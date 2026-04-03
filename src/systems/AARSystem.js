/* ============================================================
   AARSystem.js — 전투 후 결과 분석 (After Action Review)
   ────────────────────────────────────────────────────────────
   · 매 턴 데이터를 수집해 게임 종료 시 결과 오버레이에 표시
   · 수집 항목:
       - 오청 발생 횟수 / 종류별 분류
       - 분대별 이동 횟수, 사격 횟수, 명중 횟수
       - 통신 품질 평균 (턴별)
       - 배급소 피해 횟수
       - 낮/밤 페이즈별 교전 횟수
   · TurnManager._checkResult() 이전에 show() 호출
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
    this.kills         = { ally: 0, enemy: 0 };   // 아군이 적 죽인 수, 적이 아군 죽인 수
    this.casualties    = { ally: 0, enemy: 0 };   // 병력 감소 총합
    this.depotDamages  = 0;
    this.commsQualitySum = 0;
    this.commsQualityCount = 0;
    this.phaseKills    = { day: 0, dusk: 0, night: 0, dawn: 0 };
    this.currentPhase  = 'day';
    // 분대별 로그
    this.squadLog      = {};  // { squadId: { moves, shots, hits, mishears } }
    this._turnSnapshots = []; // 턴별 스냅샷 (간이 히트맵용)
  }

  /* ── 턴 시작 시 ────────────────────────────────────────────── */
  onTurnStart(turn, dayNight) {
    this.turns = turn;
    if (dayNight) this.currentPhase = dayNight.phase.id;
  }

  /* ── 오청 발생 시 ──────────────────────────────────────────── */
  /**
   * @param {string} squadId
   * @param {'coord'|'ignore'|'attack_instead'} mishearType
   */
  onMishear(squadId, mishearType) {
    this.mishears.total++;
    if (this.mishears[mishearType] !== undefined) {
      this.mishears[mishearType]++;
    }
    this._ensureSquad(squadId);
    this.squadLog[squadId].mishears++;
  }

  /* ── 사격 시 ───────────────────────────────────────────────── */
  /**
   * @param {string} side  - 'ally' | 'enemy'
   * @param {number} squadId
   * @param {boolean} hit
   */
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
  /**
   * @param {'ally'|'enemy'} side - 전멸한 분대의 진영
   */
  onSquadKilled(side) {
    // 아군 분대 전멸 → kills.enemy++, 적군 분대 전멸 → kills.ally++
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

  /* ── 분대 로그 초기화 헬퍼 ─────────────────────────────────── */
  _ensureSquad(squadId) {
    if (!this.squadLog[squadId]) {
      this.squadLog[squadId] = { moves: 0, shots: 0, hits: 0, mishears: 0 };
    }
  }

  /* ── 명중률 계산 ────────────────────────────────────────────── */
  _hitRate(side) {
    if (this.shots[side] === 0) return 0;
    return Math.round(this.hits[side] / this.shots[side] * 100);
  }

  /* ── 평균 통신 품질 ─────────────────────────────────────────── */
  _avgComms() {
    if (this.commsQualityCount === 0) return 100;
    return Math.round(this.commsQualitySum / this.commsQualityCount);
  }

  /* ── AAR 오버레이 표시 ───────────────────────────────────────── */
  /**
   * 게임 종료 시 결과 오버레이를 확장해 AAR 표시
   * ResultScene 대신 여기서 DOM을 직접 조작
   *
   * @param {object} resultData
   *   { win, turns, reason, allyAlive, allyTotal, enemyAlive, enemyTotal }
   * @param {Array} allSquads  - 전체 분대 배열
   */
  show(resultData, allSquads = []) {
    const overlay = document.getElementById('result-overlay');
    if (!overlay) return;

    const { win, turns, reason, allyAlive, allyTotal, enemyAlive, enemyTotal } = resultData;

    // ── 제목 / 사유 ──
    document.getElementById('result-reason').textContent = `훈련 종료 // ${reason}`;
    const title = document.getElementById('result-title');
    title.textContent = win ? '임무 완료' : '임무 실패';
    title.className   = win ? '' : 'lose';

    // ── 기본 통계 ──
    const enemyClass = enemyAlive > 0 ? ' red' : '';
    let html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px;margin-bottom:14px;">
        <div>소요 턴<span class="rv">${turns} / ${CONFIG.TURN_LIMIT}</span></div>
        <div>아군 잔존<span class="rv">${allyAlive} / ${allyTotal}</span></div>
        <div>적군 잔존<span class="rv${enemyClass}">${enemyAlive} / ${enemyTotal}</span></div>
        <div>아군 피해<span class="rv red">${this.casualties.ally}명</span></div>
      </div>
    `;

    // ── 구분선 ──
    html += `<div style="height:1px;background:var(--col-border);margin:0 0 14px;"></div>`;

    // ── 전투 효율 ──
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

    // ── 통신 오류 분석 ──
    html += `<div style="height:1px;background:var(--col-border);margin:0 0 14px;"></div>`;
    html += `
      <div style="font-size:.68rem;letter-spacing:.12em;color:var(--col-text-dim);margin-bottom:8px;">▸ 통신 오류 분석 (KCTC 핵심 지표)</div>
    `;

    const mishearColor = this.mishears.total === 0 ? 'var(--col-green)' : this.mishears.total <= 3 ? 'var(--col-amber)' : 'var(--col-red)';
    const mishearGrade = this.mishears.total === 0 ? '우수' : this.mishears.total <= 3 ? '보통' : '미흡';
    const commsAvg = this._avgComms();
    const commsColor = commsAvg >= 70 ? 'var(--col-green)' : commsAvg >= 50 ? 'var(--col-amber)' : 'var(--col-red)';

    html += `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px;margin-bottom:6px;">
        <div>오청 총 발생<span class="rv" style="color:${mishearColor}">${this.mishears.total}회</span></div>
        <div>통신 품질 평균<span class="rv" style="color:${commsColor}">${commsAvg}%</span></div>
        <div>좌표 변형<span class="rv">${this.mishears.coord}회</span></div>
        <div>통신 두절<span class="rv">${this.mishears.ignore}회</span></div>
        <div>명령 왜곡<span class="rv">${this.mishears.attack_instead}회</span></div>
        <div>배급소 피격<span class="rv">${this.depotDamages}회</span></div>
      </div>
    `;

    // 오청 등급
    html += `
      <div style="margin:8px 0 14px;padding:6px 10px;border:1px solid ${mishearColor};font-size:.72rem;letter-spacing:.12em;color:${mishearColor};">
        통신 숙달도 평가 — <b>${mishearGrade}</b>
        ${this.mishears.total === 0 ? ' (완벽한 통신 유지)' : ` (오청 ${this.mishears.total}회 발생)`}
      </div>
    `;

    // ── 페이즈별 교전 ──
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

    // ── 분대별 활동 요약 ──
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

    // ── OC/T 총평 ──
    html += `<div style="height:1px;background:var(--col-border);margin:0 0 14px;"></div>`;
    html += `<div style="font-size:.68rem;letter-spacing:.08em;color:var(--col-text-dim);margin-bottom:14px;line-height:1.9;font-family:'Noto Sans KR',sans-serif;">`;
    html += `<span style="color:var(--col-amber);letter-spacing:.12em;">OC/T 총평 //</span> `;
    html += this._generateOCTComment();
    html += `</div>`;

    document.getElementById('result-body').innerHTML = html;
    overlay.classList.add('show');
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

    // 통신 평가
    if (this.mishears.total === 0) {
      comments.push('전 훈련 기간 통신 오류 없음. 통신 절차 숙달 우수.');
    } else if (this.mishears.ignore > 2) {
      comments.push(`통신 두절 ${this.mishears.ignore}회 발생. 계곡 지형 진입 시 통신 음영 사전 확인 필요.`);
    } else if (this.mishears.coord > 2) {
      comments.push(`좌표 오청 ${this.mishears.coord}회. 좌표 복창 절차 재교육 권고.`);
    } else {
      comments.push(`오청 ${this.mishears.total}회 발생. 교전 중 통신 절차 유지 훈련 필요.`);
    }

    // 전투 효율 평가
    const allyHR = this._hitRate('ally');
    if (allyHR >= 60) {
      comments.push(`사격 명중률 ${allyHR}% — 우수.`);
    } else if (allyHR >= 40) {
      comments.push(`사격 명중률 ${allyHR}% — 표준. 지형 활용 사격 훈련 보완 권고.`);
    } else {
      comments.push(`사격 명중률 ${allyHR}% — 미흡. 사격 기본기 및 엄폐물 활용 집중 훈련 필요.`);
    }

    // 보급 평가
    if (this.depotDamages > 0) {
      comments.push(`배급소 ${this.depotDamages}회 피격. 후방 경계 강화 필요.`);
    }

    // 야간 평가
    const nightKills = this.phaseKills.night || 0;
    if (nightKills > 0) {
      comments.push(`야간 작전 중 ${nightKills}회 교전 발생. 야간 기동 절차 숙달 필요.`);
    }

    return comments.join(' ');
  }
}
