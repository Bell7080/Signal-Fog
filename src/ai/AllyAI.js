/* ============================================================
   AllyAI.js — 아군 분대 자율 행동 AI
   ────────────────────────────────────────────────────────────
   · 플레이어가 지휘하지 않는 아군 분대가 매 턴 자율 행동
   · 우선순위:
       1. 자급자족: 물/식량 부족 시 인벤토리 소모(1턴 소비)
       2. 수면 중: 정신력 회복 (행동 없음)
       3. 점령지 발견 시: 일부 분대 자발적 이동
       4. 소극적 방어: 확률적 순찰 이동
   · 교전 개시 불가 (플레이어 전용)
   ============================================================ */

class AllyAI {

  /**
   * @param {Array}            allySquads       - 살아있는 아군 분대
   * @param {Array}            enemySquads      - 살아있는 적군 분대
   * @param {ObjectiveSystem}  objectiveSys     - 점령지 시스템 참조
   * @param {number|null}      commandedSquadId - 이번 턴 플레이어가 지휘한 분대 ID
   * @returns {Array}          commands         - pendingCmds에 넣을 커맨드 배열
   */
  decide(allySquads, enemySquads, objectiveSys, commandedSquadId) {
    const cmds = [];
    for (const squad of allySquads) {
      if (!squad.alive) continue;
      if (squad.id === commandedSquadId) continue;  // 플레이어 지휘 분대 제외
      if (squad.sleeping) continue;                  // 수면 중 행동 없음

      const cmd = this._decideSingle(squad, allySquads, enemySquads, objectiveSys);
      if (cmd) cmds.push(cmd);
    }
    return cmds;
  }

  /* ── 분대 이동 칸수 계산 ──────────────────────────────────── */
  _getMoveRange(squad) {
    const isMG = squad.unitType === 'mg' || squad.unitType === 'machine_gun';
    let base = squad.unitType === 'mortar'
      ? (CONFIG.MORTAR_MOVE ?? 1)
      : isMG ? (CONFIG.MG_MOVE ?? 2)
             : (CONFIG.RIFLE_MOVE ?? 3);
    if (squad.unitType === 'mortar' && squad.mortarState === 'ready') base = 0;
    if (squad.supply) {
      const T = CONFIG.SURVIVAL_MOVE_PENALTY_THRESHOLD ?? 30;
      if ((squad.supply.water  ?? 100) < T) base--;
      if ((squad.supply.ration ?? 100) < T) base--;
      if ((squad.supply.morale ?? 100) < T) base--;
    }
    return Math.max(0, base);
  }

  /* ── 단일 분대 행동 결정 ─────────────────────────────────── */
  _decideSingle(squad, allies, enemies, obj) {
    const sup      = squad.supply;
    const moveRange = this._getMoveRange(squad);

    // ── 1. 자급자족: 자원 임계치 이하면 인벤토리 소모(1턴) ──
    if (sup) {
      const T = CONFIG.SURVIVAL_AUTO_USE_THRESHOLD;
      if (sup.ration < T && (sup.inv_ration ?? 0) > 0) {
        return { type: 'rest', squadId: squad.id, restType: 'eat' };
      }
      if (sup.water < T && (sup.inv_water ?? 0) > 0) {
        return { type: 'rest', squadId: squad.id, restType: 'drink' };
      }
    }

    if (moveRange <= 0) return null; // 이동 불가

    // ── 2. 점령지 발견 시: 점령지 타일에 있지 않다면 이동 고려 ──
    if (obj && obj.discovered && !obj.isOnObjective(squad.pos.col, squad.pos.row)) {
      const aliveAllies  = allies.filter(s => s.alive);
      const onObj        = aliveAllies.filter(s => obj.isOnObjective(s.pos.col, s.pos.row));
      const targetCount  = Math.ceil(aliveAllies.length * 0.45);

      if (onObj.length < targetCount && Math.random() < 0.55) {
        const step = this._stepToward(squad.pos, obj.center, enemies, moveRange);
        if (step) return { type: 'move', squadId: squad.id, targetPos: step };
      }
    }

    // ── 3. 방어 순찰: 이동 범위 내에서 적 회피하며 이동 ──
    if (Math.random() < 0.25) {
      const patrol = this._patrolStep(squad, enemies, moveRange);
      if (patrol) return { type: 'move', squadId: squad.id, targetPos: patrol };
    }

    return null; // 대기
  }

  /* ── 목표 방향으로 moveRange칸 이동 ─────────────────────── */
  _stepToward(from, to, enemies, moveRange) {
    const dc = to.col - from.col;
    const dr = to.row - from.row;
    if (dc === 0 && dr === 0) return null;

    const dist  = Math.abs(dc) + Math.abs(dr);
    const steps = Math.min(moveRange, dist);

    /* 단계적으로 이동 경로 계산 */
    let col = from.col;
    let row = from.row;
    for (let i = 0; i < steps; i++) {
      const remDc = to.col - col;
      const remDr = to.row - row;
      if (remDc === 0 && remDr === 0) break;
      let nc = col, nr = row;
      if (Math.abs(remDc) >= Math.abs(remDr)) nc += Math.sign(remDc);
      else                                     nr += Math.sign(remDr);
      nc = Math.max(0, Math.min(CONFIG.GRID_COLS - 1, nc));
      nr = Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, nr));
      if (!this._isSafeMove({ col: nc, row: nr }, enemies)) break;
      col = nc; row = nr;
    }
    if (col === from.col && row === from.row) return null;
    return { col, row };
  }

  /* ── 순찰 이동 (이동 범위 내에서 적 회피) ─────────────────── */
  _patrolStep(squad, enemies, moveRange) {
    /* 이동 가능 방향 4방향 중 랜덤 선택 후 moveRange 칸 진행 */
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    const shuffled = dirs.sort(() => Math.random() - 0.5);
    for (const [dc, dr] of shuffled) {
      let col = squad.pos.col;
      let row = squad.pos.row;
      let valid = true;
      for (let i = 0; i < moveRange; i++) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nc >= CONFIG.GRID_COLS || nr < 0 || nr >= CONFIG.GRID_ROWS) { valid = false; break; }
        if (!this._isSafeMove({ col: nc, row: nr }, enemies)) break;
        col = nc; row = nr;
      }
      if (valid && (col !== squad.pos.col || row !== squad.pos.row)) {
        return { col, row };
      }
    }
    return null;
  }

  /* ── 이동 가능 여부 (적군 위치 회피) ─────────────────────── */
  _isSafeMove(pos, enemies) {
    return !enemies.some(e => e.alive && e.pos.col === pos.col && e.pos.row === pos.row);
  }
}
