/* ============================================================
   EnemyAI.js — 적 분대 행동 실행 (Gemini 응답 → 게임 반영)
   429(Rate Limit) 시: 쿨다운 후 재시도, 영구 폴백 전환 안 함.
   ============================================================ */

class EnemyAI {

  constructor(geminiClient, fallbackAI) {
    this.gemini   = geminiClient;
    this.fallback = fallbackAI;

    this.usingFallback   = !CONFIG.GEMINI_API_KEY;
    this._rateLimitUntil = 0;   // Date.now() 기준 쿨다운 만료 시각
    this._COOLDOWN_MS    = 65 * 1000;  // 429 후 65초 대기 (분당 한도 리셋)
  }

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
      ally:  allySquads.map(s => ({ id: s.id, pos: s.pos, troops: s.troops })),
      enemy: enemySquads.map(s => ({ id: s.id, pos: s.pos, troops: s.troops })),
    };
  }

  async decideTurn(mapState) {
    // API 키 없으면 항상 폴백
    if (this.usingFallback) {
      return this.fallback.decide(mapState.enemy, mapState.ally);
    }

    // 쿨다운 중이면 폴백 (이번 턴만, 영구 아님)
    if (Date.now() < this._rateLimitUntil) {
      const remainSec = Math.ceil((this._rateLimitUntil - Date.now()) / 1000);
      this._log(`⏳ Gemini 쿨다운 중 (${remainSec}초 남음) → 폴백 AI 사용`, 'system');
      return this.fallback.decide(mapState.enemy, mapState.ally);
    }

    try {
      const actions = await this.gemini.call(mapState);
      if (!Array.isArray(actions) || actions.length === 0) {
        throw new Error('Gemini 응답이 비어 있음');
      }
      return actions;

    } catch (e) {
      const msg = (e.message || '').toUpperCase();

      if (msg.includes('RATE_LIMIT') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        // 429: 쿨다운 설정 후 이번 턴만 폴백 (영구 전환 X)
        this._rateLimitUntil = Date.now() + this._COOLDOWN_MS;
        this._log(`⚠ Gemini 429 — ${Math.round(this._COOLDOWN_MS/1000)}초 후 자동 복구. 이번 턴 폴백 AI.`, 'system');
        console.warn('🚨 Gemini Rate Limit → 쿨다운 설정:', new Date(this._rateLimitUntil).toLocaleTimeString());

      } else if (msg.includes('TIMEOUT')) {
        this._log('[AI] Gemini 타임아웃 → 이번 턴 폴백 AI', 'system');

      } else {
        this._log(`[AI] Gemini 오류 → 이번 턴 폴백 AI (${e.message})`, 'system');
        console.warn('Gemini 실패 상세:', e.message);
      }

      return this.fallback.decide(mapState.enemy, mapState.ally);
    }
  }

  _log(msg, type = '') {
    try {
      if (typeof chatUI !== 'undefined' && chatUI) {
        chatUI.addLog('SYSTEM', null, msg, type || 'system');
      }
    } catch (_) {}
  }
}
