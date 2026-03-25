/* ============================================================
   HUD.js — 턴 타이머 및 하단 액션 버튼 관리
   turnManager.confirmInput() 과 연동하여 페이즈 전환 처리.

   구현 순서 (하나씩 추가):
     1. startTurnTimer()   — 카운트다운 타이머 시작
     2. updateTimerUI()    — 타이머 수치·색상·바 갱신
     3. stopTimer()        — 타이머 정지
     4. setStatus()        — footer 상태 텍스트 갱신
     5. holdAction()       — HOLD 버튼 처리
     6. confirmTurn()      — CONFIRM 버튼 → TurnManager 위임
     7. surrenderAction()  — 항복 버튼 처리
   ============================================================ */

class HUD {

  constructor() {
    this.TURN_SEC     = CONFIG.TURN_INPUT_SEC;
    this.turnRemain   = this.TURN_SEC;
    this.timerInterval = null;
  }

  /** 카운트다운 타이머 시작 */
  startTurnTimer() {
    clearInterval(this.timerInterval);
    this.turnRemain = this.TURN_SEC;
    this.updateTimerUI();

    this.timerInterval = setInterval(() => {
      this.turnRemain--;
      this.updateTimerUI();
      if (this.turnRemain <= 0) {
        clearInterval(this.timerInterval);
        this.autoConfirm();
      }
    }, 1000);
  }

  /** 타이머 UI 갱신 (수치, 색상, 진행 바) */
  updateTimerUI() {
    const el  = document.getElementById('turn-timer');
    const bar = document.getElementById('timer-bar');
    if (!el || !bar) return;

    el.textContent = this.turnRemain;
    bar.style.width = (this.turnRemain / this.TURN_SEC * 100) + '%';
    el.className = '';

    if (this.turnRemain <= 10) {
      el.classList.add('crit');
      bar.style.background = 'var(--col-red)';
    } else if (this.turnRemain <= 20) {
      el.classList.add('warn');
      bar.style.background = 'var(--col-amber)';
    } else {
      bar.style.background = 'var(--col-green)';
    }
  }

  /** 타이머 정지 */
  stopTimer() {
    clearInterval(this.timerInterval);
  }

  /**
   * footer 상태 텍스트 갱신
   * @param {string} msg
   */
  setStatus(msg) {
    const el = document.getElementById('footer-status');
    if (el) el.textContent = msg;
  }

  /** 시간 초과 자동 처리 */
  autoConfirm() {
    this.setStatus('⚠ 시간 초과 — 자동 HOLD 처리됨');
    chatUI.addLog('SYSTEM', null, '입력 시간 초과 → 자동 대기(HOLD) 처리', 'system');
  }

  /** HOLD 버튼 */
  holdAction() {
    chatUI.addLog('SYSTEM', null, '행동 → HOLD (대기)', 'system');
    this.setStatus('HOLD 선택됨 — 턴 종료 대기');
  }

  /** CONFIRM 버튼 → TurnManager에 위임 */
  confirmTurn() {
    chatUI.addLog('SYSTEM', null, '입력 확정 — 실행 대기 중', 'system');
    this.setStatus('입력 확정 완료');
    this.stopTimer();
    // TODO: if (turnManager) turnManager.confirmInput();
  }

  /** 항복 버튼 */
  surrenderAction() {
    chatUI.addLog('SYSTEM', null, '⚠ 항복 신호 송신됨', 'system');
    this.setStatus('항복 처리 중...');
  }
}

// index.html의 onclick 핸들러와 호환되는 전역 래퍼
function holdAction()      { hud.holdAction(); }
function confirmTurn()     { hud.confirmTurn(); }
function surrenderAction() { hud.surrenderAction(); }
