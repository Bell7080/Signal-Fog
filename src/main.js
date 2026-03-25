/* ============================================================
   main.js — Three.js 게임 인스턴스 초기화
   index.html 부팅 시퀀스 완료 후 initGame() 호출됨.
   ============================================================ */

function initGame() {
  // 전역 UI 인스턴스 초기화
  window.chatUI = new ChatUI();
  window.hud    = new HUD();

  // Three.js GameScene 초기화
  const container = document.getElementById('game-canvas-container');
  window.gameScene = new GameScene(container);
  window.gameScene.init();

  chatUI.addLog('SYSTEM', null, 'Signal-Fog 3D 맵 초기화 완료', 'system');
  chatUI.addLog('OC/T',   null, '훈련 시작 준비. 분대 명령 입력 후 CONFIRM.');
  chatUI.addLog('대항군', null, '███ ████ ██ ████████...', 'distort');
}
