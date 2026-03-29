/* ============================================================
   SupplySystem.js — 보급 관리 시스템
   ────────────────────────────────────────────────────────────
   기능:
   1. 배급소(Depot) 배치 및 파괴 관리
   2. 분대별 물/전투식량 소모 및 보급
   3. 보급 부족 시 AP 패널티 적용
   4. 배급소 내구도 손상 및 파괴 처리

   배급소 배치 규칙:
   - 아군 스폰 근처 후방에 1~3개 배치 (맵 크기에 따라)
   - 적군도 자체 배급소 보유 (박격포 공격 대상)

   보급 흐름 (매 턴 startInputPhase에서 호출):
     tick(squads) →
       각 분대 물/전투식량 소모 →
       배급소 반경 내 분대 자동 보급 →
       AP 패널티 적용
   ============================================================ */

class SupplySystem {

  constructor() {
    /** @type {Array<DepotData>} */
    this.depots   = [];
    this._nextId  = 1;
    this._scene3d = null;   // GameScene._initSystems에서 주입
    this._gridMap = null;
  }

  /**
   * 씬 참조 주입 (3D 렌더링용)
   * @param {object} scene3d - THREE.Scene
   * @param {object} gridMap - GridMap 인스턴스
   */
  init(scene3d, gridMap) {
    this._scene3d = scene3d;
    this._gridMap = gridMap;
  }

  /* ── 배급소 추가 ─────────────────────────────────────────── */
  /**
   * @param {number} col
   * @param {number} row
   * @param {'ally'|'enemy'} side
   * @returns {DepotData}
   */
  addDepot(col, row, side = 'ally') {
    const depot = {
      id:       this._nextId++,
      col, row,
      side,
      water:    CONFIG.SUPPLY_DEPOT_WATER,
      ration:   CONFIG.SUPPLY_DEPOT_RATION,
      maxWater: CONFIG.SUPPLY_DEPOT_WATER,
      maxRation:CONFIG.SUPPLY_DEPOT_RATION,
      hp:       CONFIG.SUPPLY_DEPOT_HP,
      maxHp:    CONFIG.SUPPLY_DEPOT_HP,
      alive:    true,
      mesh:     null,
    };
    this.depots.push(depot);
    return depot;
  }

  /* ── 분대 보급 초기화 ────────────────────────────────────── */
  /**
   * 분대 생성 시 보급 스탯 추가
   * @param {object} squad
   */
  initSquad(squad) {
    squad.supply = {
      water:  CONFIG.SUPPLY_WATER_MAX,
      ration: CONFIG.SUPPLY_RATION_MAX,
    };
    squad._apPenalty = 0;   // 보급 부족 AP 패널티 누적
  }

  /* ── 턴 보급 처리 ────────────────────────────────────────── */
  /**
   * 매 턴 시작 시 호출: 소모 → 보급 → 패널티 계산
   * @param {Array} squads
   */
  tick(squads) {
    const allySquads = squads.filter(s => s.alive && s.supply);

    // 1. 전체 소모
    for (const s of allySquads) {
      s.supply.water  = Math.max(0, s.supply.water  - CONFIG.SUPPLY_WATER_DRAIN);
      s.supply.ration = Math.max(0, s.supply.ration - CONFIG.SUPPLY_RATION_DRAIN);
    }

    // 2. 배급소 반경 내 자동 보급
    for (const depot of this.depots.filter(d => d.alive && d.side === 'ally')) {
      for (const s of allySquads) {
        const dist = Math.abs(s.pos.col - depot.col) + Math.abs(s.pos.row - depot.row);
        if (dist > CONFIG.SUPPLY_RESUPPLY_RANGE) continue;

        // 물 보급
        const waterNeed = CONFIG.SUPPLY_WATER_MAX - s.supply.water;
        const waterGive = Math.min(waterNeed, CONFIG.SUPPLY_RESUPPLY_WATER, depot.water);
        s.supply.water += waterGive;
        depot.water    -= waterGive;

        // 전투식량 보급
        const rationNeed = CONFIG.SUPPLY_RATION_MAX - s.supply.ration;
        const rationGive = Math.min(rationNeed, CONFIG.SUPPLY_RESUPPLY_RATION, depot.ration);
        s.supply.ration += rationGive;
        depot.ration    -= rationGive;

        // 배급소 인근 정신력 회복 (SurvivalStats 연계)
        const survival = window.gameScene?.survival;
        if (survival) survival.recoverMoraleNearDepot(s);
      }

      // 배급소 재고 소진 시 파괴 처리
      if (depot.water <= 0 && depot.ration <= 0) {
        depot.water  = 0;
        depot.ration = 0;
        // 재고만 바닥난 것이지 파괴는 아님 (hp 기반 파괴와 구분)
      }
    }

    // 3. AP 패널티 계산 (다음 AP 회복 시 적용)
    for (const s of allySquads) {
      let penalty = 0;
      if (s.supply.water  < 30) penalty += CONFIG.SUPPLY_AP_PENALTY_WATER;
      if (s.supply.ration < 20) penalty += CONFIG.SUPPLY_AP_PENALTY_RATION;
      s._apPenalty = penalty;
    }
  }

  /* ── 배급소 피해 ─────────────────────────────────────────── */
  /**
   * 박격포 또는 적군 공격으로 배급소 피해
   * @param {number} depotId
   * @param {number} [amount=1]
   * @returns {{ destroyed: boolean, depot: DepotData }}
   */
  damageDepot(depotId, amount = 1) {
    const depot = this.depots.find(d => d.id === depotId);
    if (!depot || !depot.alive) return { destroyed: false, depot };

    depot.hp -= amount;
    if (depot.hp <= 0) {
      depot.hp    = 0;
      depot.alive = false;
      if (depot.mesh && this._scene3d) {
        this._scene3d.remove(depot.mesh);
        depot.mesh.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
          }
        });
        depot.mesh = null;
      }
      return { destroyed: true, depot };
    }
    return { destroyed: false, depot };
  }

  /* ── 타일 위 배급소 조회 ─────────────────────────────────── */
  /**
   * 주어진 위치에 살아있는 배급소가 있으면 반환
   * @param {number} col
   * @param {number} row
   * @returns {DepotData|null}
   */
  getDepotAt(col, row) {
    return this.depots.find(d => d.alive && d.col === col && d.row === row) || null;
  }

  /* ── 가장 가까운 배급소 ──────────────────────────────────── */
  /**
   * 분대와 가장 가까운 아군 배급소 반환
   * @param {{ col, row }} pos
   * @returns {DepotData|null}
   */
  nearestDepot(pos) {
    let best = null, bestDist = Infinity;
    for (const d of this.depots.filter(d => d.alive && d.side === 'ally')) {
      const dist = Math.abs(pos.col - d.col) + Math.abs(pos.row - d.row);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }

  /* ── 배급소 3D 메시 생성 ─────────────────────────────────── */
  /**
   * GameScene._initSystems에서 호출
   * @param {DepotData} depot
   */
  buildDepotMesh(depot) {
    if (!this._scene3d || !this._gridMap) return;
    const gm = this._gridMap;
    const wp = gm.toWorld(depot.col, depot.row);
    const TW = gm.TILE_W;
    const h  = gm.tiles[depot.row][depot.col].height;

    const group = new THREE.Group();

    // 바닥 패드
    const padGeo = new THREE.BoxGeometry(TW * 0.9, TW * 0.08, TW * 0.9);
    const color  = depot.side === 'ally' ? 0x44aaff : 0xff6644;
    const padMat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.85 });
    const pad    = new THREE.Mesh(padGeo, padMat);
    group.add(pad);

    // 테두리
    group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(padGeo),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
    ));

    // 텍스트 스프라이트
    const labelColor = depot.side === 'ally' ? '#44aaff' : '#ff6644';
    const lbl = _makeTextSprite('SUP', labelColor);
    lbl.position.set(0, TW * 0.6, 0);
    lbl.scale.set(TW * 1.2, TW * 0.6, 1);
    lbl.raycast = () => {};
    group.add(lbl);

    group.position.set(wp.x, h + TW * 0.04, wp.z);
    group.userData = { type: 'depot', depotId: depot.id };
    this._scene3d.add(group);
    depot.mesh = group;
    depot._pad = pad;
    depot._padMat = padMat;
    depot._labelSprite = lbl;
  }

  /* ── 배급소 UI 상태 업데이트 ─────────────────────────────── */
  /**
   * 배급소 잔여량에 따라 색상 변경
   * @param {DepotData} depot
   */
  updateDepotVisual(depot) {
    if (!depot.mesh || !depot._padMat) return;
    const waterPct  = depot.water  / depot.maxWater;
    const rationPct = depot.ration / depot.maxRation;
    const avg       = (waterPct + rationPct) / 2;
    let col;
    if (!depot.alive)       col = 0x333333;
    else if (avg > 0.5)     col = 0x44aaff;
    else if (avg > 0.2)     col = 0xffb84d;
    else                    col = 0xff4444;
    depot._padMat.color.setHex(col);
  }

  /* ── 보급 패널 HTML 생성 (HUD용) ────────────────────────── */
  /**
   * 배급소 상태를 HTML 문자열로 반환
   * @returns {string}
   */
  getDepotStatusHTML() {
    if (this.depots.length === 0) return '';
    const lines = this.depots
      .filter(d => d.side === 'ally')
      .map(d => {
        const col   = String.fromCharCode(65 + (d.col % 26));
        const row   = String(d.row + 1).padStart(2, '0');
        const wPct  = Math.round(d.water  / d.maxWater  * 100);
        const rPct  = Math.round(d.ration / d.maxRation * 100);
        const hp    = d.alive ? `HP:${d.hp}/${d.maxHp}` : '파괴됨';
        const state = d.alive ? '' : ' ⚠';
        return `배급소#${d.id}(${col}-${row})${state} 물:${wPct}% 식량:${rPct}% ${hp}`;
      });
    return lines.join(' | ');
  }
}

/**
 * @typedef {object} DepotData
 * @property {number}          id
 * @property {number}          col
 * @property {number}          row
 * @property {'ally'|'enemy'}  side
 * @property {number}          water
 * @property {number}          ration
 * @property {number}          maxWater
 * @property {number}          maxRation
 * @property {number}          hp
 * @property {number}          maxHp
 * @property {boolean}         alive
 * @property {THREE.Group|null} mesh
 */
