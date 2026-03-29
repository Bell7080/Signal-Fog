/* ============================================================
   FogOfWar.js v0.4
   ────────────────────────────────────────────────────────────
   변경 사항 (v0.4):
   1. 높이(elevation) 기반 시야 보정
      · 관찰자가 고지(hill)에 있으면 시야 +CONFIG.FOG_HEIGHT_BONUS
      · 관찰자와 타일 사이 높이 차이가 크면 LOS 차단
        (능선 뒤에 가려진 타일 = 보이지 않음)
   2. DayNightCycle 연동
      · computeVisible() 호출 시 dayNight.getSightRange() 사용
      · 야간에는 시야 반경 자동 축소
   3. 능선 LOS 계산 (_isBlockedByRidge)
      · Bresenham 직선 위의 중간 타일 높이가
        관찰자 ↔ 목표 보간 높이보다 높으면 차단
   ============================================================ */

class FogOfWar {

  /** @param {GridMap} gridMap */
  constructor(gridMap) {
    this.gridMap    = gridMap;
    this.sightRange = CONFIG.FOG_SIGHT_RANGE;
    this.lastKnown  = {};
    this.visibleSet = new Set();
  }

  /* ── 메인: 시야 타일 집합 계산 ───────────────────────────── */
  /**
   * 아군 분대 위치 기준 원형 시야 타일 계산.
   * 높이 보정 + LOS(능선 차단) 포함.
   *
   * @param {Array}           squads   - 살아있는 아군 분대
   * @param {DayNightCycle}   [dayNight] - 낮/밤 시스템 참조 (선택)
   * @returns {Set<string>}
   */
  computeVisible(squads, dayNight = null) {
    this.visibleSet.clear();

    // 현재 유효 시야 반경: 낮/밤 보정 포함
    const baseRange = dayNight
      ? dayNight.getSightRange()
      : CONFIG.FOG_SIGHT_RANGE;

    for (const squad of squads) {
      if (!squad.alive) continue;

      const { col, row } = squad.pos;
      const observerH = this._tileHeight(col, row);

      // 높이 기반 시야 보너스 (+, 음수 불가)
      const heightBonus = this._calcHeightBonus(observerH);
      const R = Math.max(1, baseRange + heightBonus);

      // 원형 범위 내 타일 순회
      for (let dc = -R; dc <= R; dc++) {
        for (let dr = -R; dr <= R; dr++) {
          // 유클리드 거리 판정 (원형)
          if (Math.sqrt(dc * dc + dr * dr) > R) continue;

          const tc = col + dc;
          const tr = row + dr;
          if (!this.gridMap.isInBounds(tc, tr)) continue;

          // 관찰자 자신 타일은 항상 보임
          if (dc === 0 && dr === 0) {
            this.visibleSet.add(`${tc},${tr}`);
            continue;
          }

          // 능선 LOS 차단 검사
          if (!this._isBlockedByRidge(col, row, observerH, tc, tr)) {
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

  /* ── 높이 기반 시야 보너스 계산 ─────────────────────────── */
  /**
   * 관찰자 타일 높이(0~1 정규화) → 시야 가감치
   * 높이 0.5 이상이면 +1, 0.7 이상이면 +2 (CONFIG 값 우선)
   *
   * @param {number} h - 타일 높이 (0~1 정규화, GridMap HEIGHT_MAX 기준)
   * @returns {number}
   */
  _calcHeightBonus(h) {
    const gm = this.gridMap;
    // HEIGHT_MAX 기준 정규화 (0~1)
    const norm = gm.HEIGHT_MAX > 0 ? h / gm.HEIGHT_MAX : 0;

    if (norm >= CONFIG.FOG_HEIGHT_BONUS_THRESHOLD_HIGH) {
      return CONFIG.FOG_HEIGHT_BONUS_HIGH;   // 고지 정상: +2
    }
    if (norm >= CONFIG.FOG_HEIGHT_BONUS_THRESHOLD_LOW) {
      return CONFIG.FOG_HEIGHT_BONUS_LOW;    // 고지 중턱: +1
    }
    return 0;
  }

  /* ── 능선 LOS 차단 계산 (Bresenham) ─────────────────────── */
  /**
   * 관찰자(oc, or)에서 목표(tc, tr)까지 직선 경로 위의
   * 중간 타일들이 LOS를 차단하는지 판단.
   *
   * 차단 조건:
   *   중간 타일의 높이 > 관찰자~목표 보간 높이 + TOLERANCE
   *
   * @param {number} oc  관찰자 col
   * @param {number} or_ 관찰자 row
   * @param {number} oh  관찰자 타일 높이
   * @param {number} tc  목표 col
   * @param {number} tr  목표 row
   * @returns {boolean}  true = 차단됨 (보이지 않음)
   */
  _isBlockedByRidge(oc, or_, oh, tc, tr) {
    const targetH = this._tileHeight(tc, tr);
    const dist    = Math.sqrt((tc - oc) ** 2 + (tr - or_) ** 2);
    if (dist < 1.5) return false; // 인접 타일은 항상 보임

    const tolerance = CONFIG.FOG_LOS_TOLERANCE; // 능선 차단 여유 (기본 0.06)

    // Bresenham 직선 샘플링 (중간 타일만, 끝점 제외)
    const steps = Math.ceil(dist);
    for (let i = 1; i < steps; i++) {
      const t  = i / steps;
      const sc = Math.round(oc + (tc - oc) * t);
      const sr = Math.round(or_ + (tr - or_) * t);

      if (!this.gridMap.isInBounds(sc, sr)) continue;
      if (sc === oc && sr === or_) continue; // 관찰자 타일 건너뜀
      if (sc === tc && sr === tr) continue;  // 목표 타일 건너뜀

      const midH     = this._tileHeight(sc, sr);
      // 관찰자→목표 보간 높이 (중간 지점의 "기대 높이")
      const interpH  = oh + (targetH - oh) * t;

      if (midH > interpH + tolerance) {
        return true; // 능선에 가려짐
      }
    }
    return false;
  }

  /* ── 타일 높이 조회 헬퍼 ─────────────────────────────────── */
  _tileHeight(col, row) {
    const gm = this.gridMap;
    if (!gm.isInBounds(col, row)) return 0;
    return gm.tiles[row][col].height;
  }
}
