/* ============================================================
   GeminiClient.js — Gemini API fetch 호출 및 응답 파싱
   모델: Gemini Flash (무료 플랜, 턴당 1회 호출)

   사지방 접근 불가 시 → EnemyAI가 FallbackAI로 자동 전환
   API 타임아웃: CONFIG.GEMINI_TIMEOUT (기본 3000ms)

   구현 순서 (하나씩 추가):
     1. buildPrompt()   — 맵 상태 직렬화 → 프롬프트 텍스트 생성
     2. call()          — fetch 호출 + 타임아웃 처리
     3. parseResponse() — JSON 응답 파싱 → 행동 배열 반환
   ============================================================ */

class GeminiClient {

  constructor() {
    this.apiKey  = CONFIG.GEMINI_API_KEY;
    this.model   = CONFIG.GEMINI_MODEL;
    this.baseURL = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  /**
   * 맵 상태 → Gemini 프롬프트 텍스트 생성
   * @param {object} mapState - 현재 맵 직렬화 데이터
   * @returns {string}
   */
  buildPrompt(mapState) {
    return `당신은 KCTC 대항군 지휘관입니다.
현재 전황: ${JSON.stringify(mapState)}
아군(플레이어) 통신 품질: ${mapState.allyCommsQuality}%
다음 턴 각 적 분대의 행동을 아래 JSON 형식으로만 반환하세요:
[
  { "squadId": 1, "action": "move", "targetCol": 3, "targetRow": 2 },
  { "squadId": 2, "action": "attack", "targetId": "ally_1" }
]`;
  }

  /**
   * Gemini API 호출 (타임아웃 포함)
   * @param {object} mapState
   * @returns {Promise<Array<object>>} - 적 행동 배열
   * @throws {Error} - API 실패 또는 타임아웃 시
   */
  async call(mapState) {
    const prompt = this.buildPrompt(mapState);

    const fetchPromise = fetch(`${this.baseURL}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API timeout')), CONFIG.GEMINI_TIMEOUT)
    );

    const response = await Promise.race([fetchPromise, timeoutPromise]);
    const data = await response.json();

    return this.parseResponse(data);
  }

  /**
   * Gemini 응답 JSON 파싱 → 행동 배열 반환
   * @param {object} data - Gemini API 응답 원본
   * @returns {Array<object>}
   */
  parseResponse(data) {
    try {
      const text = data.candidates[0].content.parts[0].text;
      // JSON 블록만 추출 (```json ... ``` 래핑 대응)
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array in response');
      return JSON.parse(match[0]);
    } catch (e) {
      throw new Error(`Gemini 응답 파싱 실패: ${e.message}`);
    }
  }
}
