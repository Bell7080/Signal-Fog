/* ============================================================
   main.js — Three.js 게임 인스턴스 초기화
   v0.4 FIX: 맵 크기 동적 반영, 로그 메시지 수정
   ============================================================ */

function initGame() {
  window.chatUI = new ChatUI();
  window.hud    = new HUD();

  const container = document.getElementById('game-canvas-container');
  window.gameScene = new GameScene(container);
  window.gameScene.init();

  chatUI.addLog('SYSTEM', null,
    `Signal-Fog 초기화 완료 — ${CONFIG.GRID_COLS}×${CONFIG.GRID_ROWS} 맵 (${CONFIG.GRID_COLS * CONFIG.GRID_ROWS}타일)`,
    'system'
  );
  chatUI.addLog('OC/T', null,
    `편성: 아군 ${CONFIG.SQUAD_COUNT}분대 / 적군 ${CONFIG.ENEMY_COUNT}분대`
  );
  chatUI.addLog('대항군', null, '███ ████ ██ ████████...', 'distort');
}
