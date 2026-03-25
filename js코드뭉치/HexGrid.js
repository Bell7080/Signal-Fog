/* ════════════════════════════════════════════════════════════
   js/systems/HexGrid.js  —  헥스 그리드 순수 로직
   Signal-Fog  /  팀 LNG

   ▸ Phaser·DOM·Firebase 에 의존하지 않음 → 단독 테스트 가능
   ▸ 좌표계: Odd-Q offset, pointy-top
════════════════════════════════════════════════════════════ */

import { HEX_SIZE, TERRAIN_COST } from '../config.js';

const CUBE_DIRS = [
  { x:  1, y: -1, z:  0 },
  { x:  1, y:  0, z: -1 },
  { x:  0, y:  1, z: -1 },
  { x: -1, y:  1, z:  0 },
  { x: -1, y:  0, z:  1 },
  { x:  0, y: -1, z:  1 },
];

export class HexGrid {
  constructor(cols, rows, size = HEX_SIZE) {
    this.cols = cols;
    this.rows = rows;
    this.size = size;
    /** @type {Map<string, HexTile>} */
    this._tiles = new Map();
    this._initTiles();
  }

  // ── 초기화 ────────────────────────────────────────────────
  _initTiles() {
    for (let q = 0; q < this.cols; q++) {
      for (let r = 0; r < this.rows; r++) {
        this._tiles.set(this._key(q, r), {
          q, r,
          terrain: 'OPEN',
          unit:    null,
          visible: false,
          commsOK: true,
        });
      }
    }
  }

  // ── 접근 ──────────────────────────────────────────────────
  _key(q, r)         { return `${q},${r}`; }
  tile(q, r)         { return this._tiles.get(this._key(q, r)); }
  has(q, r)          { return this._tiles.has(this._key(q, r)); }
  setTerrain(q, r, t){ const tile = this.tile(q, r); if (tile) tile.terrain = t; }

  // ── 좌표 변환 ─────────────────────────────────────────────
  toCube(q, r)   { const x = q; const z = r - (q - (q & 1)) / 2; return { x, y: -x-z, z }; }
  fromCube(x, y, z) { return { q: x, r: z + (x - (x & 1)) / 2 }; }

  toPixel(q, r) {
    const w = Math.sqrt(3) * this.size;
    const h = 2 * this.size;
    return { x: w * (q + .5 * (r & 1)), y: h * .75 * r };
  }

  fromPixel(px, py) {
    const w = Math.sqrt(3) * this.size;
    const h = 2 * this.size;
    const r = Math.round(py / (h * .75));
    const q = Math.round((px - .5 * (r & 1) * w) / w);
    return { q, r };
  }

  // ── 거리 ──────────────────────────────────────────────────
  distance(a, b) {
    const ac = this.toCube(a.q, a.r), bc = this.toCube(b.q, b.r);
    return Math.max(Math.abs(ac.x-bc.x), Math.abs(ac.y-bc.y), Math.abs(ac.z-bc.z));
  }

  // ── 인접 타일 ─────────────────────────────────────────────
  neighbors({ q, r }) {
    const c = this.toCube(q, r);
    return CUBE_DIRS
      .map(d => this.fromCube(c.x+d.x, c.y+d.y, c.z+d.z))
      .filter(({ q: nq, r: nr }) => this.has(nq, nr))
      .map(({ q: nq, r: nr }) => this.tile(nq, nr));
  }

  // ── 이동 범위 (BFS) ───────────────────────────────────────
  reachable(from, budget, costOverride = new Map()) {
    const visited = new Map();
    const queue   = [{ q: from.q, r: from.r, spent: 0 }];
    visited.set(this._key(from.q, from.r), 0);

    while (queue.length) {
      const cur = queue.shift();
      for (const nb of this.neighbors(cur)) {
        const key   = this._key(nb.q, nb.r);
        const cost  = costOverride.get(key) ?? TERRAIN_COST[nb.terrain] ?? 1;
        const total = cur.spent + cost;
        if (total <= budget && (!visited.has(key) || visited.get(key) > total)) {
          visited.set(key, total);
          queue.push({ q: nb.q, r: nb.r, spent: total });
        }
      }
    }
    visited.delete(this._key(from.q, from.r));
    return visited;
  }

  // ── 시야 (BFS) ────────────────────────────────────────────
  visibleFrom(origin, radius) {
    const visible = new Set();
    const queue   = [{ q: origin.q, r: origin.r, dist: 0 }];
    const seen    = new Set([this._key(origin.q, origin.r)]);

    while (queue.length) {
      const cur = queue.shift();
      visible.add(this._key(cur.q, cur.r));
      if (cur.dist >= radius) continue;
      for (const nb of this.neighbors(cur)) {
        const key = this._key(nb.q, nb.r);
        if (!seen.has(key)) { seen.add(key); queue.push({ q: nb.q, r: nb.r, dist: cur.dist + 1 }); }
      }
    }
    return visible;
  }

  // ── 통신 음영 갱신 ────────────────────────────────────────
  refreshCommsZones() {
    this._tiles.forEach(tile => { tile.commsOK = tile.terrain !== 'VALLEY'; });
  }

  // ── 직선 경로 ─────────────────────────────────────────────
  line(a, b) {
    const n = this.distance(a, b);
    const ac = this.toCube(a.q, a.r), bc = this.toCube(b.q, b.r);
    return Array.from({ length: n + 1 }, (_, i) => {
      const t  = n === 0 ? 0 : i / n;
      const rx = Math.round(ac.x + (bc.x - ac.x) * t);
      const rz = Math.round(ac.z + (bc.z - ac.z) * t);
      return this.fromCube(rx, -rx - rz, rz);
    });
  }

  // ── Phaser 렌더링 ─────────────────────────────────────────
  draw(gfx, offsetX = 0, offsetY = 0) {
    gfx.clear();
    gfx.lineStyle(1, 0x1a3a1a, 0.6);
    this._tiles.forEach(tile => {
      if (!tile.visible) return;
      const { x, y } = this.toPixel(tile.q, tile.r);
      this._drawHex(gfx, x + offsetX, y + offsetY);
    });
  }

  _drawHex(gfx, cx, cy) {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 180 * (60 * i - 30);
      return { x: cx + this.size * Math.cos(a), y: cy + this.size * Math.sin(a) };
    });
    gfx.beginPath();
    gfx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => gfx.lineTo(p.x, p.y));
    gfx.closePath();
    gfx.strokePath();
  }
}

/** @typedef {{ q:number, r:number, terrain:string, unit:*, visible:boolean, commsOK:boolean }} HexTile */
