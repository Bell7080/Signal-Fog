/* ============================================================
   CombatSystem.js — 교전 판정 시스템
   예선 MVP: 소총 1종, 즉사·부상 판정

   무기 스펙 (CONFIG 기준):
     소총: 사거리 4타일, 기본 명중률 60%

   구현 순서 (하나씩 추가):
     1. inRange()       — 사거리 내 여부 확인 (맨해튼 거리)
     2. rollHit()       — 명중 판정 (기본 명중률 + 지형 보정)
     3. applyDamage()   — 즉사 또는 부상 처리
     4. checkExpose()   — 빗나감 시 소음 발생 (위치 노출 여부)
   ============================================================ */

class CombatSystem {

  /**
   * 사거리 내 여부 확인 (맨해튼 거리)
   * @param {{ col, row }} from
   * @param {{ col, row }} to
   * @param {number} [range=CONFIG.RIFLE_RANGE]
   * @returns {boolean}
   */
  inRange(from, to, range = CONFIG.RIFLE_RANGE) {
    const dist = Math.abs(from.col - to.col) + Math.abs(from.row - to.row);
    return dist <= range;
  }

  /**
   * 명중 판정
   * @param {{ col, row }} attackerPos
   * @param {{ col, row }} targetPos
   * @param {object} targetTerrain - CONFIG.TERRAIN 항목
   * @returns {boolean}
   */
  rollHit(attackerPos, targetPos, targetTerrain) {
    if (!this.inRange(attackerPos, targetPos)) return false;

    let hitRate = CONFIG.RIFLE_HIT_RATE;

    // 지형 엄폐 보정
    if (targetTerrain && targetTerrain.cover) {
      hitRate -= targetTerrain.cover;
    }

    return Math.random() < hitRate;
  }

  /**
   * 피해 적용 (즉사 또는 부상)
   * @param {object} targetUnit - 피격 유닛 데이터
   * @returns {{ result: 'kill' | 'wound', unit: object }}
   */
  applyDamage(targetUnit) {
    // TODO: 예선 MVP — 즉사 단일 판정
    // 본선에서 부상(Wound) 스탯 추가 예정
    targetUnit.alive = false;
    return { result: 'kill', unit: targetUnit };
  }

  /**
   * 빗나감 시 소음 발생 여부 판정
   * @param {{ col, row }} attackerPos
   * @returns {boolean} - true면 공격자 위치 노출
   */
  checkExpose(attackerPos) {
    // TODO: 소음 반경 계산, FogOfWar와 연동
    return Math.random() < 0.3;
  }
}
