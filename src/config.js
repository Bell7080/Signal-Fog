/* ============================================================
   config.js — Signal-Fog 전역 설정값
   v0.5: moveAp 제거 → 무기별 이동칸 분리, 생존 행동소모만 유지
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
  SQUAD_AP_MAX:     3,    // 공격/특수행동 전용 AP
  SQUAD_TROOP_MAX:  4,

  /* ── 분대 수 범위 ── */
  SQUAD_MIN: 1,
  SQUAD_MAX: 10,

  /* ── 통신 ── */
  COMMS_QUALITY_THRESHOLD: 70,
  BATTERY_DRAIN_PER_TURN:  3,

  /* ── 교전 ── */
  RIFLE_RANGE:      4,
  RIFLE_HIT_RATE:   0.6,

  /* ── 포그 오브 워 (원형 시야) ── */
  FOG_SIGHT_RANGE:  4,   // 유클리드 반경 타일 수 (원형)

  /* ── 턴 ── */
  TURN_LIMIT:      20,
  TURN_INPUT_SEC:  60,

  /* ── 목표 점령 (3×3 게이지 시스템) ── */
  OBJECTIVE_SIZE:            3,
  CAPTURE_WIN_TURNS_FACTOR:  4,
  OBJECTIVE_DISCOVERY_RANGE: 3,   // 발견 반경 (타일) — 조금 넓게

  /* ── 무기별 기본 이동칸 ── */
  RIFLE_MOVE:  3,   // 소총: 3칸
  MG_MOVE:     2,   // 기관총: 2칸
  MORTAR_MOVE: 1,   // 박격포: 1칸 (거치 시 0)

  /* ── 생존 저하 이동 페널티 ── */
  SURVIVAL_MOVE_PENALTY_THRESHOLD: 30,  // 이 % 미만인 스탯당 이동칸 -1

  /* ── AI ── */
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-2.0-flash-lite',
  GEMINI_TIMEOUT: 5000,

  /* ── 보급 시스템 ── */
  SUPPLY_WATER_MAX:        100,
  SUPPLY_RATION_MAX:       100,
  SUPPLY_WATER_DRAIN:      0,     // SurvivalStats에서 처리
  SUPPLY_RATION_DRAIN:     0,
  SUPPLY_RESUPPLY_RANGE:   3,
  SUPPLY_RESUPPLY_WATER:   25,
  SUPPLY_RESUPPLY_RATION:  18,
  SUPPLY_DEPOT_WATER:      400,
  SUPPLY_DEPOT_RATION:     300,
  SUPPLY_DEPOT_HP:         3,
  SUPPLY_AP_PENALTY_WATER: 1,
  SUPPLY_AP_PENALTY_RATION:1,

  /* ── 보급 차량 ── */
  SUPPLY_VEHICLE_HP:       3,     // 차량 내구도
  SUPPLY_VEHICLE_SPEED:    2,     // 턴당 이동 칸 수
  SUPPLY_VEHICLE_FOOD_AMT: 250,   // 전투식량 보충량
  SUPPLY_VEHICLE_WATER_AMT:300,   // 급수 보충량

  /* ── 생존 스탯 시스템 ── */
  SURVIVAL_MORALE_MAX:             100,
  // 패시브 턴당 소모 없음 — 행동 시에만 소모
  SURVIVAL_WATER_DECAY_TURN:       0,
  SURVIVAL_RATION_DECAY_TURN:      0,
  SURVIVAL_MORALE_DECAY_TURN:      0,
  // 행동당 소모
  SURVIVAL_MOVE_WATER:             3,    // 이동 1회당
  SURVIVAL_MOVE_RATION:            2,
  SURVIVAL_ATTACK_MORALE:          10,   // 공격 1회당
  SURVIVAL_ATTACK_WATER:           4,
  SURVIVAL_ATTACK_RATION:          4,
  // 소지 인벤토리
  SURVIVAL_INV_RATION_START:       6,
  SURVIVAL_INV_WATER_START:        6,
  SURVIVAL_AUTO_USE_THRESHOLD:     30,   // 이 % 미만 → 인벤토리 소모 행동
  SURVIVAL_ITEM_RESTORE:           40,
  // 배급소 인근 정신력 회복
  SURVIVAL_DEPOT_MORALE_REGEN:     5,
  // 수면
  SURVIVAL_MORALE_SLEEP_BELOW:     15,
  SURVIVAL_MORALE_WAKE_ABOVE:      40,
  SURVIVAL_SLEEP_MORALE_REGEN:     15,
  // 굶주림 (water=0 AND ration=0 지속 시)
  SURVIVAL_STARVATION_INTERVAL:    4,

  /* ── 무기 시스템 ── */
  // 기관총 (MG)
  MG_RANGE:       6,
  MG_HIT_RATE:    0.70,
  // 박격포 (Mortar)
  MORTAR_RANGE:   8,
  MORTAR_HIT_RATE:0.55,
  MORTAR_AOE:     1,
  MORTAR_INACCURACY: 1,
  MORTAR_SETUP_COST: 1,
  MORTAR_COOLDOWN:   2,
};
