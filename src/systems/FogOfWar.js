/* ============================================================
   FogOfWar.js — 포그 오브 워 시야 관리
   예선 MVP: 시야 범위 3타일 (맨해튼 거리)
             통신 두절 분대 → 마지막 보고 위치 고정 표시

   구현 순서 (하나씩 추가):
     1. computeVisible()    — 아군 전체 시야 타일 목록 계산
     2. applyFog()          — 시야 밖 타일 어둡게 처리
     3. updateLastKnown()   — 통신 두절 분대 위치 캐시 갱신
     4. getLastKnown()      — 두절 분대 마지막 보고 위치 반환
   ============================================================ */

class FogOfWar {

  /** @param {GridMap} gridMap */
  constructor(gridMap) {
    this.gridMap    = gridMap;
    this.sightRange = CONFIG.FOG_SIGHT_RANGE;
    this.lastKnown  = {};  // { squadId: { col, row } }
    this.visibleSet = new Set(); // 현재 시야 내 타일 키 집합
  }

  /**
   * 아군 분대 위치 기준 시야 타일 목록 계산
   * @param {Array<object>} squads - 아군 분대 배열 (각 squad.pos = { col, row })
   * @returns {Set<string>} - 'col,row' 형식 키 집합
   */
  computeVisible(squads) {
    this.visibleSet.clear();

    for (const squad of squads) {
      if (!squad.alive) continue;
      const { col, row } = squad.pos;

      for (let dc = -this.sightRange; dc <= this.sightRange; dc++) {
        for (let dr = -this.sightRange; dr <= this.sightRange; dr++) {
          if (Math.abs(dc) + Math.abs(dr) > this.sightRange) continue;
          const tc = col + dc;
          const tr = row + dr;
          if (this.gridMap.isInBounds(tc, tr)) {
            this.visibleSet.add(`${tc},${tr}`);
          }
        }
      }
    }

    return this.visibleSet;
  }

  /**
   * 특정 타일이 시야 내인지 확인
   * @param {number} col
   * @param {number} row
   * @returns {boolean}
   */
  isVisible(col, row) {
    return this.visibleSet.has(`${col},${row}`);
  }

  /**
   * 시야 밖 타일 및 적 유닛 숨김 처리
   * 실제 렌더링은 GameScene에서 호출
   */
  applyFog() {
    // TODO: visibleSet 기준으로 타일 알파값 조정
    // 시야 내: alpha = 1.0 / 시야 밖: alpha = 0.0 (적 스프라이트 setVisible(false))
  }

  /**
   * 분대 마지막 보고 위치 갱신 (통신 두절 대비)
   * @param {number} squadId
   * @param {{ col, row }} pos
   */
  updateLastKnown(squadId, pos) {
    this.lastKnown[squadId] = { ...pos };
  }

  /**
   * 통신 두절 분대의 마지막 보고 위치 반환
   * @param {number} squadId
   * @returns {{ col, row } | null}
   */
  getLastKnown(squadId) {
    return this.lastKnown[squadId] || null;
  }
}
