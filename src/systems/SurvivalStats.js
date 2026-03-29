/* ============================================================
   SurvivalStats.js — 생존 스탯 시스템 v2
   ────────────────────────────────────────────────────────────
   관리 항목:
     · water  (수분)   — 이동/공격/턴마다 소모, 인벤토리 자동 소모
     · ration (식량)   — 이동/공격/턴마다 소모, 인벤토리 자동 소모
     · morale (정신력) — 공격/턴마다 소모, 수면 중 회복
     · inv_ration      — 소지 전투식량 개수
     · inv_water       — 소지 물 개수

   흐름 (TurnManager.startInputPhase에서 tick() 호출):
     tick(squads) →
       수동 턴 소모 →
       인벤토리 자동 소모 →
       수면 갱신 (정신력 회복 / 기상) →
       굶주림 피해

   행동 시 (GameScene._issueMove / _issueAttack에서 호출):
     consumeMove(squad)   — 이동 1회 비용
     consumeAttack(squad) — 공격 1회 비용

   수면 (sleeping):
     · morale < SLEEP_BELOW → sleeping = true (명령 불가)
     · 수면 중 매 턴 morale += SLEEP_MORALE_REGEN
     · morale >= WAKE_ABOVE → 기상

   굶주림 (starvation):
     · water = 0 AND ration = 0 → 매 STARVATION_INTERVAL턴 병력 -1
     · troops = 0 → 분대 전멸
   ============================================================ */

class SurvivalStats {

  /* ── 분대 초기화 ─────────────────────────────────────────── */
  /**
   * SupplySystem.initSquad 이후 추가 필드 초기화
   * (water, ration은 SupplySystem이 이미 설정)
   * @param {object} squad
   */
  initSquad(squad) {
    if (!squad.supply) squad.supply = {
      water:  CONFIG.SUPPLY_WATER_MAX,
      ration: CONFIG.SUPPLY_RATION_MAX,
    };
    squad.supply.morale    = CONFIG.SURVIVAL_MORALE_MAX;
    squad.supply.inv_ration = CONFIG.SURVIVAL_INV_RATION_START;
    squad.supply.inv_water  = CONFIG.SURVIVAL_INV_WATER_START;
    squad.sleeping    = false;
    squad._starveTick = 0;
  }

  /* ── 턴당 처리 ───────────────────────────────────────────── */
  /**
   * 매 턴 시작 시 호출
   * @param {Array} squads - 아군 살아있는 분대
   * @returns {Array<{squad, event: 'sleep'|'wake'|'starve'|null}>}
   */
  tick(squads) {
    const events = [];
    for (const s of squads) {
      if (!s.alive || !s.supply) continue;

      // 1. 수동 소모 (턴당)
      s.supply.water  = Math.max(0, s.supply.water  - CONFIG.SURVIVAL_WATER_DECAY_TURN);
      s.supply.ration = Math.max(0, s.supply.ration - CONFIG.SURVIVAL_RATION_DECAY_TURN);
      s.supply.morale = Math.max(0, s.supply.morale - CONFIG.SURVIVAL_MORALE_DECAY_TURN);

      // 2. 인벤토리 자동 소모
      this._autoConsume(s);

      // 3. 수면 갱신
      const sleepEvt = this._updateSleeping(s);
      if (sleepEvt) events.push({ squad: s, event: sleepEvt });

      // 4. 굶주림 피해
      if (this._checkStarvation(s)) events.push({ squad: s, event: 'starve' });
    }
    return events;
  }

  /* ── 행동 소모: 이동 ─────────────────────────────────────── */
  /**
   * @param {object} squad
   */
  consumeMove(squad) {
    if (!squad.supply) return;
    squad.supply.water  = Math.max(0, squad.supply.water  - CONFIG.SURVIVAL_MOVE_WATER);
    squad.supply.ration = Math.max(0, squad.supply.ration - CONFIG.SURVIVAL_MOVE_RATION);
    this._autoConsume(squad);
  }

  /* ── 행동 소모: 공격 ─────────────────────────────────────── */
  /**
   * @param {object} squad
   */
  consumeAttack(squad) {
    if (!squad.supply) return;
    squad.supply.morale = Math.max(0, squad.supply.morale - CONFIG.SURVIVAL_ATTACK_MORALE);
    squad.supply.water  = Math.max(0, squad.supply.water  - CONFIG.SURVIVAL_ATTACK_WATER);
    squad.supply.ration = Math.max(0, squad.supply.ration - CONFIG.SURVIVAL_ATTACK_RATION);
    this._autoConsume(squad);
  }

  /* ── 배급소 인근 정신력 회복 ─────────────────────────────── */
  /**
   * 배급소 반경 내에 있는 분대의 정신력 소폭 회복
   * @param {object} squad
   */
  recoverMoraleNearDepot(squad) {
    if (!squad.supply) return;
    squad.supply.morale = Math.min(
      CONFIG.SURVIVAL_MORALE_MAX,
      squad.supply.morale + CONFIG.SURVIVAL_DEPOT_MORALE_REGEN
    );
  }

  /* ── 인벤토리 자동 소모 ──────────────────────────────────── */
  _autoConsume(squad) {
    const t = CONFIG.SURVIVAL_AUTO_USE_THRESHOLD;
    const r = CONFIG.SURVIVAL_ITEM_RESTORE;
    if (squad.supply.ration < t && squad.supply.inv_ration > 0) {
      squad.supply.ration = Math.min(CONFIG.SUPPLY_RATION_MAX, squad.supply.ration + r);
      squad.supply.inv_ration--;
    }
    if (squad.supply.water < t && squad.supply.inv_water > 0) {
      squad.supply.water = Math.min(CONFIG.SUPPLY_WATER_MAX, squad.supply.water + r);
      squad.supply.inv_water--;
    }
  }

  /* ── 수면 갱신 ───────────────────────────────────────────── */
  _updateSleeping(squad) {
    if (!squad.sleeping && squad.supply.morale < CONFIG.SURVIVAL_MORALE_SLEEP_BELOW) {
      squad.sleeping = true;
      return 'sleep';
    }
    if (squad.sleeping) {
      squad.supply.morale = Math.min(
        CONFIG.SURVIVAL_MORALE_MAX,
        squad.supply.morale + CONFIG.SURVIVAL_SLEEP_MORALE_REGEN
      );
      if (squad.supply.morale >= CONFIG.SURVIVAL_MORALE_WAKE_ABOVE) {
        squad.sleeping = false;
        return 'wake';
      }
    }
    return null;
  }

  /* ── 굶주림 피해 ─────────────────────────────────────────── */
  _checkStarvation(squad) {
    if (squad.supply.water > 0 || squad.supply.ration > 0) {
      squad._starveTick = 0;
      return false;
    }
    squad._starveTick = (squad._starveTick || 0) + 1;
    if (squad._starveTick >= CONFIG.SURVIVAL_STARVATION_INTERVAL) {
      squad._starveTick = 0;
      squad.troops = Math.max(0, squad.troops - 1);
      if (squad.troops <= 0) squad.alive = false;
      return true;
    }
    return false;
  }
}
