/* ============================================================
   config.secret.js — API 키 설정
   ============================================================ */

// 안전하게 CONFIG 객체 확인 후 키 주입
if (typeof CONFIG === 'undefined') {
  window.CONFIG = {};
}

CONFIG.GEMINI_API_KEY = 'AIzaSyCSEBU4Zm2RmGXgcQOdFXHxYWId63NJzMk';

// 모델도 여기서 강제로 설정 (config.js보다 우선)
CONFIG.GEMINI_MODEL = 'gemini-2.5-flash-lite';

console.log('%c✅ Gemini API Key & Model loaded → ' + CONFIG.GEMINI_MODEL, 'color:#39ff8e; font-weight:bold');