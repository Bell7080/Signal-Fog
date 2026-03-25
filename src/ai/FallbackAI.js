/* ============================================================
   FallbackAI.js — Gemini API 차단·실패 시 랜덤 이동 폴백
   사지방에서 generativelanguage.googleapis.com 차단 대응.

   행동 전략: 각 적 분대가 무작위 인접 타일로 이동.
              공격 범위 내 아군이 있으면 공격 우선.

   구현 순서 (하나씩 추가):
     1. decide()        — 적 분대 전체 랜덤 행동 결정
     2. randomMove()    — 인접 타일 중 랜덤 이동 선택
     3. tryAttack()     — 사거리 내 아군 존재 시 공격 행동 반환
   ============================================================ */

class FallbackAI {

  /**
   * 적 분대 전체 행동 결정
   * @param {Array<object>} enemySquads
   * @param {Array<object>} [allySquads]
   * @returns {Array<object>} - 행동 배열
   */
  decide(enemySquads, allySquads = []) {
    const actions = [];

    for (const squad of enemySquads) {
      if (!squad.alive) continue;

      // 공격 가능한 아군 확인
      const attackAction = this.tryAttack(squad, allySquads);
      if (attackAction) {
        actions.push(attackAction);
        continue;
      }

      // 랜덤 이동
      const moveAction = this.randomMove(squad);
      if (moveAction) actions.push(moveAction);
    }

    return actions;
  }

  /**
   * 인접 타일 중 하나로 랜덤 이동
   * @param {object} squad
   * @returns {object | null}
   */
  randomMove(squad) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[0,0]]; // [0,0] = 제자리 대기
    const [dc, dr] = dirs[Math.floor(Math.random() * dirs.length)];

    const targetCol = Math.max(0, Math.min(CONFIG.GRID_COLS - 1, squad.pos.col + dc));
    const targetRow = Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, squad.pos.row + dr));

    return {
      squadId:   squad.id,
      action:    'move',
      targetCol,
      targetRow,
    };
  }

  /**
   * 사거리 내 아군 존재 시 공격 행동 반환
   * @param {object} squad
   * @param {Array<object>} allySquads
   * @returns {object | null}
   */
  tryAttack(squad, allySquads) {
    for (const ally of allySquads) {
      if (!ally.alive) continue;
      const dist = Math.abs(squad.pos.col - ally.pos.col) + Math.abs(squad.pos.row - ally.pos.row);
      if (dist <= CONFIG.RIFLE_RANGE) {
        return { squadId: squad.id, action: 'attack', targetId: `ally_${ally.id}` };
      }
    }
    return null;
  }
}
