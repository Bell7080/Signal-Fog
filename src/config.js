/* ============================================================
   config.js — Signal-Fog 전역 설정값
   v0.2: 250×250 맵 확장 + 분대 수 동적 설정 지원
   ============================================================ */

var CONFIG = {

  /* ── 맵 (250×250) ── */
  GRID_COLS:    250,
  GRID_ROWS:    250,
  TILE_SIZE:    64,

  /* ── 지형 종류 (예선 MVP 4종) ── */
  TERRAIN: {
    OPEN:    { id: 'open',   label: '개활지', moveCost: 1, commsBonus:  0, cover: 0   },
    FOREST:  { id: 'forest', label: '수풀',   moveCost: 2, commsBonus:  0, cover: 0.1 },
    VALLEY:  { id: 'valley', label: '계곡',   moveCost: 2, commsPenalty: 40, cover: 0  },
    HILL:    { id: 'hill',   label: '고지',   moveCost: 2, commsRange: 1,  cover: 0   },
  },

  /* ── 분대 (게임 시작 시 동적으로 덮어씀) ── */
  SQUAD_COUNT:      5,      // 기본값, LobbyModal에서 덮어씀
  ENEMY_COUNT:      5,      // 기본값, LobbyModal에서 덮어씀
  SQUAD_AP_MAX:     4,
  SQUAD_TROOP_MAX:  4,

  /* ── 분대 수 범위 ── */
  SQUAD_MIN: 1,
  SQUAD_MAX: 10,

  /* ── 통신 ── */
  COMMS_QUALITY_THRESHOLD: 70,
  BATTERY_DRAIN_PER_TURN:  3,

  /* ── 교전 ── */
  RIFLE_RANGE:      6,      // 넓은 맵에 맞게 사거리 확대
  RIFLE_HIT_RATE:   0.6,
  FOG_SIGHT_RANGE:  8,      // 시야 범위도 확대

  /* ── 턴 ── */
  TURN_LIMIT:      50,
  TURN_INPUT_SEC:  90,      // 분대가 많을 수 있으므로 입력 시간 확대

  /* ── 승리 조건 ── */
  CAPTURE_HOLD_TURNS: 3,

  /* ── AI ── */
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-2.0-flash-lite',
  GEMINI_TIMEOUT: 5000,     // 큰 맵 직렬화로 프롬프트가 길어지므로 타임아웃 연장
};
