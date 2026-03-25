/* ============================================================
   SurvivalStats.js — 생존 스탯 계산 및 HUD 연동
   예선 MVP: 피로도·배고픔·수면 HUD 표시 + 매 턴 자동 감소
             고갈 시 AP -1 패널티

   구현 순서 (하나씩 추가):
     1. initStats()      — 분대별 초기 스탯 설정
     2. tickDecay()      — 턴 종료 시 스탯 자동 감소
     3. checkPenalty()   — 스탯 고갈 분대에 AP -1 패널티 적용
     4. updateHUD()      — HUD 바 DOM 갱신
   ============================================================ */

class SurvivalStats {

  /** @param {number} squadCount */
  constructor(squadCount = CONFIG.SQUAD_COUNT) {
    this.stats = {};
    for (let i = 1; i <= squadCount; i++) {
      this.stats[i] = this.initStats();
    }
  }

  /** 초기 스탯 값 반환 */
  initStats() {
    return {
      fatigue: 100,   // 피로도 (높을수록 좋음)
      hunger:  100,   // 포만도
      sleep:   100,   // 수면
    };
  }

  /**
   * 턴 종료 시 스탯 자동 감소
   * @param {number} squadId
   */
  tickDecay(squadId) {
    const s = this.stats[squadId];
    if (!s) return;
    s.fatigue = Math.max(0, s.fatigue - 5);
    s.hunger  = Math.max(0, s.hunger  - 4);
    s.sleep   = Math.max(0, s.sleep   - 3);
  }

  /**
   * 스탯 고갈 시 AP 패널티 판정
   * @param {number} squadId
   * @returns {number} - AP 패널티 수치 (0 또는 -1)
   */
  checkPenalty(squadId) {
    const s = this.stats[squadId];
    if (!s) return 0;
    const depleted = s.fatigue === 0 || s.hunger === 0 || s.sleep === 0;
    return depleted ? -1 : 0;
  }

  /**
   * 특정 분대의 HUD 스탯 바 갱신
   * @param {number} squadId
   */
  updateHUD(squadId) {
    // TODO: 분대별 stat bar DOM 업데이트
    // 현재 left panel은 선택된 분대의 스탯을 표시하도록 확장 예정
  }
}
