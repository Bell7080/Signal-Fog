/* ============================================================
   GameScene.js v0.4 FIX
   핵심 수정:
     1. 카메라 위치/FOV를 맵 크기 기반으로 동적 계산 → 맵 미표시 버그 수정
     2. 하천(RIVER) 연결 생성 알고리즘 (Drunk Walk 방식)
     3. 교량(BRIDGE) 자동 배치
     4. 맵 크기가 CONFIG에서 올바르게 반영됨을 보장
   ============================================================ */

const ALLY_COLOR_DEFS = [
  { hex:0x39ff8e, css:'#39ff8e', bg:'rgba(5,40,18,0.94)',  emissive:0x1a7740 },
  { hex:0x38d9f5, css:'#38d9f5', bg:'rgba(3,28,40,0.94)',  emissive:0x0d5566 },
  { hex:0xf5e030, css:'#f5e030', bg:'rgba(36,30,2,0.94)',  emissive:0x665800 },
  { hex:0xff8c40, css:'#ff8c40', bg:'rgba(40,14,4,0.94)',  emissive:0x662000 },
  { hex:0xcc80ff, css:'#cc80ff', bg:'rgba(28,8,40,0.94)',  emissive:0x440066 },
  { hex:0x40ffee, css:'#40ffee', bg:'rgba(3,36,34,0.94)',  emissive:0x0d5550 },
  { hex:0xffe066, css:'#ffe066', bg:'rgba(36,34,4,0.94)',  emissive:0x665520 },
  { hex:0xff66b3, css:'#ff66b3', bg:'rgba(40,4,20,0.94)',  emissive:0x882244 },
  { hex:0x66ff40, css:'#66ff40', bg:'rgba(10,36,3,0.94)',  emissive:0x228800 },
  { hex:0x80c8ff, css:'#80c8ff', bg:'rgba(4,18,36,0.94)',  emissive:0x224466 },
];
const ENEMY_COLOR_DEF = { hex:0xff4444, css:'#ff4444', bg:'rgba(40,4,4,0.94)', emissive:0x882222 };

function _makeSquadLabelSprite(text, textCss, bgCss) {
  const W=160,H=72,cv=document.createElement('canvas');
  cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d'),r=14;
  ctx.fillStyle=bgCss;
  ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(W-r,0);
  ctx.arcTo(W,0,W,r,r); ctx.lineTo(W,H-r);
  ctx.arcTo(W,H,W-r,H,r); ctx.lineTo(r,H);
  ctx.arcTo(0,H,0,H-r,r); ctx.lineTo(0,r);
  ctx.arcTo(0,0,r,0,r); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=textCss; ctx.lineWidth=4; ctx.stroke();
  ctx.fillStyle=textCss; ctx.font='bold 40px "Share Tech Mono",monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(text,W/2,H/2);
  const tex=new THREE.CanvasTexture(cv);
  return new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
}

/* ═══════════════════════════════════════════════════
   지형 생성 알고리즘 — 강/하천이 이어지는 랜덤 맵
   ═══════════════════════════════════════════════════ */
function _generateMap() {
  const rows = CONFIG.GRID_ROWS;
  const cols = CONFIG.GRID_COLS;

  // 1단계: 기본 지형 배치 (개활지 베이스)
  const map = [];
  for (let r = 0; r < rows; r++) {
    map[r] = [];
    for (let c = 0; c < cols; c++) {
      // 스폰 구역(상하 2줄)은 무조건 개활지
      if (r <= 1 || r >= rows - 2) {
        map[r][c] = 'OPEN';
        continue;
      }
      const rnd = Math.random();
      if (rnd < 0.22) map[r][c] = 'FOREST';
      else if (rnd < 0.32) map[r][c] = 'HILL';
      else if (rnd < 0.38) map[r][c] = 'VALLEY';
      else map[r][c] = 'OPEN';
    }
  }

  // 2단계: 하천(RIVER) 연결 생성 — Drunk Walk 방식
  // 맵 크기에 따라 1~2개 하천 생성
  const riverCount = cols >= 20 ? 2 : 1;
  const riverRows = []; // 사용된 행 추적 (너무 가깝지 않게)

  for (let ri = 0; ri < riverCount; ri++) {
    // 하천 방향: 0=가로(좌→우), 1=세로(위→아래)
    const horizontal = Math.random() < 0.6; // 60% 확률로 가로 하천

    if (horizontal) {
      // 가로 하천: 특정 행을 좌에서 우로 이어감 (±1 row 편차 허용)
      // 스폰 구역(2줄) 피하고, 다른 하천과 3칸 이상 간격
      let startRow = Math.floor(rows * 0.3) + Math.floor(Math.random() * rows * 0.4);
      startRow = Math.max(3, Math.min(rows - 4, startRow));

      // 다른 하천과 간격 체크
      const tooClose = riverRows.some(r => Math.abs(r - startRow) < 3);
      if (tooClose) continue;
      riverRows.push(startRow);

      let curRow = startRow;
      for (let c = 0; c < cols; c++) {
        // 스폰 구역은 하천 미배치
        if (curRow <= 1 || curRow >= rows - 2) { curRow = startRow; continue; }

        map[curRow][c] = 'RIVER';

        // 다음 칸에서 row 약간 변동 (자연스러운 곡선)
        if (c < cols - 1) {
          const drift = Math.random();
          if (drift < 0.2 && curRow > 3) curRow--;
          else if (drift < 0.4 && curRow < rows - 4) curRow++;
          // 60%는 직진
        }
      }

      // 교량 배치: 하천이 지나는 col 중 1~2개에 BRIDGE
      const bridgeCount = Math.max(1, Math.floor(cols / 10));
      const bridgeCols = new Set();
      while (bridgeCols.size < bridgeCount) {
        bridgeCols.add(Math.floor(cols * 0.2) + Math.floor(Math.random() * cols * 0.6));
      }
      for (const bc of bridgeCols) {
        // 해당 열에서 RIVER 타일 찾아 BRIDGE로 교체
        for (let r = 2; r < rows - 2; r++) {
          if (map[r][bc] === 'RIVER') {
            map[r][bc] = 'BRIDGE';
            break;
          }
        }
      }

    } else {
      // 세로 하천: 특정 열을 위에서 아래로 이어감 (±1 col 편차)
      let startCol = Math.floor(cols * 0.2) + Math.floor(Math.random() * cols * 0.6);
      startCol = Math.max(2, Math.min(cols - 3, startCol));

      let curCol = startCol;
      for (let r = 2; r < rows - 2; r++) {
        map[r][curCol] = 'RIVER';

        if (r < rows - 3) {
          const drift = Math.random();
          if (drift < 0.2 && curCol > 2) curCol--;
          else if (drift < 0.4 && curCol < cols - 3) curCol++;
        }
      }

      // 교량 배치
      const bridgeCount = Math.max(1, Math.floor(rows / 10));
      const bridgeRows = new Set();
      while (bridgeRows.size < bridgeCount) {
        bridgeRows.add(3 + Math.floor(Math.random() * (rows - 6)));
      }
      for (const br of bridgeRows) {
        for (let c = 0; c < cols; c++) {
          if (map[br][c] === 'RIVER') {
            map[br][c] = 'BRIDGE';
            break;
          }
        }
      }
    }
  }

  return map;
}

function _calcSpawn(count, side, cols, rows) {
  const result = [];
  const spawnRow = side === 'ally' ? rows - 2 : 1;
  const step = Math.floor(cols / (count + 1));
  for (let i = 0; i < count; i++) {
    const col = Math.min(step * (i + 1), cols - 2);
    const id  = side === 'ally' ? (i + 1) : (CONFIG.SQUAD_COUNT + i + 1);
    result.push({ id, col, row: spawnRow });
  }
  return result;
}

function _calcObjective() {
  return {
    col: Math.floor(CONFIG.GRID_COLS / 2),
    row: Math.floor(CONFIG.GRID_ROWS / 2),
  };
}

class GameScene {
  constructor(container) {
    this.container = container;
    this.renderer = this.scene3d = this.camera = this.controls = this.raycaster = null;
    this.gridMap = null;
    this.squads = []; this.selectedSquad = null; this.pendingCmds = [];
    this.phase = 'INPUT';
    this.turnManager = this.comms = this.combat = this.enemyAI = null;
    this._animations = []; this._lastTime = null; this._mouseDownPos = null;
    this.fog = null; this._fogMeshes = {}; this._ghostMeshes = {}; this._overlapBadges = {};
    this._DEMO_OBJECTIVE = _calcObjective();
    this._pickerOutsideHandler = (e) => {
      const p = document.getElementById('squad-picker');
      if (p && !p.contains(e.target)) this._hideSquadPicker();
    };
  }

  init() {
    this._initRenderer();
    this._initScene();   // ← 반드시 renderer 다음
    this._initSystems();
    this._setupInput();
    window.addEventListener('resize', this._onResize.bind(this));
    window.gameScene = this;
    this.turnManager.startInputPhase();
    const obj = this._DEMO_OBJECTIVE;
    const objLabel = `${String.fromCharCode(65 + (obj.col % 26))}-${String(obj.row + 1).padStart(2, '0')}`;
    chatUI.addLog('OC/T', null, `훈련 개시. 목표: ${objLabel} 점령. 분대 선택 후 이동 타일 클릭.`);
    chatUI.addLog('SYSTEM', null, `맵 ${CONFIG.GRID_COLS}×${CONFIG.GRID_ROWS} | 아군 ${CONFIG.SQUAD_COUNT}분대 | 적군 ${CONFIG.ENEMY_COUNT}분대`, 'system');
    chatUI.addLog('SYSTEM', null, '드래그=회전 / 휠=줌 / 우클릭드래그=이동', 'system');
    this._tick();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x040604, 1);
    // ★ 핵심 FIX: 컨테이너 크기를 반드시 확인하고 fallback 설정
    const w = this.container.clientWidth  || window.innerWidth  || 800;
    const h = this.container.clientHeight || window.innerHeight || 600;
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);
    console.log(`[GameScene] Renderer 크기: ${w}×${h}`);
  }

  _initScene() {
    const w = this.container.clientWidth  || window.innerWidth  || 800;
    const h = this.container.clientHeight || window.innerHeight || 600;

    this.scene3d = new THREE.Scene();

    // ★ 핵심 FIX: 맵 크기 기반 카메라 거리 동적 계산
    const mapSize = Math.max(CONFIG.GRID_COLS, CONFIG.GRID_ROWS);
    // GridMap과 동일한 TILE_W 계산 (GridMap 인스턴스 없으므로 직접 계산)
    const tileW = Math.max(0.5, 1.2 * (20 / mapSize));
    const worldSize = mapSize * tileW;
    const camDist   = worldSize * 0.8;  // 맵 전체가 보이는 거리
    const camHeight = worldSize * 0.65;

    this.scene3d.fog = new THREE.FogExp2(0x040604, 0.015);  // 포그 줄임 (맵 미표시 원인 중 하나)

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, camDist * 5);
    this.camera.position.set(0, camHeight, camDist);
    this.camera.lookAt(0, 0, 0);
    console.log(`[GameScene] Camera 위치: (0, ${camHeight.toFixed(1)}, ${camDist.toFixed(1)}) | worldSize: ${worldSize.toFixed(1)}`);

    // OrbitControls
    this.controls = null;
    try {
      if (typeof THREE.OrbitControls !== 'undefined') {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        Object.assign(this.controls, {
          target:             new THREE.Vector3(0, 0, 0),
          enableDamping:      true,
          dampingFactor:      0.08,
          minDistance:        tileW * 3,
          maxDistance:        camDist * 2,
          maxPolarAngle:      Math.PI / 2.05,
          screenSpacePanning: true,
        });
      }
    } catch (e) {
      console.warn('[GameScene] OrbitControls 없음:', e.message);
    }

    // 조명
    this.scene3d.add(new THREE.AmbientLight(0x0a2010, 1.5));
    const pl = new THREE.PointLight(0x39ff8e, 1.5, worldSize * 4);
    pl.position.set(0, camHeight * 1.5, 0);
    this.scene3d.add(pl);
    const pl2 = new THREE.PointLight(0x2277cc, 0.5, worldSize * 3);
    pl2.position.set(-worldSize * 0.3, camHeight, worldSize * 0.3);
    this.scene3d.add(pl2);

    this.raycaster = new THREE.Raycaster();
  }

  _initSystems() {
    this.gridMap     = new GridMap(this);
    this.comms       = new CommsSystem();
    this.combat      = new CombatSystem();
    this.enemyAI     = new EnemyAI(new GeminiClient(), new FallbackAI());
    this.turnManager = new TurnManager(this);

    // ★ 맵 생성 (지형 랜덤 + 하천 연결)
    const layout = _generateMap();
    this.gridMap.build(layout);

    this._drawObjective();
    this._initSquads();
    this._initFog();
    this._updateFog();
  }

  _initFog() {
    this.fog = new FogOfWar(this.gridMap);
    const gm = this.gridMap;
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const h  = gm._tileHeight(gm.tiles[r][c].terrain.id);
        const wx = c * gm.TILE_W + gm.OFFSET_X;
        const wz = r * gm.TILE_W + gm.OFFSET_Z;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(gm.TILE_W, gm.TILE_W),
          new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(wx, h + 0.06, wz);
        mesh.renderOrder = 3;
        this.scene3d.add(mesh);
        this._fogMeshes[`${c},${r}`] = mesh;
      }
    }
    for (const s of this.squads.filter(q => q.side === 'enemy')) {
      const g = _makeTextSprite('?', '#882222');
      g.scale.set(gm.TILE_W * 1.2, gm.TILE_W * 1.2, 1);
      g.visible = false;
      this.scene3d.add(g);
      this._ghostMeshes[s.id] = g;
    }
  }

  _updateFog() {
    if (!this.fog) return;
    this.fog.computeVisible(this.squads.filter(s => s.side === 'ally' && s.alive));
    const gm = this.gridMap;
    for (let r = 0; r < CONFIG.GRID_ROWS; r++)
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const m = this._fogMeshes[`${c},${r}`];
        if (m) m.material.opacity = this.fog.isVisible(c, r) ? 0 : 0.76;
      }
    for (const s of this.squads.filter(q => q.side === 'enemy')) {
      const inSight = this.fog.isVisible(s.pos.col, s.pos.row);
      if (s.mesh) s.mesh.visible = s.alive && inSight;
      const ghost = this._ghostMeshes[s.id]; if (!ghost) continue;
      if (inSight && s.alive) { this.fog.updateLastKnown(s.id, s.pos); ghost.visible = false; }
      else if (s.alive) {
        const lk = this.fog.getLastKnown(s.id);
        if (lk) {
          const wp = gm.toWorld(lk.col, lk.row);
          ghost.position.set(wp.x, wp.y + 0.6, wp.z);
          ghost.visible = true;
        }
      } else ghost.visible = false;
    }
  }

  _drawObjective() {
    const obj = this._DEMO_OBJECTIVE;
    const { x, z } = this.gridMap.toWorld(obj.col, obj.row);
    const tH = this.gridMap._tileHeight(this.gridMap.tiles[obj.row][obj.col].terrain.id);
    const S  = this.gridMap.TILE_W * 0.45;
    const pts = [
      new THREE.Vector3(x - S, tH + 0.04, z - S),
      new THREE.Vector3(x + S, tH + 0.04, z - S),
      new THREE.Vector3(x + S, tH + 0.04, z + S),
      new THREE.Vector3(x - S, tH + 0.04, z + S),
      new THREE.Vector3(x - S, tH + 0.04, z - S),
    ];
    this.scene3d.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffb84d })
    ));
    const TW = this.gridMap.TILE_W;
    const star = _makeTextSprite('★', '#ffb84d');
    star.position.set(x, tH + TW * 1.0, z);
    star.scale.set(TW * 1.6, TW * 1.6, 1);
    this.scene3d.add(star);
    const lbl = _makeTextSprite('OBJ', '#ffb84d');
    lbl.position.set(x, tH + TW * 0.5, z);
    lbl.scale.set(TW, TW * 0.6, 1);
    this.scene3d.add(lbl);
  }

  _initSquads() {
    const cols = CONFIG.GRID_COLS, rows = CONFIG.GRID_ROWS;
    for (const d of _calcSpawn(CONFIG.SQUAD_COUNT, 'ally', cols, rows)) {
      const s = this._makeSquad(d.id, 'ally', d.col, d.row);
      this.squads.push(s);
      this._createMesh(s);
    }
    for (const d of _calcSpawn(CONFIG.ENEMY_COUNT, 'enemy', cols, rows)) {
      const s = this._makeSquad(d.id, 'enemy', d.col, d.row);
      this.squads.push(s);
      this._createMesh(s);
    }
    this._buildSquadPanel();
    this._syncPanel();
    this._updateOverlapVisuals();
  }

  _buildSquadPanel() {
    const list = document.getElementById('squad-list'); if (!list) return;
    list.innerHTML = '';
    this.squads.filter(s => s.side === 'ally').forEach((squad, i) => {
      const cd = squad._colDef || this._squadColor(squad);
      const card = document.createElement('div');
      card.className = 'squad-card' + (i === 0 ? ' active' : '');
      card.dataset.squadId = squad.id;
      card.style.borderLeft = `3px solid ${cd.css}`;
      card.innerHTML = `
        <div class="squad-card-header">
          <span class="squad-badge" style="color:${cd.css};border-color:${cd.css}">A${squad.id}분대</span>
          <span class="squad-status-tag">대기</span>
        </div>
        <div class="squad-troops">병력 <span>${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}</span> &nbsp;|&nbsp; AP <span>${squad.ap}/${CONFIG.SQUAD_AP_MAX}</span></div>
        <div class="comms-row">
          <span class="comms-label">통신</span>
          <div class="stat-bar"><div class="stat-fill" style="width:100%"></div></div>
          <span class="comms-val">100%</span>
        </div>`;
      card.addEventListener('click', () => this.selectSquadById(squad.id));
      list.appendChild(card);
    });
  }

  _makeSquad(id, side, col, row) {
    return { id, side, pos: { col, row }, troops: CONFIG.SQUAD_TROOP_MAX, ap: CONFIG.SQUAD_AP_MAX, terrain: CONFIG.TERRAIN.OPEN, alive: true, mesh: null, mat: null, boxMesh: null };
  }
  _squadColor(squad) {
    return squad.side === 'enemy' ? ENEMY_COLOR_DEF : ALLY_COLOR_DEFS[(squad.id - 1) % ALLY_COLOR_DEFS.length];
  }

  _createMesh(squad) {
    const { x, y, z } = this.gridMap.toWorld(squad.pos.col, squad.pos.row);
    const cd    = this._squadColor(squad);
    const TW    = this.gridMap.TILE_W;
    const label = squad.side === 'ally' ? `A${squad.id}` : `E${squad.id - CONFIG.SQUAD_COUNT}`;
    const group = new THREE.Group();

    const bw  = TW * 0.82, bh = TW * 0.55, bd = TW * 0.82;
    const geo = new THREE.BoxGeometry(bw, bh, bd);
    const mat = new THREE.MeshLambertMaterial({ color: cd.hex, transparent: true, opacity: 0.90 });
    const box = new THREE.Mesh(geo, mat);
    box.userData = { squadId: squad.id };
    group.add(box);

    const el = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: cd.hex, transparent: true, opacity: 0.9 })
    );
    el.raycast = () => {}; group.add(el);

    const sprite = _makeSquadLabelSprite(label, cd.css, cd.bg);
    sprite.position.set(0, TW * 1.0, 0);
    sprite.scale.set(TW * 1.6, TW * 0.75, 1);
    sprite.raycast = () => {};
    group.add(sprite);

    group.position.set(x, y, z);
    group.userData = { squadId: squad.id };
    this.scene3d.add(group);
    squad.mesh = group; squad.mat = mat; squad.boxMesh = box; squad._colDef = cd;
  }

  _getSquadsOnTile(col, row, side = null) {
    return this.squads.filter(s => s.alive && s.pos.col === col && s.pos.row === row && (side === null || s.side === side));
  }

  _calcOffsets(count) {
    const D = this.gridMap.TILE_W * 0.5;
    if (count === 2) return [{ dx: -D, dz: 0 }, { dx: D, dz: 0 }];
    if (count === 3) return [{ dx: -D, dz: -D * .5 }, { dx: D, dz: -D * .5 }, { dx: 0, dz: D * .9 }];
    return Array.from({ length: count }, (_, i) => ({
      dx: i % 2 === 0 ? -D : D,
      dz: (Math.floor(i / 2) - (Math.ceil(count / 2) - 1) / 2) * D * 1.2,
    }));
  }

  _updateOverlapVisuals() {
    if (!this.scene3d || !this.gridMap) return;

    // 기존 배지 제거
    for (const b of Object.values(this._overlapBadges)) {
      this.scene3d.remove(b); b.material?.map?.dispose(); b.material?.dispose();
    }
    this._overlapBadges = {};

    const TW = this.gridMap.TILE_W;

    // ── 아군 겹침 처리: 오프셋 분산 + ×N 배지 표시 ──
    const allyGroups = {};
    for (const s of this.squads.filter(q => q.alive && q.mesh && q.side === 'ally')) {
      const key = `${s.pos.col},${s.pos.row}`;
      (allyGroups[key] = allyGroups[key] || []).push(s);
    }
    for (const [key, list] of Object.entries(allyGroups)) {
      const [col, row] = key.split(',').map(Number);
      const base = this.gridMap.toWorld(col, row);
      if (list.length === 1) {
        list[0].mesh.position.set(base.x, base.y, base.z);
      } else {
        // 오프셋 분산
        const off = this._calcOffsets(list.length);
        list.forEach((s, i) => s.mesh.position.set(base.x + off[i].dx, base.y, base.z + off[i].dz));
        // 아군만 ×N 배지 표시
        const badge = _makeTextSprite(`×${list.length}`, '#ffb84d');
        badge.position.set(base.x, base.y + TW * 1.6, base.z);
        badge.scale.set(TW, TW * 0.6, 1);
        badge.renderOrder = 10;
        this.scene3d.add(badge);
        this._overlapBadges[key] = badge;
      }
    }

    // ── 적군 겹침 처리: 오프셋 분산만, 배지는 절대 표시 안 함 ──
    // (배지가 뜨면 적군 위치가 노출되어 게임 밸런스 파괴)
    const enemyGroups = {};
    for (const s of this.squads.filter(q => q.alive && q.mesh && q.side === 'enemy')) {
      const key = `${s.pos.col},${s.pos.row}`;
      (enemyGroups[key] = enemyGroups[key] || []).push(s);
    }
    for (const [key, list] of Object.entries(enemyGroups)) {
      const [col, row] = key.split(',').map(Number);
      const base = this.gridMap.toWorld(col, row);
      if (list.length === 1) {
        list[0].mesh.position.set(base.x, base.y, base.z);
      } else {
        // 오프셋만 분산 — 배지 없음
        const off = this._calcOffsets(list.length);
        list.forEach((s, i) => s.mesh.position.set(base.x + off[i].dx, base.y, base.z + off[i].dz));
      }
    }
  }

  _showSquadPicker(squads, clientX, clientY) {
    const picker = document.getElementById('squad-picker'); if (!picker) return;
    this._hideSquadPicker();
    const col = squads[0].pos.col, row = squads[0].pos.row;
    const coord = `${String.fromCharCode(65 + (col % 26))}-${String(row + 1).padStart(2, '0')}`;
    const title = document.createElement('div'); title.className = 'picker-title';
    title.innerHTML = `<span class="picker-icon">⚡</span> ${coord} 겹침 — 분대 선택`; picker.appendChild(title);
    squads.forEach(squad => {
      const cd = squad._colDef || this._squadColor(squad);
      const q = this._quality(squad);
      const hasCmd = !!this.pendingCmds.find(c => c.squadId === squad.id);
      const qColor = q < 50 ? '#ff4444' : q < 70 ? '#ffb84d' : cd.css;
      const card = document.createElement('div');
      card.className = 'picker-card' + (this.selectedSquad?.id === squad.id ? ' picker-card-selected' : '');
      card.innerHTML = `<div class="picker-card-stripe" style="background:${cd.css}"></div><div class="picker-card-content"><div class="picker-card-header"><span class="picker-card-name" style="color:${cd.css}">A${squad.id}분대</span>${hasCmd ? `<span class="picker-cmd-tag">명령↑</span>` : ''}</div><div class="picker-card-row"><span class="picker-stat-item">병력 <b>${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}</b></span><span class="picker-stat-item">AP <b>${squad.ap}/${CONFIG.SQUAD_AP_MAX}</b></span><span class="picker-stat-item" style="color:${qColor}">통신 <b>${q}%</b></span></div></div><div class="picker-card-arrow">▶</div>`;
      card.addEventListener('click', e => { e.stopPropagation(); this._hideSquadPicker(); this.selectSquad(squad); });
      picker.appendChild(card);
    });
    const closeBtn = document.createElement('div'); closeBtn.className = 'picker-close';
    closeBtn.innerHTML = '✕&nbsp;&nbsp;닫기';
    closeBtn.addEventListener('click', e => { e.stopPropagation(); this._hideSquadPicker(); });
    picker.appendChild(closeBtn);
    const rect = this.container.getBoundingClientRect();
    const PW = 224, PH = 48 + squads.length * 76 + 38;
    picker.style.left = Math.min(clientX - rect.left + 14, rect.width - PW - 6) + 'px';
    picker.style.top  = Math.min(clientY - rect.top + 14, rect.height - PH - 6) + 'px';
    picker.style.display = 'block';
    setTimeout(() => document.addEventListener('click', this._pickerOutsideHandler), 80);
    chatUI.addLog('SYSTEM', null, `⚠ ${coord} — ${squads.length}개 분대 겹침.`, 'system');
  }

  _hideSquadPicker() {
    const p = document.getElementById('squad-picker');
    if (p) { p.style.display = 'none'; p.innerHTML = ''; }
    document.removeEventListener('click', this._pickerOutsideHandler);
  }

  selectSquad(squad) {
    if (this.phase !== 'INPUT' || !squad.alive) return;
    this._hideSquadPicker(); this._cancelCmd(squad);
    if (this.selectedSquad?.mesh) {
      if (this.selectedSquad.mat) { this.selectedSquad.mat.emissive = new THREE.Color(0); this.selectedSquad.mat.opacity = 0.90; }
      this.selectedSquad.mesh.scale.set(1, 1, 1);
    }
    this.selectedSquad = squad;
    const cd = squad._colDef || this._squadColor(squad);
    squad.mat.emissive = new THREE.Color(cd.emissive);
    squad.mat.opacity  = 1.0;
    squad.mesh.scale.set(1.25, 1.25, 1.25);
    this.gridMap.clearHighlights();
    this._showMoveTargets(squad);
    this._syncPanel();
    const pos = `${String.fromCharCode(65 + (squad.pos.col % 26))}-${String(squad.pos.row + 1).padStart(2, '0')}`;
    chatUI.addLog('SYSTEM', null, `A${squad.id}분대 선택 — 위치:${pos} | AP:${squad.ap}/${CONFIG.SQUAD_AP_MAX} | 통신:${this._quality(squad)}%`, 'system');
  }

  selectSquadById(id) {
    const s = this.squads.find(q => q.side === 'ally' && q.id === id);
    if (s) this.selectSquad(s);
  }

  _showMoveTargets(squad) {
    for (let r = 0; r < CONFIG.GRID_ROWS; r++)
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const dist = Math.abs(c - squad.pos.col) + Math.abs(r - squad.pos.row);
        if (dist === 0 || dist > squad.ap) continue;
        const cost = this.gridMap.tiles[r][c].terrain.moveCost || 1;
        if (cost > squad.ap) continue;
        const stack = this._getSquadsOnTile(c, r, 'ally').length;
        this.gridMap.highlightTile(c, r, stack > 0 ? 0xffb84d : 0x39ff8e, stack > 0 ? 0.30 : 0.18);
      }
    for (const e of this.squads.filter(q => q.side === 'enemy' && q.alive))
      if (this.combat.inRange(squad.pos, e.pos))
        this.gridMap.highlightTile(e.pos.col, e.pos.row, 0xff4444, 0.38);
  }

  _clearSelection() {
    if (this.selectedSquad?.mat) {
      this.selectedSquad.mat.emissive = new THREE.Color(0);
      this.selectedSquad.mat.opacity  = 0.90;
      this.selectedSquad.mesh.scale.set(1, 1, 1);
    }
    this.selectedSquad = null;
    this.gridMap.clearHighlights();
    this._syncPanel();
  }

  _issueMove(squad, targetPos) {
    const dist = Math.abs(targetPos.col - squad.pos.col) + Math.abs(targetPos.row - squad.pos.row);
    if (dist === 0) return;
    const cost = this.gridMap.tiles[targetPos.row][targetPos.col].terrain.moveCost || 1;
    if (cost > squad.ap) { chatUI.addLog('SYSTEM', null, `AP 부족(필요:${cost},보유:${squad.ap})`, 'system'); return; }
    if (dist > squad.ap) { chatUI.addLog('SYSTEM', null, `이동 거리 초과(거리:${dist},AP:${squad.ap})`, 'system'); return; }
    this._cancelCmd(squad);
    const quality = this._quality(squad);
    if (this.comms.rollMishear(quality)) {
      const res = this.comms.applyMishear({ type: 'move', squadId: squad.id, targetTile: targetPos, targetPos }, this.squads, squad);
      if (res.distorted) {
        chatUI.showMishear(res.originalText, res.distortedText, res.mishearType);
        if (res.mishearType === 'ignore') { chatUI.addLog(`A${squad.id}`, null, '⚡ 명령 미수신 — 대기', 'system'); this._clearSelection(); return; }
        if (res.mishearType === 'attack_instead') {
          const target = this.squads.find(s => s.id === res.command.targetId && s.alive);
          if (target && squad.ap >= 1) { this.pendingCmds.push({ type: 'attack', squadId: squad.id, targetId: target.id }); squad.ap -= 1; chatUI.addLog(`A${squad.id}`, null, `⚡ 오청 → E${target.id - CONFIG.SQUAD_COUNT}분대 사격으로 둔갑`); this.gridMap.clearHighlights(); this.gridMap.highlightTile(target.pos.col, target.pos.row, 0xff4444, 0.50); }
          else { chatUI.addLog(`A${squad.id}`, null, '⚡ 오청(사격 둔갑) — AP 부족으로 대기', 'system'); }
          this._clearSelection(); return;
        }
        if (res.mishearType === 'coord') {
          const dp = res.command.targetTile;
          const dc = this.gridMap.tiles[dp.row][dp.col].terrain.moveCost || 1;
          const dd = Math.abs(dp.col - squad.pos.col) + Math.abs(dp.row - squad.pos.row);
          if (dd > 0 && dc <= squad.ap && dd <= squad.ap) {
            this.pendingCmds.push({ type: 'move', squadId: squad.id, targetPos: dp });
            squad.ap -= dc;
            this.gridMap.clearHighlights();
            this.gridMap.highlightTile(dp.col, dp.row, 0xffb84d, 0.50);
            chatUI.addLog(`A${squad.id}`, null, `⚡ 오청 이동 → ${String.fromCharCode(65 + (dp.col % 26))}-${String(dp.row + 1).padStart(2, '0')}`);
          } else { chatUI.addLog(`A${squad.id}`, null, '⚡ 오청 좌표 이동 불가 → 대기', 'system'); }
          this._clearSelection(); return;
        }
      }
    }
    this.pendingCmds.push({ type: 'move', squadId: squad.id, targetPos });
    squad.ap -= cost;
    this.gridMap.clearHighlights();
    this.gridMap.highlightTile(targetPos.col, targetPos.row, 0x39ff8e, 0.50);
    chatUI.addLog(`A${squad.id}`, null, `이동 → ${String.fromCharCode(65 + (targetPos.col % 26))}-${String(targetPos.row + 1).padStart(2, '0')}`);
    this._clearSelection();
  }

  _issueAttack(squad, target) {
    if (!this.combat.inRange(squad.pos, target.pos)) { chatUI.addLog('SYSTEM', null, `사거리 밖(최대${CONFIG.RIFLE_RANGE}타일)`, 'system'); return; }
    if (squad.ap < 1) { chatUI.addLog('SYSTEM', null, 'AP 부족 — 사격 불가', 'system'); return; }
    this._cancelCmd(squad);
    const quality = this._quality(squad);
    if (this.comms.rollMishear(quality)) {
      const res = this.comms.applyMishear({ type: 'attack', squadId: squad.id, targetId: target.id }, this.squads, squad);
      if (res.distorted && res.mishearType === 'ignore') { chatUI.showMishear(res.originalText, res.distortedText, res.mishearType); chatUI.addLog(`A${squad.id}`, null, '⚡ 사격 명령 미수신 — 대기', 'system'); this._clearSelection(); return; }
      if (res.distorted) chatUI.showMishear(res.originalText, res.distortedText, res.mishearType);
    }
    this.pendingCmds.push({ type: 'attack', squadId: squad.id, targetId: target.id });
    squad.ap -= 1;
    this.gridMap.clearHighlights();
    this.gridMap.highlightTile(target.pos.col, target.pos.row, 0xff4444, 0.50);
    chatUI.addLog(`A${squad.id}`, null, `E${target.id - CONFIG.SQUAD_COUNT}분대 사격 명령`);
    this._clearSelection();
  }

  _cancelCmd(squad) {
    const idx = this.pendingCmds.findIndex(c => c.squadId === squad.id); if (idx < 0) return;
    const old = this.pendingCmds[idx];
    if (old.type === 'move') squad.ap += (this.gridMap.tiles[old.targetPos.row][old.targetPos.col].terrain.moveCost || 1);
    else if (old.type === 'attack') squad.ap += 1;
    this.pendingCmds.splice(idx, 1);
  }

  moveSquadTo(squad, targetPos, onDone) {
    const from = { x: squad.mesh.position.x, y: squad.mesh.position.y, z: squad.mesh.position.z };
    const to   = this.gridMap.toWorld(targetPos.col, targetPos.row);
    this._animations.push({
      type: 'move', squad, from, to, duration: 0.32, elapsed: 0,
      onComplete: () => {
        squad.pos     = { ...targetPos };
        squad.terrain = this.gridMap.tiles[targetPos.row][targetPos.col].terrain;
        squad.mesh.position.set(to.x, to.y, to.z);
        this._updateOverlapVisuals();
        if (onDone) onDone();
      },
    });
  }

  applyHit(attacker, target) {
    const terrain = this.gridMap.tiles[target.pos.row][target.pos.col].terrain;
    const hit     = this.combat.rollHit(attacker.pos, target.pos, terrain);
    const aLbl    = attacker.side === 'ally' ? `A${attacker.id}` : `E${attacker.id - CONFIG.SQUAD_COUNT}`;
    const tLbl    = target.side === 'ally' ? `A${target.id}분대` : `E${target.id - CONFIG.SQUAD_COUNT}분대`;
    if (hit) {
      target.troops = Math.max(0, target.troops - 1);
      chatUI.addLog(aLbl, null, `${tLbl} 명중! (잔여:${target.troops}명)`);
      if (target.mat) {
        let n = 0;
        const flash = () => {
          if (!target.mat) return;
          target.mat.opacity = n++ % 2 === 0 ? 0.15 : 0.90;
          if (n < 6) setTimeout(flash, 90); else target.mat.opacity = 0.90;
        };
        flash();
      }
      if (target.troops <= 0) {
        target.alive = false;
        setTimeout(() => { if (target.mesh) target.mesh.visible = false; this._updateOverlapVisuals(); }, 590);
        chatUI.addLog('SYSTEM', null, `${tLbl} 전멸`, 'system');
      }
    } else {
      chatUI.addLog(aLbl, null, '사격 — 빗나감');
    }
  }

  _syncPanel() {
    const allies = this.squads.filter(s => s.side === 'ally');
    document.querySelectorAll('.squad-card').forEach(card => {
      const sid   = parseInt(card.dataset.squadId);
      const squad = allies.find(s => s.id === sid); if (!squad) return;
      const spans = card.querySelectorAll('.squad-troops span');
      if (spans[0]) spans[0].textContent = `${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}`;
      if (spans[1]) spans[1].textContent = `${squad.ap}/${CONFIG.SQUAD_AP_MAX}`;
      const q    = this._quality(squad);
      const fill = card.querySelector('.stat-fill'), cVal = card.querySelector('.comms-val');
      if (fill) { fill.style.width = q + '%'; fill.className = 'stat-fill' + (q < 50 ? ' crit' : q < CONFIG.COMMS_QUALITY_THRESHOLD ? ' warn' : ''); }
      if (cVal) cVal.textContent = q + '%';
      const tag    = card.querySelector('.squad-status-tag');
      const hasCmd = !!this.pendingCmds.find(c => c.squadId === squad.id);
      const stack  = squad.alive ? this._getSquadsOnTile(squad.pos.col, squad.pos.row, 'ally').length : 0;
      if (tag) {
        if (!squad.alive) { tag.textContent = '전멸'; tag.className = 'squad-status-tag combat'; }
        else if (q < 40)  { tag.textContent = '통신두절'; tag.className = 'squad-status-tag nocomms'; }
        else if (this.selectedSquad?.id === squad.id) { tag.textContent = '선택됨'; tag.className = 'squad-status-tag moving'; }
        else if (hasCmd)  { tag.textContent = '명령↑'; tag.className = 'squad-status-tag moving'; }
        else if (stack > 1) { tag.textContent = `겹침(${stack})`; tag.className = 'squad-status-tag nocomms'; }
        else { tag.textContent = '대기'; tag.className = 'squad-status-tag'; }
      }
      const cd = squad._colDef || this._squadColor(squad);
      card.style.borderLeft = `3px solid ${cd.css}`;
      card.classList.toggle('active', this.selectedSquad?.id === squad.id);
    });
    const allyInValley = this.squads.some(s => s.side === 'ally' && s.alive && (s.terrain?.id === 'valley' || s.terrain?.id === 'river'));
    const tw = document.getElementById('terrain-row'); if (tw) tw.style.display = allyInValley ? '' : 'none';
    const batEl = document.querySelector('.commander-block .resource-val');
    if (batEl) { const b = this.comms.batteryLevel; batEl.textContent = b + '%'; batEl.className = 'resource-val' + (b < 30 ? ' crit' : b < 50 ? ' warn' : ''); }
  }

  _quality(squad) {
    return this.comms ? Math.round(this.comms.calcQuality({ terrain: squad.terrain })) : 100;
  }

  _setupInput() {
    const cv = this.renderer.domElement; cv.style.pointerEvents = 'auto';
    cv.addEventListener('pointerdown', e => { this._mouseDownPos = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('pointerup', e => {
      if (!this._mouseDownPos) return;
      const dx = Math.abs(e.clientX - this._mouseDownPos.x), dy = Math.abs(e.clientY - this._mouseDownPos.y);
      this._mouseDownPos = null;
      if (dx < 6 && dy < 6) this._onCanvasClick(e);
    });
    cv.addEventListener('pointermove', e => {
      const hit = this._raycastTile(e);
      if (hit) {
        const el = document.getElementById('hud-coord');
        if (el) el.textContent = `${String.fromCharCode(65 + (hit.col % 26))}-${String(hit.row + 1).padStart(2, '0')}`;
      }
    });
  }

  _onCanvasClick(e) {
    if (this.phase !== 'INPUT') return; this._hideSquadPicker();
    const mouse = this._toNDC(e); this.raycaster.setFromCamera(mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.squads.filter(s => s.alive && s.boxMesh).map(s => s.boxMesh), false);
    if (hits.length > 0) {
      const { squadId } = hits[0].object.userData;
      const clicked = this.squads.find(s => s.id === squadId && s.alive);
      if (clicked) {
        if (clicked.side === 'ally') {
          const coloc = this._getSquadsOnTile(clicked.pos.col, clicked.pos.row, 'ally');
          if (coloc.length > 1) { this._showSquadPicker(coloc, e.clientX, e.clientY); return; }
          else { this.selectSquad(clicked); return; }
        }
        if (this.selectedSquad) { this._issueAttack(this.selectedSquad, clicked); return; }
      }
    }
    const tHits = this.raycaster.intersectObjects(this.gridMap.getTileMeshes());
    if (tHits.length === 0) return;
    const { col, row } = tHits[0].object.userData;
    const allies = this._getSquadsOnTile(col, row, 'ally');
    if (allies.length > 1) { this._showSquadPicker(allies, e.clientX, e.clientY); return; }
    if (allies.length === 1) { this.selectSquad(allies[0]); return; }
    if (!this.selectedSquad) return;
    const enemy = this.squads.find(q => q.side === 'enemy' && q.alive && q.pos.col === col && q.pos.row === row);
    if (enemy) { this._issueAttack(this.selectedSquad, enemy); return; }
    this._issueMove(this.selectedSquad, { col, row });
  }

  _toNDC(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  _raycastTile(e) {
    this.raycaster.setFromCamera(this._toNDC(e), this.camera);
    const h = this.raycaster.intersectObjects(this.gridMap.getTileMeshes());
    return h.length ? h[0].object.userData : null;
  }
  _onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _updateAnimations(delta) {
    const done = [];
    for (const a of this._animations) {
      a.elapsed += delta;
      const t = Math.min(a.elapsed / a.duration, 1);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      if (a.type === 'move') {
        a.squad.mesh.position.x = a.from.x + (a.to.x - a.from.x) * e;
        a.squad.mesh.position.z = a.from.z + (a.to.z - a.from.z) * e;
        a.squad.mesh.position.y = a.from.y + (a.to.y - a.from.y) * e + Math.sin(Math.PI * t) * 0.8;
      }
      if (t >= 1) { done.push(a); a.onComplete?.(); }
    }
    this._animations = this._animations.filter(a => !done.includes(a));
  }

  _tick(ts) {
    requestAnimationFrame(this._tick.bind(this));
    const now = ts || 0, delta = Math.min((now - (this._lastTime || now)) / 1000, 0.1);
    this._lastTime = now;
    this._updateAnimations(delta);
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene3d, this.camera);
  }
}
