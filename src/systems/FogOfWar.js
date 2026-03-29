/* ============================================================
   FogOfWar.js — 포그 오브 워 시야 관리
   v0.3: 유클리드 거리 기반 원형 시야
         · computeVisible: Math.sqrt 거리 ≤ FOG_SIGHT_RANGE
         · isVisible: 동일 (Set 조회)
   ============================================================ */

class FogOfWar {

  /** @param {GridMap} gridMap */
  constructor(gridMap) {
    this.gridMap    = gridMap;
    this.sightRange = CONFIG.FOG_SIGHT_RANGE;
    this.lastKnown  = {};
    this.visibleSet = new Set();
  }

  /**
   * 아군 분대 위치 기준 원형 시야 타일 계산
   * (유클리드 거리 ≤ sightRange)
   * @param {Array} squads
   * @returns {Set<string>}
   */
  computeVisible(squads) {
    this.visibleSet.clear();
    const R = this.sightRange;

    for (const squad of squads) {
      if (!squad.alive) continue;
      const { col, row } = squad.pos;

      for (let dc = -R; dc <= R; dc++) {
        for (let dr = -R; dr <= R; dr++) {
          // 유클리드 거리 판정 (원형)
          if (Math.sqrt(dc * dc + dr * dr) > R) continue;
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

  /** 특정 타일이 시야 내인지 확인 */
  isVisible(col, row) {
    return this.visibleSet.has(`${col},${row}`);
  }

  /** 통신 두절 분대 마지막 위치 캐시 갱신 */
  updateLastKnown(squadId, pos) {
    this.lastKnown[squadId] = { ...pos };
  }

  /** 통신 두절 분대의 마지막 보고 위치 반환 */
  getLastKnown(squadId) {
    return this.lastKnown[squadId] || null;
  }
}
