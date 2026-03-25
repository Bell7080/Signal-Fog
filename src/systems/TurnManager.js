/* ============================================================
   TurnManager.js — 턴 순서 및 페이즈 전환 관리
   페이즈 흐름: INPUT → EXECUTE_ALLY → EXECUTE_ENEMY → RESULT_CHECK

   구현 순서 (하나씩 추가):
     1. startInputPhase()     — 명령 입력 페이즈 시작, HUD 갱신
     2. issueMove()           — 분대 이동 명령 등록
     3. issueAttack()         — 분대 사격 명령 등록
     4. confirmInput()        — 입력 확정 → EXECUTE 페이즈 전환
     5. executeAlly()         — 아군 명령 순차 실행
     6. executeEnemy()        — EnemyAI 호출 및 적군 행동 실행
     7. checkResult()         — 승패 판정, 필요 시 ResultScene 전환
     8. nextTurn()            — 턴 카운터 증가, 다음 INPUT 페이즈 시작
   ============================================================ */

class TurnManager {

  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene    = scene;
    this.turn     = 1;
    this.phase    = 'INPUT';   // 'INPUT' | 'EXECUTE_ALLY' | 'EXECUTE_ENEMY' | 'RESULT_CHECK'
    this.commands = [];        // 이번 턴 입력된 명령 목록
  }

  /** 명령 입력 페이즈 시작 */
  startInputPhase() {
    this.phase    = 'INPUT';
    this.commands = [];
    document.getElementById('hud-turn').textContent  = String(this.turn).padStart(2, '0');
    document.getElementById('hud-phase').textContent = '입력';
    document.getElementById('phase-val').textContent = '명령 입력';
    // TODO: HUD 타이머 재시작 (hud.startTurnTimer())
  }

  /**
   * 분대 이동 명령 등록
   * @param {number} squadId
   * @param {{ col: number, row: number }} targetTile
   */
  issueMove(squadId, targetTile) {
    this.commands.push({ type: 'move', squadId, targetTile });
    // TODO: CommsSystem.applyMishear() 통과 후 실제 명령 저장
  }

  /**
   * 분대 사격 명령 등록
   * @param {number} squadId
   * @param {number} targetId - 공격 대상 적 유닛 ID
   */
  issueAttack(squadId, targetId) {
    this.commands.push({ type: 'attack', squadId, targetId });
  }

  /** 입력 확정 → 실행 페이즈 진입 */
  async confirmInput() {
    this.phase = 'EXECUTE_ALLY';
    document.getElementById('hud-phase').textContent = '실행';
    document.getElementById('phase-val').textContent = '실행 중';
    await this.executeAlly();
    await this.executeEnemy();
    this.checkResult();
  }

  /** 아군 명령 순차 실행 */
  async executeAlly() {
    // TODO: this.commands 순회 → CombatSystem / GridMap 호출
  }

  /** EnemyAI 호출 및 적군 행동 실행 */
  async executeEnemy() {
    // TODO: enemyAI.decideTurn(mapState) → 적 이동·공격 실행
  }

  /** 승패 판정 */
  checkResult() {
    // TODO: 전멸, 점령, 턴 제한 도달 여부 확인
    // 승패 확정 시 this.scene.start('ResultScene', { win, turns: this.turn, ... })
    if (this.turn >= CONFIG.TURN_LIMIT) {
      // 턴 제한 도달 → 점령 지점 수 비교
      return;
    }
    this.nextTurn();
  }

  /** 다음 턴으로 */
  nextTurn() {
    this.turn++;
    this.startInputPhase();
  }
}
