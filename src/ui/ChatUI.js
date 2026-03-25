/* ============================================================
   ChatUI.js — 통신 채팅창 관리
   오청 발생 시 글리치 텍스트 효과 + 경고음 연동 예정

   구현 순서 (하나씩 추가):
     1. addLog()         — 로그 메시지 DOM에 추가
     2. sendChat()       — 채팅 입력창 전송 처리
     3. switchChannel()  — 채널 탭 전환
     4. showMishear()    — 오청 발생 시 글리치 로그 + 사운드
   ============================================================ */

class ChatUI {

  constructor() {
    this.logEl   = document.getElementById('chat-log');
    this.inputEl = document.getElementById('chat-input');

    // 엔터키로 전송
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChat();
    });
  }

  /**
   * 로그 메시지 추가
   * @param {string}  sender  - 발신자 (예: 'OC/T', 'SYSTEM', '대항군')
   * @param {string|null} time - 시간 문자열, null이면 현재 시각 자동 삽입
   * @param {string}  text    - 메시지 내용
   * @param {string}  [type]  - '' | 'system' | 'distort'
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
   * 오청 발생 로그 표시 (글리치 효과 + 경고음)
   * @param {string} originalText
   * @param {string} distortedText
   */
  showMishear(originalText, distortedText) {
    this.addLog('⚠ 오청', null, distortedText, 'distort');
    // TODO: Howler.js 경고음 재생
    // sfx.radio_noise.play();
  }
}

// index.html의 onclick 핸들러와 호환되는 전역 래퍼
function sendChat()                    { chatUI.sendChat(); }
function switchChannel(tab, name)      { chatUI.switchChannel(tab, name); }
