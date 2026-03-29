/* ============================================================
   FallbackAI.js — 체계적 대항군 전술 AI (v3)
   ────────────────────────────────────────────────────────────
   우선순위:
     0. 자급자족: 물/식량 부족 시 인벤토리 소모(1턴)
     1. 수비형 교전: 사거리 내 아군 발견 시 응사 (반응적)
     2. 아군이 목표 다수 점령 중 → 집결 반격
     3. 역할별 행동 (ASSAULT/FLANK/DEFEND)

   기본 자세: 수동적 방어
   · 적극적 추격 없음, 무작위 순찰 위주
   · 교전은 사거리 내 접근 시에만 발생
   ============================================================ */

class FallbackAI {

  /**
   * @param {Array}  enemySquads
   * @param {Array}  allySquads
   * @param {object} mapState - { objective, ... }
   */
  decide(enemySquads, allySquads = [], mapState = {}) {
    const alive     = allySquads.filter(s => s.alive === undefined || s.alive);
    const objective = mapState.objective || null;
    const actions   = [];

    // 아군의 목표 점령 여부
    let allyOnObj = [];
    if (objective && objective.tiles) {
      allyOnObj = alive.filter(s =>
        objective.tiles.some(t => t.col === s.pos.col && t.row === s.pos.row)
      );
    }
    const alliesCapturing = allyOnObj.length >= Math.ceil(alive.length * 0.4);

    const sorted = [...enemySquads]
      .filter(s => s.alive !== false)
      .sort((a, b) => a.id - b.id);
    const n = sorted.length;

    for (let i = 0; i < n; i++) {
      const squad = sorted[i];
      if (squad.sleeping) continue; // 수면 중 행동 없음

      // ── 0. 자급자족 (물/식량 임계치 이하) ──
      if (squad.supply) {
        const T = CONFIG.SURVIVAL_AUTO_USE_THRESHOLD;
        if (squad.supply.ration < T && (squad.supply.inv_ration ?? 0) > 0) {
          actions.push({ squadId: squad.id, action: 'rest', restType: 'eat' });
          continue;
        }
        if (squad.supply.water < T && (squad.supply.inv_water ?? 0) > 0) {
          actions.push({ squadId: squad.id, action: 'rest', restType: 'drink' });
          continue;
        }
      }

      // ── 1. 사거리 내 아군 → 응사 ──
      const attackAct = this._tryAttack(squad, alive);
      if (attackAct) { actions.push(attackAct); continue; }

      // ── 2. 아군이 목표 점령 중 → 집결 반격 ──
      if (alliesCapturing && objective) {
        const act = this._moveToward(squad, objective.center);
        if (act) { actions.push(act); continue; }
      }

      // ── 3. 역할별 수비 행동 ──
      let role;
      if      (i < Math.floor(n * 0.4)) role = 'hold';    // 40%: 현위치 방어
      else if (i < Math.floor(n * 0.8)) role = 'patrol';  // 40%: 순찰
      else                               role = 'defend';  // 20%: 목표 경비

      const act = this._actByRole(squad, alive, role, objective);
      if (act) actions.push(act);
    }
    return actions;
  }

  /* ── 역할별 행동 ─────────────────────────────────────────── */
  _actByRole(squad, allySquads, role, objective) {
    switch (role) {
      case 'hold':
        // 현위치 유지 (낮은 확률로 1칸 이동)
        if (Math.random() < 0.15) return this._patrol(squad, squad.pos);
        return null;

      case 'patrol': {
        // 현위치 주변 소규모 순찰
        const center = objective ? objective.center : squad.pos;
        return this._patrol(squad, center);
      }

      case 'defend': {
        const target = objective ? objective.center : {
          col: Math.floor(CONFIG.GRID_COLS / 2),
          row: Math.floor(CONFIG.GRID_ROWS / 2),
        };
        const dist = Math.abs(squad.pos.col - target.col) + Math.abs(squad.pos.row - target.row);
        if (dist <= 3) return this._patrol(squad, target);
        return this._moveToward(squad, target);
      }

      default:
        return null;
    }
  }

  /* ── 유틸: 이동 ──────────────────────────────────────────── */
  _moveToward(squad, targetPos) {
    if (!targetPos) return null;
    const dc = Math.sign(targetPos.col - squad.pos.col);
    const dr = Math.sign(targetPos.row - squad.pos.row);
    let col = squad.pos.col, row = squad.pos.row;

    if (Math.random() < 0.6 && dr !== 0) row += dr;
    else if (dc !== 0)                    col += dc;
    else if (dr !== 0)                    row += dr;
    else return null; // 이미 목표 위치

    return { squadId: squad.id, action: 'move',
      targetCol: Math.max(0, Math.min(CONFIG.GRID_COLS - 1, col)),
      targetRow: Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, row)) };
  }

  _patrol(squad, center) {
    const dirs = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]];
    const [dc, dr] = dirs[Math.floor(Math.random() * dirs.length)];
    const col = Math.max(0, Math.min(CONFIG.GRID_COLS - 1, squad.pos.col + dc));
    const row = Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, squad.pos.row + dr));
    const dist = Math.abs(col - center.col) + Math.abs(row - center.row);
    if (dist > 5) return this._moveToward(squad, center);
    return { squadId: squad.id, action: 'move', targetCol: col, targetRow: row };
  }

  _nearestAllyPos(squad, allySquads) {
    if (!allySquads.length) return null;
    return allySquads.reduce((best, s) => {
      const d  = Math.abs(squad.pos.col - s.pos.col) + Math.abs(squad.pos.row - s.pos.row);
      const bd = best ? Math.abs(squad.pos.col - best.col) + Math.abs(squad.pos.row - best.row) : Infinity;
      return d < bd ? s.pos : best;
    }, null);
  }

  /* ── 공격 시도 (방어적 응사) ─────────────────────────────── */
  _tryAttack(squad, allySquads) {
    const range = squad.weaponRange || CONFIG.RIFLE_RANGE;
    let best = null, minDist = Infinity;
    for (const ally of allySquads) {
      const dist = Math.abs(squad.pos.col - ally.pos.col) + Math.abs(squad.pos.row - ally.pos.row);
      if (dist <= range && dist < minDist) { minDist = dist; best = ally; }
    }
    return best ? { squadId: squad.id, action: 'attack', targetId: best.id } : null;
  }

  /* ── 레거시 호환 ─────────────────────────────────────────── */
  tacticalMove(squad, allySquads) {
    return this._moveToward(squad, this._nearestAllyPos(squad, allySquads));
  }
  tryAttack(squad, allySquads) { return this._tryAttack(squad, allySquads); }
}
