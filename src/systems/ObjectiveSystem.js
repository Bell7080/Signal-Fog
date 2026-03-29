/* ============================================================
   ObjectiveSystem.js — 3×3 점령지 시스템
   ────────────────────────────────────────────────────────────
   핵심 설계:
   · 3×3 타일 크기의 점령지가 맵 중앙 40% 구역에 랜덤 배치
   · 초기에는 안개에 가려 보이지 않음 (발견 전까지 시각 숨김)
   · 아군 분대가 인접(DISCOVERY_RANGE)하면 발견, 위치 공개
   · 점령 게이지: 매 턴 점령지 타일에 있는 아군 수만큼 증가
       - 적군도 있으면 상쇄 (교전 중 게이지 증가 억제)
       - 적군만 있으면 게이지 감소 (탈환)
   · 승리 조건: gauge ≥ maxGauge
       maxGauge = 아군분대수 × CAPTURE_WIN_TURNS_FACTOR
       (예: 5분대 × 4 = 20 → 5분대 전부 4턴 또는 1분대 20턴)
   ============================================================ */

class ObjectiveSystem {

  constructor() {
    this.tiles      = [];    // [{col, row}, ...] 9개
    this.anchor     = null;  // {col, row} 좌상단
    this.center     = null;  // {col, row} 중심 타일
    this.gauge      = 0;
    this.maxGauge   = 0;
    this.discovered = false;
    this._meshGroup = null;
  }

  /* ── 초기화 ─────────────────────────────────────────────── */
  /**
   * @param {GridMap}      gridMap
   * @param {THREE.Scene}  scene3d
   * @param {number}       allyCount - 아군 분대 수
   */
  init(gridMap, scene3d, allyCount) {
    const C = CONFIG.GRID_COLS;
    const R = CONFIG.GRID_ROWS;
    const S = CONFIG.OBJECTIVE_SIZE; // 3

    // 맵 중앙 30~70% 구역에 배치 (양쪽 여백 확보)
    const minC = Math.max(1, Math.floor(C * 0.30));
    const maxC = Math.min(C - S - 1, Math.floor(C * 0.70) - S);
    const minR = Math.max(1, Math.floor(R * 0.30));
    const maxR = Math.min(R - S - 1, Math.floor(R * 0.70) - S);

    const anchorCol = minC + Math.floor(Math.random() * Math.max(1, maxC - minC + 1));
    const anchorRow = minR + Math.floor(Math.random() * Math.max(1, maxR - minR + 1));

    this.anchor = { col: anchorCol, row: anchorRow };
    this.tiles  = [];
    for (let dr = 0; dr < S; dr++)
      for (let dc = 0; dc < S; dc++)
        this.tiles.push({ col: anchorCol + dc, row: anchorRow + dr });

    this.center = { col: anchorCol + 1, row: anchorRow + 1 };

    // 승리 게이지: 분대수 × 팩터
    this.maxGauge   = Math.max(1, allyCount * CONFIG.CAPTURE_WIN_TURNS_FACTOR);
    this.gauge      = 0;
    this.discovered = false;

    this._buildMesh(gridMap, scene3d);
  }

  /* ── 타일 판단 ───────────────────────────────────────────── */
  isOnObjective(col, row) {
    return this.tiles.some(t => t.col === col && t.row === row);
  }

  /* ── 발견 체크 ───────────────────────────────────────────── */
  /**
   * 아군 분대 중 점령지 인접 분대 있으면 발견 처리
   * @param {Array} allySquads
   * @returns {boolean} 이번 턴에 새로 발견됐는지
   */
  checkDiscovery(allySquads) {
    if (this.discovered) return false;
    const range = CONFIG.OBJECTIVE_DISCOVERY_RANGE;
    const found = allySquads.some(s => {
      if (!s.alive) return false;
      return this.tiles.some(t =>
        Math.abs(s.pos.col - t.col) + Math.abs(s.pos.row - t.row) <= range
      );
    });
    if (found) {
      this.discovered = true;
      if (this._meshGroup) this._meshGroup.visible = true;
    }
    return found;
  }

  /* ── 게이지 갱신 (매 턴 _checkResult 전 호출) ───────────── */
  /**
   * @param {Array} allySquads
   * @param {Array} enemySquads
   * @returns {{ allyCount, enemyCount, delta }}
   */
  tick(allySquads, enemySquads) {
    const allyOn  = allySquads.filter(s  => s.alive  && this.isOnObjective(s.pos.col, s.pos.row));
    const enemyOn = enemySquads.filter(s => s.alive  && this.isOnObjective(s.pos.col, s.pos.row));

    let delta = 0;
    if (allyOn.length > 0) {
      // 아군 초과분만큼 게이지 증가 (교전 상태이면 상쇄)
      delta = Math.max(0, allyOn.length - enemyOn.length);
      this.gauge = Math.min(this.maxGauge, this.gauge + delta);
    } else if (enemyOn.length > 0) {
      // 적군만 있으면 탈환 (감소)
      delta = -enemyOn.length;
      this.gauge = Math.max(0, this.gauge + delta);
    }

    this._updateGaugeVisual();
    return { allyCount: allyOn.length, enemyCount: enemyOn.length, delta };
  }

  /* ── 승리 판정 ───────────────────────────────────────────── */
  isWon()      { return this.gauge >= this.maxGauge; }
  getGaugePct(){ return this.maxGauge > 0 ? Math.round(this.gauge / this.maxGauge * 100) : 0; }

  /* ── 3D 메시 생성 ────────────────────────────────────────── */
  _buildMesh(gridMap, scene3d) {
    const gm = gridMap;
    const TW = gm.TILE_W;
    const group = new THREE.Group();

    for (const t of this.tiles) {
      const wp = gm.toWorld(t.col, t.row);
      const h  = gm.tiles[t.row][t.col].height;
      const S  = TW * 0.47;

      // 테두리 선
      const pts = [
        new THREE.Vector3(wp.x - S, h + 0.035, wp.z - S),
        new THREE.Vector3(wp.x + S, h + 0.035, wp.z - S),
        new THREE.Vector3(wp.x + S, h + 0.035, wp.z + S),
        new THREE.Vector3(wp.x - S, h + 0.035, wp.z + S),
        new THREE.Vector3(wp.x - S, h + 0.035, wp.z - S),
      ];
      group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xffb84d })
      ));

      // 반투명 채움
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(TW * 0.90, TW * 0.90),
        new THREE.MeshBasicMaterial({
          color: 0xffb84d, transparent: true, opacity: 0.07,
          depthWrite: false, side: THREE.DoubleSide
        })
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(wp.x, h + 0.025, wp.z);
      fill.renderOrder = 2;
      group.add(fill);
    }

    // 중심 타일 마커
    const ct  = this.tiles[4]; // 3×3 중심 = index 4
    const cwp = gm.toWorld(ct.col, ct.row);
    const ch  = gm.tiles[ct.row][ct.col].height;

    const star = _makeTextSprite('★', '#ffb84d');
    star.position.set(cwp.x, ch + TW * 1.1, cwp.z);
    star.scale.set(TW * 1.6, TW * 1.6, 1);
    group.add(star);

    const lbl = _makeTextSprite('OBJ', '#ffb84d');
    lbl.position.set(cwp.x, ch + TW * 0.5, cwp.z);
    lbl.scale.set(TW, TW * 0.55, 1);
    group.add(lbl);

    // 게이지 레이블 (초기: 0%)
    this._gaugeSprite = _makeTextSprite('0%', '#ffcc44');
    this._gaugeSprite.position.set(cwp.x, ch + TW * 1.8, cwp.z);
    this._gaugeSprite.scale.set(TW * 1.2, TW * 0.55, 1);
    group.add(this._gaugeSprite);

    group.visible = false; // 발견 전까지 숨김
    scene3d.add(group);
    this._meshGroup   = group;
    this._scene3d     = scene3d;
    this._gaugeCenter = { x: cwp.x, y: ch + TW * 1.8, z: cwp.z };
    this._TW          = TW;
  }

  /* ── 게이지 스프라이트 갱신 ──────────────────────────────── */
  _updateGaugeVisual() {
    if (!this._meshGroup || !this._meshGroup.visible) return;
    if (!this._gaugeSprite) return;

    const pct = this.getGaugePct();
    const color = pct >= 75 ? '#39ff8e' : pct >= 40 ? '#ffb84d' : '#ff4444';

    // 스프라이트 교체 (CanvasTexture 재생성)
    const newSprite = _makeTextSprite(`${pct}%`, color);
    newSprite.position.copy(this._gaugeSprite.position);
    newSprite.scale.copy(this._gaugeSprite.scale);

    const parent = this._gaugeSprite.parent;
    if (parent) {
      parent.remove(this._gaugeSprite);
      this._gaugeSprite.material?.map?.dispose();
      this._gaugeSprite.material?.dispose();
      parent.add(newSprite);
    }
    this._gaugeSprite = newSprite;
  }
}
