/* ============================================================
   config.js — Signal-Fog 전역 설정값
   ============================================================ */

// var로 변경 → 전역 변수(window.CONFIG)가 되어 config.secret.js에서 수정 가능
var CONFIG = {

  /* ── 맵 ── */
  GRID_COLS:    12,
  GRID_ROWS:    16,
  TILE_SIZE:    64,

  /* ── 지형 종류 (예선 MVP 4종) ── */
  TERRAIN: {
    OPEN:    { id: 'open',   label: '개활지', moveCost: 1, commsBonus:  0, cover: 0   },
    FOREST:  { id: 'forest', label: '수풀',   moveCost: 2, commsBonus:  0, cover: 0.1 },
    VALLEY:  { id: 'valley', label: '계곡',   moveCost: 2, commsPenalty: 40, cover: 0  },
    HILL:    { id: 'hill',   label: '고지',   moveCost: 2, commsRange: 1,  cover: 0   },
  },

  /* ── 분대 ── */
  SQUAD_COUNT:      3,
  SQUAD_AP_MAX:     4,
  SQUAD_TROOP_MAX:  4,

  /* ── 통신 ── */
  COMMS_QUALITY_THRESHOLD: 70,
  BATTERY_DRAIN_PER_TURN:  3,

  /* ── 교전 ── */
  RIFLE_RANGE:      4,
  RIFLE_HIT_RATE:   0.6,
  FOG_SIGHT_RANGE:  4,

  /* ── 턴 ── */
  TURN_LIMIT:      30,
  TURN_INPUT_SEC:  60,

  /* ── 승리 조건 ── */
  CAPTURE_HOLD_TURNS: 3,

  /* ── AI ── */
  GEMINI_API_KEY: '',          // ← config.secret.js에서 덮어쓰기
  GEMINI_MODEL:   'gemini-2.5-flash',
  GEMINI_TIMEOUT: 3000,

};