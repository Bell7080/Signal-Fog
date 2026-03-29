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

  /* ── 교전 ── */
  RIFLE_RANGE:      4,
  RIFLE_HIT_RATE:   0.6,
  FOG_SIGHT_RANGE:  3,

  /* ── 분대 행동 AP (이동 분리 후 공격/특수행동 전용) ── */
  SQUAD_AP_MAX: 3,

  /* ── 턴 ── */
  TURN_LIMIT:      20,
  TURN_INPUT_SEC:  60,

  /* ── 목표 점령 (3×3 게이지 시스템) ── */
  OBJECTIVE_SIZE:            3,   // 점령지 크기 (3×3 타일)
  CAPTURE_WIN_TURNS_FACTOR:  4,   // 승리 게이지 = 아군분대수 × 이 값
  OBJECTIVE_DISCOVERY_RANGE: 2,   // 발견 반경 (타일)

  /* ── 이동/공격 분리 ── */
  SQUAD_MOVE_AP: 2,    // 이동 포인트 (매 턴, 별도 관리)

  /* ── AI ── */
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-2.0-flash-lite',
  GEMINI_TIMEOUT: 5000,

  /* ── 보급 시스템 ── */
  SUPPLY_WATER_MAX:        100,
  SUPPLY_RATION_MAX:       100,
  SUPPLY_WATER_DRAIN:      0,     // 소모는 SurvivalStats에서 처리 (0으로 비활성화)
  SUPPLY_RATION_DRAIN:     0,     // 소모는 SurvivalStats에서 처리
  SUPPLY_RESUPPLY_RANGE:   3,     // 배급소 보급 반경 (타일)
  SUPPLY_RESUPPLY_WATER:   25,    // 배급소 근처 수분 회복량/턴
  SUPPLY_RESUPPLY_RATION:  18,    // 배급소 근처 전투식량 회복량/턴
  SUPPLY_DEPOT_WATER:      400,   // 배급소 수분 보유량
  SUPPLY_DEPOT_RATION:     300,   // 배급소 전투식량 보유량
  SUPPLY_DEPOT_HP:         3,     // 배급소 내구도
  SUPPLY_AP_PENALTY_WATER: 1,     // 수분 30% 미만 시 AP 패널티
  SUPPLY_AP_PENALTY_RATION:1,     // 전투식량 20% 미만 시 AP 패널티

  /* ── 생존 스탯 시스템 ── */
  SURVIVAL_MORALE_MAX:             100,
  // 턴당 수동 소모 (배급소 없을 때)
  SURVIVAL_WATER_DECAY_TURN:       8,
  SURVIVAL_RATION_DECAY_TURN:      6,
  SURVIVAL_MORALE_DECAY_TURN:      4,
  // 행동당 소모
  SURVIVAL_MOVE_WATER:             2,    // 이동 1회당
  SURVIVAL_MOVE_RATION:            1,
  SURVIVAL_ATTACK_MORALE:          8,    // 공격 1회당
  SURVIVAL_ATTACK_WATER:           3,
  SURVIVAL_ATTACK_RATION:          3,
  // 소지 인벤토리
  SURVIVAL_INV_RATION_START:       5,    // 시작 소지 식량 (개)
  SURVIVAL_INV_WATER_START:        5,    // 시작 소지 물 (개)
  SURVIVAL_AUTO_USE_THRESHOLD:     25,   // 이 % 미만이면 인벤토리 자동 소모
  SURVIVAL_ITEM_RESTORE:           35,   // 아이템 1개당 회복량
  // 배급소 인접 시 모랄 소폭 회복
  SURVIVAL_DEPOT_MORALE_REGEN:     5,
  // 수면
  SURVIVAL_MORALE_SLEEP_BELOW:     15,   // 정신력 이 미만 → 수면
  SURVIVAL_MORALE_WAKE_ABOVE:      35,   // 수면 중 이 이상 → 기상
  SURVIVAL_SLEEP_MORALE_REGEN:     12,   // 수면 중 정신력 회복/턴
  // 굶주림
  SURVIVAL_STARVATION_INTERVAL:    3,    // 아사 병력 감소 간격 (턴)

  /* ── 무기 시스템 ── */
  // 기관총 (MG)
  MG_RANGE:       6,
  MG_HIT_RATE:    0.70,
  MG_MOVE_COST:   1,     // 이동 포인트 소모 증가 (2→1로 감소)
  // 박격포 (Mortar)
  MORTAR_RANGE:   8,
  MORTAR_HIT_RATE:0.55,
  MORTAR_AOE:     1,     // 폭발 반경 (타일)
  MORTAR_INACCURACY: 1,  // 착탄 오차 (±타일)
  MORTAR_SETUP_COST: 1,  // 거치 AP 비용
  MORTAR_MOVE_COST:  2,  // 이동 포인트 소모 증가 (거치 해제 시 moveAp=0)
  MORTAR_COOLDOWN:   2,  // 발사 후 재장전 턴 수
};
