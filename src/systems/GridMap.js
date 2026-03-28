/* ============================================================
   GridMap.js v0.7
   ────────────────────────────────────────────────────────────
   핵심 변경:
   1. HeightMap — Smoothstep 격자 노이즈 + bilinear 보간
      · 전체 맵에 완만한 파도형 높이장 생성
      · 지형 타입(hill/valley 등)이 노이즈 위에 가중치로 더해짐
      · 3×3 이웃 평균 스무딩 1회 → 급격한 단차 제거
      · 스폰 구역(상하 2줄) 완전 평탄화
   2. tiles[r][c].height 에 타일 top 면 y 저장
   3. toWorld() → tile.height 반환 (추가 오프셋 없음)
   4. 소형 맵: BoxGeometry 높이 타일별 개별 적용
   5. 대형 맵: InstancedMesh + dummy.scale.y로 개별 높이 적용
   ============================================================ */

/* ── Smoothstep 격자 노이즈 ─────────────────────────────────
   GX × GY 격자를 bilinear smoothstep 보간 → 0~1 높이장 반환
────────────────────────────────────────────────────────── */
function _buildHeightField(cols, rows) {
  const GX = Math.max(4, Math.floor(cols / 6));
  const GY = Math.max(4, Math.floor(rows / 6));

  // 단순 LCG 난수
  let s = (Math.random() * 0xffffff) | 0;
  function rand() { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; }

  const grid = [];
  for (let gy = 0; gy <= GY; gy++) {
    grid[gy] = [];
    for (let gx = 0; gx <= GX; gx++) grid[gy][gx] = rand();
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  const field = [];
  for (let r = 0; r < rows; r++) {
    field[r] = [];
    for (let c = 0; c < cols; c++) {
      const fx  = (c / Math.max(cols - 1, 1)) * GX;
      const fy  = (r / Math.max(rows - 1, 1)) * GY;
      const gx0 = Math.floor(fx), gx1 = Math.min(gx0 + 1, GX);
      const gy0 = Math.floor(fy), gy1 = Math.min(gy0 + 1, GY);
      const tx  = smooth(fx - gx0);
      const ty  = smooth(fy - gy0);
      field[r][c] =
        grid[gy0][gx0] * (1-tx) * (1-ty) +
        grid[gy0][gx1] *    tx  * (1-ty) +
        grid[gy1][gx0] * (1-tx) *    ty  +
        grid[gy1][gx1] *    tx  *    ty;
    }
  }
  return field;
}

class GridMap {

  constructor(scene) {
    this.scene       = scene;
    this.cols        = CONFIG.GRID_COLS;
    this.rows        = CONFIG.GRID_ROWS;
    this.tiles       = [];
    this._tileMeshes = [];
    this._highlights = [];
    this._instancedGroups = [];

    const WORLD   = 24;
    this.TILE_W   = WORLD / Math.max(this.cols, this.rows);
    this.OFFSET_X = this.TILE_W * (0.5 - this.cols / 2);
    this.OFFSET_Z = this.TILE_W * (0.5 - this.rows / 2);

    this._largeMap = Math.max(this.cols, this.rows) > 40;

    // 높이 범위: TILE_W 비율 → 맵 크기와 무관하게 시각적으로 동일한 비율
    this.HEIGHT_MIN = this.TILE_W * 0.04;   // 거의 평지
    this.HEIGHT_MAX = this.TILE_W * 0.60;   // 최고봉

    // 하이라이트 지오메트리 캐시
    this._hlGeo = new THREE.PlaneGeometry(this.TILE_W - 0.008, this.TILE_W - 0.008);
  }

  /* ────────────────────────────────────────────────────────
     build(layout)  —  전체 맵 빌드
  ──────────────────────────────────────────────────────── */
  build(layout) {
    const cols = this.cols, rows = this.rows;

    // 1. 노이즈 높이장 생성
    const field = _buildHeightField(cols, rows);

    // 2. 지형 타입별 노이즈 편향값 (0~1 범위 더하기)
    const BIAS = {
      OPEN:   0.00,
      FOREST: 0.08,
      HILL:   0.30,
      VALLEY:-0.22,
      RIVER: -0.30,
      BRIDGE: 0.02,
    };

    // 3. tiles 구성 + 높이 계산
    for (let r = 0; r < rows; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < cols; c++) {
        const key     = (layout && layout[r][c]) || 'OPEN';
        const terrain = CONFIG.TERRAIN[key] || CONFIG.TERRAIN.OPEN;

        let n = field[r][c] + (BIAS[key] ?? 0);
        n = Math.max(0, Math.min(1, n));

        // 스폰 구역 강제 평탄화
        if (r <= 1 || r >= rows - 2) n = 0;

        this.tiles[r][c] = {
          col: c, row: r, terrain,
          height: this.HEIGHT_MIN + n * (this.HEIGHT_MAX - this.HEIGHT_MIN),
          capturedBy: null, captureTurns: 0,
        };
      }
    }

    // 4. 3×3 이웃 평균 스무딩 (1회) — 급격한 단차 제거
    this._smoothPass();

    // 5. 렌더링
    this._largeMap ? this._drawTilesInstanced() : this._drawTilesNormal();
    this._drawLabels();
  }

  /* 3×3 이웃 평균 스무딩 */
  _smoothPass() {
    const rows = this.rows, cols = this.cols;
    const tmp  = Array.from({ length: rows }, () => new Float32Array(cols));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r <= 1 || r >= rows - 2) { tmp[r][c] = this.tiles[r][c].height; continue; }
        let sum = 0, cnt = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r+dr, nc = c+dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) { sum += this.tiles[nr][nc].height; cnt++; }
          }
        tmp[r][c] = sum / cnt;
      }
    }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        this.tiles[r][c].height = tmp[r][c];
  }

  /* ── 색상 ───────────────────────────────────────────── */
  _tileFillColor(tid) {
    return ({ open:0x0d1f14, forest:0x061306, valley:0x060f1a, hill:0x1a1006, river:0x041a2a, bridge:0x1a1006 })[tid] ?? 0x0d1f14;
  }
  _edgeColor(tid) {
    return ({ open:0x39ff8e, forest:0x22aa55, valley:0x2277cc, hill:0xffb84d, river:0x44aaff, bridge:0xff8844 })[tid] ?? 0x39ff8e;
  }

  /* ── 소형 맵 렌더링 ─────────────────────────────────── */
  _drawTilesNormal() {
    const s3 = this.scene.scene3d;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.tiles[r][c];
        const tid  = tile.terrain.id;
        const h    = tile.height;                       // top 면 y
        const bh   = Math.max(h, this.HEIGHT_MIN);     // 박스 높이
        const wx   = c * this.TILE_W + this.OFFSET_X;
        const wz   = r * this.TILE_W + this.OFFSET_Z;

        const geo  = new THREE.BoxGeometry(this.TILE_W - 0.02, bh, this.TILE_W - 0.02);
        const mat  = new THREE.MeshLambertMaterial({ color: this._tileFillColor(tid) });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(wx, bh / 2, wz);   // 중심 y = bh/2 → top 면 = h
        mesh.userData = { col: c, row: r, isTile: true };
        s3.add(mesh);

        mesh.add(new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: this._edgeColor(tid), transparent: true, opacity: 0.55 })
        ));

        // 레이캐스팅 평면
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(this.TILE_W - 0.04, this.TILE_W - 0.04),
          new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(wx, h + 0.003, wz);
        plane.userData = { col: c, row: r, isTile: true };
        s3.add(plane);
        this._tileMeshes.push(plane);
      }
    }
  }

  /* ── 대형 맵 렌더링 — InstancedMesh + scale.y 개별 높이 ─ */
  _drawTilesInstanced() {
    const s3         = this.scene.scene3d;
    const terrainIds = ['open','forest','valley','hill','river','bridge'];
    const dummy      = new THREE.Object3D();

    const groups = {};
    terrainIds.forEach(id => { groups[id] = []; });
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const tid = this.tiles[r][c].terrain.id;
        if (groups[tid]) groups[tid].push({ c, r });
      }

    for (const tid of terrainIds) {
      const list = groups[tid];
      if (!list.length) continue;
      // 기준 높이 1로 BoxGeometry → dummy.scale.y 로 실제 높이 적용
      const geo = new THREE.BoxGeometry(this.TILE_W - 0.008, 1, this.TILE_W - 0.008);
      const mat = new THREE.MeshLambertMaterial({ color: this._tileFillColor(tid) });
      const im  = new THREE.InstancedMesh(geo, mat, list.length);
      im.userData.isTileInstanced = true;

      list.forEach((pos, i) => {
        const h  = this.tiles[pos.r][pos.c].height;
        const bh = Math.max(h, this.HEIGHT_MIN);
        const wx = pos.c * this.TILE_W + this.OFFSET_X;
        const wz = pos.r * this.TILE_W + this.OFFSET_Z;
        dummy.position.set(wx, bh / 2, wz);
        dummy.scale.set(1, bh, 1);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      s3.add(im);
      this._instancedGroups.push(im);
    }
  }

  getTileMeshes() {
    return this._largeMap ? this._instancedGroups : this._tileMeshes;
  }

  worldToGrid(wx, wz) {
    const col = Math.round((wx - this.OFFSET_X) / this.TILE_W);
    const row = Math.round((wz - this.OFFSET_Z) / this.TILE_W);
    return this.isInBounds(col, row) ? { col, row } : null;
  }

  /* ── 레이블 ─────────────────────────────────────────── */
  _drawLabels() {
    const s3   = this.scene.scene3d;
    const n    = Math.max(this.cols, this.rows);
    const STEP = n <= 12 ? 2 : n <= 30 ? 5 : n <= 80 ? 10 : 25;
    const yLbl = this.HEIGHT_MAX + this.TILE_W * 0.3;

    for (let c = 0; c < this.cols; c += STEP) {
      const sp = _makeTextSprite(String.fromCharCode(65 + (c % 26)), '#2a5a38');
      sp.scale.set(this.TILE_W * 1.2, this.TILE_W * 0.75, 1);
      sp.position.set(c * this.TILE_W + this.OFFSET_X, yLbl, this.OFFSET_Z - this.TILE_W * 1.5);
      s3.add(sp);
    }
    for (let r = 0; r < this.rows; r += STEP) {
      const sp = _makeTextSprite(String(r + 1).padStart(2, '0'), '#2a5a38');
      sp.scale.set(this.TILE_W * 1.2, this.TILE_W * 0.75, 1);
      sp.position.set(this.OFFSET_X - this.TILE_W * 1.5, yLbl, r * this.TILE_W + this.OFFSET_Z);
      s3.add(sp);
    }
  }

  /* ── 하이라이트 ─────────────────────────────────────── */
  highlightTile(col, row, colorHex, alpha = 0.25) {
    if (!this.isInBounds(col, row)) return;
    const h  = this.tiles[row][col].height;   // ★ 타일별 높이
    const wx = col * this.TILE_W + this.OFFSET_X;
    const wz = row * this.TILE_W + this.OFFSET_Z;
    const mat  = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: alpha, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(this._hlGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(wx, h + 0.015, wz);
    mesh.renderOrder = 2;
    this.scene.scene3d.add(mesh);
    this._highlights.push(mesh);
  }

  clearHighlights() {
    for (const m of this._highlights) { this.scene.scene3d.remove(m); m.material.dispose(); }
    this._highlights = [];
  }

  /* ────────────────────────────────────────────────────────
     toWorld — 유닛 배치 기준 y
     y = tile.height (타일 top 면)
     GameScene._createMesh 에서 boxH/2 를 더해야 유닛이 타일 위에 착지
  ──────────────────────────────────────────────────────── */
  toWorld(col, row) {
    const tile = this.tiles[row][col];
    return {
      x: col * this.TILE_W + this.OFFSET_X,
      y: tile.height,   // ★ top 면 y (타일마다 다름)
      z: row * this.TILE_W + this.OFFSET_Z,
    };
  }

  isInBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }
}

/* ── 전역 텍스트 스프라이트 팩토리 ── */
function _makeTextSprite(text, color = '#39ff8e') {
  const cv  = document.createElement('canvas');
  cv.width  = 128; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'bold 38px "Share Tech Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(cv);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
}
