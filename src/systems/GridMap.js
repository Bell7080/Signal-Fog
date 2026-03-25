/* ============================================================
   GridMap.js — 8×8 정사각형 그리드 생성 및 좌표 계산
   CONFIG.GRID_COLS × CONFIG.GRID_ROWS 크기의 타일 맵 관리.

   구현 순서 (하나씩 추가):
     1. build()        — 타일 오브젝트 배열 생성 및 렌더링
     2. getTileAt()    — 픽셀 좌표 → 그리드 좌표 변환
     3. getNeighbors() — 인접 타일 목록 반환 (이동 경로용)
     4. setTerrain()   — 특정 타일 지형 타입 설정
     5. isInBounds()   — 좌표 유효성 검사
   ============================================================ */

class GridMap {

  /**
   * @param {Phaser.Scene} scene - 타일을 렌더링할 씬
   */
  constructor(scene) {
    this.scene  = scene;
    this.cols   = CONFIG.GRID_COLS;
    this.rows   = CONFIG.GRID_ROWS;
    this.tSize  = CONFIG.TILE_SIZE;
    this.tiles  = [];  // 2D 배열 [row][col] — 각 셀은 { terrain, sprite, ... }
  }

  /** 그리드 전체 타일 생성 및 초기 지형 배치 */
  build() {
    // TODO: CONFIG.TERRAIN 기준으로 타일 배치
    // TODO: Phaser Graphics 또는 Image로 렌더링
  }

  /**
   * 픽셀 좌표 → 그리드 {col, row} 반환
   * @param {number} px
   * @param {number} py
   * @returns {{ col: number, row: number } | null}
   */
  getTileAt(px, py) {
    const col = Math.floor(px / this.tSize);
    const row = Math.floor(py / this.tSize);
    if (!this.isInBounds(col, row)) return null;
    return { col, row, data: this.tiles[row][col] };
  }

  /**
   * 특정 좌표의 상하좌우 인접 타일 목록 반환
   * @param {number} col
   * @param {number} row
   * @returns {Array<{col, row}>}
   */
  getNeighbors(col, row) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    return dirs
      .map(([dc, dr]) => ({ col: col + dc, row: row + dr }))
      .filter(({ col: c, row: r }) => this.isInBounds(c, r));
  }

  /**
   * 지형 타입 설정
   * @param {number} col
   * @param {number} row
   * @param {string} terrainId - CONFIG.TERRAIN의 키 (예: 'valley')
   */
  setTerrain(col, row, terrainId) {
    if (!this.isInBounds(col, row)) return;
    // TODO: this.tiles[row][col].terrain = CONFIG.TERRAIN[terrainId.toUpperCase()];
  }

  /**
   * 그리드 범위 유효성 검사
   * @param {number} col
   * @param {number} row
   * @returns {boolean}
   */
  isInBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  /**
   * 그리드 좌표 → 픽셀 중심 좌표 반환 (스프라이트 배치용)
   * @param {number} col
   * @param {number} row
   * @returns {{ x: number, y: number }}
   */
  toPixel(col, row) {
    return {
      x: col * this.tSize + this.tSize / 2,
      y: row * this.tSize + this.tSize / 2,
    };
  }
}
