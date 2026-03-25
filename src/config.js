/* ============================================================
   config.js — Signal-Fog 전역 설정값
   모든 src 파일이 이 상수를 참조한다.
   게임 밸런스 조정은 이 파일 한 곳에서만 수행.
   ============================================================ */

const CONFIG = {

  /* ── 맵 ── */
  GRID_COLS:    12,         // 소대급 전투: 12×16 직사각 그리드 (약 600m×800m, 50m/타일)
  GRID_ROWS:    16,
  TILE_SIZE:    64,         // 픽셀 단위 타일 크기

  /* ── 지형 종류 (예선 MVP 4종) ── */
  TERRAIN: {
    OPEN:    { id: 'open',   label: '개활지', moveCost: 1, commsBonus:  0, cover: 0   },
    FOREST:  { id: 'forest', label: '수풀',   moveCost: 2, commsBonus:  0, cover: 0.1 },
    VALLEY:  { id: 'valley', label: '계곡',   moveCost: 2, commsPenalty: 40, cover: 0  }, // 오청 핵심
    HILL:    { id: 'hill',   label: '고지',   moveCost: 2, commsRange: 1,  cover: 0   },
  },

  /* ── 분대 ── */
  SQUAD_COUNT:      3,      // 기본 분대 수 (3~5, 예선은 3 고정)
  SQUAD_AP_MAX:     4,      // 분대당 턴 행동력 최대치
  SQUAD_TROOP_MAX:  4,      // 분대당 기본 병력 수

  /* ── 통신 ── */
  COMMS_QUALITY_THRESHOLD: 70, // 이 값 미만이면 오청 발생 가능
  BATTERY_DRAIN_PER_TURN:  3,  // 턴당 배터리 소모 (%)

  /* ── 교전 ── */
  RIFLE_RANGE:      4,      // 소총 사거리 (타일, K2 기준 ~200m)
  RIFLE_HIT_RATE:   0.6,    // 소총 기본 명중률 60%
  FOG_SIGHT_RANGE:  4,      // 시야 범위 (타일, ~200m)

  /* ── 턴 ── */
  TURN_LIMIT:      30,      // 최대 턴 수 (맵 확장 반영)
  TURN_INPUT_SEC:  60,      // 명령 입력 제한 시간 (초)

  /* ── 승리 조건 ── */
  CAPTURE_HOLD_TURNS: 3,    // 목표 지점 점령 유지 턴 수

  /* ── AI ── */
  GEMINI_MODEL:   'gemini-2.0-flash',
  GEMINI_TIMEOUT: 3000,     // ms — 초과 시 FallbackAI 전환
  /* ⚠ 보안 주의: API 키를 여기에 직접 입력하지 마십시오!
     키는 게임 내 'AI 설정' 버튼을 통해 입력하면 브라우저 localStorage에만 저장됩니다.
     이 필드는 빈 문자열('')로 유지하고 절대 커밋하지 마십시오. */
  GEMINI_API_KEY: '',

};
