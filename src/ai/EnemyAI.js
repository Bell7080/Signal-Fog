/* ============================================================
   EnemyAI.js — 적 분대 행동 실행 (Gemini 응답 → 게임 반영)
   Gemini API 실패(한도 초과 포함) 시 FallbackAI로 자동 전환.
   ============================================================ */

class EnemyAI {

  /**
   * @param {GeminiClient} geminiClient
   * @param {FallbackAI}   fallbackAI
   */
  constructor(geminiClient, fallbackAI) {
    this.gemini   = geminiClient;
    this.fallback = fallbackAI;

    // API 키가 없으면 처음부터 Fallback 사용
    this.usingFallback = !CONFIG.GEMINI_API_KEY;
  }

  /**
   * 현재 맵 상태 직렬화 (Gemini 프롬프트용)
   */
  serializeMap(gridMap, allySquads, enemySquads, allyCommsQuality) {
    const terrain = [];
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const t = gridMap.tiles[r][c].terrain;
        if (t.id !== 'open') terrain.push({ col: c, row: r, type: t.id });
      }
    }

    return {
      gridSize: { cols: CONFIG.GRID_COLS, rows: CONFIG.GRID_ROWS },
      allySpawnRow:  CONFIG.GRID_ROWS - 1,
      enemySpawnRow: 0,
      objective:     { col: 6, row: 7 },
      allyCommsQuality,
      terrain,
      ally: allySquads.map(s => ({
        id: s.id, pos: s.pos, troops: s.troops,
      })),
      enemy: enemySquads.map(s => ({
        id: s.id, pos: s.pos, troops: s.troops,
      })),
    };
  }

  /**
   * 적 행동 결정 (Gemini 우선, 실패 시 Fallback)
   * @param {object} mapState
   * @returns {Promise<Array<object>>}
   */
  async decideTurn(mapState) {
    if (this.usingFallback) {
      return this.fallback.decide(mapState.enemy, mapState.ally);
    }

    try {
      const actions = await this.gemini.call(mapState);

      // 응답이 빈 배열이거나 유효하지 않으면 Fallback
      if (!Array.isArray(actions) || actions.length === 0) {
        throw new Error('Gemini 응답이 비어 있음');
      }

      this.usingFallback = false;
      return actions;

    } catch (e) {
      const msg = (e.message || '').toUpperCase();
      let logMessage = '[AI] Gemini 호출 실패 → 폴백 AI로 전환';

      if (msg.includes('RATE_LIMIT') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        logMessage = '[AI] Gemini API 사용 한도 초과 (429) → 일반 AI(폴백)로 영구 전환';
        console.warn('🚨 Gemini Rate Limit 초과 감지');
      } else if (msg.includes('TIMEOUT')) {
        logMessage = '[AI] Gemini 타임아웃 → 폴백 AI 전환';
      } else if (msg.includes('GEMINI_API_KEY 미설정')) {
        logMessage = '[AI] Gemini API 키 미설정 → 폴백 AI 사용 중';
      } else {
        console.warn('Gemini 실패 상세:', e.message);
      }

      // UI 로그
      try {
        if (typeof chatUI !== 'undefined' && chatUI) {
          chatUI.addLog('SYSTEM', null, logMessage, 'system');
        }
      } catch (_) { /* 무시 */ }

      this.usingFallback = true;   // 한도 초과 시 영구 전환
      return this.fallback.decide(mapState.enemy, mapState.ally);
    }
  }
}