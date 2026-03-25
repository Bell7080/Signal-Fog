/* ============================================================
   GeminiClient.js — Gemini API fetch 호출 및 응답 파싱
   모델: gemini-2.0-flash (무료 플랜, 턴당 1회 호출)
   API 키 미설정·타임아웃·네트워크 차단 시 → EnemyAI가 FallbackAI로 전환
   ============================================================ */

class GeminiClient {

  constructor() {
    this.apiKey  = CONFIG.GEMINI_API_KEY;
    this.model   = CONFIG.GEMINI_MODEL;
    this.baseURL = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  /**
   * 맵 상태 → 전술 지침 포함 Gemini 프롬프트 생성
   * @param {object} mapState - EnemyAI.serializeMap() 반환값
   * @returns {string}
   */
  buildPrompt(mapState) {
    const { gridSize, allyCommsQuality, allySpawnRow, objective, ally, enemy } = mapState;
    const C = gridSize.cols;
    const R = gridSize.rows;

    return `You are the OPFOR (opposing force) commander in a Korean Army tactical training simulation (KCTC).
Map: ${C} columns (0~${C-1}) × ${R} rows (0~${R-1}). Your units start near row 0; the player's units start near row ${allySpawnRow}.
Terrain: rows 7-8 are VALLEY (reduces player comms quality). FOREST and HILL tiles provide cover.
Objective: Prevent the player from capturing the objective at col ${objective.col}, row ${objective.row}.

Current player comms quality: ${allyCommsQuality}% — if below 70%, their commands may be corrupted (exploit this!).

Current situation (JSON):
${JSON.stringify({ ally, enemy, terrain: mapState.terrain }, null, 2)}

Rules:
- Return exactly ONE action per living enemy squad.
- Move: targetCol 0~${C-1}, targetRow 0~${R-1}. Stay within ${CONFIG.SQUAD_AP_MAX} Manhattan-distance tiles from current position.
- Attack: only if Manhattan distance to the target ally ≤ ${CONFIG.RIFLE_RANGE}.
- Use targetId as the numeric ally squad id (e.g. 1, 2, 3) for attacks.
- Do NOT overlap two enemy squads on the same tile after moving.
- Prioritize: attack if in range, otherwise advance and flank toward isolated allies.

Return ONLY a valid JSON array, no markdown, no explanation:
[
  { "squadId": 4, "action": "move", "targetCol": 2, "targetRow": 3 },
  { "squadId": 5, "action": "attack", "targetId": 1 }
]`;
  }

  /**
   * Gemini API 호출 (타임아웃 포함)
   * API 키가 비어 있으면 즉시 오류를 던져 FallbackAI로 전환시킴
   * @param {object} mapState
   * @returns {Promise<Array<object>>}
   * @throws {Error}
   */
  async call(mapState) {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY 미설정');

    const prompt = this.buildPrompt(mapState);

    const fetchPromise = fetch(`${this.baseURL}?key=${this.apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
      }),
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API timeout')), CONFIG.GEMINI_TIMEOUT)
    );

    const response = await Promise.race([fetchPromise, timeoutPromise]);
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
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
      const match = text.match(/\[[\s\S]*?\]/);
      if (!match) throw new Error('JSON 배열 없음');
      return JSON.parse(match[0]);
    } catch (e) {
      throw new Error(`Gemini 응답 파싱 실패: ${e.message}`);
    }
  }
}
