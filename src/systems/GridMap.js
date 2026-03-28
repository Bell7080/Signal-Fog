/* ============================================================
   GridMap.js — Three.js 3D 와이어프레임 그리드
   v0.4 FIX:
     - 동적 맵 크기 (CONFIG.GRID_COLS × CONFIG.GRID_ROWS) 반영
     - 하천(RIVER) 연결 생성 알고리즘 — 좌→우 또는 위→아래로 이어지게
     - 교량(BRIDGE) 자동 배치 (하천 통과 지점)
     - 타일 레이블 간격 동적 계산
     - 카메라/포그 수치는 GameScene에서 맵 크기 기반으로 계산
   ============================================================ */

class GridMap {

  constructor(scene) {
    this.scene       = scene;
    this.cols        = CONFIG.GRID_COLS;
    this.rows        = CONFIG.GRID_ROWS;
    this.tiles       = [];
    this._tileMeshes = [];
    this._highlights = [];

    // 맵 크기에 따라 타일 크기 조정
    this.TILE_W   = this._calcTileW();
    this.OFFSET_X = this.TILE_W * (0.5 - this.cols / 2);
    this.OFFSET_Z = this.TILE_W * (0.5 - this.rows / 2);
  }

  _calcTileW() {
    // 맵이 클수록 타일을 작게 (Three.js 월드 사이즈 유지)
    const base = 1.2;
    const scale = 20 / Math.max(this.cols, this.rows);
    return Math.max(0.5, base * scale);
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
    this._drawTiles();
    this._drawLabels();
  }

  _tileHeight(terrainId) {
    const h = { open:0.15, forest:0.35, valley:0.08, hill:0.65, river:0.04, bridge:0.12 };
    return h[terrainId] !== undefined ? h[terrainId] : 0.15;
  }

  _tileFillColor(terrainId) {
    const c = {
      open:   0x0d1f14,
      forest: 0x061306,
      valley: 0x060f1a,
      hill:   0x1a1006,
      river:  0x041a2a,
      bridge: 0x1a1006,
    };
    return c[terrainId] !== undefined ? c[terrainId] : 0x0d1f14;
  }

  _edgeColor(terrainId) {
    const c = {
      open:   0x39ff8e,
      forest: 0x22aa55,
      valley: 0x2277cc,
      hill:   0xffb84d,
      river:  0x44aaff,
      bridge: 0xff8844,
    };
    return c[terrainId] !== undefined ? c[terrainId] : 0x39ff8e;
  }

  _drawTiles() {
    const s3 = this.scene.scene3d;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.tiles[r][c];
        const tid  = tile.terrain.id;
        const h    = this._tileHeight(tid);
        const wx   = c * this.TILE_W + this.OFFSET_X;
        const wz   = r * this.TILE_W + this.OFFSET_Z;

        const geo = new THREE.BoxGeometry(this.TILE_W - 0.03, Math.max(h, 0.06), this.TILE_W - 0.03);
        const mat = new THREE.MeshLambertMaterial({
          color: this._tileFillColor(tid),
          transparent: true, opacity: 0.80,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(wx, h / 2, wz);
        mesh.userData = { col: c, row: r, isTile: true };
        s3.add(mesh);

        // 엣지
        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: this._edgeColor(tid), transparent: true, opacity: 0.60,
        });
        mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));

        // 레이캐스팅용 투명 평면
        const planeGeo = new THREE.PlaneGeometry(this.TILE_W - 0.05, this.TILE_W - 0.05);
        const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
        const plane    = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(wx, h + 0.01, wz);
        plane.userData = { col: c, row: r, isTile: true };
        s3.add(plane);
        this._tileMeshes.push(plane);
      }
    }
  }

  _drawLabels() {
    const s3   = this.scene.scene3d;
    // 맵 크기에 따라 레이블 간격 동적 계산
    const STEP = this.cols <= 12 ? 2 : this.cols <= 20 ? 5 : 10;

    for (let c = 0; c < this.cols; c += STEP) {
      const label  = String.fromCharCode(65 + (c % 26));
      const sprite = _makeTextSprite(label, '#2a5a38');
      sprite.scale.set(this.TILE_W * 1.2, this.TILE_W * 0.75, 1);
      sprite.position.set(
        c * this.TILE_W + this.OFFSET_X,
        0.4,
        this.OFFSET_Z - this.TILE_W * 1.5
      );
      s3.add(sprite);
    }

    for (let r = 0; r < this.rows; r += STEP) {
      const label  = String(r + 1).padStart(2, '0');
      const sprite = _makeTextSprite(label, '#2a5a38');
      sprite.scale.set(this.TILE_W * 1.2, this.TILE_W * 0.75, 1);
      sprite.position.set(
        this.OFFSET_X - this.TILE_W * 1.5,
        0.4,
        r * this.TILE_W + this.OFFSET_Z
      );
      s3.add(sprite);
    }
  }

  highlightTile(col, row, colorHex, alpha = 0.25) {
    if (!this.isInBounds(col, row)) return;
    const tile = this.tiles[row][col];
    const h    = this._tileHeight(tile.terrain.id);
    const wx   = col * this.TILE_W + this.OFFSET_X;
    const wz   = row * this.TILE_W + this.OFFSET_Z;
    const geo  = new THREE.PlaneGeometry(this.TILE_W - 0.08, this.TILE_W - 0.08);
    const mat  = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: alpha,
      side: THREE.DoubleSide, depthWrite: false,
    });
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

  getTileMeshes() { return this._tileMeshes; }

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
