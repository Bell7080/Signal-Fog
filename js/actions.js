/* ════════════════════════════════════════════
   js/actions.js  —  푸터 액션 버튼
   Signal-Fog  /  팀 LNG
════════════════════════════════════════════ */

/** 푸터 상태 텍스트 업데이트 */
function setStatus(msg) {
  document.getElementById('footer-status').textContent = msg;
}

/** HOLD — 이번 턴 대기 선택 */
function holdAction() {
  addLog('SYSTEM', null, '행동 → HOLD (대기)', 'system');
  setStatus('HOLD 선택됨 — 턴 종료 대기');
  // TODO: Firebase turnInputs/{roomId}/myUid = { action: 'hold' }
}

/** CONFIRM — 입력 확정 */
function confirmTurn() {
  addLog('SYSTEM', null, '입력 확정 — 실행 대기 중', 'system');
  setStatus('입력 확정 완료');
  stopTurnTimer(); // timer.js
  // TODO: Firebase turnInputs/{roomId}/myUid = { action: 'confirmed', ... }
}

/** 항복 */
function surrenderAction() {
  addLog('SYSTEM', null, '⚠ 항복 신호 송신됨', 'system');
  setStatus('항복 처리 중...');
  // TODO: Firebase roomManager.js → surrender 플래그 기록
}
