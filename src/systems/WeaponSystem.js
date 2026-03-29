/* ============================================================
   WeaponSystem.js — 무기 체계 정의
   ────────────────────────────────────────────────────────────
   무기 종류:
     RIFLE       — 기본 소총 (기존 동작 유지)
     MACHINE_GUN — 기관총 (장거리, 제압, 이동 패널티)
     MORTAR      — 박격포 (간접사격, AOE, 거치 필요, 쿨다운)

   분대 무기 배정 (_assignWeapons):
     분대 수 ≥ 3일 때:
       id가 가장 작은 분대 → MACHINE_GUN
       id가 두 번째로 작은 분대 → MORTAR
       나머지 → RIFLE
     분대 수 < 3: 전부 RIFLE

   무기별 특이사항:
   ┌─────────────┬──────────────────────────────────────────────┐
   │ MACHINE_GUN │ 사거리 6, 명중 70%, 이동 AP +2               │
   │             │ 빗나감 시 목표 분대 다음 턴 제압(AP-1)        │
   ├─────────────┼──────────────────────────────────────────────┤
   │ MORTAR      │ 사거리 8, 명중 55%, AOE 반경 1타일           │
   │             │ 거치(setup) 필요 — 1 AP 소모                 │
   │             │ 착탄 오차 ±1타일, 쿨다운 2턴                 │
   │             │ 배급소 공격 가능                             │
   └─────────────┴──────────────────────────────────────────────┘
   ============================================================ */

const WEAPON_TYPES = {

  RIFLE: {
    id:           'rifle',
    label:        '소총',
    labelShort:   'RF',
    range:        CONFIG.RIFLE_RANGE,
    hitRate:      CONFIG.RIFLE_HIT_RATE,
    aoeRadius:    0,
    indirect:     false,        // 직접사격 (시야 필요)
    movePenalty:  0,            // 이동 추가 AP 없음
    setupCost:    0,            // 즉시 발사 가능
    suppression:  false,
    depotAttack:  false,
    cooldown:     0,
    color:        '#39ff8e',
  },

  MACHINE_GUN: {
    id:           'machine_gun',
    label:        '기관총',
    labelShort:   'MG',
    range:        CONFIG.MG_RANGE,
    hitRate:      CONFIG.MG_HIT_RATE,
    aoeRadius:    0,
    indirect:     false,
    movePenalty:  CONFIG.MG_MOVE_COST,   // 이동 시 AP +2 추가 소모
    setupCost:    0,                      // 즉시 발사 (별도 거치 불필요)
    suppression:  true,                   // 빗나감 → 다음 턴 목표 AP-1
    depotAttack:  false,
    cooldown:     0,
    color:        '#ffb84d',
  },

  MORTAR: {
    id:           'mortar',
    label:        '박격포',
    labelShort:   'MT',
    range:        CONFIG.MORTAR_RANGE,
    hitRate:      CONFIG.MORTAR_HIT_RATE,
    aoeRadius:    CONFIG.MORTAR_AOE,
    indirect:     true,                   // 간접사격 — 시야 불필요
    movePenalty:  CONFIG.MORTAR_MOVE_COST,// 이동 AP +3
    setupCost:    CONFIG.MORTAR_SETUP_COST,
    suppression:  false,
    depotAttack:  true,                   // 배급소 공격 가능
    cooldown:     CONFIG.MORTAR_COOLDOWN,
    color:        '#cc80ff',
  },
};

/* ============================================================ */

class WeaponSystem {

  constructor() {
    // 무기 타입 정의 참조
    this.types = WEAPON_TYPES;
  }

  /* ── 무기 타입 조회 ────────────────────────────────────────── */
  /**
   * @param {'rifle'|'machine_gun'|'mortar'} id
   * @returns {object} 무기 정의
   */
  getType(id) {
    return Object.values(WEAPON_TYPES).find(w => w.id === id) || WEAPON_TYPES.RIFLE;
  }

  /* ── 분대 무기 배정 ────────────────────────────────────────── */
  /**
   * 분대 목록을 받아 각 분대에 unitType / weaponDef 프로퍼티 부여
   * @param {Array} squads - side가 동일한 분대 목록
   */
  assignWeapons(squads) {
    if (squads.length === 0) return;

    const sorted = [...squads].sort((a, b) => a.id - b.id);

    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      if (squads.length >= 3 && i === 0) {
        s.unitType  = 'machine_gun';
      } else if (squads.length >= 3 && i === 1) {
        s.unitType  = 'mortar';
      } else {
        s.unitType  = 'rifle';
      }
      s.weaponDef = this.getType(s.unitType);

      // 박격포 전용 상태
      if (s.unitType === 'mortar') {
        s.mortarState   = 'moving';   // 'moving' | 'setup' | 'ready'
        s.mortarCooldown = 0;
      }
      // 제압 상태 (기관총에게 맞으면 다음 턴 적용)
      s.suppressed = false;
    }
  }

  /* ── 이동 AP 계산 ──────────────────────────────────────────── */
  /**
   * 지형 이동 비용 + 무기 패널티 합산
   * @param {object} squad
   * @param {object} terrain - CONFIG.TERRAIN 항목
   * @returns {number}
   */
  moveCost(squad, terrain) {
    const base    = terrain?.moveCost ?? 1;
    const penalty = squad.weaponDef?.movePenalty ?? 0;
    return base + penalty;
  }

  /* ── 박격포 거치 처리 ──────────────────────────────────────── */
  /**
   * 박격포 분대가 거치(setup)를 선언할 때 호출
   * @param {object} squad
   * @returns {{ ok: boolean, reason?: string }}
   */
  setupMortar(squad) {
    if (squad.unitType !== 'mortar') return { ok: false, reason: '박격포 분대가 아님' };
    if (squad.mortarState === 'ready') return { ok: false, reason: '이미 거치됨' };
    if (squad.ap < CONFIG.MORTAR_SETUP_COST) return { ok: false, reason: 'AP 부족' };
    squad.ap           -= CONFIG.MORTAR_SETUP_COST;
    squad.mortarState   = 'ready';
    return { ok: true };
  }

  /* ── 박격포 거치 해제 ──────────────────────────────────────── */
  /**
   * 박격포 분대가 이동하면 거치 해제
   * @param {object} squad
   */
  dismantleMortar(squad) {
    if (squad.unitType !== 'mortar') return;
    squad.mortarState = 'moving';
  }

  /* ── 쿨다운 감소 (매 턴 호출) ─────────────────────────────── */
  /**
   * @param {Array} squads
   */
  tickCooldowns(squads) {
    for (const s of squads) {
      if (s.unitType === 'mortar' && s.mortarCooldown > 0) {
        s.mortarCooldown--;
      }
      // 제압 상태 해제 (전 턴에 적용된 제압 해제)
      s.suppressed = false;
    }
  }

  /* ── 제압 적용 ─────────────────────────────────────────────── */
  /**
   * 기관총 빗나감 시 목표 분대 제압 (다음 턴 AP-1)
   * @param {object} targetSquad
   */
  applySuppression(targetSquad) {
    if (!targetSquad || !targetSquad.alive) return;
    targetSquad.suppressed = true;
  }

  /* ── 착탄 오차 적용 (박격포) ───────────────────────────────── */
  /**
   * 박격포 목표 좌표에 랜덤 오차 적용
   * @param {{ col, row }} targetPos
   * @param {number} cols - 맵 열 수
   * @param {number} rows - 맵 행 수
   * @returns {{ col, row }} 실제 착탄 위치
   */
  applyMortarInaccuracy(targetPos, cols, rows) {
    const max = CONFIG.MORTAR_INACCURACY;
    const dc  = Math.floor(Math.random() * (max * 2 + 1)) - max;
    const dr  = Math.floor(Math.random() * (max * 2 + 1)) - max;
    return {
      col: Math.max(0, Math.min(cols - 1, targetPos.col + dc)),
      row: Math.max(0, Math.min(rows - 1, targetPos.row + dr)),
    };
  }

  /* ── AOE 범위 내 분대 목록 ─────────────────────────────────── */
  /**
   * 폭발 중심 기준 radius 타일 이내 분대 반환
   * @param {{ col, row }} center
   * @param {number} radius
   * @param {Array} squads
   * @returns {Array}
   */
  getAOETargets(center, radius, squads) {
    return squads.filter(s => {
      if (!s.alive) return false;
      const dist = Math.abs(s.pos.col - center.col) + Math.abs(s.pos.row - center.row);
      return dist <= radius;
    });
  }

  /* ── 사거리 확인 ───────────────────────────────────────────── */
  /**
   * @param {{ col, row }} from
   * @param {{ col, row }} to
   * @param {object} weaponDef
   * @returns {boolean}
   */
  inRange(from, to, weaponDef) {
    const dist = Math.abs(from.col - to.col) + Math.abs(from.row - to.row);
    return dist <= (weaponDef?.range ?? CONFIG.RIFLE_RANGE);
  }

  /* ── 무기 레이블 색상 ───────────────────────────────────────── */
  getWeaponColor(unitType) {
    return (WEAPON_TYPES[unitType?.toUpperCase?.()] || WEAPON_TYPES.RIFLE).color;
  }
}
