/* ============================================================
   FallbackAI.js — Gemini API 차단·실패 시 전술적 폴백 AI
   사지방에서 generativelanguage.googleapis.com 차단 대응.

   행동 전략:
     1. 사거리 내 아군 존재 → 공격 우선
     2. 아군 없으면 → 가장 가까운 아군 방향으로 이동 (전술적 전진)
     3. 아군이 없으면 → 아군 스폰 방향(높은 row)으로 전진
   ============================================================ */

class FallbackAI {

  /**
   * 적 분대 전체 행동 결정
   * @param {Array<object>} enemySquads
   * @param {Array<object>} [allySquads]
   * @returns {Array<object>}
   */
  decide(enemySquads, allySquads = []) {
    const actions = [];

    // serializeMap에서 넘어온 ally 목록은 이미 살아있는 것만 포함되지만,
    // 혹시 alive 필드가 있으면 한 번 더 필터 (방어적 처리)
    const alive = allySquads.filter(s => s.alive === undefined || s.alive);

    for (const squad of enemySquads) {
      // alive 필드가 없으면 살아있다고 간주 (serializeMap에서 필터됨)
      if (squad.alive === false) continue;

      // 1. 공격 가능한 아군 확인
      const attackAction = this.tryAttack(squad, alive);
      if (attackAction) {
        actions.push(attackAction);
        continue;
      }

      // 2. 전술적 이동
      const moveAction = this.tacticalMove(squad, alive);
      if (moveAction) actions.push(moveAction);
    }

    return actions;
  }

  /**
   * 가장 가까운 아군 방향으로 1칸 이동.
   * 아군이 없으면 아군 스폰 방향(높은 row)으로 전진.
   */
  tacticalMove(squad, allySquads) {
    let targetCol = squad.pos.col;
    let targetRow = squad.pos.row;

    if (allySquads.length > 0) {
      let nearest = allySquads[0];
      let minDist = Infinity;
      for (const a of allySquads) {
        const d = Math.abs(squad.pos.col - a.pos.col) + Math.abs(squad.pos.row - a.pos.row);
        if (d < minDist) { minDist = d; nearest = a; }
      }

      const dc = Math.sign(nearest.pos.col - squad.pos.col);
      const dr = Math.sign(nearest.pos.row - squad.pos.row);

      if (Math.random() < 0.55 && dr !== 0) {
        targetRow = squad.pos.row + dr;
      } else if (dc !== 0) {
        targetCol = squad.pos.col + dc;
      } else if (dr !== 0) {
        targetRow = squad.pos.row + dr;
      }
    } else {
      // 아군 미발견 → row 증가 방향으로 전진
      targetRow = squad.pos.row + 1;
    }

    targetCol = Math.max(0, Math.min(CONFIG.GRID_COLS - 1, targetCol));
    targetRow = Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, targetRow));

    return { squadId: squad.id, action: 'move', targetCol, targetRow };
  }

  /**
   * 사거리 내 아군 존재 시 공격 행동 반환
   */
  tryAttack(squad, allySquads) {
    let best = null;
    let minDist = Infinity;

    for (const ally of allySquads) {
      const dist = Math.abs(squad.pos.col - ally.pos.col) + Math.abs(squad.pos.row - ally.pos.row);
      if (dist <= CONFIG.RIFLE_RANGE && dist < minDist) {
        minDist = dist;
        best    = ally;
      }
    }

    return best ? { squadId: squad.id, action: 'attack', targetId: best.id } : null;
  }
}
