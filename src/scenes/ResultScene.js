/* ============================================================
   ResultScene.js — 결과 화면 씬 (Phaser 의존 제거)
   STEP 9에서 DOM 기반 결과 오버레이로 구현 예정.

   표시 항목:
     - 승/패 판정 (목표 점령, 전멸, 턴 초과)
     - 턴 수 및 오청 발생 횟수
     - 아군·적군 잔여 병력
     - [다시 시작] 버튼 → GameScene 재시작
   ============================================================ */

class ResultScene {

  constructor() {
    this.resultData = null;
  }

  /** GameScene에서 결과 데이터 수신 */
  init(data) {
    this.resultData = data;
  }

  create() {
    // TODO: DOM 오버레이로 결과 화면 렌더링
    // const { win, turns, mishearCount, allyRemain, enemyRemain } = this.resultData;
  }

  onRestart() {
    // TODO: GameScene 재시작
    if (window.gameScene) {
      location.reload();
    }
  }
}
