/* ============================================================
   GridMap.js — Three.js 3D 그리드
   v0.6 FIX:
     - toWorld() y 이중 오프셋 제거 → 유닛이 타일 표면에 착지
     - 대형 맵 렉 최적화:
       · 레이블 간격 더 넓게 (대형 맵에서 스프라이트 수 감소)
       · InstancedMesh 재질 opacity 제거 (transparent=false → 렌더 부담 감소)
       · 하이라이트 PlaneGeometry 풀링 (매 턴 재생성 → 캐시 재사용)
   ============================================================ */

class GridMap {

  constructor(scene) {
    this.scene       = scene;
    this.cols        = CONFIG.GRID_COLS;
    this.rows        = CONFIG.GRID_ROWS;
    this.tiles       = [];
    this._tileMeshes = [];
    this._highlights = [];
    this._instancedGroups = [];

    // 월드 사이즈: 맵 크기에 관계없이 ~24 유닛 고정
    const WORLD = 24;
    this.TILE_W   = WORLD / Math.max(this.cols, this.rows);
    this.OFFSET_X = this.TILE_W * (0.5 - this.cols / 2);
    this.OFFSET_Z = this.TILE_W * (0.5 - this.rows / 2);

    // 대형 맵 여부 (>40 → InstancedMesh + 캔버스 포그)
    this._largeMap = Math.max(this.cols, this.rows) > 40;

    // 하이라이트 지오메트리 캐시 (한 번만 생성)
    this._hlGeo = new THREE.PlaneGeometry(this.TILE_W - 0.008, this.TILE_W - 0.008);
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

  // ── 지형별 타일 높이 (박스 top 면의 y 좌표) ──────────────────
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

  /* ── 소형 맵 (<= 40) ─────────────────────────────────────── */
  _drawTilesNormal() {
    const s3 = this.scene.scene3d;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.tiles[r][c];
        const tid  = tile.terrain.id;
        const h    = this._tileHeight(tid);       // top 면 y
        const bh   = Math.max(h, 0.06);           // box 전체 높이
        const wx   = c * this.TILE_W + this.OFFSET_X;
        const wz   = r * this.TILE_W + this.OFFSET_Z;

        const geo  = new THREE.BoxGeometry(this.TILE_W - 0.03, bh, this.TILE_W - 0.03);
        const mat  = new THREE.MeshLambertMaterial({ color: this._tileFillColor(tid) });
        const mesh = new THREE.Mesh(geo, mat);
        // 박스 중심 y = bh/2 → top 면이 정확히 h 위치에 오도록
        mesh.position.set(wx, bh / 2, wz);
        mesh.userData = { col: c, row: r, isTile: true };
        s3.add(mesh);

        mesh.add(new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: this._edgeColor(tid), transparent: true, opacity: 0.60 })
        ));

        // 레이캐스팅 평면 — top 면 y에 아주 살짝 올림
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(this.TILE_W - 0.05, this.TILE_W - 0.05),
          new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(wx, h + 0.005, wz);
        plane.userData = { col: c, row: r, isTile: true };
        s3.add(plane);
        this._tileMeshes.push(plane);
      }
    }
  }

  /* ── 대형 맵 (> 40) — InstancedMesh ──────────────────────── */
  _drawTilesInstanced() {
    const s3         = this.scene.scene3d;
    const terrainIds = ['open', 'forest', 'valley', 'hill', 'river', 'bridge'];
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
      if (list.length === 0) continue;
      const h  = this._tileHeight(tid);
      const bh = Math.max(h, 0.06);
      const geo = new THREE.BoxGeometry(this.TILE_W - 0.008, bh, this.TILE_W - 0.008);
      // ★ transparent:false → 렌더 소트 생략 → 대형 맵 FPS 개선
      const mat = new THREE.MeshLambertMaterial({ color: this._tileFillColor(tid) });
      const im  = new THREE.InstancedMesh(geo, mat, list.length);
      im.userData.isTileInstanced = true;

      list.forEach((pos, i) => {
        const wx = pos.c * this.TILE_W + this.OFFSET_X;
        const wz = pos.r * this.TILE_W + this.OFFSET_Z;
        dummy.position.set(wx, bh / 2, wz);   // 박스 중심 = bh/2
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      s3.add(im);
      this._instancedGroups.push(im);
    }
  }

  getTileMeshes() {
    if (!this._largeMap) return this._tileMeshes;
    return this._instancedGroups;
  }

  worldToGrid(wx, wz) {
    const col = Math.round((wx - this.OFFSET_X) / this.TILE_W);
    const row = Math.round((wz - this.OFFSET_Z) / this.TILE_W);
    if (!this.isInBounds(col, row)) return null;
    return { col, row };
  }

  /* ── 레이블 — 대형 맵에서 스프라이트 수 최소화 ──────────── */
  _drawLabels() {
    const s3 = this.scene.scene3d;
    const n  = Math.max(this.cols, this.rows);
    // 스텝: 소형 2, 중형 5, 대형 10, 초대형 25
    const STEP = n <= 12 ? 2 : n <= 30 ? 5 : n <= 80 ? 10 : 25;

    for (let c = 0; c < this.cols; c += STEP) {
      const sprite = _makeTextSprite(String.fromCharCode(65 + (c % 26)), '#2a5a38');
      sprite.scale.set(this.TILE_W * 1.2, this.TILE_W * 0.75, 1);
      sprite.position.set(c * this.TILE_W + this.OFFSET_X, 0.4, this.OFFSET_Z - this.TILE_W * 1.5);
      s3.add(sprite);
    }
    for (let r = 0; r < this.rows; r += STEP) {
      const sprite = _makeTextSprite(String(r + 1).padStart(2, '0'), '#2a5a38');
      sprite.scale.set(this.TILE_W * 1.2, this.TILE_W * 0.75, 1);
      sprite.position.set(this.OFFSET_X - this.TILE_W * 1.5, 0.4, r * this.TILE_W + this.OFFSET_Z);
      s3.add(sprite);
    }
  }

  /* ── 하이라이트 — 지오메트리 캐시 재사용 ────────────────── */
  highlightTile(col, row, colorHex, alpha = 0.25) {
    if (!this.isInBounds(col, row)) return;
    const tile = this.tiles[row][col];
    const h    = this._tileHeight(tile.terrain.id);
    const wx   = col * this.TILE_W + this.OFFSET_X;
    const wz   = row * this.TILE_W + this.OFFSET_Z;
    // 지오메트리는 캐시된 것 재사용, 머테리얼만 새로 생성
    const mat  = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: alpha,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this._hlGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(wx, h + 0.02, wz);
    mesh.renderOrder = 2;
    this.scene.scene3d.add(mesh);
    this._highlights.push(mesh);
  }

  clearHighlights() {
    for (const m of this._highlights) {
      this.scene.scene3d.remove(m);
      // 지오메트리는 공유 캐시이므로 dispose 하지 않음
      m.material.dispose();
    }
    this._highlights = [];
  }

  /* ── toWorld: 유닛 배치 좌표 ──────────────────────────────
     ★ 핵심 수정: y = 타일 top 면 높이만 반환 (추가 오프셋 제거)
        유닛 박스 높이(bh)의 절반은 GameScene._createMesh에서 처리
  ─────────────────────────────────────────────────────────── */
  toWorld(col, row) {
    const tile = this.tiles[row][col];
    const h    = this._tileHeight(tile.terrain.id);  // 타일 top 면 y
    return {
      x: col * this.TILE_W + this.OFFSET_X,
      y: h,          // ★ 추가 오프셋 없음 — GameScene이 박스 bh/2 더함
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
