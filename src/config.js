/* ============================================================
   config.js — Signal-Fog 전역 설정값
   v0.6: 높이 기반 시야 + 낮/밤 사이클 상수 추가
   ============================================================ */

var CONFIG = {

  /* ── 맵 (APIKeyModal에서 동적으로 덮어씀) ── */
  GRID_COLS:    20,
  GRID_ROWS:    20,
  TILE_SIZE:    64,

  MAP_MIN: 10,
  MAP_MAX: 250,
  MAP_DEFAULT: 20,

  /* ── 지형 종류 ── */
  TERRAIN: {
    OPEN:    { id: 'open',   label: '개활지', moveCost: 1, commsBonus:  0, cover: 0   },
    FOREST:  { id: 'forest', label: '수풀',   moveCost: 2, commsBonus:  0, cover: 0.1 },
    VALLEY:  { id: 'valley', label: '계곡',   moveCost: 2, commsPenalty: 40, cover: 0  },
    HILL:    { id: 'hill',   label: '고지',   moveCost: 2, commsRange: 1,  cover: 0   },
    RIVER:   { id: 'river',  label: '하천',   moveCost: 3, commsPenalty: 10, cover: 0  },
    BRIDGE:  { id: 'bridge', label: '교량',   moveCost: 1, commsBonus:  0, cover: 0   },
  },

  /* ── 분대 ── */
  SQUAD_COUNT:      5,
  ENEMY_COUNT:      5,
  SQUAD_AP_MAX:     3,
  SQUAD_TROOP_MAX:  4,
  SQUAD_MIN: 1,
  SQUAD_MAX: 10,

  /* ── 통신 ── */
  COMMS_QUALITY_THRESHOLD: 70,
  BATTERY_DRAIN_PER_TURN:  3,

  /* ── 교전 ── */
  RIFLE_RANGE:      4,
  RIFLE_HIT_RATE:   0.6,

  /* ── 포그 오브 워 ── */
  FOG_SIGHT_RANGE:  4,

  /* ★ 높이 기반 시야 보정 (v0.6 신규) ── */
  // heightNorm(0~1) 기준 임계치
  FOG_HEIGHT_BONUS_THRESHOLD_LOW:  0.55,  // 중턱 이상 → 시야 +1
  FOG_HEIGHT_BONUS_THRESHOLD_HIGH: 0.75,  // 고지 정상 → 시야 +2
  FOG_HEIGHT_BONUS_LOW:   1,
  FOG_HEIGHT_BONUS_HIGH:  2,
  // 능선 LOS 차단 여유값 (0에 가까울수록 엄격)
  FOG_LOS_TOLERANCE: 0.06,

  /* ── 턴 ── */
  TURN_LIMIT:      20,
  TURN_INPUT_SEC:  60,

  /* ── 목표 점령 ── */
  OBJECTIVE_SIZE:            3,
  CAPTURE_WIN_TURNS_FACTOR:  4,
  OBJECTIVE_DISCOVERY_RANGE: 3,

  /* ── 무기별 기본 이동칸 ── */
  RIFLE_MOVE:  3,
  MG_MOVE:     2,
  MORTAR_MOVE: 1,

  SURVIVAL_MOVE_PENALTY_THRESHOLD: 30,

  /* ── AI ── */
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-2.0-flash-lite',
  GEMINI_TIMEOUT: 5000,

  /* ── 보급 시스템 ── */
  SUPPLY_WATER_MAX:        100,
  SUPPLY_RATION_MAX:       100,
  SUPPLY_WATER_DRAIN:      0,
  SUPPLY_RATION_DRAIN:     0,
  SUPPLY_RESUPPLY_RANGE:   3,
  SUPPLY_RESUPPLY_WATER:   25,
  SUPPLY_RESUPPLY_RATION:  18,
  SUPPLY_DEPOT_WATER:      400,
  SUPPLY_DEPOT_RATION:     300,
  SUPPLY_DEPOT_HP:         3,
  SUPPLY_AP_PENALTY_WATER: 1,
  SUPPLY_AP_PENALTY_RATION:1,

  SUPPLY_VEHICLE_HP:       3,
  SUPPLY_VEHICLE_SPEED:    2,
  SUPPLY_VEHICLE_FOOD_AMT: 250,
  SUPPLY_VEHICLE_WATER_AMT:300,

  /* ── 생존 스탯 ── */
  SURVIVAL_MORALE_MAX:             100,
  SURVIVAL_WATER_DECAY_TURN:       0,
  SURVIVAL_RATION_DECAY_TURN:      0,
  SURVIVAL_MORALE_DECAY_TURN:      0,
  SURVIVAL_MOVE_WATER:             3,
  SURVIVAL_MOVE_RATION:            2,
  SURVIVAL_ATTACK_MORALE:          10,
  SURVIVAL_ATTACK_WATER:           4,
  SURVIVAL_ATTACK_RATION:          4,
  SURVIVAL_INV_RATION_START:       6,
  SURVIVAL_INV_WATER_START:        6,
  SURVIVAL_AUTO_USE_THRESHOLD:     30,
  SURVIVAL_ITEM_RESTORE:           40,
  SURVIVAL_DEPOT_MORALE_REGEN:     5,
  SURVIVAL_MORALE_SLEEP_BELOW:     15,
  SURVIVAL_MORALE_WAKE_ABOVE:      40,
  SURVIVAL_SLEEP_MORALE_REGEN:     15,
  SURVIVAL_STARVATION_INTERVAL:    4,

  /* ── 무기 시스템 ── */
  MG_RANGE:       6,
  MG_HIT_RATE:    0.70,
  MORTAR_RANGE:   8,
  MORTAR_HIT_RATE:0.55,
  MORTAR_AOE:     1,
  MORTAR_INACCURACY: 1,
  MORTAR_SETUP_COST: 1,
  MORTAR_COOLDOWN:   2,

  /* ★ 낮/밤 사이클 (v0.6 신규) ──────────────────────────── */
  // 예선 MVP: 낮/밤 활성화 여부 (false면 항상 낮)
  DAY_NIGHT_ENABLED: true,
  // 각 페이즈 길이는 DayNightCycle.PHASES에서 직접 관리
};
