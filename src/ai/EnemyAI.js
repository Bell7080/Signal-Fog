/* ============================================================
   EnemyAI.js — 적 분대 행동 실행 (Gemini 응답 → 게임 반영)
   v0.2: 250×250 맵 대응 — objective 좌표 동적 참조
   ============================================================ */

class EnemyAI {

  constructor(geminiClient, fallbackAI) {
    this.gemini   = geminiClient;
    this.fallback = fallbackAI;
    this.usingFallback   = !CONFIG.GEMINI_API_KEY;
    this._rateLimitUntil = 0;
    this._COOLDOWN_MS    = 65 * 1000;
  }

  serializeMap(gridMap, allySquads, enemySquads, allyCommsQuality) {
    const terrain = [];
    const enemyPositions = enemySquads.map(s => s.pos);
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const t = gridMap.tiles[r][c].terrain;
        if (t.id === 'open') continue;
        const near = enemyPositions.some(p =>
          Math.abs(p.col - c) + Math.abs(p.row - r) <= 30
        );
        if (near) terrain.push({ col: c, row: r, type: t.id });
      }
    }

    // 목표 지점: ObjectiveSystem 참조
    const objSys = window.gameScene?.objective;
    const objective = objSys
      ? {
          center:    objSys.center,
          tiles:     objSys.tiles,
          gauge:     objSys.gauge,
          maxGauge:  objSys.maxGauge,
          gaugePct:  objSys.getGaugePct(),
        }
      : { center: { col: Math.floor(CONFIG.GRID_COLS/2), row: Math.floor(CONFIG.GRID_ROWS/2) }, tiles: [] };

    return {
      gridSize:      { cols: CONFIG.GRID_COLS, rows: CONFIG.GRID_ROWS },
      allySpawnRow:  CONFIG.GRID_ROWS - 2,
      enemySpawnRow: 1,
      objective,
      allyCommsQuality,
      terrain,
      ally:  allySquads.map(s => ({
        id: s.id, pos: s.pos, troops: s.troops,
      })),
      enemy: enemySquads.map(s => ({
        id: s.id, pos: s.pos, troops: s.troops,
        weaponRange: s.weaponDef?.range || CONFIG.RIFLE_RANGE,
        unitType: s.unitType || 'rifle',
      })),
    };
  }

  async decideTurn(mapState) {
    if (this.usingFallback) {
      return this.fallback.decide(mapState.enemy, mapState.ally, mapState);
    }
    if (Date.now() < this._rateLimitUntil) {
      const remainSec = Math.ceil((this._rateLimitUntil - Date.now()) / 1000);
      this._log(`⏳ Gemini 쿨다운 중 (${remainSec}초 남음) → 폴백 AI`, 'system');
      return this.fallback.decide(mapState.enemy, mapState.ally, mapState);
    }
    try {
      const actions = await this.gemini.call(mapState);
      if (!Array.isArray(actions) || actions.length === 0) throw new Error('Gemini 응답 비어있음');
      return actions;
    } catch (e) {
      const msg = (e.message || '').toUpperCase();
      if (msg.includes('RATE_LIMIT') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        this._rateLimitUntil = Date.now() + this._COOLDOWN_MS;
        this._log(`⚠ Gemini 429 — ${Math.round(this._COOLDOWN_MS/1000)}초 후 복구. 이번 턴 폴백.`, 'system');
      } else if (msg.includes('TIMEOUT')) {
        this._log('[AI] Gemini 타임아웃 → 이번 턴 폴백', 'system');
      } else {
        this._log(`[AI] Gemini 오류 → 이번 턴 폴백 (${e.message})`, 'system');
      }
      return this.fallback.decide(mapState.enemy, mapState.ally, mapState);
    }
  }

  _log(msg, type = '') {
    try { if (typeof chatUI !== 'undefined' && chatUI) chatUI.addLog('SYSTEM', null, msg, type||'system'); } catch(_) {}
  }
}
