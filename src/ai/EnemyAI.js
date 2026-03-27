async decideTurn(mapState) {
  if (this.usingFallback) {
    return this.fallback.decide(mapState.enemy, mapState.ally);
  }

  try {
    const actions = await this.gemini.call(mapState);

    if (!Array.isArray(actions) || actions.length === 0) {
      throw new Error('Gemini 응답이 비어 있음');
    }

    this.usingFallback = false;
    return actions;

  } catch (e) {
    const msg = e.message || '';
    let logMessage = '[AI] Gemini 호출 실패 → 폴백 AI로 전환';

    if (msg.includes('RATE_LIMIT_EXCEEDED') || msg.includes('429')) {
      logMessage = '[AI] Gemini API 사용 한도 초과 (429) → 일반 AI(폴백)로 영구 전환';
      console.warn('Gemini Rate Limit 초과 감지');
    } else if (msg.includes('GEMINI_TIMEOUT') || msg.includes('SERVER_ERROR')) {
      logMessage = '[AI] Gemini 서버 오류 또는 타임아웃 → 폴백 AI 전환';
    } else if (msg.includes('GEMINI_API_KEY 미설정')) {
      logMessage = '[AI] Gemini API 키 미설정 → 폴백 AI 사용 중';
    }

    console.warn('Gemini 실패 → FallbackAI 전환:', msg);

    try {
      if (typeof chatUI !== 'undefined' && chatUI) {
        chatUI.addLog('SYSTEM', null, logMessage, 'system');
      }
    } catch (_) {}

    this.usingFallback = true;   // 한도 초과 시 영구 전환 (재시도 안 함)
    return this.fallback.decide(mapState.enemy, mapState.ally);
  }
}