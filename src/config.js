/* ============================================================
   config.js — Signal-Fog 전역 설정값
   v0.4 FIX: 맵 크기 동적 조절 지원 (10~30 범위)
   ============================================================ */

var CONFIG = {

  /* ── 맵 (APIKeyModal에서 동적으로 덮어씀) ── */
  GRID_COLS:    20,
  GRID_ROWS:    20,
  TILE_SIZE:    64,

  /* ── 맵 크기 범위 ── */
  MAP_MIN: 10,
  MAP_MAX: 30,
  MAP_DEFAULT: 20,

  /* ── 지형 종류 (예선 MVP 6종) ── */
  TERRAIN: {
    OPEN:    { id: 'open',   label: '개활지', moveCost: 1, commsBonus:  0, cover: 0   },
    FOREST:  { id: 'forest', label: '수풀',   moveCost: 2, commsBonus:  0, cover: 0.1 },
    VALLEY:  { id: 'valley', label: '계곡',   moveCost: 2, commsPenalty: 40, cover: 0  },
    HILL:    { id: 'hill',   label: '고지',   moveCost: 2, commsRange: 1,  cover: 0   },
    RIVER:   { id: 'river',  label: '하천',   moveCost: 3, commsPenalty: 10, cover: 0  },
    BRIDGE:  { id: 'bridge', label: '교량',   moveCost: 1, commsBonus:  0, cover: 0   },
  },

  /* ── 분대 (게임 시작 시 동적으로 덮어씀) ── */
  SQUAD_COUNT:      5,
  ENEMY_COUNT:      5,
  SQUAD_AP_MAX:     4,
  SQUAD_TROOP_MAX:  4,

  /* ── 분대 수 범위 ── */
  SQUAD_MIN: 1,
  SQUAD_MAX: 10,

  /* ── 통신 ── */
  COMMS_QUALITY_THRESHOLD: 70,
  BATTERY_DRAIN_PER_TURN:  3,

  /* ── 교전 (기획서 스펙: 소총 4타일) ── */
  RIFLE_RANGE:      4,
  RIFLE_HIT_RATE:   0.6,
  FOG_SIGHT_RANGE:  3,

  /* ── 턴 ── */
  TURN_LIMIT:      20,
  TURN_INPUT_SEC:  60,

  /* ── 승리 조건 ── */
  CAPTURE_HOLD_TURNS: 3,

  /* ── AI ── */
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-2.0-flash-lite',
  GEMINI_TIMEOUT: 5000,
};
