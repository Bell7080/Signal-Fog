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
    this.usingFallback = false;
  }

  /**
   * 현재 맵 상태 직렬화 (Gemini 프롬프트용)
   * 지형 정보(비개활지 타일)·아군 통신 품질·목표지점 포함
   * @param {GridMap} gridMap
   * @param {Array}   allySquads  - 살아 있는 아군만
   * @param {Array}   enemySquads - 살아 있는 적군만
   * @param {number}  allyCommsQuality - 아군 평균 통신 품질 (0~100)
   * @returns {object}
   */
  serializeMap(gridMap, allySquads, enemySquads, allyCommsQuality) {
    // 개활지가 아닌 타일만 포함 (프롬프트 길이 최소화)
    const terrain = [];
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const t = gridMap.tiles[r][c].terrain;
        if (t.id !== 'open') terrain.push({ col: c, row: r, type: t.id });
      }
    }

    return {
      gridSize: { cols: CONFIG.GRID_COLS, rows: CONFIG.GRID_ROWS },
      allySpawnRow:  CONFIG.GRID_ROWS - 1,   // 아군 시작 행
      enemySpawnRow: 0,                       // 적군 시작 행 (현재 위치)
      objective:     { col: 6, row: 7 },     // 점령 목표 지점
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
   * @param {object} mapState - serializeMap() 반환값
   * @returns {Promise<Array<object>>} - 행동 배열
   */
  async decideTurn(mapState) {
    if (this.usingFallback) {
      return this.fallback.decide(mapState.enemy, mapState.ally);
    }

    try {
      const actions = await this.gemini.call(mapState);
      this.usingFallback = false;
      return actions;
    } catch (e) {
      console.warn('Gemini 실패 → FallbackAI 전환:', e.message);
      chatUI.addLog('SYSTEM', null, '[AI] Gemini 연결 실패 → 폴백 AI로 전환', 'system');
      this.usingFallback = true;
      return this.fallback.decide(mapState.enemy, mapState.ally);
    }
  }
}
