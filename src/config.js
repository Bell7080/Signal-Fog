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
  MAP_MAX: 250,
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

  /* ── 보급 시스템 ── */
  SUPPLY_WATER_MAX:        100,   // 분대 최대 수분 (%)
  SUPPLY_RATION_MAX:       100,   // 분대 최대 전투식량 (%)
  SUPPLY_WATER_DRAIN:      8,     // 턴당 수분 소모량
  SUPPLY_RATION_DRAIN:     5,     // 턴당 전투식량 소모량
  SUPPLY_RESUPPLY_RANGE:   3,     // 배급소 보급 반경 (타일)
  SUPPLY_RESUPPLY_WATER:   25,    // 배급소 근처 수분 회복량/턴
  SUPPLY_RESUPPLY_RATION:  18,    // 배급소 근처 전투식량 회복량/턴
  SUPPLY_DEPOT_WATER:      400,   // 배급소 수분 보유량
  SUPPLY_DEPOT_RATION:     300,   // 배급소 전투식량 보유량
  SUPPLY_DEPOT_HP:         3,     // 배급소 내구도
  SUPPLY_AP_PENALTY_WATER: 1,     // 수분 30% 미만 시 AP 패널티
  SUPPLY_AP_PENALTY_RATION:1,     // 전투식량 20% 미만 시 AP 패널티

  /* ── 무기 시스템 ── */
  // 기관총 (MG)
  MG_RANGE:       6,
  MG_HIT_RATE:    0.70,
  MG_MOVE_COST:   2,     // 이동 AP 비용 증가 (기본 대비)
  // 박격포 (Mortar)
  MORTAR_RANGE:   8,
  MORTAR_HIT_RATE:0.55,
  MORTAR_AOE:     1,     // 폭발 반경 (타일)
  MORTAR_INACCURACY: 1,  // 착탄 오차 (±타일)
  MORTAR_SETUP_COST: 1,  // 거치 AP 비용
  MORTAR_MOVE_COST:  3,  // 이동 AP 비용
  MORTAR_COOLDOWN:   2,  // 발사 후 재장전 턴 수
};
