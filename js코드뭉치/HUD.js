/* ════════════════════════════════════════════════════════════
   js/ui/HUD.js  —  HUD 매니저
   Signal-Fog  /  팀 LNG

   ▸ 역할: 턴 타이머, 생존 스탯 바, 자원, 상태 텍스트, 액션 버튼
   ▸ DOM 의존: #turn-timer, #timer-bar, #footer-status,
               .stat-row[data-stat], .resource-row[data-resource]
   ▸ 의존: EventBus, config(EVT, TURN_SEC)
════════════════════════════════════════════════════════════ */

import bus from '../EventBus.js';
import { EVT, TURN_SEC } from '../config.js';

export class HUD {
  constructor() {
    this._remain   = TURN_SEC;
    this._interval = null;

    // DOM 참조 캐싱
    this._timerEl  = document.getElementById('turn-timer');
    this._barEl    = document.getElementById('timer-bar');
    this._statusEl = document.getElementById('footer-status');
    this._turnEl   = document.getElementById('hud-turn');
    this._phaseEl  = document.getElementById('hud-phase');

    this._bindActions();
    this._subscribeEvents();
  }

  // ── 액션 버튼 바인딩 ──────────────────────────────────────
  _bindActions() {
    document.querySelector('[data-action="hold"]')
      ?.addEventListener('click', () => this._onHold());
    document.querySelector('[data-action="confirm"]')
      ?.addEventListener('click', () => this._onConfirm());
    document.querySelector('[data-action="surrender"]')
      ?.addEventListener('click', () => this._onSurrender());
  }

  // ── EventBus 구독 ──────────────────────────────────────────
  _subscribeEvents() {
    bus.on(EVT.STATUS,          msg    => this.setStatus(msg));
    bus.on(EVT.TURN_START,      ()     => this.startTimer());
    bus.on(EVT.TURN_STOP,       ()     => this.stopTimer());
    bus.on(EVT.TURN_NUMBER,     n      => this._setTurnNumber(n));
    bus.on(EVT.STATS_UPDATE,    stats  => this._updateStats(stats));
    bus.on(EVT.RESOURCE_UPDATE, res    => this._updateResources(res));
  }

  // ── 타이머 ────────────────────────────────────────────────

  startTimer() {
    this.stopTimer();
    this._remain = TURN_SEC;
    this._tick();
    this._interval = setInterval(() => {
      this._remain = Math.max(0, this._remain - 1);
      this._tick();
      if (this._remain <= 0) {
        this.stopTimer();
        bus.emit(EVT.TURN_EXPIRED, null);
        bus.emit(EVT.LOG, { text: '입력 시간 초과 → 자동 HOLD 처리', type: 'system' });
        this.setStatus('⚠ 시간 초과 — 자동 HOLD 처리됨');
      }
    }, 1000);
  }

  stopTimer() {
    clearInterval(this._interval);
    this._interval = null;
  }

  _tick() {
    if (!this._timerEl || !this._barEl) return;
    this._timerEl.textContent      = this._remain;
    this._barEl.style.width        = `${(this._remain / TURN_SEC) * 100}%`;

    // 색상 + 클래스 전환
    this._timerEl.className = '';
    if (this._remain <= 10) {
      this._timerEl.classList.add('crit');
      this._barEl.style.background = 'var(--col-red)';
    } else if (this._remain <= 20) {
      this._timerEl.classList.add('warn');
      this._barEl.style.background = 'var(--col-amber)';
    } else {
      this._barEl.style.background = 'var(--col-green)';
    }
  }

  // ── 공개 API ──────────────────────────────────────────────

  setStatus(msg) {
    if (this._statusEl) this._statusEl.textContent = msg;
  }

  // ── 내부 업데이트 ─────────────────────────────────────────

  _setTurnNumber(n) {
    if (this._turnEl)  this._turnEl.textContent  = String(n).padStart(2, '0');
    if (this._phaseEl) this._phaseEl.textContent = '입력';
  }

  /**
   * @param {{ hunger, fatigue, sleep, fitness }} stats  — 각 0~100
   */
  _updateStats({ hunger, fatigue, sleep, fitness }) {
    const map = { hunger, fatigue, sleep, fitness };
    Object.entries(map).forEach(([key, val]) => {
      const row  = document.querySelector(`.stat-row[data-stat="${key}"]`);
      if (!row) return;

      const fill = row.querySelector('.stat-fill');
      const valEl = row.querySelector('.stat-val');
      const bar   = row.querySelector('.stat-bar');

      if (fill) {
        fill.style.setProperty('--pct', `${val}%`);

        // data-level 속성으로 CSS가 색상 처리
        if (val <= 20)      fill.dataset.level = 'crit';
        else if (val <= 50) fill.dataset.level = 'warn';
        else                delete fill.dataset.level;
      }

      if (valEl) valEl.textContent = val;
      if (bar)   bar.setAttribute('aria-valuenow', val);
    });
  }

  /**
   * @param {{ battery, ammo, ammoMax, ap, apMax, terrain }} res
   */
  _updateResources({ battery, ammo, ammoMax, ap, apMax, terrain }) {
    this._setResource('battery', battery != null ? `${battery}%` : null);
    this._setResource('ammo',    ammo    != null ? `${ammo} / ${ammoMax}` : null);
    this._setResource('ap',      ap      != null ? `${ap} / ${apMax}` : null,
                                 ap != null && ap <= 1 ? 'warn' : null);
    this._setResource('terrain', terrain ?? null);
  }

  _setResource(key, val, alert = null) {
    if (val == null) return;
    const row = document.querySelector(`.resource-row[data-resource="${key}"]`);
    if (!row) return;
    const el = row.querySelector('.resource-val');
    if (!el) return;
    el.textContent = val;
    if (alert) el.dataset.alert = alert;
    else       delete el.dataset.alert;
  }

  // ── 액션 핸들러 ───────────────────────────────────────────

  _onHold() {
    bus.emit(EVT.ACTION_HOLD, null);
    bus.emit(EVT.LOG, { text: '행동 → HOLD (대기)', type: 'system' });
    this.setStatus('HOLD 선택됨 — 턴 종료 대기');
  }

  _onConfirm() {
    bus.emit(EVT.ACTION_CONFIRM, null);
    bus.emit(EVT.LOG, { text: '입력 확정 — 실행 대기 중', type: 'system' });
    this.setStatus('입력 확정 완료');
    this.stopTimer();
  }

  _onSurrender() {
    if (!confirm('항복하시겠습니까?')) return;
    bus.emit(EVT.ACTION_SURRENDER, null);
    bus.emit(EVT.LOG, { text: '⚠ 항복 신호 송신됨', type: 'system' });
    this.setStatus('항복 처리 중...');
  }
}
