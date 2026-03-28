/* ============================================================
   GridMap.js v0.8
   ────────────────────────────────────────────────────────────
   변경 사항:
   1. HeightMap — 두 레이어 분리
      · BASE 레이어: 완만한 저주파 노이즈 (전체 지형 굴곡)
      · RIDGE 레이어: 고주파 능선 노이즈 (hill/mountain 전용)
      · 두 레이어를 blend → 전체 높이 차이를 줄이면서도 능선은 능선끼리 연결
   2. 지형 연속성 보장
      · 강(RIVER/BRIDGE)은 별도 카테고리로 분리, 항상 저지대에 배치
      · 고지(HILL)는 RIDGE 레이어가 강한 구역에만 배치 → 능선이 자연스럽게 연결
      · 스무딩 패스 2회 → 급격한 단차 완전 제거
   3. HEIGHT_MAX 축소 (TILE_W × 0.38) → 시각적 높이 차이 완만화
   4. 레이캐스팅 버그 수정
      · 피킹 평면을 BoxGeometry TOP 면 y에 정확히 맞춤
      · camera.near를 TILE_W * 0.1로 줄여 근거리 오차 제거
      · 각 타일 개별 피킹 평면 → y = tile.height (top 면)으로 통일
   ============================================================ */

/* ── 저주파 Smoothstep 노이즈 (기저 지형) ──────────────────
   GX×GY 격자 bilinear 보간 → 0~1 완만한 높이장
────────────────────────────────────────────────────────── */
function _buildBaseField(cols, rows, seed) {
  const GX = Math.max(3, Math.floor(cols / 10));
  const GY = Math.max(3, Math.floor(rows / 10));

  let s = (seed * 1664525 + 1013904223) & 0x7fffffff;
  function rand() { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  const grid = [];
  for (let gy = 0; gy <= GY; gy++) {
    grid[gy] = [];
    for (let gx = 0; gx <= GX; gx++) grid[gy][gx] = rand();
  }

  const field = [];
  for (let r = 0; r < rows; r++) {
    field[r] = [];
    for (let c = 0; c < cols; c++) {
      const fx  = (c / Math.max(cols - 1, 1)) * GX;
      const fy  = (r / Math.max(rows - 1, 1)) * GY;
      const gx0 = Math.floor(fx), gx1 = Math.min(gx0 + 1, GX);
      const gy0 = Math.floor(fy), gy1 = Math.min(gy0 + 1, GY);
      const tx  = smooth(fx - gx0), ty = smooth(fy - gy0);
      field[r][c] =
        grid[gy0][gx0] * (1-tx) * (1-ty) +
        grid[gy0][gx1] *    tx  * (1-ty) +
        grid[gy1][gx0] * (1-tx) *    ty  +
        grid[gy1][gx1] *    tx  *    ty;
    }
  }
  return field;
}

/* ── 고주파 능선 노이즈 ─────────────────────────────────────
   더 촘촘한 격자 → 능선·골짜기 패턴 형성
   결과를 thresholding 해서 binary ridge map 생성
────────────────────────────────────────────────────────── */
function _buildRidgeField(cols, rows, seed) {
  const GX = Math.max(5, Math.floor(cols / 5));
  const GY = Math.max(5, Math.floor(rows / 5));

  let s = (seed * 69069 + 1) & 0x7fffffff;
  function rand() { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  const grid = [];
  for (let gy = 0; gy <= GY; gy++) {
    grid[gy] = [];
    for (let gx = 0; gx <= GX; gx++) grid[gy][gx] = rand();
  }

  const field = [];
  for (let r = 0; r < rows; r++) {
    field[r] = [];
    for (let c = 0; c < cols; c++) {
      const fx  = (c / Math.max(cols - 1, 1)) * GX;
      const fy  = (r / Math.max(rows - 1, 1)) * GY;
      const gx0 = Math.floor(fx), gx1 = Math.min(gx0 + 1, GX);
      const gy0 = Math.floor(fy), gy1 = Math.min(gy0 + 1, GY);
      const tx  = smooth(fx - gx0), ty = smooth(fy - gy0);
      const v =
        grid[gy0][gx0] * (1-tx) * (1-ty) +
        grid[gy0][gx1] *    tx  * (1-ty) +
        grid[gy1][gx0] * (1-tx) *    ty  +
        grid[gy1][gx1] *    tx  *    ty;
      // ridge: 0.5 기준 절댓값 반전 → 능선 패턴
      field[r][c] = 1 - Math.abs(v - 0.5) * 2;
    }
  }
  return field;
}

/* ── 지형 배치 생성 ─────────────────────────────────────────
   base + ridge 두 레이어를 사용해 지형 타입 결정:
   · RIVER/VALLEY  → base < 0.35  (저지대)
   · HILL          → ridge > 0.72 (능선 집중 구역)
   · FOREST        → base 0.45~0.65 (중간 지대)
   · OPEN          → 나머지
────────────────────────────────────────────────────────── */
function _generateMapFromFields(base, ridge, cols, rows) {
  const map = [];
  for (let r = 0; r < rows; r++) {
    map[r] = [];
    for (let c = 0; c < cols; c++) {
      if (r <= 1 || r >= rows - 2) { map[r][c] = 'OPEN'; continue; }

      const b = base[r][c];
      const rg = ridge[r][c];

      if      (b < 0.28)            map[r][c] = 'VALLEY';
      else if (b < 0.38)            map[r][c] = 'OPEN';   // 저지대 완충
      else if (rg > 0.75)           map[r][c] = 'HILL';
      else if (b > 0.60 && rg>0.45) map[r][c] = 'HILL';
      else if (b > 0.55)            map[r][c] = 'FOREST';
      else if (b < 0.45)            map[r][c] = 'FOREST';
      else                          map[r][c] = 'OPEN';
    }
  }
  return map;
}

/* ── 강 경로 삽입 ───────────────────────────────────────────
   base 노이즈의 저지대를 따라 자연스럽게 강 경로 생성.
   브리지는 강을 가로지르는 지점에 자동 배치.
────────────────────────────────────────────────────────── */
function _insertRivers(map, base, cols, rows) {
  const riverCount = cols >= 20 ? 2 : 1;

  for (let ri = 0; ri < riverCount; ri++) {
    const horizontal = Math.random() < 0.55;

    if (horizontal) {
      // base 저지대 행(row) 찾기
      let bestRow = 3, bestAvg = 1;
      for (let r = 3; r < rows - 3; r++) {
        const avg = base[r].reduce((a, v) => a + v, 0) / cols;
        if (avg < bestAvg) { bestAvg = avg; bestRow = r; }
      }
      // 이전 강과 너무 가까우면 스킵
      let tooClose = false;
      for (let r2 = bestRow - 3; r2 <= bestRow + 3; r2++) {
        if (r2 >= 0 && r2 < rows && map[r2].some(t => t === 'RIVER')) { tooClose = true; break; }
      }
      if (tooClose) continue;

      // 저지대를 따라 구불구불 강 삽입
      let cr = bestRow;
      for (let c = 0; c < cols; c++) {
        if (cr <= 1 || cr >= rows - 2) { cr = bestRow; }
        map[cr][c] = 'RIVER';
        if (c < cols - 1) {
          // 다음 칸에서 인접 행 중 base가 더 낮은 쪽으로 흐름
          const upBase   = cr > 2     ? base[cr - 1][c + 1] : 1;
          const downBase = cr < rows-3 ? base[cr + 1][c + 1] : 1;
          const curBase  = base[cr][c + 1];
          const minB = Math.min(upBase, downBase, curBase);
          if (minB === upBase   && Math.random() < 0.4) cr--;
          else if (minB === downBase && Math.random() < 0.4) cr++;
        }
      }
      // 브리지 배치 (강 위 bridge)
      const bridgeCount = Math.max(1, Math.floor(cols / 12));
      const step = Math.floor(cols / (bridgeCount + 1));
      for (let bi = 1; bi <= bridgeCount; bi++) {
        const bc = Math.min(step * bi + Math.floor(Math.random() * 4 - 2), cols - 2);
        for (let r = 2; r < rows - 2; r++) {
          if (map[r][bc] === 'RIVER') { map[r][bc] = 'BRIDGE'; break; }
        }
      }

    } else {
      // 수직 강
      let bestCol = 2, bestAvg = 1;
      for (let c = 2; c < cols - 2; c++) {
        let avg = 0;
        for (let r = 0; r < rows; r++) avg += base[r][c];
        avg /= rows;
        if (avg < bestAvg) { bestAvg = avg; bestCol = c; }
      }
      let cc = bestCol;
      for (let r = 2; r < rows - 2; r++) {
        if (cc <= 1 || cc >= cols - 2) cc = bestCol;
        map[r][cc] = 'RIVER';
        if (r < rows - 3) {
          const leftB  = cc > 2      ? base[r+1][cc-1] : 1;
          const rightB = cc < cols-3 ? base[r+1][cc+1] : 1;
          const curB   = base[r+1][cc];
          const minB   = Math.min(leftB, rightB, curB);
          if (minB === leftB  && Math.random() < 0.4) cc--;
          else if (minB === rightB && Math.random() < 0.4) cc++;
        }
      }
      const bridgeCount = Math.max(1, Math.floor(rows / 12));
      const step = Math.floor(rows / (bridgeCount + 1));
      for (let bi = 1; bi <= bridgeCount; bi++) {
        const br = Math.min(step * bi + Math.floor(Math.random() * 4 - 2), rows - 3);
        for (let c = 0; c < cols; c++) {
          if (map[br][c] === 'RIVER') { map[br][c] = 'BRIDGE'; break; }
        }
      }
    }
  }
  return map;
}

/* ── 높이 계산 ──────────────────────────────────────────────
   base + ridge 를 지형 타입별 가중치로 혼합.
   전체 높이 범위를 줄여서 완만한 지형 실현.
────────────────────────────────────────────────────────── */
function _buildHeightField(base, ridge, layout, cols, rows) {
  // 지형별 base/ridge 혼합 비율 & 높이 편향
  const WEIGHTS = {
    //              baseW  ridgeW  bias
    OPEN:   { bw: 0.7,  rw: 0.1,  bias:  0.00 },
    FOREST: { bw: 0.6,  rw: 0.2,  bias:  0.05 },
    HILL:   { bw: 0.3,  rw: 0.7,  bias:  0.18 },
    VALLEY: { bw: 0.8,  rw: 0.05, bias: -0.20 },
    RIVER:  { bw: 0.9,  rw: 0.00, bias: -0.28 },
    BRIDGE: { bw: 0.85, rw: 0.00, bias: -0.22 },
  };

  const field = [];
  for (let r = 0; r < rows; r++) {
    field[r] = [];
    for (let c = 0; c < cols; c++) {
      const key = layout[r][c] || 'OPEN';
      const w   = WEIGHTS[key] || WEIGHTS.OPEN;
      let h = base[r][c] * w.bw + ridge[r][c] * w.rw + w.bias;
      // 스폰 구역 평탄화
      if (r <= 1 || r >= rows - 2) h = 0;
      field[r][c] = Math.max(0, Math.min(1, h));
    }
  }
  return field;
}

/* ── 스무딩 ─────────────────────────────────────────────────
   가우시안 커널 근사 (1-2-1 / 2-4-2 / 1-2-1) 1패스.
   추가로 지형 경계 완충: 강→강이웃 높이 부드럽게 당김.
────────────────────────────────────────────────────────── */
function _smoothField(field, layout, rows, cols, passes = 2) {
  let f = field;
  for (let p = 0; p < passes; p++) {
    const tmp = Array.from({ length: rows }, () => new Float32Array(cols));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r <= 1 || r >= rows - 2) { tmp[r][c] = f[r][c]; continue; }
        let sum = 0, w = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r+dr, nc = c+dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              const wt = (dr === 0 && dc === 0) ? 4 : (dr !== 0 && dc !== 0) ? 1 : 2;
              sum += f[nr][nc] * wt; w += wt;
            }
          }
        tmp[r][c] = sum / w;
      }
    }
    f = tmp;
  }
  return f;
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

    // ★ HEIGHT_MAX 축소 (0.60 → 0.38) — 전체 높이 차이 완만화
    this.HEIGHT_MIN = this.TILE_W * 0.02;
    this.HEIGHT_MAX = this.TILE_W * 0.38;

    this._hlGeo = new THREE.PlaneGeometry(this.TILE_W - 0.008, this.TILE_W - 0.008);
  }

  /* ─────────────────────────────────────────────────────────
     build(layout)  —  전체 맵 빌드
     layout는 _generateMap()이 반환한 2D 문자열 배열.
     내부에서 두 노이즈 레이어를 생성해 높이 계산.
  ───────────────────────────────────────────────────────── */
  build(layout) {
    const cols = this.cols, rows = this.rows;
    const seed = (Math.random() * 0xffffff) | 0;

    // 1. 노이즈 레이어 생성
    const baseField  = _buildBaseField(cols, rows, seed);
    const ridgeField = _buildRidgeField(cols, rows, seed ^ 0xdeadbeef);

    // 2. 높이 필드 계산 (layout 기반 가중치 혼합)
    let hField = _buildHeightField(baseField, ridgeField, layout, cols, rows);

    // 3. 스무딩 2패스
    hField = _smoothField(hField, layout, rows, cols, 2);

    // 4. tiles 구성
    for (let r = 0; r < rows; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < cols; c++) {
        const key     = (layout && layout[r][c]) || 'OPEN';
        const terrain = CONFIG.TERRAIN[key] || CONFIG.TERRAIN.OPEN;
        const h       = this.HEIGHT_MIN + hField[r][c] * (this.HEIGHT_MAX - this.HEIGHT_MIN);
        this.tiles[r][c] = {
          col: c, row: r, terrain,
          height: h,
          capturedBy: null, captureTurns: 0,
        };
      }
    }

    // 5. 렌더링
    this._largeMap ? this._drawTilesInstanced() : this._drawTilesNormal();
    this._drawLabels();
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
        const h    = tile.height;          // top 면 y
        const bh   = Math.max(h, this.HEIGHT_MIN); // 박스 높이 (= top 면 y, 바닥은 y=0)
        const wx   = c * this.TILE_W + this.OFFSET_X;
        const wz   = r * this.TILE_W + this.OFFSET_Z;

        // 박스: 중심 y = bh/2 → top 면 = bh = h
        const geo  = new THREE.BoxGeometry(this.TILE_W - 0.02, bh, this.TILE_W - 0.02);
        const mat  = new THREE.MeshLambertMaterial({ color: this._tileFillColor(tid) });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(wx, bh / 2, wz);
        mesh.userData = { col: c, row: r, isTile: true };
        s3.add(mesh);

        mesh.add(new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: this._edgeColor(tid), transparent: true, opacity: 0.55 })
        ));

        /* ★ 레이캐스팅 평면 버그 수정
           y = tile.height (top 면)에 정확히 배치.
           이전: bh/2 + 오프셋 → 박스 측면이 가려진 높은 타일 뒤쪽을 잘못 선택.
           수정: 각 타일의 실제 top 면 y에 얇은 픽킹 평면 배치. */
        const pickGeo  = new THREE.PlaneGeometry(this.TILE_W - 0.01, this.TILE_W - 0.01);
        const pickMesh = new THREE.Mesh(
          pickGeo,
          new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
        );
        pickMesh.rotation.x = -Math.PI / 2;
        pickMesh.position.set(wx, h + 0.005, wz);   // ★ top 면 y + 아주 작은 오프셋
        pickMesh.userData = { col: c, row: r, isTile: true };
        s3.add(pickMesh);
        this._tileMeshes.push(pickMesh);
      }
    }
  }

  /* ── 대형 맵 렌더링 — InstancedMesh ─────────────────── */
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
    const h  = this.tiles[row][col].height;
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
     toWorld — 유닛 배치 기준 y = tile.height (top 면)
  ───────────────────────────────────────────────────────── */
  toWorld(col, row) {
    const tile = this.tiles[row][col];
    return {
      x: col * this.TILE_W + this.OFFSET_X,
      y: tile.height,
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
