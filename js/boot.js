/* ════════════════════════════════════════════
   js/boot.js  —  부팅 시퀀스 + 시계
   Signal-Fog  /  팀 LNG
════════════════════════════════════════════ */

const BOOT_LINES = [
  '> SIGNAL-FOG v0.1 초기화 중...',
  '> Phaser.js 3.90.0 로드 완료',
  '> Firebase SDK 연결 대기...',
  '> Howler.js 사운드 엔진 활성화',
  '> 헥스 그리드 모듈 로드 중...',
  '> TensorFlow.js 봇 엔진 준비',
  '> Firebase Realtime DB 연결...',
  '> 사지방 네트워크 환경 감지',
  '> 로비 씬 진입 준비 완료',
  '> 전술 시뮬레이터 시작',
];

let bootIdx = 0;
const bootLog = document.getElementById('boot-log');
const bootBar = document.getElementById('boot-bar');
const bootScr = document.getElementById('boot-screen');

/**
 * 한 줄씩 부팅 로그를 출력하고
 * 완료 시 부팅 화면을 페이드 아웃 후 initGame() 호출
 */
function bootStep() {
  if (bootIdx >= BOOT_LINES.length) {
    setTimeout(() => {
      bootScr.style.transition = 'opacity .6s';
      bootScr.style.opacity = '0';
      setTimeout(() => {
        bootScr.style.display = 'none';
        initGame(); // game.js
      }, 650);
    }, 400);
    return;
  }

  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = BOOT_LINES[bootIdx];
  line.style.animationDelay = '0s';
  bootLog.appendChild(line);

  bootIdx++;
  bootBar.style.width = (bootIdx / BOOT_LINES.length * 100) + '%';
  setTimeout(bootStep, 220 + Math.random() * 180);
}

/* ── 시계 ── */
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    String(now.getHours()).padStart(2,'0') + ':' +
    String(now.getMinutes()).padStart(2,'0') + ':' +
    String(now.getSeconds()).padStart(2,'0') + ' KST';
}

/* ── 진입점 ── */
window.addEventListener('load', () => {
  updateClock();
  setInterval(updateClock, 1000);
  setTimeout(bootStep, 600);
});
