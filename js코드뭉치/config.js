/* ════════════════════════════════════════════════════════════
   js/config.js  —  게임 전역 상수
   Signal-Fog  /  팀 LNG

   ▸ 로직 없음 — export const 만 허용
   ▸ 밸런스 조정·기능 추가 시 여기만 수정
   ▸ CSS 토큰과 수치 일치 항목: HEX_SIZE, TURN_SEC

   SECTIONS:
   [1] TURN SYSTEM
   [2] MAP
   [3] TERRAIN COSTS
   [4] COMMS QUALITY
   [5] SURVIVAL DECAY / PENALTY
   [6] ROLE AP
   [7] WEAPON SPEC
   [8] FIREBASE PATHS
   [9] EVENT BUS NAMES
════════════════════════════════════════════════════════════ */


/* ── [1] TURN SYSTEM ──────────────────────────────────────── */
export const TURN_SEC          = 60;    // 입력 페이즈 제한 시간(초)
export const HANDOVER_SEC      = 30;    // 지휘관 사망 후 인수인계 제한 시간
export const EXEC_TICK_MS      = 400;   // 실행 페이즈 1액션당 딜레이

/* ── [2] MAP ──────────────────────────────────────────────── */
export const MAP_COLS_PROTO    = 20;    // 예선 프로토타입 가로 헥스 수
export const MAP_ROWS_PROTO    = 20;    // 예선 프로토타입 세로 헥스 수
export const MAP_COLS_FINAL    = 40;    // 본선 확장
export const MAP_ROWS_FINAL    = 40;
export const HEX_SIZE          = 40;    // 헥스 외접원 반지름(px)

/* ── [3] TERRAIN COSTS  — 턴당 AP 소모 ─────────────────── */
export const TERRAIN_COST = Object.freeze({
  OPEN:       1,
  HILL_TOP:   2,
  VALLEY:     2,
  HILL_BACK:  2,
  URBAN:      2,
  FOREST:     2,
  RIVER:      3,
  BRIDGE:     1,
  MINEFIELD: Infinity,   // 진입 불가
});

/* ── [4] COMMS QUALITY  — 통신 품질 임계값(%) ────────────── */
export const COMMS_QUALITY = Object.freeze({
  DISTORT_THRESHOLD:   70,  // 이하 → 오청 발생
  DELAY_THRESHOLD:     50,  // 이하 → 지연 발생
  BLACKOUT_THRESHOLD:   0,  // 완전 두절
  BATTERY_WARN:        20,  // 배터리 경고
  INTERCEPT_OPEN:      25,  // 개활지 도청 노출 보정(%)
});

/* ── [5] SURVIVAL  — 생존 스탯 ───────────────────────────── */
export const SURVIVAL_DECAY = Object.freeze({
  HUNGER_BASE:    3,    // 배고픔 턴당 기본 감소
  FATIGUE_BASE:   2,    // 피로도 기본 감소
  FATIGUE_COMBAT: 3,    // 전투·이동 추가
  SLEEP_NIGHT:   20,    // 야간 미수면 감소
});

export const SURVIVAL_PENALTY = Object.freeze({
  HUNGER_MOVE:   50,    // 배고픔 50↓ → 이동력 -1
  HUNGER_AP:      0,    // 배고픔 0  → AP -2
  FATIGUE_AIM:   50,    // 피로 50↓  → 명중 -10%, 오청 +10%
  FATIGUE_AP:     0,    // 피로 0    → AP -3, 오청 +25%
  SLEEP_JUDGE:   50,    // 수면 50↓  → 판단 -1, 시야 -1
  SLEEP_DOWN:     0,    // 수면 0    → 행동불능 위험
});

/* ── [6] ROLE AP  — 역할별 기본 행동력 ─────────────────── */
export const ROLE_AP = Object.freeze({
  COMPANY_CO:   3,
  XO:           3,
  PLATOON_LDR:  4,
  SQUAD_LDR:    5,
  SOLDIER:      6,
  RADIOMAN:     4,
  MEDIC:        4,
  ENGINEER:     4,
  SUPPLY:       4,
  WEAPONS_LDR:  4,
});

/* ── [7] WEAPON SPEC ───────────────────────────────────────── */
export const WEAPON_SPEC = Object.freeze({
  RIFLE:   { range: 5,  acc: 60, damage: 'kill_wound' },
  MG:      { range: 8,  acc: 50, damage: 'kill_wound', suppress: true },
  MORTAR:  { range: 15, acc: 40, damage: 'aoe3' },
  AT:      { range: 10, acc: 70, damage: 'vehicle_kill' },
  GRENADE: { range: 2,  acc: null, damage: 'aoe2' },
  ARTY:    { range: 99, acc: 35, damage: 'aoe5', delay: 3 },
});

/* ── [8] FIREBASE PATHS ─────────────────────────────────── */
export const FB_PATH = Object.freeze({
  ROOMS:       'rooms',
  PLAYERS:     'players',
  GAME_STATE:  'gameState',
  TURN_INPUTS: 'turnInputs',
  CHAT:        'chatLog',
  AAR:         'aarData',
});

/* ── [9] EVENT BUS NAMES  — 오타 방지용 상수 ────────────── */
export const EVT = Object.freeze({
  // UI
  LOG:              'log',             // ChatUI → 로그 추가
  STATUS:           'status',          // HUD → 하단 상태 텍스트
  TOAST:            'toast',           // 알림 토스트 (확장 예정)

  // Turn
  TURN_START:       'turn:start',
  TURN_STOP:        'turn:stop',
  TURN_EXPIRED:     'turn:expired',
  TURN_NUMBER:      'turn:number',

  // Actions
  ACTION_HOLD:      'action:hold',
  ACTION_CONFIRM:   'action:confirm',
  ACTION_SURRENDER: 'action:surrender',

  // Units
  UNIT_MOVE:        'unit:move',
  UNIT_FIRE:        'unit:fire',
  UNIT_DEAD:        'unit:dead',
  UNIT_SELECT:      'unit:select',

  // Comms
  COMMS_ERROR:      'comms:error',

  // Resources
  SUPPLY_UPDATE:    'supply:update',
  STATS_UPDATE:     'stats:update',
  RESOURCE_UPDATE:  'resource:update',
});
