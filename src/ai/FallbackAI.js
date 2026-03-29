/* ============================================================
   FallbackAI.js — 체계적 대항군 전술 AI (v2)
   ────────────────────────────────────────────────────────────
   역할 분배 (sorted by ID):
     · ASSAULT  (앞 40%) — 직접 돌격, 적 조우 즉시 교전
     · FLANK    (중간 40%) — 측면 우회, 포위 시도
     · DEFEND   (나머지 20%) — 목표 지점 방어·경비

   우선순위:
     1. 사거리 내 아군 → 즉시 공격
     2. 아군 다수가 목표 점령 중 → 모든 분대 목표로 집결
     3. 역할별 행동

   목표 인식:
     · mapState.objective 포함 시 활용
     · 모를 경우 중앙으로 이동
   ============================================================ */

class FallbackAI {

  /**
   * @param {Array}  enemySquads
   * @param {Array}  allySquads
   * @param {object} mapState    - { objective, gridSize, ... }
   */
  decide(enemySquads, allySquads = [], mapState = {}) {
    const alive     = allySquads.filter(s => s.alive === undefined || s.alive);
    const objective = mapState.objective || null;
    const actions   = [];

    // 아군의 목표 점령 여부 확인
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

      // 1. 사거리 내 아군 공격
      const attackAct = this._tryAttack(squad, alive);
      if (attackAct) { actions.push(attackAct); continue; }

      // 2. 아군이 목표를 많이 점령 중 → 집결 (모든 역할 오버라이드)
      if (alliesCapturing && objective) {
        const act = this._moveToward(squad, objective.center);
        if (act) { actions.push(act); continue; }
      }

      // 3. 역할 결정
      let role;
      if      (i < Math.floor(n * 0.4)) role = 'assault';
      else if (i < Math.floor(n * 0.8)) role = 'flank';
      else                               role = 'defend';

      const act = this._actByRole(squad, alive, role, objective);
      if (act) actions.push(act);
    }
    return actions;
  }

  /* ── 역할별 행동 ─────────────────────────────────────────── */
  _actByRole(squad, allySquads, role, objective) {
    switch (role) {
      case 'assault': {
        // 가장 가까운 아군 쪽으로 직진
        const nearest = this._nearestAllyPos(squad, allySquads);
        return this._moveToward(squad, nearest);
      }
      case 'flank': {
        // 측면 우회 — 적군 cluster 중심에서 ±2 열 offset
        const cx = allySquads.length > 0
          ? allySquads.reduce((s, a) => s + a.pos.col, 0) / allySquads.length
          : CONFIG.GRID_COLS / 2;
        const cy = allySquads.length > 0
          ? allySquads.reduce((s, a) => s + a.pos.row, 0) / allySquads.length
          : CONFIG.GRID_ROWS / 2;
        const offset = squad.id % 2 === 0 ? 3 : -3;
        return this._moveToward(squad, {
          col: Math.round(cx) + offset,
          row: Math.round(cy),
        });
      }
      case 'defend': {
        // 목표 지점 근처 유지 또는 이동
        const target = objective ? objective.center : null;
        if (target) {
          const dist = Math.abs(squad.pos.col - target.col) + Math.abs(squad.pos.row - target.row);
          if (dist <= 3) {
            // 목표 주변 소규모 순찰
            return this._patrol(squad, target);
          }
          return this._moveToward(squad, target);
        }
        // 목표 모를 때: 맵 중앙으로
        return this._moveToward(squad, {
          col: Math.floor(CONFIG.GRID_COLS / 2),
          row: Math.floor(CONFIG.GRID_ROWS / 2),
        });
      }
      default:
        return this.tacticalMove(squad, allySquads);
    }
  }

  /* ── 유틸: 이동 ──────────────────────────────────────────── */
  _moveToward(squad, targetPos) {
    if (!targetPos) {
      return { squadId: squad.id, action: 'move',
        targetCol: squad.pos.col,
        targetRow: Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, squad.pos.row + 1)) };
    }
    const dc = Math.sign(targetPos.col - squad.pos.col);
    const dr = Math.sign(targetPos.row - squad.pos.row);
    let col = squad.pos.col, row = squad.pos.row;

    // 우선 행 방향, 일부 확률로 열 방향
    if (Math.random() < 0.6 && dr !== 0) row += dr;
    else if (dc !== 0) col += dc;
    else if (dr !== 0) row += dr;

    return { squadId: squad.id, action: 'move',
      targetCol: Math.max(0, Math.min(CONFIG.GRID_COLS - 1, col)),
      targetRow: Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, row)) };
  }

  _patrol(squad, center) {
    // 목표 주변 1~2칸 순찰
    const dirs = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]];
    const [dc, dr] = dirs[Math.floor(Math.random() * dirs.length)];
    const col = Math.max(0, Math.min(CONFIG.GRID_COLS - 1, squad.pos.col + dc));
    const row = Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, squad.pos.row + dr));
    // 너무 멀어지면 중심으로
    const dist = Math.abs(col - center.col) + Math.abs(row - center.row);
    if (dist > 4) return this._moveToward(squad, center);
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

  /* ── 공격 시도 ───────────────────────────────────────────── */
  _tryAttack(squad, allySquads) {
    // 무기 사거리 반영 (serializeMap이 weaponRange를 포함하면 사용)
    const range = squad.weaponRange || CONFIG.RIFLE_RANGE;
    let best = null, minDist = Infinity;
    for (const ally of allySquads) {
      const dist = Math.abs(squad.pos.col - ally.pos.col) + Math.abs(squad.pos.row - ally.pos.row);
      if (dist <= range && dist < minDist) {
        minDist = dist;
        best    = ally;
      }
    }
    return best ? { squadId: squad.id, action: 'attack', targetId: best.id } : null;
  }

  /* ── 레거시 호환 ─────────────────────────────────────────── */
  tacticalMove(squad, allySquads) {
    const nearest = this._nearestAllyPos(squad, allySquads);
    return this._moveToward(squad, nearest);
  }

  tryAttack(squad, allySquads) {
    return this._tryAttack(squad, allySquads);
  }
}
