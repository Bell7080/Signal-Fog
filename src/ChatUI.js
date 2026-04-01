/* ============================================================
   ChatUI.js — 통신 채팅창 관리
   v2: 채팅 명령 파싱 (ChatCommandParser) 연동
   ============================================================ */

class ChatUI {

  constructor() {
    this.logEl   = document.getElementById('chat-log');
    this.inputEl = document.getElementById('chat-input');

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChat();
    });
  }

  /**
   * 로그 메시지 추가
   * @param {string}      sender
   * @param {string|null} time
   * @param {string}      text
   * @param {string}      [type] - '' | 'system' | 'distort'
   */
  addLog(sender, time, text, type = '') {
    const t  = time || new Date().toTimeString().slice(0, 5);
    const el = document.createElement('div');
    el.className = 'log-entry';

    if (type === 'system') {
      el.innerHTML = `<span class="log-time">[${t}]</span><span class="log-system">${text}</span>`;
    } else if (type === 'distort') {
      el.innerHTML = `<span class="log-time">[${t}]</span><span class="log-sender">${sender}</span>`
                   + `<span class="log-distort" data-raw="${text}">${text}</span>`;
    } else {
      el.innerHTML = `<span class="log-time">[${t}]</span><span class="log-sender">${sender}</span>`
                   + `<span class="log-text">${text}</span>`;
    }

    el.style.animationDelay = '0s';
    this.logEl.appendChild(el);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  /** 채팅 입력창 전송 — v2: 명령 파싱 연동 */
  sendChat() {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.addLog('나 >', null, text);
    this.inputEl.value = '';

    // ── [D] 채팅 명령 파싱 ──
    if (window.gameScene?.chatParser) {
      const recognized = window.gameScene.chatParser.parse(text);
      if (recognized) {
        this.addLog('SYSTEM', null, '✓ 명령 인식 — 인게임 적용됨', 'system');
      }
    }
  }

  /**
   * 채널 탭 전환
   * @param {HTMLElement} tab
   * @param {string}      name
   */
  switchChannel(tab, name) {
    document.querySelectorAll('.ch-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    this.addLog('SYSTEM', null, `채널 전환 → [${name}]`, 'system');
  }

  /**
   * 오청 발생 로그 표시 — 종류별로 다른 메시지
   * @param {string} originalText
   * @param {string} distortedText
   * @param {string} [mishearType] - 'coord' | 'ignore' | 'attack_instead'
   */
  showMishear(originalText, distortedText, mishearType = 'coord') {
    const typeLabel = {
      coord:           '⚡ 오청 — 좌표 변형',
      ignore:          '⚡ 오청 — 통신 두절',
      attack_instead:  '⚡ 오청 — 명령 왜곡',
    }[mishearType] || '⚡ 오청';

    this.addLog('⚠ 원본', null, originalText, 'distort');
    this.addLog(typeLabel, null, distortedText, 'distort');
  }
}

// index.html의 onclick 핸들러와 호환되는 전역 래퍼
function sendChat()               { chatUI.sendChat(); }
function switchChannel(tab, name) { chatUI.switchChannel(tab, name); }
