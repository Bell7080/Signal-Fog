/* ════════════════════════════════════════════════════════════
   js/ui/ChatUI.js  —  채팅 패널 UI 매니저
   Signal-Fog  /  팀 LNG

   ▸ bus.emit(EVT.LOG, payload) 한 줄로 어디서든 로그 추가
   ▸ DOM 의존: #chat-log, #chat-input, #chat-send, .ch-tab
   ▸ 의존: EventBus, config(EVT)
════════════════════════════════════════════════════════════ */

import bus from '../EventBus.js';
import { EVT } from '../config.js';

export class ChatUI {
  /** @param {firebase.database.Database|null} db */
  constructor(db = null) {
    this._db      = db;
    this._channel = '지휘';
    this._logEl   = document.getElementById('chat-log');
    this._inputEl = document.getElementById('chat-input');

    this._bindDOM();
    this._subscribeEvents();
  }

  // ── DOM 이벤트 연결 ───────────────────────────────────────
  _bindDOM() {
    document.getElementById('chat-send')
      ?.addEventListener('click', () => this.sendChat());

    this._inputEl
      ?.addEventListener('keydown', e => {
        if (e.key === 'Enter') this.sendChat();
      });

    document.querySelectorAll('.ch-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchChannel(tab, tab.dataset.channel ?? tab.textContent.trim());
      });
    });
  }

  // ── EventBus 구독 ─────────────────────────────────────────
  _subscribeEvents() {
    bus.on(EVT.LOG, ({ sender = null, time = null, text, type = '' }) => {
      this.addLog(sender, time, text, type);
    });
  }

  // ── 공개 API ──────────────────────────────────────────────

  /**
   * 로그 엔트리 추가
   * @param {string|null} sender
   * @param {string|null} time    'HH:MM' | null → 현재 시각
   * @param {string}      text
   * @param {string}      type    '' | 'system' | 'distort'
   */
  addLog(sender, time, text, type = '') {
    if (!this._logEl) return;

    const t   = time ?? new Date().toTimeString().slice(0, 5);
    const el  = document.createElement('div');
    el.className = 'log-entry';

    if (type === 'system') {
      el.innerHTML =
        `<span class="log-time">[${t}]</span>` +
        `<span class="log-system">${this._esc(text)}</span>`;

    } else if (type === 'distort') {
      const safe = this._esc(text);
      el.innerHTML =
        `<span class="log-time">[${t}]</span>` +
        `<span class="log-sender">${this._esc(sender ?? '')}</span>` +
        `<span class="log-distort">${safe}</span>`;

    } else {
      el.innerHTML =
        `<span class="log-time">[${t}]</span>` +
        `<span class="log-sender">${this._esc(sender ?? '')}</span>` +
        `<span class="log-text">${this._esc(text)}</span>`;
    }

    this._logEl.appendChild(el);

    // 자동 스크롤 (사용자가 위로 스크롤 중이면 건너뜀)
    const { scrollTop, scrollHeight, clientHeight } = this._logEl;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (isNearBottom) {
      this._logEl.scrollTop = this._logEl.scrollHeight;
    }
  }

  /** 메시지 전송 */
  sendChat() {
    const text = this._inputEl?.value.trim();
    if (!text) return;

    this.addLog('나 >', null, text);
    this._inputEl.value = '';

    // TODO: Firebase chatManager 연동
    // this._db?.ref(`rooms/${roomId}/chatLog/${this._channel}`).push(...)
  }

  /** 채널 탭 전환 */
  switchChannel(tab, name) {
    document.querySelectorAll('.ch-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    this._channel = name;

    bus.emit(EVT.LOG, { text: `채널 전환 → [${name}]`, type: 'system' });
    // TODO: Firebase 채널 히스토리 로드
  }

  // ── 내부 유틸 ─────────────────────────────────────────────
  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
