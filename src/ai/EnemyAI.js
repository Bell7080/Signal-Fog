/* ============================================================
   EnemyAI.js — 적 분대 행동 실행 (Gemini 응답 → 게임 반영)
   Gemini API 실패 시 FallbackAI로 자동 전환.

   구현 순서 (하나씩 추가):
     1. serializeMap()   — GridMap + 분대 상태 → JSON 직렬화
     2. decideTurn()     — GeminiClient.call() 또는 FallbackAI.decide()
     3. executeActions() — 반환된 행동 배열 → 실제 게임 반영
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
   * @param {GridMap} gridMap
   * @param {Array}   allySquads
   * @param {Array}   enemySquads
   * @param {number}  allyCommsQuality - 아군 평균 통신 품질
   * @returns {object}
   */
  serializeMap(gridMap, allySquads, enemySquads, allyCommsQuality) {
    return {
      gridSize: { cols: CONFIG.GRID_COLS, rows: CONFIG.GRID_ROWS },
      allyCommsQuality,
      ally: allySquads.map(s => ({
        id:     s.id,
        pos:    s.pos,
        troops: s.troops,
        alive:  s.alive,
      })),
      enemy: enemySquads.map(s => ({
        id:     s.id,
        pos:    s.pos,
        troops: s.troops,
        alive:  s.alive,
      })),
      // TODO: 지형 정보 포함
    };
  }

  /**
   * 적 행동 결정 (Gemini 우선, 실패 시 Fallback)
   * @param {object} mapState
   * @returns {Promise<Array<object>>} - 행동 배열
   */
  async decideTurn(mapState) {
    if (this.usingFallback) {
      return this.fallback.decide(mapState.enemy);
    }

    try {
      const actions = await this.gemini.call(mapState);
      this.usingFallback = false;
      return actions;
    } catch (e) {
      console.warn('Gemini 실패 → FallbackAI 전환:', e.message);
      chatUI.addLog('SYSTEM', null, '[AI] Gemini 연결 실패 → 폴백 AI로 전환', 'system');
      this.usingFallback = true;
      return this.fallback.decide(mapState.enemy);
    }
  }

  /**
   * 행동 배열을 실제 게임에 반영
   * @param {Array<object>} actions
   * @param {GridMap}       gridMap
   * @param {Array}         enemySquads
   */
  executeActions(actions, gridMap, enemySquads) {
    for (const action of actions) {
      const squad = enemySquads.find(s => s.id === action.squadId);
      if (!squad || !squad.alive) continue;

      if (action.action === 'move') {
        // TODO: 유효 타일 확인 후 이동
        squad.pos = { col: action.targetCol, row: action.targetRow };
      } else if (action.action === 'attack') {
        // TODO: CombatSystem.rollHit() 호출
      }
    }
  }
}
