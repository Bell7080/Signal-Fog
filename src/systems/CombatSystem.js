/* ============================================================
   CombatSystem.js — 교전 판정 시스템
   v0.5 WeaponSystem 연동
   ────────────────────────────────────────────────────────────
   무기별 스펙 (CONFIG / WeaponSystem 기준):
     소총:   사거리 4, 명중 60%, 직접사격
     기관총: 사거리 6, 명중 70%, 직접사격, 제압 효과
     박격포: 사거리 8, 명중 55%, 간접사격, AOE 반경 1

   구현:
     1. inRange()        — 사거리 내 여부 (무기 타입 지원)
     2. rollHit()        — 명중 판정 (무기별 명중률 + 지형 보정)
     3. applyDamage()    — 즉사 처리
     4. applyAOE()       — 박격포 범위 피해
     5. checkExpose()    — 빗나감 소음 노출
   ============================================================ */

class CombatSystem {

  /**
   * 사거리 내 여부 확인
   * @param {{ col, row }} from
   * @param {{ col, row }} to
   * @param {number|object} [rangeOrWeapon] - 숫자 또는 weaponDef 객체
   * @returns {boolean}
   */
  inRange(from, to, rangeOrWeapon) {
    let range;
    if (typeof rangeOrWeapon === 'object' && rangeOrWeapon !== null) {
      range = rangeOrWeapon.range ?? CONFIG.RIFLE_RANGE;
    } else {
      range = rangeOrWeapon ?? CONFIG.RIFLE_RANGE;
    }
    const dist = Math.abs(from.col - to.col) + Math.abs(from.row - to.row);
    return dist <= range;
  }

  /**
   * 명중 판정
   * @param {{ col, row }} attackerPos
   * @param {{ col, row }} targetPos
   * @param {object} targetTerrain - CONFIG.TERRAIN 항목
   * @param {object} [weaponDef]   - WeaponSystem의 무기 정의 (옵션)
   * @returns {boolean}
   */
  rollHit(attackerPos, targetPos, targetTerrain, weaponDef) {
    const wDef = weaponDef || { range: CONFIG.RIFLE_RANGE, hitRate: CONFIG.RIFLE_HIT_RATE };
    if (!this.inRange(attackerPos, targetPos, wDef)) return false;

    let hitRate = wDef.hitRate ?? CONFIG.RIFLE_HIT_RATE;

    // 지형 엄폐 보정
    if (targetTerrain && targetTerrain.cover) {
      hitRate -= targetTerrain.cover;
    }

    return Math.random() < hitRate;
  }

  /**
   * 피해 적용 (병력 1 감소)
   * @param {object} targetUnit
   * @returns {{ result: 'kill'|'wound', unit: object }}
   */
  applyDamage(targetUnit) {
    targetUnit.troops = Math.max(0, targetUnit.troops - 1);
    if (targetUnit.troops <= 0) {
      targetUnit.alive = false;
      return { result: 'kill', unit: targetUnit };
    }
    return { result: 'wound', unit: targetUnit };
  }

  /**
   * 박격포 AOE 피해 처리
   * @param {{ col, row }} center    - 실제 착탄 위치 (오차 적용 후)
   * @param {number}       radius    - 폭발 반경 (타일)
   * @param {Array}        squads    - 전체 분대 목록
   * @param {object}       weaponDef - 박격포 무기 정의
   * @returns {Array<{ squad, hit: boolean, result: string }>}
   */
  applyAOE(center, radius, squads, weaponDef) {
    const results = [];
    for (const s of squads) {
      if (!s.alive) continue;
      const dist = Math.abs(s.pos.col - center.col) + Math.abs(s.pos.row - center.row);
      if (dist > radius) continue;

      // AOE 내 분대: 거리에 따라 명중률 감쇠
      // 중심 타일: 100% hitRate, 반경 1타일: 60%
      const falloff  = dist === 0 ? 1.0 : 0.6;
      const hitRate  = (weaponDef?.hitRate ?? CONFIG.MORTAR_HIT_RATE) * falloff;
      const hit      = Math.random() < hitRate;

      if (hit) {
        const dmgResult = this.applyDamage(s);
        results.push({ squad: s, hit: true, result: dmgResult.result });
      } else {
        results.push({ squad: s, hit: false, result: 'miss' });
      }
    }
    return results;
  }

  /**
   * 빗나감 시 소음 발생 여부 판정
   * @param {{ col, row }} attackerPos
   * @returns {boolean} true면 공격자 위치 노출
   */
  checkExpose(attackerPos) {
    return Math.random() < 0.3;
  }
}
