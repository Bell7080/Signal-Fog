/* ============================================================
   ResultScene.js — 결과 화면 씬
   역할: 게임 종료 후 승패·통신 오류 요약 표시.

   표시 항목:
     - 승/패 판정 (목표 점령, 전멸, 턴 초과)
     - 턴 수 및 오청 발생 횟수
     - 아군·적군 잔여 병력
     - [다시 시작] 버튼 → GameScene 재시작

   구현 순서 (하나씩 추가):
     1. init(data)   — GameScene에서 결과 데이터 수신
     2. create()     — 결과 UI 렌더링
     3. onRestart()  — GameScene 재시작
   ============================================================ */

class ResultScene extends Phaser.Scene {

  constructor() {
    super({ key: 'ResultScene' });
    this.resultData = null;
  }

  // GameScene에서 this.scene.start('ResultScene', { ... }) 로 데이터 전달
  init(data) {
    this.resultData = data;
  }

  create() {
    const { width, height } = this.scale;

    // TODO: 승패 텍스트, 통계 표시
    // const { win, turns, mishearCount, allyRemain, enemyRemain } = this.resultData;

    // 임시 플레이스홀더
    this.add.text(width / 2, height / 2,
      '[ RESULT ]\nResultScene — 구현 대기 중',
      {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '14px',
        color: '#1e6644',
        align: 'center',
      }
    ).setOrigin(0.5);

    // TODO: 다시 시작 버튼
    // this.add.text(...).setInteractive().on('pointerdown', this.onRestart, this);
  }

  onRestart() {
    this.scene.start('GameScene');
  }
}
