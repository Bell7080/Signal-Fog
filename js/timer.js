/* ════════════════════════════════════════════
   js/timer.js  —  턴 타이머
   Signal-Fog  /  팀 LNG
════════════════════════════════════════════ */

const TURN_SEC = 60;
let turnRemain   = TURN_SEC;
let timerInterval = null;

/** 타이머 UI(숫자 + 컬러 바) 갱신 */
function updateTimerUI() {
  const el  = document.getElementById('turn-timer');
  const bar = document.getElementById('timer-bar');

  el.textContent = turnRemain;
  bar.style.width = (turnRemain / TURN_SEC * 100) + '%';
  el.className = '';

  if (turnRemain <= 10) {
    el.classList.add('crit');
    bar.style.background = 'var(--col-red)';
  } else if (turnRemain <= 20) {
    el.classList.add('warn');
    bar.style.background = 'var(--col-amber)';
  } else {
    bar.style.background = 'var(--col-green)';
  }
}

/** 타이머 만료 시 자동 HOLD 처리 */
function autoConfirm() {
  setStatus('⚠ 시간 초과 — 자동 HOLD 처리됨');
  addLog('SYSTEM', null, '입력 시간 초과 → 자동 대기(HOLD) 처리', 'system');
}

/**
 * 턴 타이머 시작 (60초 카운트다운)
 * game.js의 initGame() 또는 턴 전환 시 호출
 */
function startTurnTimer() {
  clearInterval(timerInterval);
  turnRemain = TURN_SEC;
  updateTimerUI();
  timerInterval = setInterval(() => {
    turnRemain--;
    updateTimerUI();
    if (turnRemain <= 0) {
      clearInterval(timerInterval);
      autoConfirm();
    }
  }, 1000);
}

/** 외부에서 타이머 강제 정지 (confirmTurn 등) */
function stopTurnTimer() {
  clearInterval(timerInterval);
}
