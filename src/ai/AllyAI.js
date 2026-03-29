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

  /* ── 단일 분대 행동 결정 ─────────────────────────────────── */
  _decideSingle(squad, allies, enemies, obj) {
    const sup = squad.supply;

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

    // ── 2. 점령지 발견 시: 점령지 타일에 있지 않다면 이동 고려 ──
    if (obj && obj.discovered && !obj.isOnObjective(squad.pos.col, squad.pos.row)) {
      const aliveAllies  = allies.filter(s => s.alive);
      const onObj        = aliveAllies.filter(s => obj.isOnObjective(s.pos.col, s.pos.row));
      const targetCount  = Math.ceil(aliveAllies.length * 0.45);

      if (onObj.length < targetCount && Math.random() < 0.45) {
        const step = this._stepToward(squad.pos, obj.center, enemies);
        if (step) return { type: 'move', squadId: squad.id, targetPos: step };
      }
    }

    // ── 3. 소극적 방어: 낮은 확률로 1칸 순찰 ──
    if (Math.random() < 0.12) {
      const patrol = this._patrolStep(squad, enemies);
      if (patrol) return { type: 'move', squadId: squad.id, targetPos: patrol };
    }

    return null; // 대기
  }

  /* ── 목표 방향으로 1칸 이동 ──────────────────────────────── */
  _stepToward(from, to, enemies) {
    const dc = to.col - from.col;
    const dr = to.row - from.row;
    if (dc === 0 && dr === 0) return null;

    const candidates = [];
    if (dc !== 0) candidates.push({ col: from.col + Math.sign(dc), row: from.row });
    if (dr !== 0) candidates.push({ col: from.col, row: from.row + Math.sign(dr) });
    if (Math.random() < 0.5) candidates.reverse(); // 확률적 방향 선택

    for (const pos of candidates) {
      if (this._isSafeMove(pos, enemies)) return pos;
    }
    return null;
  }

  /* ── 인접 타일 순찰 이동 ─────────────────────────────────── */
  _patrolStep(squad, enemies) {
    const dirs = [
      { col: squad.pos.col + 1, row: squad.pos.row },
      { col: squad.pos.col - 1, row: squad.pos.row },
      { col: squad.pos.col,     row: squad.pos.row + 1 },
      { col: squad.pos.col,     row: squad.pos.row - 1 },
    ];
    const valid = dirs.filter(p =>
      p.col >= 0 && p.col < CONFIG.GRID_COLS &&
      p.row >= 0 && p.row < CONFIG.GRID_ROWS &&
      this._isSafeMove(p, enemies)
    );
    if (!valid.length) return null;
    return valid[Math.floor(Math.random() * valid.length)];
  }

  /* ── 이동 가능 여부 (적군 위치 회피) ─────────────────────── */
  _isSafeMove(pos, enemies) {
    return !enemies.some(e => e.alive && e.pos.col === pos.col && e.pos.row === pos.row);
  }
}
