/* ============================================================
   SupplyVehicle.js — 보급 차량 시스템
   ────────────────────────────────────────────────────────────
   흐름:
     1턴: 플레이어 보급 요청 (request)
     2턴: 차량이 맵 외곽에서 배급소로 이동 시작 (approaching)
     3턴: 배급소 도착 → 보급 완료 → 퇴장 시작 (at_depot → departing)
     4턴: 맵 외곽으로 퇴장 후 제거 (done)

   차량 종류:
     · 'food'  — 전투식량 창고용 (노란색)
     · 'water' — 급수소용 (파란색)

   차량은 맵 위에 표시되며 적군이 사거리 내에 있으면 피격 가능.
   ============================================================ */

class SupplyVehicleSystem {

  constructor() {
    /** @type {Array<VehicleData>} */
    this.vehicles = [];
    this._nextId  = 1;
    this._scene3d = null;
    this._gridMap = null;
  }

  /** 씬/맵 참조 주입 */
  init(scene3d, gridMap) {
    this._scene3d = scene3d;
    this._gridMap = gridMap;
  }

  /* ── 보급 요청 ───────────────────────────────────────────── */
  /**
   * @param {DepotData} depot        - 대상 배급소
   * @param {string}    type         - 'food' | 'water'
   * @returns {VehicleData}
   */
  request(depot, type) {
    const gm = this._gridMap;
    if (!gm) return null;

    // 아군 후방(맵 하단)에서 출발
    const startCol = Math.max(0, Math.min(CONFIG.GRID_COLS - 1, depot.col));
    const startRow = CONFIG.GRID_ROWS - 1;   // 맵 최하단 (아군 후방)

    const vehicle = {
      id:       this._nextId++,
      type,
      depotId:  depot.id,
      depotPos: { col: depot.col, row: depot.row },
      state:    'approaching',   // approaching → at_depot → departing → done
      pos:      { col: startCol, row: startRow },
      startPos: { col: startCol, row: startRow },
      hp:       CONFIG.SUPPLY_VEHICLE_HP,
      maxHp:    CONFIG.SUPPLY_VEHICLE_HP,
      mesh:     null,
    };

    this._buildMesh(vehicle);
    this.vehicles.push(vehicle);
    return vehicle;
  }

  /* ── 턴 진행 ─────────────────────────────────────────────── */
  /**
   * @param {SupplySystem} supplySystem
   * @param {Function}     onLog   - (msg) → chatUI 로그 출력 콜백
   */
  tick(supplySystem, onLog) {
    const speed = CONFIG.SUPPLY_VEHICLE_SPEED;

    for (const v of this.vehicles) {
      if (v.state === 'done') continue;

      if (v.state === 'approaching') {
        v.pos = this._stepToward(v.pos, v.depotPos, speed);
        if (v.pos.col === v.depotPos.col && v.pos.row === v.depotPos.row) {
          v.state = 'at_depot';
          // 배급소 보급
          const depot = supplySystem.depots.find(d => d.id === v.depotId);
          if (depot && depot.alive) {
            if (v.type === 'food') {
              depot.ration = Math.min(depot.maxRation, depot.ration + CONFIG.SUPPLY_VEHICLE_FOOD_AMT);
              onLog?.(`보급 차량(식량) 배급소#${depot.id} 도착 — 전투식량 +${CONFIG.SUPPLY_VEHICLE_FOOD_AMT}`);
            } else {
              depot.water = Math.min(depot.maxWater, depot.water + CONFIG.SUPPLY_VEHICLE_WATER_AMT);
              onLog?.(`보급 차량(급수) 배급소#${depot.id} 도착 — 물 +${CONFIG.SUPPLY_VEHICLE_WATER_AMT}`);
            }
          } else {
            onLog?.(`보급 차량 — 배급소#${v.depotId} 파괴됨, 보급 실패`);
          }
        }

      } else if (v.state === 'at_depot') {
        v.state = 'departing';
        onLog?.(`보급 차량 퇴장 중...`);

      } else if (v.state === 'departing') {
        v.pos = this._stepToward(v.pos, v.startPos, speed + 1); // 퇴장 빠르게
        if (v.pos.col === v.startPos.col && v.pos.row === v.startPos.row) {
          v.state = 'done';
          this._removeMesh(v);
        }
      }

      if (v.state !== 'done') this._updateMeshPos(v);
    }

    // 완료된 차량 제거
    this.vehicles = this.vehicles.filter(v => v.state !== 'done');
  }

  /* ── 차량 피해 ───────────────────────────────────────────── */
  /**
   * @param {number} vehicleId
   * @param {number} [amount=1]
   * @returns {{ destroyed: boolean, vehicle: VehicleData }}
   */
  damage(vehicleId, amount = 1) {
    const v = this.vehicles.find(v => v.id === vehicleId);
    if (!v) return null;
    v.hp -= amount;
    if (v.hp <= 0) {
      v.hp    = 0;
      v.state = 'done';
      this._removeMesh(v);
      this.vehicles = this.vehicles.filter(x => x.id !== vehicleId);
      return { destroyed: true, vehicle: v };
    }
    return { destroyed: false, vehicle: v };
  }

  /* ── 위치에 차량 있는지 조회 ─────────────────────────────── */
  getVehicleAt(col, row) {
    return this.vehicles.find(v => v.state !== 'done' && v.pos.col === col && v.pos.row === row) || null;
  }

  /* ── 이동 (맨해튼) ───────────────────────────────────────── */
  _stepToward(pos, target, steps) {
    let { col, row } = pos;
    for (let i = 0; i < steps; i++) {
      const dc = target.col - col;
      const dr = target.row - row;
      if (dc === 0 && dr === 0) break;
      if (Math.abs(dc) >= Math.abs(dr)) col += Math.sign(dc);
      else row += Math.sign(dr);
      // 맵 경계 유지
      col = Math.max(0, Math.min(CONFIG.GRID_COLS - 1, col));
      row = Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, row));
    }
    return { col, row };
  }

  /* ── 3D 메시 생성 ────────────────────────────────────────── */
  _buildMesh(vehicle) {
    if (!this._scene3d || !this._gridMap) return;
    const gm  = this._gridMap;
    const TW  = gm.TILE_W;
    const wp  = gm.toWorld(vehicle.pos.col, vehicle.pos.row);
    const h   = gm.tiles[vehicle.pos.row][vehicle.pos.col].height;

    const color     = vehicle.type === 'food' ? 0xffb84d : 0x44aaff;
    const colorCss  = vehicle.type === 'food' ? '#ffb84d' : '#44aaff';
    const labelText = vehicle.type === 'food' ? 'VHC-F' : 'VHC-W';

    const geo  = new THREE.BoxGeometry(TW * 0.65, TW * 0.28, TW * 0.45);
    const mat  = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.92 });
    const box  = new THREE.Mesh(geo, mat);

    // 외곽선
    box.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
    ));

    // 레이블 스프라이트
    const lbl = _makeTextSprite(labelText, colorCss);
    lbl.position.set(0, TW * 0.55, 0);
    lbl.scale.set(TW * 1.1, TW * 0.48, 1);
    lbl.raycast = () => {};

    const group = new THREE.Group();
    group.add(box);
    group.add(lbl);
    group.position.set(wp.x, h + TW * 0.14, wp.z);
    group.userData = { type: 'vehicle', vehicleId: vehicle.id };
    group.renderOrder = 1;

    this._scene3d.add(group);
    vehicle.mesh = group;
    vehicle._mat = mat;
  }

  /* ── 메시 위치 갱신 ──────────────────────────────────────── */
  _updateMeshPos(vehicle) {
    if (!vehicle.mesh || !this._gridMap) return;
    const gm  = this._gridMap;
    const col = Math.max(0, Math.min(CONFIG.GRID_COLS - 1, vehicle.pos.col));
    const row = Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, vehicle.pos.row));
    const wp  = gm.toWorld(col, row);
    const h   = gm.tiles[row][col].height;
    vehicle.mesh.position.set(wp.x, h + gm.TILE_W * 0.14, wp.z);
    vehicle.mesh.visible = true;
  }

  /* ── 메시 제거 ───────────────────────────────────────────── */
  _removeMesh(vehicle) {
    if (!vehicle.mesh || !this._scene3d) return;
    this._scene3d.remove(vehicle.mesh);
    vehicle.mesh.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    vehicle.mesh = null;
  }
}
