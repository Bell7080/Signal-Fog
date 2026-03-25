/* ============================================================
   main.js — Phaser 게임 인스턴스 초기화
   index.html 부팅 시퀀스 완료 후 initGame() 호출됨.
   씬 등록 순서: BootScene → GameScene → ResultScene
   ============================================================ */

function initGame() {

  const phaserConfig = {
    type: Phaser.AUTO,
    parent: 'game-canvas-container',
    backgroundColor: '#040604',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // 씬은 각 Scene 파일 구현 후 순서대로 등록
    scene: [BootScene, GameScene, ResultScene],
  };

  window.phaserGame = new Phaser.Game(phaserConfig);

  // 전역 UI 인스턴스 초기화
  window.chatUI = new ChatUI();
  window.hud    = new HUD();

  chatUI.addLog('SYSTEM', null, 'Signal-Fog 초기화 완료', 'system');
  chatUI.addLog('OC/T',   null, '훈련 시작 준비. 분대 명령 입력 후 CONFIRM.');
  chatUI.addLog('대항군', null, '███ ████ ██ ████████...', 'distort');

  hud.startTurnTimer();
  hud.setStatus('명령 입력 — 각 분대에 행동을 할당하십시오');
}
