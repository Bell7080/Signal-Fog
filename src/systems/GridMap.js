/* ============================================================
   GridMap.js — Three.js 3D 그리드
   v0.5: 250×250 대규모 맵 대응
     - InstancedMesh 사용: 타일 타입별 단일 draw call → 브라우저 멈춤 방지
     - 레이캐스팅은 논리 좌표 직접 계산 (투명 PlaneGeometry 62,500개 제거)
     - 타일 크기: 월드 사이즈 고정(24유닛), 맵 크기에 따라 자동 스케일
   ============================================================ */

class GridMap {

  constructor(scene) {
    this.scene       = scene;
    this.cols        = CONFIG.GRID_COLS;
    this.rows        = CONFIG.GRID_ROWS;
    this.tiles       = [];
    this._tileMeshes = [];   // 레이캐스팅용 — 소형맵만 실제 사용
    this._highlights = [];
    this._instancedGroups = []; // InstancedMesh 목록 (dispose용)

    // 월드 사이즈를 맵 크기에 관계없이 ~24 유닛으로 고정
    const WORLD = 24;
    this.TILE_W   = WORLD / Math.max(this.cols, this.rows);
    this.OFFSET_X = this.TILE_W * (0.5 - this.cols / 2);
    this.OFFSET_Z = this.TILE_W * (0.5 - this.rows / 2);

    // 대형 맵(>40) 여부 — 레이캐스팅 전략 전환
    this._largeMap = Math.max(this.cols, this.rows) > 40;
  }

  build(layout) {
    for (let r = 0; r < this.rows; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < this.cols; c++) {
        const key = layout ? layout[r][c] : 'OPEN';
        this.tiles[r][c] = {
          col: c, row: r,
          terrain: CONFIG.TERRAIN[key] || CONFIG.TERRAIN.OPEN,
          capturedBy: null, captureTurns: 0,
        };
      }
    }
    if (this._largeMap) {
      this._drawTilesInstanced();
    } else {
      this._drawTilesNormal();
    }
    this._drawLabels();
  }

  _tileHeight(terrainId) {
    const h = { open:0.15, forest:0.35, valley:0.08, hill:0.65, river:0.04, bridge:0.12 };
    return h[terrainId] !== undefined ? h[terrainId] : 0.15;
  }

  _tileFillColor(terrainId) {
    const c = {
      open:   0x0d1f14, forest: 0x061306, valley: 0x060f1a,
      hill:   0x1a1006, river:  0x041a2a, bridge: 0x1a1006,
    };
    return c[terrainId] !== undefined ? c[terrainId] : 0x0d1f14;
  }

  _edgeColor(terrainId) {
    const c = {
      open:   0x39ff8e, forest: 0x22aa55, valley: 0x2277cc,
      hill:   0xffb84d, river:  0x44aaff, bridge: 0xff8844,
    };
    return c[terrainId] !== undefined ? c[terrainId] : 0x39ff8e;
  }

  /* ── 소형 맵(<= 40) — 개별 BoxGeometry + 레이캐스팅 PlaneGeometry ── */
  _drawTilesNormal() {
    const s3 = this.scene.scene3d;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.tiles[r][c];
        const tid  = tile.terrain.id;
        const h    = this._tileHeight(tid);
        const wx   = c * this.TILE_W + this.OFFSET_X;
        const wz   = r * this.TILE_W + this.OFFSET_Z;

        const geo = new THREE.BoxGeometry(this.TILE_W - 0.03, Math.max(h, 0.06), this.TILE_W - 0.03);
        const mat = new THREE.MeshLambertMaterial({ color: this._tileFillColor(tid), transparent: true, opacity: 0.80 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(wx, h / 2, wz);
        mesh.userData = { col: c, row: r, isTile: true };
        s3.add(mesh);

        const edgeGeo = new THREE.EdgesGeometry(geo);
        mesh.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: this._edgeColor(tid), transparent: true, opacity: 0.60 })));

        // 레이캐스팅 평면
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(this.TILE_W - 0.05, this.TILE_W - 0.05),
          new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(wx, h + 0.01, wz);
        plane.userData = { col: c, row: r, isTile: true };
        s3.add(plane);
        this._tileMeshes.push(plane);
      }
    }
  }

  /* ── 대형 맵(> 40) — InstancedMesh로 타입별 단일 draw call ── */
  _drawTilesInstanced() {
    const s3      = this.scene.scene3d;
    const terrainIds = ['open', 'forest', 'valley', 'hill', 'river', 'bridge'];
    const dummy   = new THREE.Object3D();

    // 타입별 타일 모음
    const groups = {};
    terrainIds.forEach(id => { groups[id] = []; });
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const tid = this.tiles[r][c].terrain.id;
        if (groups[tid]) groups[tid].push({ c, r });
      }

    // 각 타입별 InstancedMesh 생성
    for (const tid of terrainIds) {
      const list = groups[tid];
      if (list.length === 0) continue;
      const h   = this._tileHeight(tid);
      const bh  = Math.max(h, 0.06);
      const geo = new THREE.BoxGeometry(this.TILE_W - 0.008, bh, this.TILE_W - 0.008);
      const mat = new THREE.MeshLambertMaterial({ color: this._tileFillColor(tid), transparent: true, opacity: 0.80 });
      const im  = new THREE.InstancedMesh(geo, mat, list.length);
      im.userData.isTileInstanced = true;

      list.forEach((pos, i) => {
        const wx = pos.c * this.TILE_W + this.OFFSET_X;
        const wz = pos.r * this.TILE_W + this.OFFSET_Z;
        dummy.position.set(wx, h / 2, wz);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      s3.add(im);
      this._instancedGroups.push(im);
    }

    // 대형 맵: 레이캐스팅은 수학적 계산으로 대체 (_raycastLogical)
    // _tileMeshes는 빈 배열 — getTileMeshes()에서 처리
  }

  /* ── 레이캐스팅: 대형 맵은 화면→월드 좌표 역산으로 타일 찾기 ── */
  getTileMeshes() {
    // 소형 맵: 기존 PlaneGeometry 배열
    if (!this._largeMap) return this._tileMeshes;
    // 대형 맵: InstancedMesh 반환 (Three.js Raycaster가 지원함)
    return this._instancedGroups;
  }

  /* 월드 좌표 → 그리드 좌표 직접 계산 (대형 맵 fallback) */
  worldToGrid(wx, wz) {
    const col = Math.round((wx - this.OFFSET_X) / this.TILE_W);
    const row = Math.round((wz - this.OFFSET_Z) / this.TILE_W);
    if (!this.isInBounds(col, row)) return null;
    return { col, row };
  }

  _drawLabels() {
    const s3   = this.scene.scene3d;
    // 맵 크기에 따라 레이블 간격 동적 계산
    const n    = Math.max(this.cols, this.rows);
    const STEP = n <= 12 ? 2 : n <= 30 ? 5 : n <= 80 ? 10 : 25;

    for (let c = 0; c < this.cols; c += STEP) {
      const label  = String.fromCharCode(65 + (c % 26));
      const sprite = _makeTextSprite(label, '#2a5a38');
      sprite.scale.set(this.TILE_W * 1.2, this.TILE_W * 0.75, 1);
      sprite.position.set(c * this.TILE_W + this.OFFSET_X, 0.4, this.OFFSET_Z - this.TILE_W * 1.5);
      s3.add(sprite);
    }

    for (let r = 0; r < this.rows; r += STEP) {
      const label  = String(r + 1).padStart(2, '0');
      const sprite = _makeTextSprite(label, '#2a5a38');
      sprite.scale.set(this.TILE_W * 1.2, this.TILE_W * 0.75, 1);
      sprite.position.set(this.OFFSET_X - this.TILE_W * 1.5, 0.4, r * this.TILE_W + this.OFFSET_Z);
      s3.add(sprite);
    }
  }

  highlightTile(col, row, colorHex, alpha = 0.25) {
    if (!this.isInBounds(col, row)) return;
    const tile = this.tiles[row][col];
    const h    = this._tileHeight(tile.terrain.id);
    const wx   = col * this.TILE_W + this.OFFSET_X;
    const wz   = row * this.TILE_W + this.OFFSET_Z;
    const geo  = new THREE.PlaneGeometry(this.TILE_W - 0.008, this.TILE_W - 0.008);
    const mat  = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: alpha, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(wx, h + 0.02, wz);
    this.scene.scene3d.add(mesh);
    this._highlights.push(mesh);
  }

  clearHighlights() {
    for (const m of this._highlights) {
      this.scene.scene3d.remove(m);
      m.geometry.dispose(); m.material.dispose();
    }
    this._highlights = [];
  }

  toWorld(col, row) {
    const tile = this.tiles[row][col];
    const h    = this._tileHeight(tile.terrain.id);
    return {
      x: col * this.TILE_W + this.OFFSET_X,
      y: h + 0.22,
      z: row * this.TILE_W + this.OFFSET_Z,
    };
  }

  isInBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }
}

/* ── 전역 텍스트 스프라이트 팩토리 ── */
function _makeTextSprite(text, color = '#39ff8e') {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'bold 38px "Share Tech Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
}

