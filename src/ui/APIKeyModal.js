/* ============================================================
   APIKeyModal.js — 시작 전 API 키 선택 팝업
   index.html 하단에 <script src="src/ui/APIKeyModal.js"></script>
   로 로드한 뒤, window.onload 대신 APIKeyModal.show()를 호출.
   ============================================================ */

class APIKeyModal {

  static show(onStart) {
    // 이미 있으면 제거
    const old = document.getElementById('api-modal-root');
    if (old) old.remove();

    const root = document.createElement('div');
    root.id = 'api-modal-root';
    root.innerHTML = `
      <style>
        #api-modal-root {
          position: fixed; inset: 0; z-index: 99999;
          background: rgba(4, 6, 4, 0.97);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Share Tech Mono', monospace;
        }

        /* 스캔라인 오버레이 */
        #api-modal-root::before {
          content: '';
          position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(
            0deg, transparent, transparent 2px,
            rgba(0,0,0,0.13) 2px, rgba(0,0,0,0.13) 4px
          );
          z-index: 1;
        }

        #api-modal-box {
          position: relative; z-index: 2;
          width: 480px;
          border: 1px solid #1e3a28;
          background: #080c0a;
          box-shadow:
            0 0 60px rgba(57,255,142,0.08),
            0 0 120px rgba(57,255,142,0.04),
            inset 0 0 30px rgba(57,255,142,0.02);
          animation: modalIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
        }

        @keyframes modalIn {
          from { opacity: 0; transform: translateY(18px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }

        /* 상단 헤더 */
        #api-modal-header {
          padding: 18px 24px 14px;
          border-bottom: 1px solid #1e3a28;
          background: rgba(30,58,40,0.15);
        }

        #api-modal-logo {
          font-size: 1.5rem;
          letter-spacing: 0.3em;
          color: #39ff8e;
          text-shadow: 0 0 20px rgba(57,255,142,0.5);
          animation: logoFlicker 6s infinite;
          margin-bottom: 4px;
        }

        @keyframes logoFlicker {
          0%,94%,100% { opacity:1 }
          95% { opacity:0.5 }
          97% { opacity:1 }
          98% { opacity:0.3 }
        }

        #api-modal-sub {
          font-size: 0.6rem;
          letter-spacing: 0.18em;
          color: #4a7c59;
        }

        /* 본문 */
        #api-modal-body {
          padding: 22px 24px 20px;
        }

        .modal-section-label {
          font-size: 0.58rem;
          letter-spacing: 0.18em;
          color: #4a7c59;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        /* 모드 선택 버튼 */
        .modal-mode-btns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 20px;
        }

        .modal-mode-btn {
          padding: 14px 12px;
          background: transparent;
          border: 1px solid #1e3a28;
          color: #4a7c59;
          font-family: 'Share Tech Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
          line-height: 1.6;
        }

        .modal-mode-btn:hover {
          border-color: #39ff8e;
          color: #c8e6c9;
          background: rgba(57,255,142,0.04);
        }

        .modal-mode-btn.selected {
          border-color: #39ff8e;
          color: #39ff8e;
          background: rgba(57,255,142,0.06);
          box-shadow: 0 0 14px rgba(57,255,142,0.1);
        }

        .modal-mode-btn.selected-fallback {
          border-color: #ffb84d;
          color: #ffb84d;
          background: rgba(255,184,77,0.06);
          box-shadow: 0 0 14px rgba(255,184,77,0.1);
        }

        .modal-mode-icon {
          font-size: 1.1rem;
          display: block;
          margin-bottom: 6px;
        }

        .modal-mode-title {
          display: block;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          margin-bottom: 3px;
          font-weight: bold;
        }

        .modal-mode-desc {
          display: block;
          font-size: 0.55rem;
          color: #4a7c59;
          letter-spacing: 0.04em;
          font-family: 'Noto Sans KR', sans-serif;
          line-height: 1.5;
        }

        .modal-mode-btn.selected     .modal-mode-desc { color: #1e6644; }
        .modal-mode-btn.selected-fallback .modal-mode-desc { color: #8a6020; }

        /* API 키 입력 영역 */
        #api-key-section {
          display: none;
          margin-bottom: 18px;
          animation: fadeIn 0.25s ease forwards;
        }

        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }

        #api-key-section.visible { display: block; }

        .modal-input-wrap {
          display: flex;
          border: 1px solid #1e3a28;
          background: rgba(13,20,16,0.8);
          transition: border-color 0.2s;
        }

        .modal-input-wrap:focus-within {
          border-color: #39ff8e;
          box-shadow: 0 0 10px rgba(57,255,142,0.1);
        }

        .modal-input-prefix {
          padding: 9px 10px;
          font-size: 0.65rem;
          color: #39ff8e;
          border-right: 1px solid #1e3a28;
          user-select: none;
          white-space: nowrap;
        }

        #api-key-input {
          flex: 1;
          padding: 9px 10px;
          background: transparent;
          border: none;
          outline: none;
          font-family: 'Share Tech Mono', monospace;
          font-size: 0.65rem;
          color: #c8e6c9;
          caret-color: #39ff8e;
          letter-spacing: 0.04em;
        }

        #api-key-input::placeholder { color: #2a5a38; }

        .modal-input-hint {
          margin-top: 6px;
          font-size: 0.55rem;
          color: #4a7c59;
          letter-spacing: 0.06em;
          font-family: 'Noto Sans KR', sans-serif;
        }

        .modal-input-hint a {
          color: #1e6644;
          text-decoration: none;
        }
        .modal-input-hint a:hover { color: #39ff8e; }

        /* 검증 상태 */
        #api-key-status {
          margin-top: 7px;
          font-size: 0.58rem;
          letter-spacing: 0.08em;
          min-height: 16px;
        }

        #api-key-status.ok  { color: #39ff8e; }
        #api-key-status.err { color: #ff4444; }
        #api-key-status.chk { color: #ffb84d; animation: pulse 1s infinite; }

        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        /* 구분선 */
        .modal-sep {
          height: 1px;
          background: #1e3a28;
          margin: 0 0 18px;
        }

        /* 시작 버튼 */
        #api-modal-start {
          width: 100%;
          padding: 13px;
          background: transparent;
          border: 1px solid #39ff8e;
          color: #39ff8e;
          font-family: 'Share Tech Mono', monospace;
          font-size: 0.78rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }

        #api-modal-start::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(57,255,142,0.08), transparent);
          transform: translateX(-100%);
          transition: transform 0.4s;
        }

        #api-modal-start:hover {
          background: rgba(57,255,142,0.1);
          box-shadow: 0 0 24px rgba(57,255,142,0.2);
        }

        #api-modal-start:hover::before { transform: translateX(100%); }

        #api-modal-start:disabled {
          border-color: #1e3a28;
          color: #2a5a38;
          cursor: not-allowed;
          box-shadow: none;
        }

        #api-modal-start:disabled::before { display: none; }

        /* 하단 경고 */
        #api-modal-footer {
          padding: 10px 24px 14px;
          border-top: 1px solid #1e3a28;
          font-size: 0.53rem;
          color: #2a5a38;
          letter-spacing: 0.06em;
          font-family: 'Noto Sans KR', sans-serif;
          line-height: 1.6;
        }
      </style>

      <div id="api-modal-box">

        <div id="api-modal-header">
          <div id="api-modal-logo">SIGNAL-FOG</div>
          <div id="api-modal-sub">KCTC 과학화전투 시뮬레이터 // v0.1 ALPHA — 팀 LNG</div>
        </div>

        <div id="api-modal-body">

          <div class="modal-section-label">▸ 전투 모드 선택</div>

          <div class="modal-mode-btns">
            <button class="modal-mode-btn" id="btn-ai" onclick="APIKeyModal._selectMode('ai')">
              <span class="modal-mode-icon">🤖</span>
              <span class="modal-mode-title">AI 대항군 탑재</span>
              <span class="modal-mode-desc">Gemini API 기반<br>전술 판단 적군 AI</span>
            </button>
            <button class="modal-mode-btn" id="btn-fallback" onclick="APIKeyModal._selectMode('fallback')">
              <span class="modal-mode-icon">⚡</span>
              <span class="modal-mode-title">기본 모드 시작</span>
              <span class="modal-mode-desc">API 키 불필요<br>내장 전술 AI 사용</span>
            </button>
          </div>

          <div id="api-key-section">
            <div class="modal-section-label">▸ Gemini API 키 입력</div>
            <div class="modal-input-wrap">
              <span class="modal-input-prefix">KEY&gt;</span>
              <input id="api-key-input" type="password"
                placeholder="AIzaSy..."
                oninput="APIKeyModal._onKeyInput(this.value)"
                onpaste="setTimeout(()=>APIKeyModal._onKeyInput(document.getElementById('api-key-input').value),0)"
              />
            </div>
            <div class="modal-input-hint">
              키 발급: <a href="https://aistudio.google.com/app/apikey" target="_blank">aistudio.google.com</a>
              &nbsp;(무료 플랜 / 분당 15회)
            </div>
            <div id="api-key-status"></div>
          </div>

          <div class="modal-sep"></div>

          <button id="api-modal-start" disabled onclick="APIKeyModal._start()">
            ▶ &nbsp; 훈련 개시
          </button>

        </div>

        <div id="api-modal-footer">
          ※ 입력된 API 키는 브라우저 메모리에만 보관되며 외부로 전송되지 않습니다.<br>
          ※ 키 미입력 시 내장 AI(폴백)로 동작합니다. 심사 데모에서도 정상 작동합니다.
        </div>

      </div>
    `;

    document.body.appendChild(root);
    APIKeyModal._onStart = onStart;
    APIKeyModal._mode    = null;
  }

  static _selectMode(mode) {
    APIKeyModal._mode = mode;

    const btnAi       = document.getElementById('btn-ai');
    const btnFallback = document.getElementById('btn-fallback');
    const keySection  = document.getElementById('api-key-section');
    const startBtn    = document.getElementById('api-modal-start');

    // 버튼 스타일 초기화
    btnAi.className       = 'modal-mode-btn';
    btnFallback.className = 'modal-mode-btn';

    if (mode === 'ai') {
      btnAi.className      = 'modal-mode-btn selected';
      keySection.classList.add('visible');
      // 키 입력값 있으면 바로 활성화
      const val = (document.getElementById('api-key-input')?.value || '').trim();
      startBtn.disabled = val.length < 20;
    } else {
      btnFallback.className = 'modal-mode-btn selected-fallback';
      keySection.classList.remove('visible');
      document.getElementById('api-key-status').textContent = '';
      startBtn.disabled = false;
    }
  }

  static _onKeyInput(val) {
    const status   = document.getElementById('api-key-status');
    const startBtn = document.getElementById('api-modal-start');
    const trimmed  = val.trim();

    if (trimmed.length === 0) {
      status.textContent = '';
      status.className   = '';
      startBtn.disabled  = true;
      return;
    }

    if (!trimmed.startsWith('AIzaSy')) {
      status.textContent = '✗ Gemini API 키는 AIzaSy 로 시작합니다';
      status.className   = 'err';
      startBtn.disabled  = true;
      return;
    }

    if (trimmed.length < 30) {
      status.textContent = '⋯ 키를 끝까지 입력하세요';
      status.className   = 'chk';
      startBtn.disabled  = true;
      return;
    }

    status.textContent = '✓ 키 형식 확인됨 — 시작 가능';
    status.className   = 'ok';
    startBtn.disabled  = false;
  }

  static _start() {
    const mode = APIKeyModal._mode;
    if (!mode) return;

    if (mode === 'ai') {
      const key = document.getElementById('api-key-input').value.trim();
      if (key.length >= 20) {
        CONFIG.GEMINI_API_KEY = key;
        console.log('%c✅ Gemini API Key 런타임 주입 완료', 'color:#39ff8e;font-weight:bold');
      }
    } else {
      // 폴백 모드: 키 비워서 EnemyAI가 처음부터 FallbackAI 사용
      CONFIG.GEMINI_API_KEY = '';
    }

    // 모달 페이드아웃 후 제거
    const root = document.getElementById('api-modal-root');
    if (root) {
      root.style.transition = 'opacity 0.35s';
      root.style.opacity    = '0';
      setTimeout(() => { root.remove(); APIKeyModal._onStart?.(); }, 370);
    } else {
      APIKeyModal._onStart?.();
    }
  }
}
