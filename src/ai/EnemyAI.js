/* ============================================================
   EnemyAI.js — 적 분대 행동 실행 (Gemini 응답 → 게임 반영)
   Gemini API 실패 시 FallbackAI로 자동 전환.
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
   * @param {GridMap} gridMap
   * @param {Array}   allySquads
   * @param {Array}   enemySquads
   * @param {number}  allyCommsQuality
   * @returns {object}
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
    // Fallback 모드면 바로 반환
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
      console.warn('Gemini 실패 → FallbackAI 전환:', e.message);

      // chatUI가 없을 경우에도 안전하게 처리
      try {
        if (typeof chatUI !== 'undefined' && chatUI) {
          chatUI.addLog('SYSTEM', null, '[AI] Gemini 연결 실패 → 폴백 AI로 전환', 'system');
        }
      } catch (_) { /* UI 오류 무시 */ }

      this.usingFallback = true;
      return this.fallback.decide(mapState.enemy, mapState.ally);
    }
  }
}
