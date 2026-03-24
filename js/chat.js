/* ════════════════════════════════════════════
   js/chat.js  —  채팅 / 로그 / 채널 전환
   Signal-Fog  /  팀 LNG
════════════════════════════════════════════ */

const chatLogEl = document.getElementById('chat-log');

/**
 * 로그 엔트리를 채팅 패널에 추가
 * @param {string} sender  - 발신자 이름
 * @param {string|null} time - HH:MM 형식, null 이면 현재 시각
 * @param {string} text   - 메시지 본문
 * @param {string} type   - '' | 'system' | 'distort'
 */
function addLog(sender, time, text, type = '') {
  const t  = time || new Date().toTimeString().slice(0, 5);
  const el = document.createElement('div');
  el.className = 'log-entry';
  el.style.animationDelay = '0s';

  if (type === 'system') {
    el.innerHTML =
      `<span class="log-time">[${t}]</span>` +
      `<span class="log-system">${text}</span>`;

  } else if (type === 'distort') {
    // 통신 오류 글리치 텍스트
    el.innerHTML =
      `<span class="log-time">[${t}]</span>` +
      `<span class="log-sender">${sender}</span>` +
      `<span class="log-distort" data-raw="${text}">${text}</span>`;

  } else {
    el.innerHTML =
      `<span class="log-time">[${t}]</span>` +
      `<span class="log-sender">${sender}</span>` +
      `<span class="log-text">${text}</span>`;
  }

  chatLogEl.appendChild(el);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

/** 채팅 전송 */
function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  // TODO: Firebase chatManager.js 연동 후 실제 전송으로 교체
  addLog('나 >', null, text);
  input.value = '';
}

/** 채널 탭 전환 */
function switchChannel(tab, name) {
  document.querySelectorAll('.ch-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  // TODO: Firebase에서 해당 채널 로그 불러오기
  addLog('SYSTEM', null, `채널 전환 → [${name}]`, 'system');
}

/* ── Enter 키 전송 ── */
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
});
