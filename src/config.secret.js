/* ============================================================
   config.secret.js — API 키 + 모델 설정 (우선 적용)
   ============================================================ */

if (typeof CONFIG === 'undefined') {
  window.CONFIG = {};
}

// 본인 API 키
CONFIG.GEMINI_API_KEY = 'AIzaSyCSEBU4Zm2RmGXgcQOdFXHxYWId63NJzMk';

// ← 가장 안정적인 모델 (2026년 3월 기준 추천)
CONFIG.GEMINI_MODEL = 'gemini-2.0-flash';

console.log('%c✅ Gemini API Key & Model loaded → ' + CONFIG.GEMINI_MODEL, 'color:#39ff8e; font-weight:bold');