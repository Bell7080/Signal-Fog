/* ════════════════════════════════════════════
   js/game.js  —  Phaser 게임 초기화
   boot.js의 bootStep() 완료 후 호출됨
   Signal-Fog  /  팀 LNG
════════════════════════════════════════════ */

/**
 * Phaser 게임 인스턴스 초기화
 * TODO: Firebase 초기화 → 로비 씬 → 헥스 맵 씬으로 교체 예정
 */
function initGame() {

  /* ── Firebase 초기화 (설정 후 주석 해제) ──
  firebase.initializeApp({
    apiKey:            "YOUR_API_KEY",
    authDomain:        "YOUR_PROJECT.firebaseapp.com",
    databaseURL:       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId:         "YOUR_PROJECT",
    storageBucket:     "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId:             "YOUR_APP_ID",
  });
  */

  /* ── Phaser 설정 ── */
  const config = {
    type: Phaser.AUTO,
    parent: 'game-canvas-container',
    backgroundColor: '#040604',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: {
      create() {
        // ── 임시 플레이스홀더: 헥스 맵 구현 전 ──
        const { width, height } = this.scale;
        this.add.text(
          width / 2, height / 2,
          '[ HEX MAP LOADING... ]\n20×20 헥스 그리드 초기화 대기',
          {
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '14px',
            color: '#1e6644',
            align: 'center',
          }
        ).setOrigin(0.5);

        // 마우스 좌표 → HUD 그리드 좌표 표시
        this.input.on('pointermove', (ptr) => {
          const gx = String.fromCharCode(65 + Math.floor(ptr.x / 40));
          const gy = String(Math.floor(ptr.y / 40) + 1).padStart(2, '0');
          document.getElementById('hud-coord').textContent = `${gx}-${gy}`;
        });

        // TODO: BootScene → LobbyScene → GameScene 으로 전환
      }
    }
  };

  window.phaserGame = new Phaser.Game(config);

  /* ── 부팅 완료 로그 & 타이머 시작 ── */
  addLog('SYSTEM', null, 'Signal-Fog 초기화 완료 — 로비 대기 중', 'system');
  addLog('OC/T',   null, '훈련 시작 준비. 역할 배정 후 입장하십시오.', '');
  addLog('대항군', null, '███ ████ ██ ████████...', 'distort');

  startTurnTimer(); // timer.js
  setStatus('로비 — 역할 배정 대기 중');
}
