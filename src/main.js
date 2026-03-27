/* ============================================================
   main.js — Three.js 게임 인스턴스 초기화
   v0.2: 250×250 맵 + 동적 분대 수 반영
   ============================================================ */

function initGame() {
  window.chatUI = new ChatUI();
  window.hud    = new HUD();

  const container = document.getElementById('game-canvas-container');
  window.gameScene = new GameScene(container);
  window.gameScene.init();

  chatUI.addLog('SYSTEM', null, `Signal-Fog 3D 맵 초기화 완료 — 250×250 (62,500타일)`, 'system');
  chatUI.addLog('OC/T',   null, `편성: 아군 ${CONFIG.SQUAD_COUNT}분대 / 적군 ${CONFIG.ENEMY_COUNT}분대`);
  chatUI.addLog('대항군', null, '███ ████ ██ ████████...', 'distort');
}
