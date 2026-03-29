/* ============================================================
   SurvivalStats.js — 생존 스탯 시스템 v3
   ────────────────────────────────────────────────────────────
   · 패시브 턴당 소모 없음 — 행동(이동/교전) 시에만 소모
   · 수면 상태: 매 턴 startInputPhase에서 _processSleep 호출
   · 자율 보충: AllyAI/FallbackAI가 'rest' 커맨드 발행 →
                autonomousRestore(squad, 'eat'|'drink') 호출
   · 아사 판정: water=0 && ration=0 지속 시 STARVATION_INTERVAL마다 병력 감소
   ============================================================ */

class SurvivalStats {

  /* ── 분대 초기화 ─────────────────────────────────────────── */
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

  /* ── 수면 상태 처리 (매 턴 startInputPhase에서 호출) ──────── */
  /**
   * 수면 진입/기상 처리만 담당 (소모 없음)
   * @param {Array} squads - 아군+적군 살아있는 분대
   * @returns {Array<{squad, event: 'sleep'|'wake'}>}
   */
  processSleep(squads) {
    const events = [];
    for (const s of squads) {
      if (!s.alive || !s.supply) continue;
      const evt = this._updateSleeping(s);
      if (evt) events.push({ squad: s, event: evt });
    }
    return events;
  }

  /* ── 아사 판정 (매 턴 호출) ──────────────────────────────── */
  /**
   * @param {Array} squads - 살아있는 분대
   * @returns {Array<{squad, event: 'starve'}>}
   */
  processStarvation(squads) {
    const events = [];
    for (const s of squads) {
      if (!s.alive || !s.supply) continue;
      if (this._checkStarvation(s)) events.push({ squad: s, event: 'starve' });
    }
    return events;
  }

  /* ── 행동 소모: 이동 ─────────────────────────────────────── */
  consumeMove(squad) {
    if (!squad.supply) return;
    squad.supply.water  = Math.max(0, squad.supply.water  - CONFIG.SURVIVAL_MOVE_WATER);
    squad.supply.ration = Math.max(0, squad.supply.ration - CONFIG.SURVIVAL_MOVE_RATION);
  }

  /* ── 행동 소모: 공격 ─────────────────────────────────────── */
  consumeAttack(squad) {
    if (!squad.supply) return;
    squad.supply.morale = Math.max(0, squad.supply.morale - CONFIG.SURVIVAL_ATTACK_MORALE);
    squad.supply.water  = Math.max(0, squad.supply.water  - CONFIG.SURVIVAL_ATTACK_WATER);
    squad.supply.ration = Math.max(0, squad.supply.ration - CONFIG.SURVIVAL_ATTACK_RATION);
  }

  /* ── 자율 보충 (AllyAI/FallbackAI 'rest' 커맨드 실행 시) ── */
  /**
   * @param {object} squad
   * @param {'eat'|'drink'} restType
   * @returns {boolean} 실제로 소모 했는지
   */
  autonomousRestore(squad, restType) {
    if (!squad.supply) return false;
    const R = CONFIG.SURVIVAL_ITEM_RESTORE;
    if (restType === 'eat' && (squad.supply.inv_ration ?? 0) > 0) {
      squad.supply.ration = Math.min(CONFIG.SUPPLY_RATION_MAX, squad.supply.ration + R);
      squad.supply.inv_ration--;
      return true;
    }
    if (restType === 'drink' && (squad.supply.inv_water ?? 0) > 0) {
      squad.supply.water = Math.min(CONFIG.SUPPLY_WATER_MAX, squad.supply.water + R);
      squad.supply.inv_water--;
      return true;
    }
    return false;
  }

  /* ── 배급소 인근 정신력 회복 ─────────────────────────────── */
  recoverMoraleNearDepot(squad) {
    if (!squad.supply) return;
    squad.supply.morale = Math.min(
      CONFIG.SURVIVAL_MORALE_MAX,
      (squad.supply.morale ?? 100) + CONFIG.SURVIVAL_DEPOT_MORALE_REGEN
    );
  }

  /* ── 수면 갱신 ───────────────────────────────────────────── */
  _updateSleeping(squad) {
    const morale = squad.supply.morale ?? 100;
    if (!squad.sleeping && morale < CONFIG.SURVIVAL_MORALE_SLEEP_BELOW) {
      squad.sleeping = true;
      return 'sleep';
    }
    if (squad.sleeping) {
      squad.supply.morale = Math.min(
        CONFIG.SURVIVAL_MORALE_MAX,
        morale + CONFIG.SURVIVAL_SLEEP_MORALE_REGEN
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
    if ((squad.supply.water ?? 1) > 0 || (squad.supply.ration ?? 1) > 0) {
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
