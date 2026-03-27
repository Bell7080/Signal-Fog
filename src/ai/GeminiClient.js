/* ============================================================
   GeminiClient.js — Gemini API 호출 (한도 초과 대응 강화)
   ============================================================ */

class GeminiClient {

  constructor() {
    this.apiKey  = CONFIG.GEMINI_API_KEY || '';
    this.model   = CONFIG.GEMINI_MODEL;
    this.baseURL = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  buildPrompt(mapState) { /* 기존 코드 그대로 유지 */ }

  /**
   * Gemini API 호출 - 429 한도 초과 시 별도 에러 throw
   */
  async call(mapState) {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY 미설정');

    const prompt = this.buildPrompt(mapState);

    const fetchPromise = fetch(`${this.baseURL}?key=${this.apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 }, // temperature 낮춰서 더 안정적
      }),
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API timeout')), CONFIG.GEMINI_TIMEOUT)
    );

    let response;
    try {
      response = await Promise.race([fetchPromise, timeoutPromise]);
    } catch (e) {
      if (e.message.includes('timeout')) throw new Error('GEMINI_TIMEOUT');
      throw e;
    }

    if (!response.ok) {
      const status = response.status;
      let errorMsg = `Gemini HTTP ${status}`;

      // 429 한도 초과를 명확히 구분
      if (status === 429) {
        errorMsg = 'GEMINI_RATE_LIMIT_EXCEEDED';
      } else if (status >= 500) {
        errorMsg = 'GEMINI_SERVER_ERROR';
      }

      throw new Error(errorMsg);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  /**
   * 응답 파싱 - 더 관대하게 JSON 배열 추출
   */
  parseResponse(data) {
    try {
      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('응답 구조 이상');
      }

      const text = data.candidates[0].content.parts[0].text.trim();

      // JSON 배열 찾기 (더 강력한 정규식)
      const match = text.match(/(\[[\s\S]*?\])/);
      if (!match) throw new Error('JSON 배열 없음');

      const jsonStr = match[0];
      const actions = JSON.parse(jsonStr);

      if (!Array.isArray(actions)) throw new Error('배열 아님');
      return actions;
    } catch (e) {
      console.warn('Gemini parse failed:', e.message, 'Raw text:', data?.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 200));
      throw new Error(`Gemini 응답 파싱 실패: ${e.message}`);
    }
  }
}