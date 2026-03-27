/* ============================================================
   GeminiClient.js — Gemini API 호출 (2026년 3월 기준 개선 버전)
   ============================================================ */

class GeminiClient {

  constructor() {
    this.apiKey  = CONFIG.GEMINI_API_KEY || '';
    this.model   = CONFIG.GEMINI_MODEL;
    this.baseURL = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  buildPrompt(mapState) {
    // 기존 buildPrompt 그대로 유지 (여기서는 생략)
    // ... (원본 buildPrompt 코드 그대로 넣으세요)
  }

  /**
   * Gemini API 호출 - 상세 에러 디버깅 강화
   */
  async call(mapState) {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY 미설정');

    const prompt = this.buildPrompt(mapState);

    console.log(`[Gemini Request] Model: ${this.model} | Prompt length: ${prompt.length} chars`);

    const fetchPromise = fetch(`${this.baseURL}?key=${this.apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.3, 
          maxOutputTokens: 300,     // 더 낮춰서 안전
          topP: 0.85
        },
      }),
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), CONFIG.GEMINI_TIMEOUT)
    );

    let response;
    try {
      response = await Promise.race([fetchPromise, timeoutPromise]);
    } catch (e) {
      if (e.message.includes('timeout')) throw new Error('GEMINI_TIMEOUT');
      throw e;
    }

    if (!response.ok) {
      let errorMsg = `Gemini HTTP ${response.status}`;
      let errorBody = null;

      try {
        errorBody = await response.json();
        console.error('🔴 [Gemini Full Error Body]', errorBody);   // ← 이 로그가 핵심!
        if (errorBody.error?.message) {
          errorMsg += ` - ${errorBody.error.message}`;
        }
      } catch (parseErr) {
        console.error('🔴 Gemini error body parsing failed');
      }

      throw new Error(errorMsg);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  /**
   * 응답 파싱 (기존과 동일)
   */
  parseResponse(data) {
    try {
      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('응답 구조 이상');
      }

      const text = data.candidates[0].content.parts[0].text.trim();
      const match = text.match(/(\[[\s\S]*?\])/);
      if (!match) throw new Error('JSON 배열 없음');

      const actions = JSON.parse(match[0]);
      if (!Array.isArray(actions)) throw new Error('배열 아님');

      return actions;
    } catch (e) {
      console.warn('Gemini parse failed:', e.message);
      throw new Error(`Gemini 응답 파싱 실패: ${e.message}`);
    }
  }
}