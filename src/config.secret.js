/* ============================================================
   config.secret.js — API 키 설정
   ============================================================ */

// 안전하게 CONFIG 객체 확인 후 키 주입
if (typeof CONFIG === 'undefined') {
  window.CONFIG = {};
}

CONFIG.GEMINI_API_KEY = 'AIzaSyCSEBU4Zm2RmGXgcQOdFXHxYWId63NJzMk';   // ← 본인 키 유지

console.log('%c✅ Gemini API Key loaded (config.secret.js)', 'color:#39ff8e; font-weight:bold');