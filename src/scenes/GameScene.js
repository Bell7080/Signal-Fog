/* ============================================================
   GameScene.js v0.6 FIX
   수정 사항:
     1. 유닛 공중 부양 수정
        - toWorld()가 타일 top 면 y만 반환
        - _createMesh에서 group.position.y = tileTopY + boxH/2
        - moveSquadTo / initSquads 모두 동일 공식 적용
     2. 카메라 시점 최적화
        - 맵 크기별 적정 거리 / 높이 / FOV 자동 계산
        - 소형(≤20): 현재 수준 / 중형(21~60): 중간 / 대형(>60): 넓게
     3. 대형 맵 성능 개선
        - scene.fog 밀도를 맵 크기에 따라 조정 (대형은 옅게)
        - OrbitControls maxDistance 맵 크기 연동
        - 포그 캔버스 해상도 1px/tile (기존 2px → 절반)
        - 유닛 라벨 스프라이트 대형 맵에서 크기 축소
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
   맵 생성 — 하천 연결 (Drunk Walk)
   ═══════════════════════════════════════════════════ */
function _generateMap() {
  const rows = CONFIG.GRID_ROWS, cols = CONFIG.GRID_COLS;
  const map  = [];
  for (let r = 0; r < rows; r++) {
    map[r] = [];
    for (let c = 0; c < cols; c++) {
      if (r <= 1 || r >= rows - 2) { map[r][c] = 'OPEN'; continue; }
      const rnd = Math.random();
      if      (rnd < 0.22) map[r][c] = 'FOREST';
      else if (rnd < 0.32) map[r][c] = 'HILL';
      else if (rnd < 0.38) map[r][c] = 'VALLEY';
      else                 map[r][c] = 'OPEN';
    }
  }

  const riverCount = cols >= 20 ? 2 : 1;
  const riverRows  = [];

  for (let ri = 0; ri < riverCount; ri++) {
    const horizontal = Math.random() < 0.6;
    if (horizontal) {
      let startRow = Math.floor(rows * 0.3) + Math.floor(Math.random() * rows * 0.4);
      startRow = Math.max(3, Math.min(rows - 4, startRow));
      if (riverRows.some(r => Math.abs(r - startRow) < 3)) continue;
      riverRows.push(startRow);
      let curRow = startRow;
      for (let c = 0; c < cols; c++) {
        if (curRow <= 1 || curRow >= rows - 2) { curRow = startRow; continue; }
        map[curRow][c] = 'RIVER';
        if (c < cols - 1) {
          const d = Math.random();
          if (d < 0.2 && curRow > 3)        curRow--;
          else if (d < 0.4 && curRow < rows-4) curRow++;
        }
      }
      const bridgeCount = Math.max(1, Math.floor(cols / 10));
      const bridgeCols  = new Set();
      while (bridgeCols.size < bridgeCount)
        bridgeCols.add(Math.floor(cols*0.2) + Math.floor(Math.random()*cols*0.6));
      for (const bc of bridgeCols) {
        for (let r = 2; r < rows-2; r++) {
          if (map[r][bc] === 'RIVER') { map[r][bc] = 'BRIDGE'; break; }
        }
      }
    } else {
      let startCol = Math.floor(cols*0.2) + Math.floor(Math.random()*cols*0.6);
      startCol = Math.max(2, Math.min(cols-3, startCol));
      let curCol = startCol;
      for (let r = 2; r < rows-2; r++) {
        map[r][curCol] = 'RIVER';
        if (r < rows-3) {
          const d = Math.random();
          if (d < 0.2 && curCol > 2)         curCol--;
          else if (d < 0.4 && curCol < cols-3) curCol++;
        }
      }
      const bridgeCount = Math.max(1, Math.floor(rows/10));
      const bRows = new Set();
      while (bRows.size < bridgeCount)
        bRows.add(3 + Math.floor(Math.random()*(rows-6)));
      for (const br of bRows) {
        for (let c = 0; c < cols; c++) {
          if (map[br][c] === 'RIVER') { map[br][c] = 'BRIDGE'; break; }
        }
      }
    }
  }
  return map;
}

function _calcSpawn(count, side, cols, rows) {
  const result   = [];
  const spawnRow = side === 'ally' ? rows - 2 : 1;
  const step     = Math.floor(cols / (count + 1));
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

/* ═══════════════════════════════════════════════════
   카메라 파라미터 — 맵 크기별 자동 계산
   ★ 핵심 수정: worldSize × 배율을 맵 크기에 따라 줄임
   ═══════════════════════════════════════════════════ */
function _calcCameraParams(TILE_W, cols, rows) {
  const mapSize  = Math.max(cols, rows);
  const worldW   = cols * TILE_W;
  const worldH   = rows * TILE_W;
  const maxWorld = Math.max(worldW, worldH);

  // 맵 크기별 거리·높이 배율 조정
  // 소형(≤20): 0.65/0.55, 중형(21~60): 0.55/0.45, 대형(>60): 0.45/0.38
  let distMul, heightMul, fov;
  if (mapSize <= 20) {
    distMul   = 0.65; heightMul = 0.55; fov = 55;
  } else if (mapSize <= 60) {
    distMul   = 0.58; heightMul = 0.48; fov = 60;
  } else if (mapSize <= 120) {
    distMul   = 0.52; heightMul = 0.42; fov = 65;
  } else {
    distMul   = 0.46; heightMul = 0.36; fov = 70;
  }

  const camDist   = maxWorld * distMul;
  const camHeight = maxWorld * heightMul;

  return { camDist, camHeight, fov };
}

class GameScene {
  constructor(container) {
    this.container = container;
    this.renderer  = this.scene3d = this.camera = this.controls = this.raycaster = null;
    this.gridMap   = null;
    this.squads    = []; this.selectedSquad = null; this.pendingCmds = [];
    this.phase     = 'INPUT';
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
    this._initScene();
    this._initSystems();
    this._setupInput();
    window.addEventListener('resize', this._onResize.bind(this));
    window.gameScene = this;
    this.turnManager.startInputPhase();
    const obj      = this._DEMO_OBJECTIVE;
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
    const w = this.container.clientWidth  || window.innerWidth  || 800;
    const h = this.container.clientHeight || window.innerHeight || 600;
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);
    console.log(`[GameScene] Renderer: ${w}×${h}`);
  }

  _initScene() {
    const w = this.container.clientWidth  || window.innerWidth  || 800;
    const h = this.container.clientHeight || window.innerHeight || 600;

    this.scene3d = new THREE.Scene();

    // TILE_W 미리 계산 (GridMap과 동일 공식)
    const WORLD  = 24;
    const tileW  = WORLD / Math.max(CONFIG.GRID_COLS, CONFIG.GRID_ROWS);

    // ★ 맵 크기별 카메라 파라미터
    const { camDist, camHeight, fov } = _calcCameraParams(tileW, CONFIG.GRID_COLS, CONFIG.GRID_ROWS);
    console.log(`[GameScene] tileW:${tileW.toFixed(3)} camDist:${camDist.toFixed(2)} camHeight:${camHeight.toFixed(2)} fov:${fov}`);

    // 포그: 대형 맵에서 너무 짙으면 맵이 안 보이므로 밀도 조정
    const mapSize  = Math.max(CONFIG.GRID_COLS, CONFIG.GRID_ROWS);
    const fogDensity = mapSize <= 20 ? 0.015 : mapSize <= 60 ? 0.008 : 0.004;
    this.scene3d.fog = new THREE.FogExp2(0x040604, fogDensity);

    this.camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, camDist * 6);
    this.camera.position.set(0, camHeight, camDist);
    this.camera.lookAt(0, 0, 0);

    // OrbitControls
    this.controls = null;
    try {
      if (typeof THREE.OrbitControls !== 'undefined') {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        Object.assign(this.controls, {
          target:             new THREE.Vector3(0, 0, 0),
          enableDamping:      true,
          dampingFactor:      0.08,
          minDistance:        tileW * 2,
          maxDistance:        camDist * 3,      // 맵 연동
          maxPolarAngle:      Math.PI / 2.05,
          screenSpacePanning: true,
        });
      }
    } catch (e) {
      console.warn('[GameScene] OrbitControls 없음:', e.message);
    }

    // 조명
    const worldSize = Math.max(CONFIG.GRID_COLS, CONFIG.GRID_ROWS) * tileW;
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

    if (gm._largeMap) {
      this._fogMode = 'canvas';
      this._initFogCanvas();
    } else {
      this._fogMode = 'mesh';
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
    }

    for (const s of this.squads.filter(q => q.side === 'enemy')) {
      const g = _makeTextSprite('?', '#882222');
      g.scale.set(gm.TILE_W * 1.2, gm.TILE_W * 1.2, 1);
      g.visible = false;
      this.scene3d.add(g);
      this._ghostMeshes[s.id] = g;
    }
  }

  _initFogCanvas() {
    const gm   = this.gridMap;
    const cols = CONFIG.GRID_COLS, rows = CONFIG.GRID_ROWS;
    // ★ 대형 맵 성능: 해상도 1px/tile (기존 2px의 절반)
    const RES    = 1;
    const canvas = document.createElement('canvas');
    canvas.width  = cols * RES;
    canvas.height = rows * RES;
    this._fogCtx    = canvas.getContext('2d');
    this._fogTex    = new THREE.CanvasTexture(canvas);
    this._fogResRCP = RES;

    const totalW = cols * gm.TILE_W;
    const totalH = rows * gm.TILE_W;
    const fogGeo = new THREE.PlaneGeometry(totalW, totalH);
    const fogMat = new THREE.MeshBasicMaterial({
      map: this._fogTex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const fogPlane = new THREE.Mesh(fogGeo, fogMat);
    fogPlane.rotation.x = -Math.PI / 2;
    fogPlane.position.set(
      gm.OFFSET_X + totalW / 2 - gm.TILE_W / 2,
      0.3,
      gm.OFFSET_Z + totalH / 2 - gm.TILE_W / 2
    );
    fogPlane.renderOrder = 3;
    this.scene3d.add(fogPlane);
    this._fogPlane = fogPlane;
  }

  _updateFog() {
    if (!this.fog) return;
    this.fog.computeVisible(this.squads.filter(s => s.side === 'ally' && s.alive));
    const gm = this.gridMap;

    if (this._fogMode === 'canvas') {
      const ctx = this._fogCtx;
      const RES = this._fogResRCP;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,0.76)';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      for (let r = 0; r < CONFIG.GRID_ROWS; r++)
        for (let c = 0; c < CONFIG.GRID_COLS; c++)
          if (this.fog.isVisible(c, r))
            ctx.clearRect(c * RES, r * RES, RES, RES);
      this._fogTex.needsUpdate = true;
    } else {
      for (let r = 0; r < CONFIG.GRID_ROWS; r++)
        for (let c = 0; c < CONFIG.GRID_COLS; c++) {
          const m = this._fogMeshes[`${c},${r}`];
          if (m) m.material.opacity = this.fog.isVisible(c, r) ? 0 : 0.76;
        }
    }

    for (const s of this.squads.filter(q => q.side === 'enemy')) {
      const inSight = this.fog.isVisible(s.pos.col, s.pos.row);
      if (s.mesh) s.mesh.visible = s.alive && inSight;
      const ghost = this._ghostMeshes[s.id]; if (!ghost) continue;
      if (inSight && s.alive) {
        this.fog.updateLastKnown(s.id, s.pos);
        ghost.visible = false;
      } else if (s.alive) {
        const lk = this.fog.getLastKnown(s.id);
        if (lk) {
          const wp = gm.toWorld(lk.col, lk.row);
          // 고스트 스프라이트 y: 타일 top + 약간 위
          ghost.position.set(wp.x, wp.y + gm.TILE_W * 0.6, wp.z);
          ghost.visible = true;
        }
      } else {
        ghost.visible = false;
      }
    }
  }

  _drawObjective() {
    const obj = this._DEMO_OBJECTIVE;
    const gm  = this.gridMap;
    const { x, z } = gm.toWorld(obj.col, obj.row);
    const tH  = gm._tileHeight(gm.tiles[obj.row][obj.col].terrain.id);
    const S   = gm.TILE_W * 0.45;
    const pts = [
      new THREE.Vector3(x-S, tH+0.04, z-S),
      new THREE.Vector3(x+S, tH+0.04, z-S),
      new THREE.Vector3(x+S, tH+0.04, z+S),
      new THREE.Vector3(x-S, tH+0.04, z+S),
      new THREE.Vector3(x-S, tH+0.04, z-S),
    ];
    this.scene3d.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffb84d })
    ));
    const TW   = gm.TILE_W;
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
      const cd   = squad._colDef || this._squadColor(squad);
      const card = document.createElement('div');
      card.className     = 'squad-card' + (i === 0 ? ' active' : '');
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
    return { id, side, pos:{col,row}, troops:CONFIG.SQUAD_TROOP_MAX, ap:CONFIG.SQUAD_AP_MAX,
             terrain:CONFIG.TERRAIN.OPEN, alive:true, mesh:null, mat:null, boxMesh:null };
  }
  _squadColor(squad) {
    return squad.side === 'enemy' ? ENEMY_COLOR_DEF : ALLY_COLOR_DEFS[(squad.id-1) % ALLY_COLOR_DEFS.length];
  }

  /* ── 유닛 메시 생성 ──────────────────────────────────────────
     ★ 핵심 수정: group.position.y = tileTopY + boxH/2
        toWorld()는 타일 top 면 y를 반환하므로
        박스의 절반 높이만큼 추가해야 박스가 타일 위에 정확히 놓임
  ─────────────────────────────────────────────────────────── */
  _createMesh(squad) {
    const gm   = this.gridMap;
    const wp   = gm.toWorld(squad.pos.col, squad.pos.row);  // wp.y = tile top 면
    const cd   = this._squadColor(squad);
    const TW   = gm.TILE_W;
    const label = squad.side === 'ally' ? `A${squad.id}` : `E${squad.id - CONFIG.SQUAD_COUNT}`;

    const group = new THREE.Group();

    // 박스 크기
    const bw  = TW * 0.82, bh = TW * 0.55, bd = TW * 0.82;
    const geo = new THREE.BoxGeometry(bw, bh, bd);
    const mat = new THREE.MeshLambertMaterial({ color: cd.hex, transparent: true, opacity: 0.90 });
    const box = new THREE.Mesh(geo, mat);
    box.userData = { squadId: squad.id };
    group.add(box);

    group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: cd.hex, transparent: true, opacity: 0.9 })
    ));

    // 라벨 스프라이트: 대형 맵에서 크기 스케일다운
    const mapSize    = Math.max(CONFIG.GRID_COLS, CONFIG.GRID_ROWS);
    const labelScale = mapSize > 60 ? 0.7 : 1.0;
    const sprite     = _makeSquadLabelSprite(label, cd.css, cd.bg);
    sprite.position.set(0, TW * 1.0, 0);
    sprite.scale.set(TW * 1.6 * labelScale, TW * 0.75 * labelScale, 1);
    sprite.raycast = () => {};
    group.add(sprite);

    // ★ group y = tile top 면 + 박스 절반 높이
    group.position.set(wp.x, wp.y + bh / 2, wp.z);
    group.userData = { squadId: squad.id };
    this.scene3d.add(group);

    squad.mesh    = group;
    squad.mat     = mat;
    squad.boxMesh = box;
    squad._colDef = cd;
    squad._boxH   = bh;  // 이동 애니메이션에서 재사용
  }

  _getSquadsOnTile(col, row, side = null) {
    return this.squads.filter(s => s.alive && s.pos.col===col && s.pos.row===row && (side===null || s.side===side));
  }

  _calcOffsets(count) {
    const D = this.gridMap.TILE_W * 0.5;
    if (count===2) return [{dx:-D,dz:0},{dx:D,dz:0}];
    if (count===3) return [{dx:-D,dz:-D*.5},{dx:D,dz:-D*.5},{dx:0,dz:D*.9}];
    return Array.from({length:count},(_,i)=>({
      dx: i%2===0 ? -D : D,
      dz: (Math.floor(i/2)-(Math.ceil(count/2)-1)/2)*D*1.2,
    }));
  }

  _updateOverlapVisuals() {
    if (!this.scene3d || !this.gridMap) return;
    for (const b of Object.values(this._overlapBadges)) {
      this.scene3d.remove(b); b.material?.map?.dispose(); b.material?.dispose();
    }
    this._overlapBadges = {};

    const TW = this.gridMap.TILE_W;

    // 아군 겹침
    const allyGroups = {};
    for (const s of this.squads.filter(q => q.alive && q.mesh && q.side==='ally')) {
      const key = `${s.pos.col},${s.pos.row}`;
      (allyGroups[key] = allyGroups[key]||[]).push(s);
    }
    for (const [key,list] of Object.entries(allyGroups)) {
      const [col,row] = key.split(',').map(Number);
      const base = this.gridMap.toWorld(col,row);
      if (list.length===1) {
        const s = list[0];
        s.mesh.position.set(base.x, base.y + s._boxH/2, base.z);
      } else {
        const off = this._calcOffsets(list.length);
        list.forEach((s,i) => s.mesh.position.set(base.x+off[i].dx, base.y + s._boxH/2, base.z+off[i].dz));
        const badge = _makeTextSprite(`×${list.length}`, '#ffb84d');
        badge.position.set(base.x, base.y + TW*1.6, base.z);
        badge.scale.set(TW,TW*0.6,1);
        badge.renderOrder = 10;
        this.scene3d.add(badge);
        this._overlapBadges[key] = badge;
      }
    }

    // 적군 겹침 (배지 없음)
    const enemyGroups = {};
    for (const s of this.squads.filter(q => q.alive && q.mesh && q.side==='enemy')) {
      const key = `${s.pos.col},${s.pos.row}`;
      (enemyGroups[key] = enemyGroups[key]||[]).push(s);
    }
    for (const [key,list] of Object.entries(enemyGroups)) {
      const [col,row] = key.split(',').map(Number);
      const base = this.gridMap.toWorld(col,row);
      if (list.length===1) {
        const s = list[0];
        s.mesh.position.set(base.x, base.y + s._boxH/2, base.z);
      } else {
        const off = this._calcOffsets(list.length);
        list.forEach((s,i) => s.mesh.position.set(base.x+off[i].dx, base.y + s._boxH/2, base.z+off[i].dz));
      }
    }
  }

  _showSquadPicker(squads, clientX, clientY) {
    const picker = document.getElementById('squad-picker'); if (!picker) return;
    this._hideSquadPicker();
    const col   = squads[0].pos.col, row = squads[0].pos.row;
    const coord = `${String.fromCharCode(65+(col%26))}-${String(row+1).padStart(2,'0')}`;
    const title = document.createElement('div'); title.className='picker-title';
    title.innerHTML=`<span class="picker-icon">⚡</span> ${coord} 겹침 — 분대 선택`; picker.appendChild(title);
    squads.forEach(squad => {
      const cd    = squad._colDef || this._squadColor(squad);
      const q     = this._quality(squad);
      const hasCmd= !!this.pendingCmds.find(c=>c.squadId===squad.id);
      const qColor= q<50?'#ff4444':q<70?'#ffb84d':cd.css;
      const card  = document.createElement('div');
      card.className = 'picker-card'+(this.selectedSquad?.id===squad.id?' picker-card-selected':'');
      card.innerHTML = `<div class="picker-card-stripe" style="background:${cd.css}"></div><div class="picker-card-content"><div class="picker-card-header"><span class="picker-card-name" style="color:${cd.css}">A${squad.id}분대</span>${hasCmd?`<span class="picker-cmd-tag">명령↑</span>`:''}</div><div class="picker-card-row"><span class="picker-stat-item">병력 <b>${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}</b></span><span class="picker-stat-item">AP <b>${squad.ap}/${CONFIG.SQUAD_AP_MAX}</b></span><span class="picker-stat-item" style="color:${qColor}">통신 <b>${q}%</b></span></div></div><div class="picker-card-arrow">▶</div>`;
      card.addEventListener('click', e=>{ e.stopPropagation(); this._hideSquadPicker(); this.selectSquad(squad); });
      picker.appendChild(card);
    });
    const closeBtn = document.createElement('div'); closeBtn.className='picker-close';
    closeBtn.innerHTML='✕&nbsp;&nbsp;닫기';
    closeBtn.addEventListener('click', e=>{ e.stopPropagation(); this._hideSquadPicker(); });
    picker.appendChild(closeBtn);
    const rect = this.container.getBoundingClientRect();
    const PW=224, PH=48+squads.length*76+38;
    picker.style.left = Math.min(clientX-rect.left+14, rect.width-PW-6)+'px';
    picker.style.top  = Math.min(clientY-rect.top+14,  rect.height-PH-6)+'px';
    picker.style.display='block';
    setTimeout(()=>document.addEventListener('click', this._pickerOutsideHandler), 80);
    chatUI.addLog('SYSTEM',null,`⚠ ${coord} — ${squads.length}개 분대 겹침.`,'system');
  }

  _hideSquadPicker() {
    const p = document.getElementById('squad-picker');
    if (p) { p.style.display='none'; p.innerHTML=''; }
    document.removeEventListener('click', this._pickerOutsideHandler);
  }

  selectSquad(squad) {
    if (this.phase!=='INPUT' || !squad.alive) return;
    this._hideSquadPicker(); this._cancelCmd(squad);
    if (this.selectedSquad?.mesh) {
      if (this.selectedSquad.mat) {
        this.selectedSquad.mat.emissive = new THREE.Color(0);
        this.selectedSquad.mat.opacity  = 0.90;
      }
      this.selectedSquad.mesh.scale.set(1,1,1);
    }
    this.selectedSquad = squad;
    const cd = squad._colDef || this._squadColor(squad);
    squad.mat.emissive = new THREE.Color(cd.emissive);
    squad.mat.opacity  = 1.0;
    squad.mesh.scale.set(1.25,1.25,1.25);
    this.gridMap.clearHighlights();
    this._showMoveTargets(squad);
    this._syncPanel();
    const pos = `${String.fromCharCode(65+(squad.pos.col%26))}-${String(squad.pos.row+1).padStart(2,'0')}`;
    chatUI.addLog('SYSTEM',null,`A${squad.id}분대 선택 — 위치:${pos} | AP:${squad.ap}/${CONFIG.SQUAD_AP_MAX} | 통신:${this._quality(squad)}%`,'system');
  }

  selectSquadById(id) {
    const s = this.squads.find(q => q.side==='ally' && q.id===id);
    if (s) this.selectSquad(s);
  }

  _showMoveTargets(squad) {
    for (let r = 0; r < CONFIG.GRID_ROWS; r++)
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const dist = Math.abs(c-squad.pos.col)+Math.abs(r-squad.pos.row);
        if (dist===0 || dist>squad.ap) continue;
        const cost = this.gridMap.tiles[r][c].terrain.moveCost||1;
        if (cost>squad.ap) continue;
        const stack = this._getSquadsOnTile(c,r,'ally').length;
        this.gridMap.highlightTile(c,r, stack>0?0xffb84d:0x39ff8e, stack>0?0.30:0.18);
      }
    for (const e of this.squads.filter(q=>q.side==='enemy'&&q.alive))
      if (this.combat.inRange(squad.pos, e.pos))
        this.gridMap.highlightTile(e.pos.col, e.pos.row, 0xff4444, 0.38);
  }

  _clearSelection() {
    if (this.selectedSquad?.mat) {
      this.selectedSquad.mat.emissive = new THREE.Color(0);
      this.selectedSquad.mat.opacity  = 0.90;
      this.selectedSquad.mesh.scale.set(1,1,1);
    }
    this.selectedSquad = null;
    this.gridMap.clearHighlights();
    this._syncPanel();
  }

  _issueMove(squad, targetPos) {
    const dist = Math.abs(targetPos.col-squad.pos.col)+Math.abs(targetPos.row-squad.pos.row);
    if (dist===0) return;
    const cost = this.gridMap.tiles[targetPos.row][targetPos.col].terrain.moveCost||1;
    if (cost>squad.ap) { chatUI.addLog('SYSTEM',null,`AP 부족(필요:${cost},보유:${squad.ap})`,'system'); return; }
    if (dist>squad.ap) { chatUI.addLog('SYSTEM',null,`이동 거리 초과(거리:${dist},AP:${squad.ap})`,'system'); return; }
    this._cancelCmd(squad);
    const quality = this._quality(squad);
    if (this.comms.rollMishear(quality)) {
      const res = this.comms.applyMishear({type:'move',squadId:squad.id,targetTile:targetPos,targetPos}, this.squads, squad);
      if (res.distorted) {
        chatUI.showMishear(res.originalText, res.distortedText, res.mishearType);
        if (res.mishearType==='ignore') { chatUI.addLog(`A${squad.id}`,null,'⚡ 명령 미수신 — 대기','system'); this._clearSelection(); return; }
        if (res.mishearType==='attack_instead') {
          const target=this.squads.find(s=>s.id===res.command.targetId&&s.alive);
          if (target&&squad.ap>=1) { this.pendingCmds.push({type:'attack',squadId:squad.id,targetId:target.id}); squad.ap-=1; chatUI.addLog(`A${squad.id}`,null,`⚡ 오청 → E${target.id-CONFIG.SQUAD_COUNT}분대 사격으로 둔갑`); this.gridMap.clearHighlights(); this.gridMap.highlightTile(target.pos.col,target.pos.row,0xff4444,0.50); }
          else { chatUI.addLog(`A${squad.id}`,null,'⚡ 오청(사격 둔갑) — AP 부족으로 대기','system'); }
          this._clearSelection(); return;
        }
        if (res.mishearType==='coord') {
          const dp=res.command.targetTile;
          const dc=this.gridMap.tiles[dp.row][dp.col].terrain.moveCost||1;
          const dd=Math.abs(dp.col-squad.pos.col)+Math.abs(dp.row-squad.pos.row);
          if (dd>0&&dc<=squad.ap&&dd<=squad.ap) {
            this.pendingCmds.push({type:'move',squadId:squad.id,targetPos:dp}); squad.ap-=dc;
            this.gridMap.clearHighlights(); this.gridMap.highlightTile(dp.col,dp.row,0xffb84d,0.50);
            chatUI.addLog(`A${squad.id}`,null,`⚡ 오청 이동 → ${String.fromCharCode(65+(dp.col%26))}-${String(dp.row+1).padStart(2,'0')}`);
          } else { chatUI.addLog(`A${squad.id}`,null,'⚡ 오청 좌표 이동 불가 → 대기','system'); }
          this._clearSelection(); return;
        }
      }
    }
    this.pendingCmds.push({type:'move',squadId:squad.id,targetPos});
    squad.ap-=cost;
    this.gridMap.clearHighlights();
    this.gridMap.highlightTile(targetPos.col,targetPos.row,0x39ff8e,0.50);
    chatUI.addLog(`A${squad.id}`,null,`이동 → ${String.fromCharCode(65+(targetPos.col%26))}-${String(targetPos.row+1).padStart(2,'0')}`);
    this._clearSelection();
  }

  _issueAttack(squad, target) {
    if (!this.combat.inRange(squad.pos,target.pos)) { chatUI.addLog('SYSTEM',null,`사거리 밖(최대${CONFIG.RIFLE_RANGE}타일)`,'system'); return; }
    if (squad.ap<1) { chatUI.addLog('SYSTEM',null,'AP 부족 — 사격 불가','system'); return; }
    this._cancelCmd(squad);
    const quality=this._quality(squad);
    if (this.comms.rollMishear(quality)) {
      const res=this.comms.applyMishear({type:'attack',squadId:squad.id,targetId:target.id},this.squads,squad);
      if (res.distorted&&res.mishearType==='ignore') { chatUI.showMishear(res.originalText,res.distortedText,res.mishearType); chatUI.addLog(`A${squad.id}`,null,'⚡ 사격 명령 미수신 — 대기','system'); this._clearSelection(); return; }
      if (res.distorted) chatUI.showMishear(res.originalText,res.distortedText,res.mishearType);
    }
    this.pendingCmds.push({type:'attack',squadId:squad.id,targetId:target.id});
    squad.ap-=1;
    this.gridMap.clearHighlights();
    this.gridMap.highlightTile(target.pos.col,target.pos.row,0xff4444,0.50);
    chatUI.addLog(`A${squad.id}`,null,`E${target.id-CONFIG.SQUAD_COUNT}분대 사격 명령`);
    this._clearSelection();
  }

  _cancelCmd(squad) {
    const idx=this.pendingCmds.findIndex(c=>c.squadId===squad.id); if (idx<0) return;
    const old=this.pendingCmds[idx];
    if (old.type==='move') squad.ap+=(this.gridMap.tiles[old.targetPos.row][old.targetPos.col].terrain.moveCost||1);
    else if (old.type==='attack') squad.ap+=1;
    this.pendingCmds.splice(idx,1);
  }

  /* ── 이동 애니메이션 ─────────────────────────────────────────
     ★ from/to의 y = 타일 top + boxH/2 를 유지
  ─────────────────────────────────────────────────────────── */
  moveSquadTo(squad, targetPos, onDone) {
    const gm   = this.gridMap;
    const fromWP = gm.toWorld(squad.pos.col, squad.pos.row);
    const toWP   = gm.toWorld(targetPos.col, targetPos.row);
    const bh     = squad._boxH || gm.TILE_W * 0.55;

    const from = { x: squad.mesh.position.x, y: fromWP.y + bh/2, z: squad.mesh.position.z };
    const to   = { x: toWP.x,                y: toWP.y   + bh/2, z: toWP.z };

    this._animations.push({
      type: 'move', squad, from, to, duration: 0.32, elapsed: 0,
      onComplete: () => {
        squad.pos     = { ...targetPos };
        squad.terrain = gm.tiles[targetPos.row][targetPos.col].terrain;
        squad.mesh.position.set(to.x, to.y, to.z);
        this._updateOverlapVisuals();
        if (onDone) onDone();
      },
    });
  }

  applyHit(attacker, target) {
    const terrain = this.gridMap.tiles[target.pos.row][target.pos.col].terrain;
    const hit     = this.combat.rollHit(attacker.pos, target.pos, terrain);
    const aLbl    = attacker.side==='ally' ? `A${attacker.id}` : `E${attacker.id-CONFIG.SQUAD_COUNT}`;
    const tLbl    = target.side==='ally' ? `A${target.id}분대` : `E${target.id-CONFIG.SQUAD_COUNT}분대`;
    if (hit) {
      target.troops = Math.max(0, target.troops-1);
      chatUI.addLog(aLbl, null, `${tLbl} 명중! (잔여:${target.troops}명)`);
      if (target.mat) {
        let n=0;
        const flash=()=>{
          if (!target.mat) return;
          target.mat.opacity=n++%2===0?0.15:0.90;
          if (n<6) setTimeout(flash,90); else target.mat.opacity=0.90;
        };
        flash();
      }
      if (target.troops<=0) {
        target.alive=false;
        setTimeout(()=>{ if(target.mesh) target.mesh.visible=false; this._updateOverlapVisuals(); }, 590);
        chatUI.addLog('SYSTEM',null,`${tLbl} 전멸`,'system');
      }
    } else {
      chatUI.addLog(aLbl, null, '사격 — 빗나감');
    }
  }

  _syncPanel() {
    const allies = this.squads.filter(s => s.side==='ally');
    document.querySelectorAll('.squad-card').forEach(card => {
      const sid   = parseInt(card.dataset.squadId);
      const squad = allies.find(s => s.id===sid); if (!squad) return;
      const spans = card.querySelectorAll('.squad-troops span');
      if (spans[0]) spans[0].textContent=`${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}`;
      if (spans[1]) spans[1].textContent=`${squad.ap}/${CONFIG.SQUAD_AP_MAX}`;
      const q    = this._quality(squad);
      const fill = card.querySelector('.stat-fill'), cVal=card.querySelector('.comms-val');
      if (fill) { fill.style.width=q+'%'; fill.className='stat-fill'+(q<50?' crit':q<CONFIG.COMMS_QUALITY_THRESHOLD?' warn':''); }
      if (cVal) cVal.textContent=q+'%';
      const tag    = card.querySelector('.squad-status-tag');
      const hasCmd = !!this.pendingCmds.find(c=>c.squadId===squad.id);
      const stack  = squad.alive ? this._getSquadsOnTile(squad.pos.col,squad.pos.row,'ally').length : 0;
      if (tag) {
        if (!squad.alive)                    { tag.textContent='전멸';  tag.className='squad-status-tag combat'; }
        else if (q<40)                        { tag.textContent='통신두절'; tag.className='squad-status-tag nocomms'; }
        else if (this.selectedSquad?.id===squad.id) { tag.textContent='선택됨'; tag.className='squad-status-tag moving'; }
        else if (hasCmd)                      { tag.textContent='명령↑'; tag.className='squad-status-tag moving'; }
        else if (stack>1)                     { tag.textContent=`겹침(${stack})`; tag.className='squad-status-tag nocomms'; }
        else                                  { tag.textContent='대기';  tag.className='squad-status-tag'; }
      }
      const cd = squad._colDef||this._squadColor(squad);
      card.style.borderLeft=`3px solid ${cd.css}`;
      card.classList.toggle('active', this.selectedSquad?.id===squad.id);
    });
    const allyInValley = this.squads.some(s=>s.side==='ally'&&s.alive&&(s.terrain?.id==='valley'||s.terrain?.id==='river'));
    const tw=document.getElementById('terrain-row'); if(tw) tw.style.display=allyInValley?'':'none';
    const batEl=document.querySelector('.commander-block .resource-val');
    if(batEl){ const b=this.comms.batteryLevel; batEl.textContent=b+'%'; batEl.className='resource-val'+(b<30?' crit':b<50?' warn':''); }
  }

  _quality(squad) {
    return this.comms ? Math.round(this.comms.calcQuality({ terrain: squad.terrain })) : 100;
  }

  _setupInput() {
    const cv = this.renderer.domElement; cv.style.pointerEvents='auto';
    cv.addEventListener('pointerdown', e=>{ this._mouseDownPos={x:e.clientX,y:e.clientY}; });
    cv.addEventListener('pointerup', e=>{
      if (!this._mouseDownPos) return;
      const dx=Math.abs(e.clientX-this._mouseDownPos.x), dy=Math.abs(e.clientY-this._mouseDownPos.y);
      this._mouseDownPos=null;
      if (dx<6&&dy<6) this._onCanvasClick(e);
    });
    cv.addEventListener('pointermove', e=>{
      const hit=this._raycastTile(e);
      if (hit) {
        const el=document.getElementById('hud-coord');
        if(el) el.textContent=`${String.fromCharCode(65+(hit.col%26))}-${String(hit.row+1).padStart(2,'0')}`;
      }
    });
  }

  _onCanvasClick(e) {
    if (this.phase!=='INPUT') return; this._hideSquadPicker();
    const mouse=this._toNDC(e); this.raycaster.setFromCamera(mouse, this.camera);

    const hits=this.raycaster.intersectObjects(
      this.squads.filter(s=>s.alive&&s.boxMesh).map(s=>s.boxMesh), false
    );
    if (hits.length>0) {
      const {squadId}=hits[0].object.userData;
      const clicked=this.squads.find(s=>s.id===squadId&&s.alive);
      if (clicked) {
        if (clicked.side==='ally') {
          const coloc=this._getSquadsOnTile(clicked.pos.col,clicked.pos.row,'ally');
          if (coloc.length>1) { this._showSquadPicker(coloc,e.clientX,e.clientY); return; }
          else { this.selectSquad(clicked); return; }
        }
        if (this.selectedSquad) { this._issueAttack(this.selectedSquad,clicked); return; }
      }
    }

    let col, row;
    if (this.gridMap._largeMap) {
      const gridCoord=this._raycastToGrid(e);
      if (!gridCoord) return;
      col=gridCoord.col; row=gridCoord.row;
    } else {
      const tHits=this.raycaster.intersectObjects(this.gridMap.getTileMeshes());
      if (tHits.length===0) return;
      col=tHits[0].object.userData.col;
      row=tHits[0].object.userData.row;
    }
    if (col===undefined||row===undefined) return;

    const allies=this._getSquadsOnTile(col,row,'ally');
    if (allies.length>1) { this._showSquadPicker(allies,e.clientX,e.clientY); return; }
    if (allies.length===1) { this.selectSquad(allies[0]); return; }
    if (!this.selectedSquad) return;
    const enemy=this.squads.find(q=>q.side==='enemy'&&q.alive&&q.pos.col===col&&q.pos.row===row);
    if (enemy) { this._issueAttack(this.selectedSquad,enemy); return; }
    this._issueMove(this.selectedSquad,{col,row});
  }

  _raycastToGrid(e) {
    this.raycaster.setFromCamera(this._toNDC(e), this.camera);
    const ray=this.raycaster.ray;
    if (Math.abs(ray.direction.y)<0.0001) return null;
    const t=-ray.origin.y/ray.direction.y;
    if (t<0) return null;
    const wx=ray.origin.x+t*ray.direction.x;
    const wz=ray.origin.z+t*ray.direction.z;
    return this.gridMap.worldToGrid(wx,wz);
  }

  _toNDC(e) {
    const r=this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  }
  _raycastTile(e) {
    this.raycaster.setFromCamera(this._toNDC(e), this.camera);
    if (this.gridMap._largeMap) return this._raycastToGrid(e);
    const h=this.raycaster.intersectObjects(this.gridMap.getTileMeshes());
    return h.length ? h[0].object.userData : null;
  }
  _onResize() {
    const w=this.container.clientWidth, h=this.container.clientHeight;
    if (!w||!h) return;
    this.camera.aspect=w/h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h);
  }

  _updateAnimations(delta) {
    const done=[];
    for (const a of this._animations) {
      a.elapsed+=delta;
      const t=Math.min(a.elapsed/a.duration,1);
      const e=t<0.5?2*t*t:-1+(4-2*t)*t;
      if (a.type==='move') {
        a.squad.mesh.position.x=a.from.x+(a.to.x-a.from.x)*e;
        a.squad.mesh.position.z=a.from.z+(a.to.z-a.from.z)*e;
        // y: 직선 보간 + sin 아치 (이동 연출, 목적지 y에 수렴)
        const baseY   = a.from.y + (a.to.y - a.from.y) * e;
        const archH   = (this.gridMap?.TILE_W || 0.3) * 0.8;
        a.squad.mesh.position.y = baseY + Math.sin(Math.PI * t) * archH;
      }
      if (t>=1) { done.push(a); a.onComplete?.(); }
    }
    this._animations=this._animations.filter(a=>!done.includes(a));
  }

  _tick(ts) {
    requestAnimationFrame(this._tick.bind(this));
    const now=ts||0, delta=Math.min((now-(this._lastTime||now))/1000, 0.1);
    this._lastTime=now;
    this._updateAnimations(delta);
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene3d, this.camera);
  }
}
