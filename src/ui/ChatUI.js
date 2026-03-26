/* ============================================================
   ChatUI.js — 통신 채팅창 관리
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

  /** 채팅 입력창 전송 */
  sendChat() {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.addLog('나 >', null, text);
    this.inputEl.value = '';
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
    // 오청 종류별 헤더 텍스트
    const typeLabel = {
      coord:           '⚡ 오청 — 좌표 변형',
      ignore:          '⚡ 오청 — 통신 두절',
      attack_instead:  '⚡ 오청 — 명령 왜곡',
    }[mishearType] || '⚡ 오청';

    // 원본 명령을 흐릿하게 먼저 표시
    this.addLog('⚠ 원본', null, originalText, 'distort');

    // 오청 결과를 굵게 강조
    this.addLog(typeLabel, null, distortedText, 'distort');

    // TODO: Howler.js 경고음 재생
    // sfx.radio_noise.play();
  }
}

// index.html의 onclick 핸들러와 호환되는 전역 래퍼
function sendChat()               { chatUI.sendChat(); }
function switchChannel(tab, name) { chatUI.switchChannel(tab, name); }
