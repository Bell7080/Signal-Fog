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
    if (window.gameScene && window.gameScene.turnManager) {
      window.gameScene.turnManager.confirmInput();
    } else {
      chatUI.addLog('SYSTEM', null, '입력 확정 — 실행 대기 중', 'system');
      this.setStatus('입력 확정 완료');
      this.stopTimer();
    }
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

/* ── Gemini API 키 모달 ──────────────────────────────────────────
   키는 브라우저 localStorage('signal_fog_gemini_key')에만 저장.
   소스코드·config.js·서버 어디에도 기록하지 않는다.
   ────────────────────────────────────────────────────────────── */
const _LSKEY = 'signal_fog_gemini_key';

function openApiKeyModal() {
  const modal = document.getElementById('api-key-modal');
  const input = document.getElementById('api-key-input');
  const st    = document.getElementById('api-key-status');
  if (!modal) return;

  // 저장된 키 로드 (마스킹된 미리보기)
  const saved = localStorage.getItem(_LSKEY) || '';
  input.value = saved;
  st.textContent = saved
    ? `✔ 저장된 키: ${saved.slice(0,8)}…`
    : '키 없음 — 폴백 AI 사용 중';
  st.className = 'api-key-status ' + (saved ? 'ok' : '');
  modal.classList.add('show');
  input.focus();
}

function closeApiKeyModal() {
  document.getElementById('api-key-modal')?.classList.remove('show');
}

function saveApiKey() {
  const input = document.getElementById('api-key-input');
  const st    = document.getElementById('api-key-status');
  const key   = (input?.value || '').trim();

  if (key && !key.startsWith('AIza')) {
    st.textContent = '⚠ 유효하지 않은 키 형식 (AIzaSy... 로 시작해야 함)';
    st.className   = 'api-key-status err';
    return;
  }

  if (key) {
    localStorage.setItem(_LSKEY, key);
  } else {
    localStorage.removeItem(_LSKEY);
  }

  // GeminiClient에 즉시 반영 + FallbackAI 락 해제
  if (window.gameScene?.enemyAI?.gemini) {
    window.gameScene.enemyAI.gemini.apiKey    = key;
    window.gameScene.enemyAI.usingFallback    = false;
  }

  st.textContent = key ? `✔ 저장 완료. 다음 턴부터 Gemini AI가 적을 지휘합니다.`
                       : '키 삭제됨 — 폴백 AI 사용';
  st.className = 'api-key-status ok';
  setTimeout(closeApiKeyModal, 1800);
}

function clearApiKey() {
  document.getElementById('api-key-input').value = '';
  saveApiKey();
}
