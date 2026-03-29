/* ============================================================
   GridMap.js v0.9
   ────────────────────────────────────────────────────────────
   v0.9 변경 사항:
   1. _enforceRidgeContinuity() 추가
      · HILL 타일들이 서로 고립되지 않도록
        인접 HILL 타일들의 높이를 평균화해 능선을 연결.
      · ridge 값이 threshold 이상인 타일들 사이를
        1칸짜리 평지(OPEN)가 끊어도 높이를 부드럽게 이어줌.
   2. _normalizeHeights() 추가
      · 최종 높이 필드를 0~1 재정규화 (최솟값=0, 최댓값=1 보장)
      · FogOfWar._calcHeightBonus()가 정규화 값을 신뢰할 수 있게
   3. 기존 빌드 흐름:
        baseField → ridgeField → layout → heightField →
        ridgeContinuity → smoothing(2pass) → normalize → tiles
   ============================================================ */

/* ────────────────────────────────────────────────────────────
   (이전 함수들 _buildBaseField, _buildRidgeField,
   _generateMapFromFields, _insertRivers, _buildHeightField,
   _smoothField 는 v0.8과 동일하게 유지)
────────────────────────────────────────────────────────────── */

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
      field[r][c] = 1 - Math.abs(v - 0.5) * 2;
    }
  }
  return field;
}

function _generateMapFromFields(base, ridge, cols, rows) {
  const map = [];
  for (let r = 0; r < rows; r++) {
    map[r] = [];
    for (let c = 0; c < cols; c++) {
      if (r <= 1 || r >= rows - 2) { map[r][c] = 'OPEN'; continue; }
      const b = base[r][c];
      const rg = ridge[r][c];
      if      (b < 0.28)            map[r][c] = 'VALLEY';
      else if (b < 0.38)            map[r][c] = 'OPEN';
      else if (rg > 0.75)           map[r][c] = 'HILL';
      else if (b > 0.60 && rg>0.45) map[r][c] = 'HILL';
      else if (b > 0.55)            map[r][c] = 'FOREST';
      else if (b < 0.45)            map[r][c] = 'FOREST';
      else                          map[r][c] = 'OPEN';
    }
  }
  return map;
}

function _insertRivers(map, base, cols, rows) {
  const riverCount = cols >= 20 ? 2 : 1;
  for (let ri = 0; ri < riverCount; ri++) {
    const horizontal = Math.random() < 0.55;
    if (horizontal) {
      let bestRow = 3, bestAvg = 1;
      for (let r = 3; r < rows - 3; r++) {
        const avg = base[r].reduce((a, v) => a + v, 0) / cols;
        if (avg < bestAvg) { bestAvg = avg; bestRow = r; }
      }
      let tooClose = false;
      for (let r2 = bestRow - 3; r2 <= bestRow + 3; r2++) {
        if (r2 >= 0 && r2 < rows && map[r2].some(t => t === 'RIVER')) { tooClose = true; break; }
      }
      if (tooClose) continue;
      let cr = bestRow;
      for (let c = 0; c < cols; c++) {
        if (cr <= 1 || cr >= rows - 2) { cr = bestRow; }
        map[cr][c] = 'RIVER';
        if (c < cols - 1) {
          const upBase   = cr > 2     ? base[cr - 1][c + 1] : 1;
          const downBase = cr < rows-3 ? base[cr + 1][c + 1] : 1;
          const curBase  = base[cr][c + 1];
          const minB = Math.min(upBase, downBase, curBase);
          if (minB === upBase   && Math.random() < 0.4) cr--;
          else if (minB === downBase && Math.random() < 0.4) cr++;
        }
      }
      const bridgeCount = Math.max(1, Math.floor(cols / 12));
      const step = Math.floor(cols / (bridgeCount + 1));
      for (let bi = 1; bi <= bridgeCount; bi++) {
        const bc = Math.min(step * bi + Math.floor(Math.random() * 4 - 2), cols - 2);
        for (let r = 2; r < rows - 2; r++) {
          if (map[r][bc] === 'RIVER') { map[r][bc] = 'BRIDGE'; break; }
        }
      }
    } else {
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

function _buildHeightField(base, ridge, layout, cols, rows) {
  const WEIGHTS = {
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
      if (r <= 1 || r >= rows - 2) h = 0;
      field[r][c] = Math.max(0, Math.min(1, h));
    }
  }
  return field;
}

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

/* ── v0.9 신규: 능선 연속성 강화 패스 ──────────────────────────
   HILL 타일이 1칸짜리 OPEN으로 단절된 경우,
   양쪽 HILL의 높이 평균을 OPEN 타일에 부여해 능선이 이어지게 함.
   4방향 이웃만 검사 (대각선 제외 → 능선 형태 자연스럽게 유지).
─────────────────────────────────────────────────────────────── */
function _enforceRidgeContinuity(field, layout, cols, rows) {
  // HILL 여부 맵 (ridge 값 0.5 이상 or 타입 HILL)
  const isHill = (r, c) => layout[r][c] === 'HILL';

  const DIRS = [[0,1],[0,-1],[1,0],[-1,0]];
  // 2회 패스로 연쇄 연결도 처리
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 2; r < rows - 2; r++) {
      for (let c = 2; c < cols - 2; c++) {
        // 현재 타일이 OPEN 또는 FOREST인 경우만 처리
        const t = layout[r][c];
        if (t === 'HILL' || t === 'RIVER' || t === 'BRIDGE' || t === 'VALLEY') continue;

        // 4방향 HILL 이웃 목록
        const hillNeighbors = DIRS
          .map(([dr, dc]) => {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return null;
            return isHill(nr, nc) ? field[nr][nc] : null;
          })
          .filter(v => v !== null);

        if (hillNeighbors.length < 2) continue; // HILL 이웃이 2개 이상일 때만

        // 이웃 HILL 평균 높이 적용 (현재 높이보다 높을 때만 올려줌)
        const avgHill = hillNeighbors.reduce((a, b) => a + b, 0) / hillNeighbors.length;
        if (avgHill > field[r][c]) {
          // 부드럽게 블렌딩: 원래 높이와 50% 혼합
          field[r][c] = field[r][c] * 0.5 + avgHill * 0.5;
        }
      }
    }
  }
  return field;
}

/* ── v0.9 신규: 높이 정규화 (0~1 범위 보장) ─────────────────── */
function _normalizeHeights(field, rows, cols) {
  let minH = Infinity, maxH = -Infinity;
  for (let r = 2; r < rows - 2; r++)
    for (let c = 0; c < cols; c++) {
      if (field[r][c] < minH) minH = field[r][c];
      if (field[r][c] > maxH) maxH = field[r][c];
    }
  const range = maxH - minH;
  if (range < 0.001) return field; // 평탄 맵이면 그대로
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (r <= 1 || r >= rows - 2) { field[r][c] = 0; continue; }
      field[r][c] = (field[r][c] - minH) / range;
    }
  return field;
}

/* ── 카메라 파라미터 ─────────────────────────────────────────── */
function _calcCameraParams(tileW, cols, rows) {
  const mapSize=Math.max(cols,rows), maxWorld=mapSize*tileW;
  let distMul,heightMul,fov;
  if      (mapSize<=20){distMul=0.65;heightMul=0.55;fov=55;}
  else if (mapSize<=60){distMul=0.58;heightMul=0.48;fov=60;}
  else if (mapSize<=120){distMul=0.52;heightMul=0.42;fov=65;}
  else                 {distMul=0.46;heightMul=0.36;fov=70;}
  return{camDist:maxWorld*distMul, camHeight:maxWorld*heightMul, fov};
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

    this.HEIGHT_MIN = this.TILE_W * 0.02;
    this.HEIGHT_MAX = this.TILE_W * 0.38;

    this._hlGeo = new THREE.PlaneGeometry(this.TILE_W - 0.008, this.TILE_W - 0.008);
  }

  /* ─────────────────────────────────────────────────────────
     build(layout)
     v0.9: ridgeContinuity + normalize 패스 추가
  ───────────────────────────────────────────────────────── */
  build(layout) {
    const cols = this.cols, rows = this.rows;
    const seed = (Math.random() * 0xffffff) | 0;

    const baseField  = _buildBaseField(cols, rows, seed);
    const ridgeField = _buildRidgeField(cols, rows, seed ^ 0xdeadbeef);

    let hField = _buildHeightField(baseField, ridgeField, layout, cols, rows);

    // ★ v0.9 신규: 능선 연속성 강화 (smoothing 전에 적용)
    hField = _enforceRidgeContinuity(hField, layout, cols, rows);

    // 스무딩 2패스
    hField = _smoothField(hField, layout, rows, cols, 2);

    // ★ v0.9 신규: 높이 정규화 (0~1 보장)
    hField = _normalizeHeights(hField, rows, cols);

    for (let r = 0; r < rows; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < cols; c++) {
        const key     = (layout && layout[r][c]) || 'OPEN';
        const terrain = CONFIG.TERRAIN[key] || CONFIG.TERRAIN.OPEN;
        // 정규화된 hField(0~1)를 실제 높이로 변환
        const h       = this.HEIGHT_MIN + hField[r][c] * (this.HEIGHT_MAX - this.HEIGHT_MIN);
        this.tiles[r][c] = {
          col: c, row: r, terrain,
          height:    h,
          heightNorm: hField[r][c], // ★ 정규화값 별도 저장 (FogOfWar 참조용)
          capturedBy: null, captureTurns: 0,
        };
      }
    }

    this._largeMap ? this._drawTilesInstanced() : this._drawTilesNormal();
    this._drawLabels();
  }

  /* ── 색상 ─────────────────────────────────────────────────── */
  _tileFillColor(tid) {
    return ({ open:0x0d1f14, forest:0x061306, valley:0x060f1a, hill:0x1a1006, river:0x041a2a, bridge:0x1a1006 })[tid] ?? 0x0d1f14;
  }
  _edgeColor(tid) {
    return ({ open:0x39ff8e, forest:0x22aa55, valley:0x2277cc, hill:0xffb84d, river:0x44aaff, bridge:0xff8844 })[tid] ?? 0x39ff8e;
  }

  /* ── 소형 맵 렌더링 ──────────────────────────────────────── */
  _drawTilesNormal() {
    const s3 = this.scene.scene3d;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.tiles[r][c];
        const tid  = tile.terrain.id;
        const h    = tile.height;
        const bh   = Math.max(h, this.HEIGHT_MIN);
        const wx   = c * this.TILE_W + this.OFFSET_X;
        const wz   = r * this.TILE_W + this.OFFSET_Z;

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

        const pickGeo  = new THREE.PlaneGeometry(this.TILE_W - 0.01, this.TILE_W - 0.01);
        const pickMesh = new THREE.Mesh(
          pickGeo,
          new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
        );
        pickMesh.rotation.x = -Math.PI / 2;
        pickMesh.position.set(wx, h + 0.005, wz);
        pickMesh.userData = { col: c, row: r, isTile: true };
        s3.add(pickMesh);
        this._tileMeshes.push(pickMesh);
      }
    }
  }

  /* ── 대형 맵 렌더링 — InstancedMesh ─────────────────────── */
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

  /* ── 레이블 ────────────────────────────────────────────── */
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

  /* ── 하이라이트 ─────────────────────────────────────────── */
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
