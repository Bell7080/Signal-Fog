/* ============================================================
   APIKeyModal.js (src/ai/) — 시작 전 API 키 선택 + 병력 편성 + 맵 크기 팝업
   v0.4 FIX:
     - src/ui/APIKeyModal.js 충돌 제거 (이 파일만 사용)
     - 맵 크기 슬라이더 추가 (10×10 ~ 30×30)
     - CONFIG.SQUAD_COUNT / ENEMY_COUNT / GRID_COLS / GRID_ROWS 올바르게 주입
   ============================================================ */

class APIKeyModal {

  static show(onStart) {
    const old = document.getElementById('api-modal-root');
    if (old) old.remove();

    const mapDef = CONFIG.MAP_DEFAULT || 20;
    const mapMin = CONFIG.MAP_MIN || 10;
    const mapMax = CONFIG.MAP_MAX || 30;

    const root = document.createElement('div');
    root.id = 'api-modal-root';
    root.innerHTML = `
      <style>
        #api-modal-root {
          position: fixed; inset: 0; z-index: 99999;
          background: rgba(4,6,4,0.97);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Share Tech Mono', monospace;
          overflow-y: auto; padding: 20px 0;
        }
        #api-modal-root::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.13) 2px,rgba(0,0,0,.13) 4px);
          z-index: 1;
        }
        #api-modal-box {
          position: relative; z-index: 2; width: 540px;
          border: 1px solid #1e3a28; background: #080c0a;
          box-shadow: 0 0 60px rgba(57,255,142,.08), inset 0 0 30px rgba(57,255,142,.02);
          animation: modalIn .4s cubic-bezier(.16,1,.3,1) forwards;
        }
        @keyframes modalIn { from{opacity:0;transform:translateY(18px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        #api-modal-header { padding:18px 24px 14px; border-bottom:1px solid #1e3a28; background:rgba(30,58,40,.15); }
        #api-modal-logo { font-size:1.5rem; letter-spacing:.3em; color:#39ff8e; text-shadow:0 0 20px rgba(57,255,142,.5); animation:logoFlicker 6s infinite; margin-bottom:4px; }
        @keyframes logoFlicker { 0%,94%,100%{opacity:1} 95%{opacity:.5} 97%{opacity:1} 98%{opacity:.3} }
        #api-modal-sub { font-size:.6rem; letter-spacing:.18em; color:#4a7c59; }
        #api-modal-body { padding:20px 24px 18px; }
        .modal-section-label { font-size:.58rem; letter-spacing:.18em; color:#4a7c59; text-transform:uppercase; margin-bottom:10px; margin-top:14px; }
        .modal-section-label:first-child { margin-top:0; }
        .modal-mode-btns { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:4px; }
        .modal-mode-btn { padding:14px 12px; background:transparent; border:1px solid #1e3a28; color:#4a7c59; font-family:'Share Tech Mono',monospace; font-size:.65rem; letter-spacing:.1em; cursor:pointer; text-align:left; transition:all .2s; line-height:1.6; }
        .modal-mode-btn:hover { border-color:#39ff8e; color:#c8e6c9; background:rgba(57,255,142,.04); }
        .modal-mode-btn.selected { border-color:#39ff8e; color:#39ff8e; background:rgba(57,255,142,.06); box-shadow:0 0 14px rgba(57,255,142,.1); }
        .modal-mode-btn.selected-fallback { border-color:#ffb84d; color:#ffb84d; background:rgba(255,184,77,.06); }
        .modal-mode-icon { font-size:1.1rem; display:block; margin-bottom:6px; }
        .modal-mode-title { display:block; font-size:.72rem; letter-spacing:.08em; margin-bottom:3px; font-weight:bold; }
        .modal-mode-desc { display:block; font-size:.55rem; color:#4a7c59; letter-spacing:.04em; font-family:'Noto Sans KR',sans-serif; line-height:1.5; }
        .modal-mode-btn.selected .modal-mode-desc { color:#1e6644; }
        .modal-mode-btn.selected-fallback .modal-mode-desc { color:#8a6020; }
        #api-key-section { display:none; margin-bottom:4px; animation:fadeIn .25s ease forwards; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        #api-key-section.visible { display:block; }
        .modal-input-wrap { display:flex; border:1px solid #1e3a28; background:rgba(13,20,16,.8); transition:border-color .2s; }
        .modal-input-wrap:focus-within { border-color:#39ff8e; box-shadow:0 0 10px rgba(57,255,142,.1); }
        .modal-input-prefix { padding:9px 10px; font-size:.65rem; color:#39ff8e; border-right:1px solid #1e3a28; user-select:none; white-space:nowrap; }
        #api-key-input { flex:1; padding:9px 10px; background:transparent; border:none; outline:none; font-family:'Share Tech Mono',monospace; font-size:.65rem; color:#c8e6c9; caret-color:#39ff8e; letter-spacing:.04em; }
        #api-key-input::placeholder { color:#2a5a38; }
        .modal-input-hint { margin-top:6px; font-size:.55rem; color:#4a7c59; letter-spacing:.06em; font-family:'Noto Sans KR',sans-serif; }
        .modal-input-hint a { color:#1e6644; text-decoration:none; }
        .modal-input-hint a:hover { color:#39ff8e; }
        #api-key-status { margin-top:7px; font-size:.58rem; letter-spacing:.08em; min-height:16px; }
        #api-key-status.ok  { color:#39ff8e; }
        #api-key-status.err { color:#ff4444; }
        #api-key-status.chk { color:#ffb84d; animation:pulse 1s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

        /* ── 맵 크기 슬라이더 ── */
        .map-size-wrap { border:1px solid #1e3a28; padding:14px 16px 12px; background:rgba(13,20,16,.5); margin-bottom:4px; }
        .map-size-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .map-size-title { font-size:.65rem; letter-spacing:.1em; color:#c8e6c9; }
        .map-size-val { font-size:1.4rem; color:#39ff8e; text-shadow:0 0 10px rgba(57,255,142,.4); letter-spacing:.06em; }
        .map-size-slider { width:100%; -webkit-appearance:none; appearance:none; height:3px; border-radius:2px; outline:none; cursor:pointer; background:linear-gradient(to right,#39ff8e 0%,#39ff8e var(--map-pct,50%),#1e3a28 var(--map-pct,50%),#1e3a28 100%); }
        .map-size-slider::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; border:2px solid #39ff8e; background:#080c0a; box-shadow:0 0 8px #39ff8e; cursor:pointer; }
        .map-size-info { display:flex; justify-content:space-between; margin-top:7px; font-size:.54rem; color:#4a7c59; letter-spacing:.06em; font-family:'Noto Sans KR',sans-serif; }
        .map-size-info b { color:#39ff8e; }

        /* ── 지형 프리뷰 태그 ── */
        .terrain-tags { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
        .terrain-tag { font-size:.52rem; padding:2px 8px; border:1px solid; letter-spacing:.06em; }
        .terrain-tag.open   { color:#39ff8e; border-color:#39ff8e; }
        .terrain-tag.forest { color:#22aa55; border-color:#22aa55; }
        .terrain-tag.valley { color:#2277cc; border-color:#2277cc; }
        .terrain-tag.hill   { color:#ffb84d; border-color:#ffb84d; }
        .terrain-tag.river  { color:#44aaff; border-color:#44aaff; }
        .terrain-tag.bridge { color:#ff8844; border-color:#ff8844; }

        /* ── 병력 편성 ── */
        .force-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:4px; }
        .force-card { border:1px solid #1e3a28; padding:14px 14px 12px; background:rgba(13,20,16,.5); }
        .force-card.ally-card  { border-color:#1e6644; }
        .force-card.enemy-card { border-color:#662222; }
        .force-card-title { font-size:.58rem; letter-spacing:.14em; margin-bottom:10px; text-transform:uppercase; }
        .ally-card  .force-card-title { color:#39ff8e; }
        .enemy-card .force-card-title { color:#ff4444; }
        .force-counter { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .force-btn { width:28px; height:28px; border:1px solid #1e3a28; background:transparent; font-family:'Share Tech Mono',monospace; font-size:1rem; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; flex-shrink:0; color:#c8e6c9; }
        .force-btn:hover { background:rgba(255,255,255,.07); border-color:#c8e6c9; }
        .force-val { font-size:1.8rem; font-weight:bold; min-width:36px; text-align:center; line-height:1; }
        .ally-card  .force-val { color:#39ff8e; text-shadow:0 0 12px rgba(57,255,142,.4); }
        .enemy-card .force-val { color:#ff4444; text-shadow:0 0 12px rgba(255,68,68,.4); }
        .force-label { font-size:.55rem; color:#4a7c59; letter-spacing:.06em; text-align:center; margin-top:5px; font-family:'Noto Sans KR',sans-serif; }
        .force-slider { width:100%; margin-top:8px; -webkit-appearance:none; appearance:none; height:3px; border-radius:2px; outline:none; cursor:pointer; background:linear-gradient(to right,var(--slider-fill,#39ff8e) 0%,var(--slider-fill,#39ff8e) var(--slider-pct,50%),#1e3a28 var(--slider-pct,50%),#1e3a28 100%); }
        .force-slider::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; border:2px solid var(--slider-fill,#39ff8e); background:#080c0a; box-shadow:0 0 6px var(--slider-fill,#39ff8e); cursor:pointer; }
        .ally-slider  { --slider-fill:#39ff8e; }
        .enemy-slider { --slider-fill:#ff4444; }
        .force-preview { margin-top:6px; font-size:.52rem; color:#4a7c59; letter-spacing:.06em; font-family:'Noto Sans KR',sans-serif; text-align:center; }
        .modal-sep { height:1px; background:#1e3a28; margin:14px 0; }
        #api-modal-start { width:100%; padding:13px; background:transparent; border:1px solid #39ff8e; color:#39ff8e; font-family:'Share Tech Mono',monospace; font-size:.78rem; letter-spacing:.2em; text-transform:uppercase; cursor:pointer; transition:all .2s; position:relative; overflow:hidden; }
        #api-modal-start:hover { background:rgba(57,255,142,.1); box-shadow:0 0 24px rgba(57,255,142,.2); }
        #api-modal-start:disabled { border-color:#1e3a28; color:#2a5a38; cursor:not-allowed; box-shadow:none; }
        #api-modal-footer { padding:10px 24px 14px; border-top:1px solid #1e3a28; font-size:.53rem; color:#2a5a38; letter-spacing:.06em; font-family:'Noto Sans KR',sans-serif; line-height:1.6; }
      </style>

      <div id="api-modal-box">
        <div id="api-modal-header">
          <div id="api-modal-logo">SIGNAL-FOG</div>
          <div id="api-modal-sub">KCTC 과학화전투 시뮬레이터 // v0.4 — 팀 LNG</div>
        </div>

        <div id="api-modal-body">

          <!-- 전투 모드 -->
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

          <!-- API 키 입력 -->
          <div id="api-key-section">
            <div class="modal-section-label" style="margin-top:14px;">▸ Gemini API 키 입력</div>
            <div class="modal-input-wrap">
              <span class="modal-input-prefix">KEY&gt;</span>
              <input id="api-key-input" type="password" placeholder="AIzaSy..."
                oninput="APIKeyModal._onKeyInput(this.value)"
                onpaste="setTimeout(()=>APIKeyModal._onKeyInput(document.getElementById('api-key-input').value),0)" />
            </div>
            <div class="modal-input-hint">
              키 발급: <a href="https://aistudio.google.com/app/apikey" target="_blank">aistudio.google.com</a>
              &nbsp;(무료 플랜 / 분당 15회)
            </div>
            <div id="api-key-status"></div>
          </div>

          <!-- 맵 크기 -->
          <div class="modal-section-label">▸ 작전 구역 맵 크기</div>
          <div class="map-size-wrap">
            <div class="map-size-row">
              <span class="map-size-title">맵 크기</span>
              <span class="map-size-val" id="map-size-display">${mapDef} × ${mapDef}</span>
            </div>
            <input type="range" class="map-size-slider" id="map-size-slider"
              min="${mapMin}" max="${mapMax}" value="${mapDef}"
              oninput="APIKeyModal._onMapSlider(this.value)" />
            <div class="map-size-info">
              <span>${mapMin}×${mapMin} (소규모)</span>
              <span>현재: <b id="map-tile-count">${mapDef*mapDef}</b> 타일</span>
              <span>${mapMax}×${mapMax} (대규모)</span>
            </div>
            <div class="terrain-tags">
              <span class="terrain-tag open">개활지</span>
              <span class="terrain-tag forest">수풀</span>
              <span class="terrain-tag valley">계곡</span>
              <span class="terrain-tag hill">고지</span>
              <span class="terrain-tag river">하천 (연결)</span>
              <span class="terrain-tag bridge">교량</span>
            </div>
          </div>

          <!-- 병력 편성 -->
          <div class="modal-section-label">▸ 병력 편성 (1 ~ 10개 분대)</div>
          <div class="force-grid">
            <div class="force-card ally-card">
              <div class="force-card-title">🟢 아군 분대</div>
              <div class="force-counter">
                <button class="force-btn" onclick="APIKeyModal._changeCount('ally',-1)">−</button>
                <div><div class="force-val" id="ally-count-val">5</div><div class="force-label">개 분대</div></div>
                <button class="force-btn" onclick="APIKeyModal._changeCount('ally',+1)">+</button>
              </div>
              <input type="range" class="force-slider ally-slider" id="ally-slider" min="1" max="10" value="5" oninput="APIKeyModal._onSlider('ally',this.value)" />
              <div class="force-preview" id="ally-preview">병사 20명 / AP 5×4</div>
            </div>
            <div class="force-card enemy-card">
              <div class="force-card-title">🔴 적군 분대</div>
              <div class="force-counter">
                <button class="force-btn" onclick="APIKeyModal._changeCount('enemy',-1)">−</button>
                <div><div class="force-val" id="enemy-count-val">5</div><div class="force-label">개 분대</div></div>
                <button class="force-btn" onclick="APIKeyModal._changeCount('enemy',+1)">+</button>
              </div>
              <input type="range" class="force-slider enemy-slider" id="enemy-slider" min="1" max="10" value="5" oninput="APIKeyModal._onSlider('enemy',this.value)" />
              <div class="force-preview" id="enemy-preview">병사 20명</div>
            </div>
          </div>

          <div class="modal-sep"></div>

          <button id="api-modal-start" disabled onclick="APIKeyModal._start()">
            ▶ &nbsp; 훈련 개시
          </button>
        </div>

        <div id="api-modal-footer">
          ※ 입력된 API 키는 브라우저 메모리에만 보관되며 외부로 전송되지 않습니다.<br>
          ※ 하천은 맵을 가로지르도록 연결 생성됩니다. 교량으로 도하 가능합니다.
        </div>
      </div>
    `;

    document.body.appendChild(root);
    APIKeyModal._onStart    = onStart;
    APIKeyModal._mode       = null;
    APIKeyModal._allyCount  = 5;
    APIKeyModal._enemyCount = 5;
    APIKeyModal._mapSize    = mapDef;
    APIKeyModal._updateSliderGradient('ally',  5);
    APIKeyModal._updateSliderGradient('enemy', 5);
    APIKeyModal._updateMapSliderGradient(mapDef, mapMin, mapMax);
    APIKeyModal._updatePreview();
  }

  static _updateMapSliderGradient(val, min, max) {
    const slider = document.getElementById('map-size-slider');
    if (!slider) return;
    const pct = ((val - min) / (max - min) * 100).toFixed(1);
    slider.style.setProperty('--map-pct', pct + '%');
  }

  static _onMapSlider(val) {
    const n = parseInt(val);
    APIKeyModal._mapSize = n;
    const dispEl = document.getElementById('map-size-display');
    const tileEl = document.getElementById('map-tile-count');
    if (dispEl) dispEl.textContent = `${n} × ${n}`;
    if (tileEl) tileEl.textContent = `${n * n}`;
    const min = CONFIG.MAP_MIN || 10, max = CONFIG.MAP_MAX || 30;
    APIKeyModal._updateMapSliderGradient(n, min, max);
  }

  static _updateSliderGradient(side, val) {
    const slider = document.getElementById(`${side}-slider`);
    if (!slider) return;
    const pct = ((val - 1) / 9 * 100).toFixed(1);
    slider.style.setProperty('--slider-pct', pct + '%');
  }

  static _changeCount(side, delta) {
    const key  = side === 'ally' ? '_allyCount' : '_enemyCount';
    const next = Math.min(10, Math.max(1, APIKeyModal[key] + delta));
    APIKeyModal[key] = next;
    document.getElementById(`${side}-count-val`).textContent = next;
    const slider = document.getElementById(`${side}-slider`);
    if (slider) slider.value = next;
    APIKeyModal._updateSliderGradient(side, next);
    APIKeyModal._updatePreview();
  }

  static _onSlider(side, val) {
    const n   = parseInt(val);
    const key = side === 'ally' ? '_allyCount' : '_enemyCount';
    APIKeyModal[key] = n;
    document.getElementById(`${side}-count-val`).textContent = n;
    APIKeyModal._updateSliderGradient(side, n);
    APIKeyModal._updatePreview();
  }

  static _updatePreview() {
    const troop = (typeof CONFIG !== 'undefined' ? CONFIG.SQUAD_TROOP_MAX : 4);
    const a = APIKeyModal._allyCount, e = APIKeyModal._enemyCount;
    const allyEl  = document.getElementById('ally-preview');
    const enemyEl = document.getElementById('enemy-preview');
    if (allyEl)  allyEl.textContent  = `병사 ${a * troop}명 / AP ${a}×4`;
    if (enemyEl) enemyEl.textContent = `병사 ${e * troop}명`;
  }

  static _selectMode(mode) {
    APIKeyModal._mode = mode;
    const btnAi      = document.getElementById('btn-ai');
    const btnFallback= document.getElementById('btn-fallback');
    const keySection = document.getElementById('api-key-section');
    const startBtn   = document.getElementById('api-modal-start');
    btnAi.className = btnFallback.className = 'modal-mode-btn';
    if (mode === 'ai') {
      btnAi.className = 'modal-mode-btn selected';
      keySection.classList.add('visible');
      startBtn.disabled = (document.getElementById('api-key-input')?.value || '').trim().length < 20;
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
    if (trimmed.length === 0) { status.textContent=''; status.className=''; startBtn.disabled=true; return; }
    if (!trimmed.startsWith('AIzaSy')) { status.textContent='✗ Gemini API 키는 AIzaSy 로 시작합니다'; status.className='err'; startBtn.disabled=true; return; }
    if (trimmed.length < 30) { status.textContent='⋯ 키를 끝까지 입력하세요'; status.className='chk'; startBtn.disabled=true; return; }
    status.textContent='✓ 키 형식 확인됨 — 시작 가능'; status.className='ok'; startBtn.disabled=false;
  }

  static _start() {
    const mode = APIKeyModal._mode;
    if (!mode) return;

    // ── AI 키 주입 ──
    if (mode === 'ai') {
      const key = document.getElementById('api-key-input').value.trim();
      if (key.length >= 20) {
        CONFIG.GEMINI_API_KEY = key;
        console.log('%c✅ Gemini API Key 주입 완료','color:#39ff8e;font-weight:bold');
      }
    } else {
      CONFIG.GEMINI_API_KEY = '';
    }

    // ── 맵 크기 주입 ── (핵심: GRID_COLS / GRID_ROWS 덮어씀)
    const mapN = APIKeyModal._mapSize || CONFIG.MAP_DEFAULT || 20;
    CONFIG.GRID_COLS = mapN;
    CONFIG.GRID_ROWS = mapN;

    // ── 분대 수 주입 ──
    CONFIG.SQUAD_COUNT  = APIKeyModal._allyCount;
    CONFIG.ENEMY_COUNT  = APIKeyModal._enemyCount;

    console.log(
      `%c⚔ 편성 완료 — 아군 ${CONFIG.SQUAD_COUNT}분대 / 적군 ${CONFIG.ENEMY_COUNT}분대 | 맵 ${mapN}×${mapN}`,
      'color:#39ff8e;font-weight:bold'
    );

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
