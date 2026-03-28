/* ============================================================
   APIKeyModal.js (src/ai/) — 시작 전 API 키 선택 + 병력 편성 + 맵 크기 팝업
   v0.5 FIX:
     - 맵 크기 슬라이더 비선형 스텝 적용
       · 10 ~ 49 → 1 단위
       · 50 ~ 250 → 10 단위
     - 슬라이더 내부 값: 0 ~ (STEPS-1) 인덱스, 실제 맵 크기로 변환
     - 최대 250×250
   ============================================================ */

/* ── 비선형 스텝 테이블 생성 ──────────────────────────────────
   10~49  → 1 단위  (40개)
   50~250 → 10 단위 (21개)
   총 61 스텝 (index 0~60)
   ──────────────────────────────────────────────────────────── */
(function buildMapSteps() {
  const steps = [];
  for (let v = 10; v <= 49; v += 1)  steps.push(v);
  for (let v = 50; v <= 250; v += 10) steps.push(v);
  window._MAP_STEPS = steps;           // [10,11,...,49,50,60,...,250]
  window._MAP_STEPS_MAX_IDX = steps.length - 1;  // 60
})();

function _mapValToIdx(val) {
  const steps = window._MAP_STEPS;
  // 가장 가까운 인덱스 반환
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs(steps[i] - val);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function _mapIdxToVal(idx) {
  const steps = window._MAP_STEPS;
  return steps[Math.max(0, Math.min(steps.length - 1, idx))];
}

class APIKeyModal {

  static show(onStart) {
    const old = document.getElementById('api-modal-root');
    if (old) old.remove();

    const DEF_VAL = CONFIG.MAP_DEFAULT || 20;
    const DEF_IDX = _mapValToIdx(DEF_VAL);
    const MAX_IDX = window._MAP_STEPS_MAX_IDX;

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
          position: relative; z-index: 2; width: 560px;
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

        /* ── 병력 편성 + 맵 크기 — 3열 통합 그리드 ── */
        .force-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:4px; }
        .force-card { border:1px solid #1e3a28; padding:12px 12px 10px; background:rgba(13,20,16,.5); }
        .force-card.ally-card  { border-color:#1e6644; }
        .force-card.enemy-card { border-color:#662222; }
        .force-card.map-card   { border-color:#1e3a55; }
        .force-card-title { font-size:.56rem; letter-spacing:.12em; margin-bottom:9px; text-transform:uppercase; }
        .ally-card  .force-card-title { color:#39ff8e; }
        .enemy-card .force-card-title { color:#ff4444; }
        .map-card   .force-card-title { color:#6699ff; }
        .force-counter { display:flex; align-items:center; justify-content:space-between; gap:6px; }
        .force-btn { width:26px; height:26px; border:1px solid #1e3a28; background:transparent; font-family:'Share Tech Mono',monospace; font-size:1rem; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; flex-shrink:0; color:#c8e6c9; }
        .force-btn:hover { background:rgba(255,255,255,.07); border-color:#c8e6c9; }
        .force-val { font-size:1.6rem; font-weight:bold; min-width:32px; text-align:center; line-height:1; }
        .ally-card  .force-val { color:#39ff8e; text-shadow:0 0 10px rgba(57,255,142,.4); }
        .enemy-card .force-val { color:#ff4444; text-shadow:0 0 10px rgba(255,68,68,.4); }
        .map-card   .force-val { color:#6699ff; text-shadow:0 0 10px rgba(102,153,255,.4); font-size:1.1rem; line-height:1.4; }
        .force-label { font-size:.52rem; color:#4a7c59; letter-spacing:.05em; text-align:center; margin-top:4px; font-family:'Noto Sans KR',sans-serif; }

        /* ── 비선형 맵 슬라이더 ── */
        .force-slider {
          width:100%; margin-top:8px;
          -webkit-appearance:none; appearance:none;
          height:3px; border-radius:2px; outline:none; cursor:pointer;
          background: linear-gradient(to right,
            var(--slider-fill,#39ff8e) 0%,
            var(--slider-fill,#39ff8e) var(--slider-pct,50%),
            #1e3a28 var(--slider-pct,50%),
            #1e3a28 100%);
        }
        .force-slider::-webkit-slider-thumb {
          -webkit-appearance:none; width:13px; height:13px; border-radius:50%;
          border:2px solid var(--slider-fill,#39ff8e);
          background:#080c0a; box-shadow:0 0 5px var(--slider-fill,#39ff8e); cursor:pointer;
        }
        .ally-slider  { --slider-fill:#39ff8e; }
        .enemy-slider { --slider-fill:#ff4444; }
        .map-slider   { --slider-fill:#6699ff; }

        .force-preview { margin-top:5px; font-size:.50rem; color:#4a7c59; letter-spacing:.04em; font-family:'Noto Sans KR',sans-serif; text-align:center; }

        /* ── 맵 크기 스텝 힌트 바 ── */
        .map-step-hint {
          display:flex; justify-content:space-between;
          margin-top:4px; font-size:.44rem; color:#2a5a38; letter-spacing:.03em;
        }

        /* ── 지형 태그 ── */
        .terrain-tags { display:flex; gap:3px; flex-wrap:wrap; margin-top:7px; }
        .terrain-tag { font-size:.46rem; padding:1px 5px; border:1px solid; letter-spacing:.04em; }
        .terrain-tag.open   { color:#39ff8e; border-color:#39ff8e; }
        .terrain-tag.forest { color:#22aa55; border-color:#22aa55; }
        .terrain-tag.valley { color:#2277cc; border-color:#2277cc; }
        .terrain-tag.hill   { color:#ffb84d; border-color:#ffb84d; }
        .terrain-tag.river  { color:#44aaff; border-color:#44aaff; }
        .terrain-tag.bridge { color:#ff8844; border-color:#ff8844; }

        .modal-sep { height:1px; background:#1e3a28; margin:14px 0; }
        #api-modal-start { width:100%; padding:13px; background:transparent; border:1px solid #39ff8e; color:#39ff8e; font-family:'Share Tech Mono',monospace; font-size:.78rem; letter-spacing:.2em; text-transform:uppercase; cursor:pointer; transition:all .2s; position:relative; overflow:hidden; }
        #api-modal-start:hover { background:rgba(57,255,142,.1); box-shadow:0 0 24px rgba(57,255,142,.2); }
        #api-modal-start:disabled { border-color:#1e3a28; color:#2a5a38; cursor:not-allowed; box-shadow:none; }
        #api-modal-footer { padding:10px 24px 14px; border-top:1px solid #1e3a28; font-size:.53rem; color:#2a5a38; letter-spacing:.06em; font-family:'Noto Sans KR',sans-serif; line-height:1.6; }
      </style>

      <div id="api-modal-box">
        <div id="api-modal-header">
          <div id="api-modal-logo">SIGNAL-FOG</div>
          <div id="api-modal-sub">KCTC 과학화전투 시뮬레이터 // v0.5 — 팀 LNG</div>
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

          <!-- 병력 편성 + 맵 크기 -->
          <div class="modal-section-label">▸ 병력 편성 &amp; 작전 구역</div>
          <div class="force-grid">

            <!-- 아군 -->
            <div class="force-card ally-card">
              <div class="force-card-title">🟢 아군 분대</div>
              <div class="force-counter">
                <button class="force-btn" onclick="APIKeyModal._changeCount('ally',-1)">−</button>
                <div><div class="force-val" id="ally-count-val">5</div><div class="force-label">개 분대</div></div>
                <button class="force-btn" onclick="APIKeyModal._changeCount('ally',+1)">+</button>
              </div>
              <input type="range" class="force-slider ally-slider" id="ally-slider"
                min="1" max="10" value="5"
                oninput="APIKeyModal._onSlider('ally',this.value)" />
              <div class="force-preview" id="ally-preview">병사 20명 / AP 5×4</div>
            </div>

            <!-- 적군 -->
            <div class="force-card enemy-card">
              <div class="force-card-title">🔴 적군 분대</div>
              <div class="force-counter">
                <button class="force-btn" onclick="APIKeyModal._changeCount('enemy',-1)">−</button>
                <div><div class="force-val" id="enemy-count-val">5</div><div class="force-label">개 분대</div></div>
                <button class="force-btn" onclick="APIKeyModal._changeCount('enemy',+1)">+</button>
              </div>
              <input type="range" class="force-slider enemy-slider" id="enemy-slider"
                min="1" max="10" value="5"
                oninput="APIKeyModal._onSlider('enemy',this.value)" />
              <div class="force-preview" id="enemy-preview">병사 20명</div>
            </div>

            <!-- 맵 크기 (비선형 슬라이더) -->
            <div class="force-card map-card">
              <div class="force-card-title">🗺 맵 크기</div>
              <div class="force-counter">
                <button class="force-btn" onclick="APIKeyModal._changeMap(-1)" style="border-color:#1e3a55;">−</button>
                <div>
                  <div class="force-val" id="map-size-display">${DEF_VAL}×${DEF_VAL}</div>
                  <div class="force-label" id="map-tile-count">${DEF_VAL*DEF_VAL} 타일</div>
                </div>
                <button class="force-btn" onclick="APIKeyModal._changeMap(+1)" style="border-color:#1e3a55;">+</button>
              </div>
              <!-- 슬라이더 range: 0 ~ MAX_IDX (인덱스 기반) -->
              <input type="range" class="force-slider map-slider" id="map-size-slider"
                min="0" max="${MAX_IDX}" value="${DEF_IDX}"
                oninput="APIKeyModal._onMapSlider(this.value)" />
              <!-- 스텝 힌트 레이블 -->
              <div class="map-step-hint">
                <span>10</span><span>50</span><span>100</span><span>150</span><span>200</span><span>250</span>
              </div>
              <div class="terrain-tags">
                <span class="terrain-tag open">개활지</span>
                <span class="terrain-tag forest">수풀</span>
                <span class="terrain-tag valley">계곡</span>
                <span class="terrain-tag hill">고지</span>
                <span class="terrain-tag river">하천</span>
                <span class="terrain-tag bridge">교량</span>
              </div>
            </div>

          </div>

          <div class="modal-sep"></div>
          <button id="api-modal-start" disabled onclick="APIKeyModal._start()">
            ▶ &nbsp; 훈련 개시
          </button>
        </div>

        <div id="api-modal-footer">
          ※ 입력된 API 키는 브라우저 메모리에만 보관되며 외부로 전송되지 않습니다.<br>
          ※ 맵 50타일 이상부터 10단위 조절 / 최대 250×250 (62,500 타일).
        </div>
      </div>
    `;

    document.body.appendChild(root);
    APIKeyModal._onStart    = onStart;
    APIKeyModal._mode       = null;
    APIKeyModal._allyCount  = 5;
    APIKeyModal._enemyCount = 5;
    APIKeyModal._mapSize    = DEF_VAL;
    APIKeyModal._mapIdx     = DEF_IDX;

    // 초기 슬라이더 그라데이션
    APIKeyModal._updateSliderGradient('ally',  5);
    APIKeyModal._updateSliderGradient('enemy', 5);
    APIKeyModal._updateMapSliderGradient(DEF_IDX);
    APIKeyModal._updatePreview();
  }

  /* ── 맵 슬라이더: 인덱스 → 실제 크기 변환 후 UI 갱신 ── */
  static _onMapSlider(idxStr) {
    const idx = parseInt(idxStr);
    const val = _mapIdxToVal(idx);
    APIKeyModal._mapIdx  = idx;
    APIKeyModal._mapSize = val;
    APIKeyModal._refreshMapUI(val, idx);
  }

  /* ── ± 버튼: 인덱스 1 이동 ── */
  static _changeMap(delta) {
    const newIdx = Math.max(0, Math.min(window._MAP_STEPS_MAX_IDX, APIKeyModal._mapIdx + delta));
    const val    = _mapIdxToVal(newIdx);
    APIKeyModal._mapIdx  = newIdx;
    APIKeyModal._mapSize = val;
    const slider = document.getElementById('map-size-slider');
    if (slider) slider.value = newIdx;
    APIKeyModal._refreshMapUI(val, newIdx);
  }

  static _refreshMapUI(val, idx) {
    const dispEl = document.getElementById('map-size-display');
    const tileEl = document.getElementById('map-tile-count');
    if (dispEl) dispEl.textContent = `${val}×${val}`;
    const tiles = val * val;
    let tileStr = tiles >= 1000 ? `${(tiles / 1000).toFixed(1)}k 타일` : `${tiles} 타일`;
    if (val >= 100) tileStr += ' ⚠';   // 대형 맵 경고
    if (tileEl) tileEl.textContent = tileStr;
    APIKeyModal._updateMapSliderGradient(idx);
  }

  static _updateMapSliderGradient(idx) {
    const slider = document.getElementById('map-size-slider');
    if (!slider) return;
    const pct = (idx / window._MAP_STEPS_MAX_IDX * 100).toFixed(2);
    slider.style.setProperty('--slider-pct', pct + '%');
  }

  /* ── 병력 슬라이더 ── */
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

  /* ── 모드 선택 ── */
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

  /* ── 게임 시작 ── */
  static _start() {
    const mode = APIKeyModal._mode;
    if (!mode) return;

    // AI 키 주입
    if (mode === 'ai') {
      const key = document.getElementById('api-key-input').value.trim();
      if (key.length >= 20) {
        CONFIG.GEMINI_API_KEY = key;
        console.log('%c✅ Gemini API Key 주입 완료','color:#39ff8e;font-weight:bold');
      }
    } else {
      CONFIG.GEMINI_API_KEY = '';
    }

    // 맵 크기 주입 (비선형 스텝 변환 결과)
    const mapN = APIKeyModal._mapSize || CONFIG.MAP_DEFAULT || 20;
    CONFIG.GRID_COLS = mapN;
    CONFIG.GRID_ROWS = mapN;

    // 분대 수 주입
    CONFIG.SQUAD_COUNT  = APIKeyModal._allyCount;
    CONFIG.ENEMY_COUNT  = APIKeyModal._enemyCount;

    console.log(
      `%c⚔ 편성 — 아군 ${CONFIG.SQUAD_COUNT}분대 / 적군 ${CONFIG.ENEMY_COUNT}분대 | 맵 ${mapN}×${mapN}`,
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
