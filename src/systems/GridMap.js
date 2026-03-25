/* ============================================================
   GridMap.js — Three.js 3D 와이어프레임 그리드 생성
   BoxGeometry 타일 + EdgesGeometry 홀로그램 와이어프레임
   ============================================================ */

class GridMap {

  constructor(scene) {
    this.scene      = scene;         // GameScene (scene.scene3d = THREE.Scene)
    this.cols       = CONFIG.GRID_COLS;
    this.rows       = CONFIG.GRID_ROWS;
    this.tiles      = [];
    this._tileMeshes = [];           // 레이캐스팅용 투명 평면
    this._highlights = [];           // 활성 하이라이트 메시

    // 타일 1칸 = 1.2 Three.js 단위 (약 50m/타일), 그리드 원점 중앙 정렬
    this.TILE_W   = 1.2;
    this.OFFSET_X = this.TILE_W * (0.5 - this.cols / 2);
    this.OFFSET_Z = this.TILE_W * (0.5 - this.rows / 2);
  }

  /* ── 전체 타일 생성 ── */
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

  /* ── 지형별 높이 ── */
  _tileHeight(terrainId) {
    const h = { open: 0.15, forest: 0.35, valley: 0.08, hill: 0.65 };
    return h[terrainId] !== undefined ? h[terrainId] : 0.15;
  }

  /* ── 지형별 내부 채우기 색 ── */
  _tileFillColor(terrainId) {
    const c = { open: 0x0d1f14, forest: 0x061306, valley: 0x060f1a, hill: 0x1a1006 };
    return c[terrainId] !== undefined ? c[terrainId] : 0x0d1f14;
  }

  /* ── 지형별 와이어프레임 색 ── */
  _edgeColor(terrainId) {
    const c = { open: 0x39ff8e, forest: 0x22aa55, valley: 0x2277cc, hill: 0xffb84d };
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

        // 박스 메시 (반투명 내부)
        const geo = new THREE.BoxGeometry(
          this.TILE_W - 0.03, h, this.TILE_W - 0.03
        );
        const mat = new THREE.MeshLambertMaterial({
          color: this._tileFillColor(tid),
          transparent: true,
          opacity: 0.80,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(wx, h / 2, wz);
        mesh.userData = { col: c, row: r, isTile: true };
        s3.add(mesh);

        // 엣지 와이어프레임 (홀로그램 효과)
        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: this._edgeColor(tid),
          transparent: true,
          opacity: 0.75,
        });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        mesh.add(edges);

        // 상면 바닥 평면 (레이캐스팅 전용, invisible)
        const planeGeo = new THREE.PlaneGeometry(
          this.TILE_W - 0.05, this.TILE_W - 0.05
        );
        const planeMat = new THREE.MeshBasicMaterial({
          visible: false,
          side: THREE.DoubleSide,
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(wx, h + 0.01, wz);
        plane.userData = { col: c, row: r, isTile: true };
        s3.add(plane);
        this._tileMeshes.push(plane);
      }
    }
  }

  /* ── 좌표 레이블 스프라이트 ── */
  _drawLabels() {
    const s3 = this.scene.scene3d;

    // 열 레이블 A~H (앞쪽)
    for (let c = 0; c < this.cols; c++) {
      const sprite = _makeTextSprite(String.fromCharCode(65 + c), '#2a5a38');
      sprite.scale.set(0.45, 0.45, 1);
      sprite.position.set(
        c * this.TILE_W + this.OFFSET_X,
        0.25,
        this.OFFSET_Z - this.TILE_W * 0.7
      );
      s3.add(sprite);
    }

    // 행 레이블 01~08 (왼쪽)
    for (let r = 0; r < this.rows; r++) {
      const sprite = _makeTextSprite(String(r + 1).padStart(2, '0'), '#2a5a38');
      sprite.scale.set(0.45, 0.45, 1);
      sprite.position.set(
        this.OFFSET_X - this.TILE_W * 0.7,
        0.25,
        r * this.TILE_W + this.OFFSET_Z
      );
      s3.add(sprite);
    }
  }

  /* ── 타일 하이라이트 ── */
  highlightTile(col, row, colorHex, alpha = 0.25) {
    if (!this.isInBounds(col, row)) return;
    const tile = this.tiles[row][col];
    const h    = this._tileHeight(tile.terrain.id);
    const wx   = col * this.TILE_W + this.OFFSET_X;
    const wz   = row * this.TILE_W + this.OFFSET_Z;

    const geo = new THREE.PlaneGeometry(this.TILE_W - 0.08, this.TILE_W - 0.08);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: alpha,
      side: THREE.DoubleSide,
      depthWrite: false,
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
      m.geometry.dispose();
      m.material.dispose();
    }
    this._highlights = [];
  }

  /* ── 레이캐스팅 대상 메시 배열 반환 ── */
  getTileMeshes() { return this._tileMeshes; }

  /* ── 타일 (col, row) → 3D 월드 좌표 (분대 배치 기준) ── */
  toWorld(col, row) {
    const tile = this.tiles[row][col];
    const h    = this._tileHeight(tile.terrain.id);
    return {
      x: col * this.TILE_W + this.OFFSET_X,
      y: h + 0.22,          // 타일 상면 + 분대 박스 절반 높이
      z: row * this.TILE_W + this.OFFSET_Z,
    };
  }

  isInBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }
}

/* ── 공용 텍스트 스프라이트 팩토리 (GridMap & GameScene 공유) ── */
function _makeTextSprite(text, color = '#39ff8e') {
  const canvas = document.createElement('canvas');
  canvas.width  = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'bold 38px "Share Tech Mono", monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false,
  });
  return new THREE.Sprite(mat);
}
