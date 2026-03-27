/* ============================================================
   GeminiClient.js — Gemini API 호출
   ============================================================ */

class GeminiClient {

  constructor() {
    this.apiKey  = CONFIG.GEMINI_API_KEY || '';
    this.model   = CONFIG.GEMINI_MODEL;
    this.baseURL = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  /**
   * 맵 상태 → Gemini 프롬프트 문자열 생성
   */
  buildPrompt(mapState) {
    const { gridSize, allyCommsQuality, terrain, ally, enemy, objective } = mapState;

    const terrainStr = terrain.length > 0
      ? terrain.map(t => `(col:${t.col},row:${t.row},type:${t.type})`).join(' ')
      : '없음';

    const allyStr = ally.map(s =>
      `[ID:${s.id} col:${s.pos.col} row:${s.pos.row} 병력:${s.troops}]`
    ).join(', ');

    const enemyStr = enemy.map(s =>
      `[ID:${s.id} col:${s.pos.col} row:${s.pos.row} 병력:${s.troops}]`
    ).join(', ');

    return `당신은 KCTC 대항군 지휘관입니다. 전술적으로 최적의 행동을 결정하십시오.

전장 정보:
- 그리드 크기: ${gridSize.cols}×${gridSize.rows} (col 0~${gridSize.cols-1}, row 0~${gridSize.rows-1})
- 아군(적) 통신 품질: ${allyCommsQuality}%
- 목표 지점: col:${objective?.col ?? 6} row:${objective?.row ?? 7}
- 특수 지형: ${terrainStr}

아군(당신이 조종하는 적군) 분대:
${enemyStr}

적(아군) 분대:
${allyStr}

규칙:
1. 각 분대당 1개 행동만 반환
2. 이동은 1칸만 (상하좌우 대각선 포함)
3. 맨해튼 거리 4 이하 적이 있으면 attack 우선
4. 반드시 아래 JSON 배열 형식만 반환 (설명 없이)

반환 형식 예시:
[
  {"squadId": 4, "action": "move", "targetCol": 3, "targetRow": 1},
  {"squadId": 5, "action": "attack", "targetId": 1},
  {"squadId": 6, "action": "move", "targetCol": 7, "targetRow": 1}
]`;
  }

  /**
   * Gemini API 호출
   */
  async call(mapState) {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY 미설정');

    const prompt = this.buildPrompt(mapState);

    console.log(`[Gemini] 호출 모델: ${this.model} | 프롬프트 길이: ${prompt.length}자`);

    const fetchPromise = fetch(`${this.baseURL}?key=${this.apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     0.3,
          maxOutputTokens: 300,
          topP:            0.85,
        },
      }),
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), CONFIG.GEMINI_TIMEOUT)
    );

    let response;
    try {
      response = await Promise.race([fetchPromise, timeoutPromise]);
    } catch (e) {
      throw new Error(e.message.includes('TIMEOUT') ? 'GEMINI_TIMEOUT' : e.message);
    }

    if (!response.ok) {
      let errorMsg = `Gemini HTTP ${response.status}`;
      try {
        const body = await response.json();
        console.error('🔴 [Gemini Error]', body);
        if (body.error?.message) errorMsg += ` — ${body.error.message}`;
      } catch (_) {}
      throw new Error(errorMsg);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  /**
   * 응답 파싱
   */
  parseResponse(data) {
    try {
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('응답 구조 이상');
      }

      const text  = data.candidates[0].content.parts[0].text.trim();
      const match = text.match(/(\[[\s\S]*?\])/);
      if (!match) throw new Error('JSON 배열 없음');

      const actions = JSON.parse(match[0]);
      if (!Array.isArray(actions)) throw new Error('배열 아님');

      console.log('[Gemini] 파싱 성공:', actions);
      return actions;

    } catch (e) {
      console.warn('[Gemini] 파싱 실패:', e.message);
      throw new Error(`Gemini 응답 파싱 실패: ${e.message}`);
    }
  }
}
