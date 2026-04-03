/* ============================================================
   AARSystem.js — 전투 후 결과 분석 (After Action Review)
   v2: 리플레이 시스템 통합
   ────────────────────────────────────────────────────────────
   · 매 턴 전체 유닛 위치 스냅샷 수집 (리플레이용)
   · 이동 경로 벡터 추적 (분대별 전체 이동 궤적)
   · AAR 오버레이에 캔버스 기반 리플레이 맵 통합
   ============================================================ */

class AARSystem {

  constructor() {
    this._reset();
  }

  _reset() {
    this.turns         = 0;
    this.mishears      = { coord: 0, ignore: 0, attack_instead: 0, total: 0 };
    this.hits          = { ally: 0, enemy: 0 };
    this.shots         = { ally: 0, enemy: 0 };
    this.kills         = { ally: 0, enemy: 0 };
    this.casualties    = { ally: 0, enemy: 0 };
    this.depotDamages  = 0;
    this.commsQualitySum = 0;
    this.commsQualityCount = 0;
    this.phaseKills    = { day: 0, dusk: 0, night: 0, dawn: 0 };
    this.currentPhase  = 'day';
    this.squadLog      = {};
    this._turnSnapshots = [];
    this._combatEvents = [];
    this._mapCols = CONFIG.GRID_COLS;
    this._mapRows = CONFIG.GRID_ROWS;
  }

  /* ── 턴 시작 시 ────────────────────────────────────────────── */
  onTurnStart(turn, dayNight) {
    this.turns = turn;
    if (dayNight) this.currentPhase = dayNight.phase.id;
  }

  /* ── 리플레이: 턴 종료 시 전체 유닛 스냅샷 저장 ─────────────
     TurnManager._checkResult() 직전에 호출
  ──────────────────────────────────────────────────────────── */
  captureSnapshot(allSquads, turn, phase) {
    const snap = {
      turn,
      phase: phase || this.currentPhase,
      units: allSquads.map(s => ({
        id:    s.id,
        side:  s.side,
        col:   s.pos.col,
        row:   s.pos.row,
        alive: s.alive,
        troops: s.troops,
        unitType: s.unitType || 'rifle',
      })),
    };
    this._turnSnapshots.push(snap);
  }

  /* ── 리플레이: 교전 이벤트 기록 ─────────────────────────────
     applyHit 호출 시점에 저장
  ──────────────────────────────────────────────────────────── */
  onCombatEvent(attackerSquad, targetSquad, hit, turn) {
    this._combatEvents.push({
      turn:       turn || this.turns,
      attackerId: attackerSquad.id,
      attackerSide: attackerSquad.side,
      targetId:   targetSquad.id,
      targetSide: targetSquad.side,
      fromCol:    attackerSquad.pos.col,
      fromRow:    attackerSquad.pos.row,
      toCol:      targetSquad.pos.col,
      toRow:      targetSquad.pos.row,
      hit,
    });
  }

  /* ── 오청 발생 시 ──────────────────────────────────────────── */
  onMishear(squadId, mishearType) {
    this.mishears.total++;
    if (this.mishears[mishearType] !== undefined) {
      this.mishears[mishearType]++;
    }
    this._ensureSquad(squadId);
    this.squadLog[squadId].mishears++;
  }

  /* ── 사격 시 ───────────────────────────────────────────────── */
  onShot(side, squadId, hit) {
    if (side === 'ally' || side === 'enemy') {
      this.shots[side]++;
      if (hit) this.hits[side]++;
    }
    this._ensureSquad(squadId);
    this.squadLog[squadId].shots++;
    if (hit) this.squadLog[squadId].hits++;
    if (hit) this.phaseKills[this.currentPhase] = (this.phaseKills[this.currentPhase] || 0) + 1;
  }

  /* ── 분대 전멸 시 ──────────────────────────────────────────── */
  onSquadKilled(side) {
    if (side === 'ally')  this.kills.enemy++;
    if (side === 'enemy') this.kills.ally++;
  }

  /* ── 병력 피해 시 ──────────────────────────────────────────── */
  onCasualty(side) {
    if (side === 'ally' || side === 'enemy') {
      this.casualties[side]++;
    }
  }

  /* ── 배급소 피격 시 ────────────────────────────────────────── */
  onDepotDamage() {
    this.depotDamages++;
  }

  /* ── 이동 시 ───────────────────────────────────────────────── */
  onMove(squadId) {
    this._ensureSquad(squadId);
    this.squadLog[squadId].moves++;
  }

  /* ── 통신 품질 기록 ─────────────────────────────────────────── */
  recordCommsQuality(quality) {
    this.commsQualitySum += quality;
    this.commsQualityCount++;
  }

  _ensureSquad(squadId) {
    if (!this.squadLog[squadId]) {
      this.squadLog[squadId] = { moves: 0, shots: 0, hits: 0, mishears: 0 };
    }
  }

  _hitRate(side) {
    if (this.shots[side] === 0) return 0;
    return Math.round(this.hits[side] / this.shots[side] * 100);
  }

  _avgComms() {
    if (this.commsQualityCount === 0) return 100;
    return Math.round(this.commsQualitySum / this.commsQualityCount);
  }

  /* ── AAR 오버레이 표시 ───────────────────────────────────────── */
  show(resultData, allSquads = []) {
    const overlay = document.getElementById('result-overlay');
    if (!overlay) return;

    const { win, turns, reason, allyAlive, allyTotal, enemyAlive, enemyTotal } = resultData;

    document.getElementById('result-reason').textContent = `훈련 종료 // ${reason}`;
    const title = document.getElementById('result-title');
    title.textContent = win ? '임무 완료' : '임무 실패';
    title.className   = win ? '' : 'lose';

    const enemyClass = enemyAlive > 0 ? ' red' : '';
    let html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px;margin-bottom:14px;">
        <div>소요 턴<span class="rv">${turns} / ${CONFIG.TURN_LIMIT}</span></div>
        <div>아군 잔존<span class="rv">${allyAlive} / ${allyTotal}</span></div>
        <div>적군 잔존<span class="rv${enemyClass}">${enemyAlive} / ${enemyTotal}</span></div>
        <div>아군 피해<span class="rv red">${this.casualties.ally}명</span></div>
      </div>
    `;

    html += `<div style="height:1px;background:var(--col-border);margin:0 0 14px;"></div>`;

    html += `
      <div style="font-size:.68rem;letter-spacing:.12em;color:var(--col-text-dim);margin-bottom:8px;">▸ 전투 효율</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px;margin-bottom:14px;">
        <div>아군 명중률<span class="rv">${this._hitRate('ally')}%</span></div>
        <div>적군 명중률<span class="rv red">${this._hitRate('enemy')}%</span></div>
        <div>아군 사격<span class="rv">${this.shots.ally}회</span></div>
        <div>적군 사격<span class="rv">${this.shots.enemy}회</span></div>
        <div>분대 격파<span class="rv">${this.kills.ally}개</span></div>
        <div>분대 피격<span class="rv red">${this.kills.enemy}개</span></div>
      </div>
    `;

    html += `<div style="height:1px;background:var(--col-border);margin:0 0 14px;"></div>`;

    const mishearColor = this.mishears.total === 0 ? 'var(--col-green)' : this.mishears.total <= 3 ? 'var(--col-amber)' : 'var(--col-red)';
    const mishearGrade = this.mishears.total === 0 ? '우수' : this.mishears.total <= 3 ? '보통' : '미흡';
    const commsAvg = this._avgComms();
    const commsColor = commsAvg >= 70 ? 'var(--col-green)' : commsAvg >= 50 ? 'var(--col-amber)' : 'var(--col-red)';

    html += `
      <div style="font-size:.68rem;letter-spacing:.12em;color:var(--col-text-dim);margin-bottom:8px;">▸ 통신 오류 분석 (KCTC 핵심 지표)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px;margin-bottom:6px;">
        <div>오청 총 발생<span class="rv" style="color:${mishearColor}">${this.mishears.total}회</span></div>
        <div>통신 품질 평균<span class="rv" style="color:${commsColor}">${commsAvg}%</span></div>
        <div>좌표 변형<span class="rv">${this.mishears.coord}회</span></div>
        <div>통신 두절<span class="rv">${this.mishears.ignore}회</span></div>
        <div>명령 왜곡<span class="rv">${this.mishears.attack_instead}회</span></div>
        <div>배급소 피격<span class="rv">${this.depotDamages}회</span></div>
      </div>
      <div style="margin:8px 0 14px;padding:6px 10px;border:1px solid ${mishearColor};font-size:.72rem;letter-spacing:.12em;color:${mishearColor};">
        통신 숙달도 평가 — <b>${mishearGrade}</b>
        ${this.mishears.total === 0 ? ' (완벽한 통신 유지)' : ` (오청 ${this.mishears.total}회 발생)`}
      </div>
    `;

    const phaseTotal = Object.values(this.phaseKills).reduce((a, b) => a + b, 0);
    if (phaseTotal > 0) {
      html += `<div style="height:1px;background:var(--col-border);margin:0 0 14px;"></div>`;
      html += `
        <div style="font-size:.68rem;letter-spacing:.12em;color:var(--col-text-dim);margin-bottom:8px;">▸ 페이즈별 전과</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px;text-align:center;">
          ${this._phaseBar('낮',   this.phaseKills.day,  phaseTotal, 'var(--col-green)')}
          ${this._phaseBar('저녁', this.phaseKills.dusk, phaseTotal, 'var(--col-amber)')}
          ${this._phaseBar('밤',   this.phaseKills.night,phaseTotal, '#4466cc')}
          ${this._phaseBar('새벽', this.phaseKills.dawn, phaseTotal, '#cc88ff')}
        </div>
      `;
    }

    const squadEntries = Object.entries(this.squadLog)
      .filter(([, v]) => v.shots > 0 || v.moves > 0 || v.mishears > 0)
      .sort(([a], [b]) => parseInt(a) - parseInt(b));

    if (squadEntries.length > 0) {
      html += `<div style="height:1px;background:var(--col-border);margin:0 0 14px;"></div>`;
      html += `<div style="font-size:.68rem;letter-spacing:.12em;color:var(--col-text-dim);margin-bottom:8px;">▸ 분대별 활동</div>`;
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;margin-bottom:14px;">`;
      for (const [sid, log] of squadEntries) {
        const squadObj = allSquads.find(s => s.id === parseInt(sid) && s.side === 'ally');
        if (!squadObj) continue;
        const cd = squadObj._colDef || { css: '#39ff8e' };
        const hr = log.shots > 0 ? Math.round(log.hits / log.shots * 100) : 0;
        html += `
          <div style="border:1px solid ${cd.css};padding:7px 9px;font-size:.62rem;line-height:1.9;">
            <div style="color:${cd.css};letter-spacing:.1em;margin-bottom:3px;">A${sid}분대</div>
            <div style="color:var(--col-text-dim);">이동 <b style="color:var(--col-text);">${log.moves}</b>회</div>
            <div style="color:var(--col-text-dim);">사격 <b style="color:var(--col-text);">${log.shots}</b>회 / 명중 <b style="color:var(--col-green);">${hr}%</b></div>
            ${log.mishears > 0 ? `<div style="color:var(--col-red);">오청 ${log.mishears}회</div>` : ''}
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `<div style="height:1px;background:var(--col-border);margin:0 0 14px;"></div>`;
    html += `<div style="font-size:.68rem;letter-spacing:.08em;color:var(--col-text-dim);margin-bottom:14px;line-height:1.9;font-family:'Noto Sans KR',sans-serif;">`;
    html += `<span style="color:var(--col-amber);letter-spacing:.12em;">OC/T 총평 //</span> `;
    html += this._generateOCTComment();
    html += `</div>`;

    /* ── 리플레이 섹션 ── */
    html += this._buildReplayHTML(allSquads);

    document.getElementById('result-body').innerHTML = html;
    overlay.classList.add('show');

    /* 리플레이 캔버스 초기화 (DOM 렌더 후) */
    requestAnimationFrame(() => {
      this._initReplayCanvas(allSquads);
    });
  }

  /* ── 리플레이 HTML 골격 ────────────────────────────────────── */
  _buildReplayHTML(allSquads) {
    if (this._turnSnapshots.length === 0) return '';
    const maxTurn = this._turnSnapshots.length;

    return `
      <div style="height:1px;background:var(--col-border);margin:0 0 18px;"></div>

      <div style="font-size:.68rem;letter-spacing:.18em;color:var(--col-amber);margin-bottom:12px;text-transform:uppercase;">
        ▸ 전투 기동 리플레이
      </div>

      <!-- 리플레이 캔버스 -->
      <div style="position:relative;background:#040604;border:1px solid var(--col-border);margin-bottom:14px;">
        <canvas id="replay-canvas" style="display:block;width:100%;"></canvas>

        <!-- 턴 표시 오버레이 -->
        <div id="replay-turn-badge" style="
          position:absolute;top:10px;left:10px;
          background:rgba(8,12,10,.92);border:1px solid var(--col-amber);
          padding:4px 12px;font-family:'Share Tech Mono',monospace;
          font-size:.72rem;letter-spacing:.14em;color:var(--col-amber);
          pointer-events:none;
        ">TURN 01 / ${String(maxTurn).padStart(2,'0')}</div>

        <!-- 페이즈 표시 -->
        <div id="replay-phase-badge" style="
          position:absolute;top:10px;right:10px;
          background:rgba(8,12,10,.92);border:1px solid var(--col-green-dim);
          padding:4px 12px;font-family:'Share Tech Mono',monospace;
          font-size:.68rem;letter-spacing:.1em;color:var(--col-green-dim);
          pointer-events:none;
        ">낮</div>
      </div>

      <!-- 범례 -->
      <div style="display:flex;gap:20px;margin-bottom:14px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:6px;font-size:.65rem;color:var(--col-text-dim);letter-spacing:.06em;">
          <div style="width:10px;height:10px;background:#39ff8e;border-radius:2px;flex-shrink:0;"></div>아군 현재 위치
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:.65rem;color:var(--col-text-dim);letter-spacing:.06em;">
          <div style="width:10px;height:10px;background:rgba(57,255,142,.2);border-radius:2px;flex-shrink:0;"></div>아군 이동 경로
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:.65rem;color:var(--col-text-dim);letter-spacing:.06em;">
          <div style="width:10px;height:10px;background:#ff4444;border-radius:2px;flex-shrink:0;"></div>적군 현재 위치
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:.65rem;color:var(--col-text-dim);letter-spacing:.06em;">
          <div style="width:10px;height:10px;background:rgba(255,68,68,.2);border-radius:2px;flex-shrink:0;"></div>적군 이동 경로
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:.65rem;color:var(--col-text-dim);letter-spacing:.06em;">
          <div style="width:10px;height:10px;background:#ff8844;border-radius:50%;flex-shrink:0;"></div>교전 발생
        </div>
      </div>

      <!-- 슬라이더 컨트롤 -->
      <div style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <span style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:var(--col-text-dim);letter-spacing:.08em;white-space:nowrap;">진행도</span>
          <input
            type="range" id="replay-slider"
            min="0" max="${maxTurn - 1}" value="0" step="1"
            style="flex:1;cursor:pointer;"
          />
          <span id="replay-slider-val" style="font-family:'Share Tech Mono',monospace;font-size:.72rem;color:var(--col-green);letter-spacing:.08em;white-space:nowrap;min-width:60px;text-align:right;">01 / ${String(maxTurn).padStart(2,'0')}</span>
        </div>

        <!-- 재생 버튼 그룹 -->
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button id="replay-btn-prev" style="
            padding:5px 14px;background:transparent;border:1px solid var(--col-border);
            color:var(--col-text-dim);font-family:'Share Tech Mono',monospace;font-size:.7rem;
            letter-spacing:.08em;cursor:pointer;transition:all .15s;
          ">◀ PREV</button>

          <button id="replay-btn-play" style="
            padding:5px 18px;background:transparent;border:1px solid var(--col-green);
            color:var(--col-green);font-family:'Share Tech Mono',monospace;font-size:.7rem;
            letter-spacing:.1em;cursor:pointer;transition:all .15s;
          ">▶ PLAY</button>

          <button id="replay-btn-next" style="
            padding:5px 14px;background:transparent;border:1px solid var(--col-border);
            color:var(--col-text-dim);font-family:'Share Tech Mono',monospace;font-size:.7rem;
            letter-spacing:.08em;cursor:pointer;transition:all .15s;
          ">NEXT ▶</button>

          <button id="replay-btn-trail" style="
            padding:5px 14px;background:rgba(57,255,142,.06);border:1px solid var(--col-green-dim);
            color:var(--col-green-dim);font-family:'Share Tech Mono',monospace;font-size:.7rem;
            letter-spacing:.08em;cursor:pointer;transition:all .15s;
          ">경로 표시 ON</button>

          <span style="font-family:'Share Tech Mono',monospace;font-size:.62rem;color:var(--col-text-dim);letter-spacing:.06em;margin-left:4px;" id="replay-speed-label">속도 1×</span>
          <input type="range" id="replay-speed" min="1" max="4" value="2" step="1" style="width:80px;" />
        </div>
      </div>

      <!-- 유닛 정보 패널 (클릭 시 표시) -->
      <div id="replay-unit-info" style="
        display:none;padding:8px 12px;
        background:rgba(8,12,10,.92);border:1px solid var(--col-amber);
        font-family:'Share Tech Mono',monospace;font-size:.68rem;letter-spacing:.08em;
        color:var(--col-text-dim);margin-bottom:10px;
        font-family:'Noto Sans KR',sans-serif;line-height:1.8;
      "></div>
    `;
  }

  /* ── 리플레이 캔버스 초기화 및 렌더 로직 ─────────────────── */
  _initReplayCanvas(allSquads) {
    const canvas = document.getElementById('replay-canvas');
    if (!canvas || this._turnSnapshots.length === 0) return;

    const COLS = this._mapCols || CONFIG.GRID_COLS;
    const ROWS = this._mapRows || CONFIG.GRID_ROWS;

    /* 캔버스 크기 결정: 최대 640px 너비, 비율 유지 */
    const container = canvas.parentElement;
    const maxW = Math.min(container.clientWidth || 640, 640);
    const CELL = Math.max(4, Math.floor(Math.min(maxW / COLS, 500 / ROWS)));
    const PAD  = 20;
    const W    = COLS * CELL + PAD * 2;
    const H    = ROWS * CELL + PAD * 2;

    canvas.width  = W;
    canvas.height = H;
    canvas.style.width  = '100%';
    canvas.style.height = 'auto';

    /* 상태 */
    let currentIdx  = 0;
    let showTrail   = true;
    let isPlaying   = false;
    let playTimer   = null;
    const SPEEDS    = [2000, 1000, 600, 300];
    let speedIdx    = 1;

    /* 분대 색상 캐시 */
    const squadColors = {};
    allSquads.forEach(s => {
      if (s._colDef) squadColors[s.id] = s._colDef.css;
    });
    const getColor = (id, side) => {
      if (squadColors[id]) return squadColors[id];
      return side === 'ally' ? '#39ff8e' : '#ff4444';
    };

    /* 분대 이동 경로 계산 (스냅샷에서 추적) */
    const buildTrails = (upToIdx) => {
      const trails = {};
      for (let i = 0; i <= upToIdx && i < this._turnSnapshots.length; i++) {
        const snap = this._turnSnapshots[i];
        for (const u of snap.units) {
          if (!trails[u.id]) trails[u.id] = [];
          const last = trails[u.id][trails[u.id].length - 1];
          if (!last || last.col !== u.col || last.row !== u.row) {
            trails[u.id].push({ col: u.col, row: u.row, alive: u.alive });
          }
        }
      }
      return trails;
    };

    /* 지형 색상 (간소화) */
    const TERRAIN_COLORS = {
      open:   '#0d1f14', forest: '#061306', valley: '#060f1a',
      hill:   '#1a1006', river:  '#041a2a', bridge: '#1a1006',
    };

    /* ── 메인 렌더 함수 ── */
    const render = (idx) => {
      const ctx  = canvas.getContext('2d');
      const snap = this._turnSnapshots[idx];
      if (!snap) return;

      ctx.clearRect(0, 0, W, H);

      /* 배경: 격자 */
      ctx.fillStyle = '#040604';
      ctx.fillRect(0, 0, W, H);

      /* 격자선 */
      ctx.strokeStyle = 'rgba(30,58,40,0.3)';
      ctx.lineWidth = 0.5;
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(PAD + c * CELL, PAD);
        ctx.lineTo(PAD + c * CELL, PAD + ROWS * CELL);
        ctx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(PAD, PAD + r * CELL);
        ctx.lineTo(PAD + COLS * CELL, PAD + r * CELL);
        ctx.stroke();
      }

      /* 지형 렌더 (GridMap 참조) */
      if (window.gameScene && window.gameScene.gridMap && window.gameScene.gridMap.tiles) {
        const gm = window.gameScene.gridMap;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (!gm.tiles[r] || !gm.tiles[r][c]) continue;
            const tid = gm.tiles[r][c].terrain.id;
            const fillColor = TERRAIN_COLORS[tid] || TERRAIN_COLORS.open;
            ctx.fillStyle = fillColor;
            ctx.fillRect(PAD + c * CELL, PAD + r * CELL, CELL, CELL);
          }
        }
      }

      /* 목표 지점 표시 */
      const obj = window.gameScene?.objective;
      if (obj && obj.tiles) {
        ctx.fillStyle = 'rgba(255,184,77,0.18)';
        ctx.strokeStyle = '#ffb84d';
        ctx.lineWidth = 1;
        for (const t of obj.tiles) {
          ctx.fillRect(PAD + t.col * CELL, PAD + t.row * CELL, CELL, CELL);
          ctx.strokeRect(PAD + t.col * CELL + 0.5, PAD + t.row * CELL + 0.5, CELL - 1, CELL - 1);
        }
      }

      /* 이동 경로 (trail) */
      if (showTrail) {
        const trails = buildTrails(idx);
        for (const [idStr, path] of Object.entries(trails)) {
          const id = parseInt(idStr);
          const side = path.length > 0
            ? (allSquads.find(s => s.id === id)?.side || 'ally')
            : 'ally';
          if (path.length < 2) continue;

          const color = getColor(id, side);
          const trailColor = side === 'ally'
            ? 'rgba(57,255,142,0.28)'
            : 'rgba(255,68,68,0.28)';

          ctx.beginPath();
          ctx.strokeStyle = trailColor;
          ctx.lineWidth   = Math.max(1, CELL * 0.18);
          ctx.lineCap     = 'round';
          ctx.lineJoin    = 'round';
          ctx.setLineDash([CELL * 0.4, CELL * 0.3]);

          const startX = PAD + path[0].col * CELL + CELL / 2;
          const startY = PAD + path[0].row * CELL + CELL / 2;
          ctx.moveTo(startX, startY);

          for (let i = 1; i < path.length; i++) {
            const x = PAD + path[i].col * CELL + CELL / 2;
            const y = PAD + path[i].row * CELL + CELL / 2;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          /* 경로 위 작은 점들 */
          ctx.fillStyle = trailColor;
          for (let i = 0; i < path.length - 1; i++) {
            const x = PAD + path[i].col * CELL + CELL / 2;
            const y = PAD + path[i].row * CELL + CELL / 2;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(1, CELL * 0.12), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      /* 교전 이벤트 표시 (현재 턴까지) */
      const turnNum = snap.turn;
      const combatThisTurn = this._combatEvents.filter(e => e.turn === turnNum && e.hit);
      for (const ev of combatThisTurn) {
        const fx = PAD + ev.fromCol * CELL + CELL / 2;
        const fy = PAD + ev.fromRow * CELL + CELL / 2;
        const tx = PAD + ev.toCol   * CELL + CELL / 2;
        const ty = PAD + ev.toRow   * CELL + CELL / 2;

        /* 사격선 */
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,136,68,0.55)';
        ctx.lineWidth   = Math.max(1, CELL * 0.12);
        ctx.setLineDash([CELL * 0.3, CELL * 0.2]);
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        /* 착탄 표시 */
        const cr = Math.max(2, CELL * 0.35);
        ctx.beginPath();
        ctx.arc(tx, ty, cr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,68,68,0.4)';
        ctx.fill();
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      /* 유닛 렌더 */
      for (const unit of snap.units) {
        if (!unit.alive) {
          /* 전멸 유닛: × 표시 */
          const ux = PAD + unit.col * CELL + CELL / 2;
          const uy = PAD + unit.row * CELL + CELL / 2;
          const r  = Math.max(2, CELL * 0.28);
          ctx.strokeStyle = unit.side === 'ally' ? 'rgba(57,255,142,.3)' : 'rgba(255,68,68,.3)';
          ctx.lineWidth   = Math.max(1, CELL * 0.1);
          ctx.beginPath(); ctx.moveTo(ux - r, uy - r); ctx.lineTo(ux + r, uy + r); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ux + r, uy - r); ctx.lineTo(ux - r, uy + r); ctx.stroke();
          continue;
        }

        const color = getColor(unit.id, unit.side);
        const ux = PAD + unit.col * CELL + CELL / 2;
        const uy = PAD + unit.row * CELL + CELL / 2;
        const r  = Math.max(3, CELL * 0.38);

        /* 외곽 글로우 */
        ctx.beginPath();
        ctx.arc(ux, uy, r + Math.max(1, CELL * 0.12), 0, Math.PI * 2);
        ctx.fillStyle = unit.side === 'ally'
          ? 'rgba(57,255,142,0.15)'
          : 'rgba(255,68,68,0.15)';
        ctx.fill();

        /* 유닛 원 */
        ctx.beginPath();
        ctx.arc(ux, uy, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        /* 테두리 */
        ctx.beginPath();
        ctx.arc(ux, uy, r, 0, Math.PI * 2);
        ctx.strokeStyle = unit.side === 'ally' ? '#39ff8e' : '#ff4444';
        ctx.lineWidth   = Math.max(0.5, CELL * 0.06);
        ctx.stroke();

        /* 유닛 ID 텍스트 (셀이 충분히 클 때만) */
        if (CELL >= 12) {
          const labelFontSize = Math.max(7, Math.min(11, CELL * 0.5));
          ctx.fillStyle   = '#080c0a';
          ctx.font        = `bold ${labelFontSize}px "Share Tech Mono", monospace`;
          ctx.textAlign   = 'center';
          ctx.textBaseline = 'middle';
          const label = unit.side === 'ally'
            ? `A${unit.id}`
            : `E${unit.id - CONFIG.SQUAD_COUNT}`;
          ctx.fillText(label, ux, uy);
        }

        /* 병력 바 (셀이 충분히 클 때) */
        if (CELL >= 10) {
          const barW = CELL * 0.8;
          const barH = Math.max(2, CELL * 0.1);
          const barX = ux - barW / 2;
          const barY = uy + r + 2;
          const pct  = unit.troops / CONFIG.SQUAD_TROOP_MAX;

          ctx.fillStyle = 'rgba(8,12,10,0.7)';
          ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = pct > 0.5 ? '#39ff8e' : pct > 0.25 ? '#ffb84d' : '#ff4444';
          ctx.fillRect(barX, barY, barW * pct, barH);
        }
      }

      /* 축 레이블 (셀이 충분히 클 때) */
      if (CELL >= 10) {
        const labelFont = Math.max(7, Math.min(10, CELL * 0.55));
        ctx.fillStyle   = '#2a5a38';
        ctx.font        = `${labelFont}px "Share Tech Mono", monospace`;
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';

        const step = Math.max(1, Math.floor(COLS / 10));
        for (let c = 0; c < COLS; c += step) {
          ctx.fillText(
            String.fromCharCode(65 + (c % 26)),
            PAD + c * CELL + CELL / 2,
            PAD - 7
          );
        }
        ctx.textAlign = 'right';
        const rstep = Math.max(1, Math.floor(ROWS / 10));
        for (let r = 0; r < ROWS; r += rstep) {
          ctx.fillText(
            String(r + 1).padStart(2, '0'),
            PAD - 3,
            PAD + r * CELL + CELL / 2
          );
        }
      }

      /* 배급소 표시 */
      const supply = window.gameScene?.supply;
      if (supply) {
        for (const depot of supply.depots.filter(d => d.side === 'ally')) {
          const dx = PAD + depot.col * CELL + CELL / 2;
          const dy = PAD + depot.row * CELL + CELL / 2;
          const dr = Math.max(2, CELL * 0.3);
          ctx.fillStyle = depot.alive ? 'rgba(68,170,255,0.5)' : 'rgba(100,100,100,0.3)';
          ctx.beginPath();
          ctx.rect(dx - dr, dy - dr, dr * 2, dr * 2);
          ctx.fill();
          ctx.strokeStyle = depot.alive ? '#44aaff' : '#555';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      /* 턴 배지 업데이트 */
      const badge = document.getElementById('replay-turn-badge');
      if (badge) {
        badge.textContent = `TURN ${String(snap.turn).padStart(2,'0')} / ${String(this._turnSnapshots.length).padStart(2,'0')}`;
      }
      const phaseBadge = document.getElementById('replay-phase-badge');
      if (phaseBadge) {
        const phaseLabels = { day:'낮', dusk:'저녁', night:'밤', dawn:'새벽' };
        const phaseColors = { day:'var(--col-green-dim)', dusk:'var(--col-amber)', night:'#4466cc', dawn:'#cc88ff' };
        phaseBadge.textContent = phaseLabels[snap.phase] || snap.phase;
        phaseBadge.style.color = phaseColors[snap.phase] || 'var(--col-green-dim)';
        phaseBadge.style.borderColor = phaseColors[snap.phase] || 'var(--col-green-dim)';
      }

      /* 슬라이더 값 업데이트 */
      const sliderVal = document.getElementById('replay-slider-val');
      if (sliderVal) {
        sliderVal.textContent = `${String(snap.turn).padStart(2,'0')} / ${String(this._turnSnapshots.length).padStart(2,'0')}`;
      }
    };

    /* ── 초기 렌더 ── */
    render(0);

    /* ── 슬라이더 이벤트 ── */
    const slider = document.getElementById('replay-slider');
    if (slider) {
      slider.addEventListener('input', () => {
        currentIdx = parseInt(slider.value);
        render(currentIdx);
        stopPlay();
      });
    }

    /* ── PREV / NEXT 버튼 ── */
    document.getElementById('replay-btn-prev')?.addEventListener('click', () => {
      stopPlay();
      currentIdx = Math.max(0, currentIdx - 1);
      if (slider) slider.value = currentIdx;
      render(currentIdx);
    });
    document.getElementById('replay-btn-next')?.addEventListener('click', () => {
      stopPlay();
      currentIdx = Math.min(this._turnSnapshots.length - 1, currentIdx + 1);
      if (slider) slider.value = currentIdx;
      render(currentIdx);
    });

    /* ── PLAY 버튼 ── */
    const playBtn = document.getElementById('replay-btn-play');
    const stopPlay = () => {
      isPlaying = false;
      clearInterval(playTimer);
      if (playBtn) playBtn.textContent = '▶ PLAY';
    };
    const startPlay = () => {
      isPlaying = true;
      /* 항상 처음(0번 스냅샷)부터 재생 */
      currentIdx = 0;
      if (slider) slider.value = 0;
      render(0);
      if (playBtn) playBtn.textContent = '⏸ PAUSE';
      playTimer = setInterval(() => {
        currentIdx++;
        if (currentIdx >= this._turnSnapshots.length) {
          currentIdx = 0;
          stopPlay();
          return;
        }
        if (slider) slider.value = currentIdx;
        render(currentIdx);
      }, SPEEDS[speedIdx - 1]);
    };
    playBtn?.addEventListener('click', () => {
      if (isPlaying) stopPlay();
      else startPlay();
    });

    /* ── Trail 토글 ── */
    const trailBtn = document.getElementById('replay-btn-trail');
    trailBtn?.addEventListener('click', () => {
      showTrail = !showTrail;
      trailBtn.textContent = `경로 표시 ${showTrail ? 'ON' : 'OFF'}`;
      trailBtn.style.background    = showTrail ? 'rgba(57,255,142,.06)' : 'transparent';
      trailBtn.style.borderColor   = showTrail ? 'var(--col-green-dim)' : 'var(--col-border)';
      trailBtn.style.color         = showTrail ? 'var(--col-green-dim)' : 'var(--col-text-dim)';
      render(currentIdx);
    });

    /* ── 속도 슬라이더 ── */
    const speedSlider = document.getElementById('replay-speed');
    speedSlider?.addEventListener('input', () => {
      speedIdx = parseInt(speedSlider.value);
      const labels = ['0.5×', '1×', '1.5×', '2×'];
      const lbl = document.getElementById('replay-speed-label');
      if (lbl) lbl.textContent = `속도 ${labels[speedIdx - 1] || '1×'}`;
      if (isPlaying) { stopPlay(); startPlay(); }
    });

    /* ── 캔버스 클릭: 유닛 정보 팝업 ── */
    canvas.addEventListener('click', (e) => {
      const rect   = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top)  * scaleY;
      const col = Math.floor((mx - PAD) / CELL);
      const row = Math.floor((my - PAD) / CELL);

      const snap  = this._turnSnapshots[currentIdx];
      const found = snap?.units.filter(u => u.col === col && u.row === row && u.alive);
      const infoEl = document.getElementById('replay-unit-info');
      if (!infoEl) return;

      if (!found || found.length === 0) {
        infoEl.style.display = 'none';
        return;
      }
      infoEl.style.display = 'block';
      const coord = `${String.fromCharCode(65 + (col % 26))}-${String(row + 1).padStart(2, '0')}`;
      infoEl.innerHTML = found.map(u => {
        const label = u.side === 'ally' ? `A${u.id}분대` : `E${u.id - CONFIG.SQUAD_COUNT}분대`;
        const color = getColor(u.id, u.side);
        const log   = this.squadLog[u.id];
        const moveStr = log ? `이동 ${log.moves}회` : '';
        const shotStr = log ? `사격 ${log.shots}회` : '';
        const mishStr = log?.mishears > 0 ? ` | 오청 ${log.mishears}회` : '';
        return `<span style="color:${color};letter-spacing:.1em;">${label}</span> — ${coord} | 병력 ${u.troops}/${CONFIG.SQUAD_TROOP_MAX} | ${moveStr} ${shotStr}${mishStr}`;
      }).join('<br>');
    });

    /* 키보드 화살표 지원 */
    document.addEventListener('keydown', (e) => {
      const overlay = document.getElementById('result-overlay');
      if (!overlay || !overlay.classList.contains('show')) return;
      if (e.key === 'ArrowLeft') {
        stopPlay();
        currentIdx = Math.max(0, currentIdx - 1);
        if (slider) slider.value = currentIdx;
        render(currentIdx);
      } else if (e.key === 'ArrowRight') {
        stopPlay();
        currentIdx = Math.min(this._turnSnapshots.length - 1, currentIdx + 1);
        if (slider) slider.value = currentIdx;
        render(currentIdx);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (isPlaying) stopPlay(); else startPlay();
      }
    });
  }

  /* ── 페이즈 바 HTML ── */
  _phaseBar(label, count, total, color) {
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    return `
      <div>
        <div style="font-size:.6rem;color:${color};margin-bottom:4px;">${label}</div>
        <div style="height:32px;background:var(--col-border);position:relative;">
          <div style="position:absolute;bottom:0;width:100%;height:${pct}%;background:${color};opacity:0.7;"></div>
        </div>
        <div style="font-size:.62rem;color:var(--col-text-dim);margin-top:3px;">${count}회</div>
      </div>
    `;
  }

  /* ── OC/T 자동 총평 생성 ── */
  _generateOCTComment() {
    const comments = [];
    if (this.mishears.total === 0) {
      comments.push('전 훈련 기간 통신 오류 없음. 통신 절차 숙달 우수.');
    } else if (this.mishears.ignore > 2) {
      comments.push(`통신 두절 ${this.mishears.ignore}회 발생. 계곡 지형 진입 시 통신 음영 사전 확인 필요.`);
    } else if (this.mishears.coord > 2) {
      comments.push(`좌표 오청 ${this.mishears.coord}회. 좌표 복창 절차 재교육 권고.`);
    } else {
      comments.push(`오청 ${this.mishears.total}회 발생. 교전 중 통신 절차 유지 훈련 필요.`);
    }
    const allyHR = this._hitRate('ally');
    if (allyHR >= 60) {
      comments.push(`사격 명중률 ${allyHR}% — 우수.`);
    } else if (allyHR >= 40) {
      comments.push(`사격 명중률 ${allyHR}% — 표준. 지형 활용 사격 훈련 보완 권고.`);
    } else {
      comments.push(`사격 명중률 ${allyHR}% — 미흡. 사격 기본기 및 엄폐물 활용 집중 훈련 필요.`);
    }
    if (this.depotDamages > 0) {
      comments.push(`배급소 ${this.depotDamages}회 피격. 후방 경계 강화 필요.`);
    }
    const nightKills = this.phaseKills.night || 0;
    if (nightKills > 0) {
      comments.push(`야간 작전 중 ${nightKills}회 교전 발생. 야간 기동 절차 숙달 필요.`);
    }
    return comments.join(' ');
  }
}
