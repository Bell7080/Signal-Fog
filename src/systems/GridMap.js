/* ============================================================
   GridMap.js — 8×8 정사각형 그리드 생성 및 좌표 계산
   ============================================================ */

class GridMap {

  constructor(scene) {
    this.scene      = scene;
    this.cols       = CONFIG.GRID_COLS;
    this.rows       = CONFIG.GRID_ROWS;
    this.tSize      = CONFIG.TILE_SIZE;
    this.tiles      = [];
    this._tileGfx   = null;
    this._gridGfx   = null;
    this.hlGfx      = null; // highlight layer
  }

  /* ── 전체 타일 생성 및 렌더링 ── */
  build(layout) {
    // 타일 데이터 초기화
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
    this._drawGrid();
    this._drawLabels();
    this.hlGfx = this.scene.add.graphics().setDepth(3);
  }

  _drawTiles() {
    const COLOR = {
      open:   0x1a2e14,
      forest: 0x0e1f09,
      valley: 0x0d1c2a,
      hill:   0x2a1f0f,
    };
    const BORDER = {
      open:   0x2a4a20,
      forest: 0x163010,
      valley: 0x163040,
      hill:   0x3d2e18,
    };

    this._tileGfx = this.scene.add.graphics().setDepth(0);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const id  = this.tiles[r][c].terrain.id;
        const x   = c * this.tSize;
        const y   = r * this.tSize;
        const col = COLOR[id] || COLOR.open;
        const bdr = BORDER[id] || BORDER.open;

        this._tileGfx.fillStyle(col, 1);
        this._tileGfx.fillRect(x + 1, y + 1, this.tSize - 2, this.tSize - 2);

        // 지형 구분 테두리 (지형 종류가 다를 때만)
        this._tileGfx.lineStyle(1, bdr, 0.4);
        this._tileGfx.strokeRect(x + 1, y + 1, this.tSize - 2, this.tSize - 2);
      }
    }

    // 지형 레이블 (개활지 제외)
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.tiles[r][c].terrain;
        if (t.id === 'open') continue;
        const x = c * this.tSize + this.tSize / 2;
        const y = r * this.tSize + this.tSize - 9;
        this.scene.add.text(x, y, t.label, {
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: '8px', color: '#3a5a30',
        }).setOrigin(0.5, 1).setDepth(1);
      }
    }
  }

  _drawGrid() {
    this._gridGfx = this.scene.add.graphics().setDepth(2);
    this._gridGfx.lineStyle(1, 0x1e3a28, 0.5);
    for (let c = 0; c <= this.cols; c++) {
      this._gridGfx.lineBetween(c * this.tSize, 0, c * this.tSize, this.rows * this.tSize);
    }
    for (let r = 0; r <= this.rows; r++) {
      this._gridGfx.lineBetween(0, r * this.tSize, this.cols * this.tSize, r * this.tSize);
    }
  }

  _drawLabels() {
    const style = { fontFamily: "'Share Tech Mono', monospace", fontSize: '9px', color: '#2a5a38' };
    // 열 레이블 (A~H)
    for (let c = 0; c < this.cols; c++) {
      this.scene.add.text(c * this.tSize + this.tSize / 2, 2,
        String.fromCharCode(65 + c), style).setOrigin(0.5, 0).setDepth(4);
    }
    // 행 레이블 (01~08)
    for (let r = 0; r < this.rows; r++) {
      this.scene.add.text(2, r * this.tSize + this.tSize / 2,
        String(r + 1).padStart(2, '0'), style).setOrigin(0, 0.5).setDepth(4);
    }
  }

  /* ── 하이라이트 ── */
  highlightTile(col, row, color = 0x39ff8e, alpha = 0.25) {
    if (!this.isInBounds(col, row)) return;
    this.hlGfx.fillStyle(color, alpha);
    this.hlGfx.fillRect(
      col * this.tSize + 2, row * this.tSize + 2,
      this.tSize - 4, this.tSize - 4
    );
  }

  clearHighlights() { this.hlGfx.clear(); }

  /* ── 좌표 변환 ── */
  getTileAt(worldX, worldY) {
    const col = Math.floor(worldX / this.tSize);
    const row = Math.floor(worldY / this.tSize);
    if (!this.isInBounds(col, row)) return null;
    return { col, row, data: this.tiles[row][col] };
  }

  toPixel(col, row) {
    return {
      x: col * this.tSize + this.tSize / 2,
      y: row * this.tSize + this.tSize / 2,
    };
  }

  getNeighbors(col, row) {
    return [[-1,0],[1,0],[0,-1],[0,1]]
      .map(([dc, dr]) => ({ col: col + dc, row: row + dr }))
      .filter(({ col: c, row: r }) => this.isInBounds(c, r));
  }

  isInBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }
}
