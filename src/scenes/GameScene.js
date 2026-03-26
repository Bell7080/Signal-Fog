/* ============================================================
   GameScene.js — Three.js 3D 메인 게임 씬
   변경: 같은 타일 분대 겹침 시각화 + 분대 선택 피커 추가
   ============================================================ */

function _generateMap() {
  const rows = CONFIG.GRID_ROWS;
  const cols = CONFIG.GRID_COLS;
  const map  = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      let t;
      if (r <= 1 || r >= rows - 2)     t = 'OPEN';
      else if (r === 7 || r === 8)     t = 'VALLEY';
      else {
        const rnd = Math.random();
        if (rnd < 0.25)      t = 'FOREST';
        else if (rnd < 0.42) t = 'HILL';
        else                  t = 'OPEN';
      }
      row.push(t);
    }
    map.push(row);
  }
  return map;
}

const DEMO_OBJECTIVE = { col: 6, row: 7 };
const ALLY_SPAWN  = [{ id:1, col:2, row:15 }, { id:2, col:6, row:15 }, { id:3, col:10, row:15 }];
const ENEMY_SPAWN = [{ id:4, col:2, row:0  }, { id:5, col:6, row:0  }, { id:6, col:10, row:0  }];

/* ============================================================ */

class GameScene {

  constructor(container) {
    this.container = container;

    this.renderer  = null;
    this.scene3d   = null;
    this.camera    = null;
    this.controls  = null;
    this.raycaster = null;

    this.gridMap        = null;
    this.squads         = [];
    this.selectedSquad  = null;
    this.pendingCmds    = [];
    this.phase          = 'INPUT';
    this.turnManager    = null;
    this.comms          = null;
    this.combat         = null;
    this.enemyAI        = null;

    this._animations    = [];
    this._lastTime      = null;
    this._mouseDownPos  = null;

    this.fog          = null;
    this._fogMeshes   = {};
    this._ghostMeshes = {};

    // ── 겹침 관련 ──
    this._overlapBadges = {};   // 'col,row' → THREE.Sprite (×N 뱃지)
    this._pickerOutsideHandler = (e) => {
      const picker = document.getElementById('squad-picker');
      if (picker && !picker.contains(e.target)) {
        this._hideSquadPicker();
      }
    };
  }

  /* ── 초기화 ── */
  init() {
    this._initRenderer();
    this._initScene();
    this._initSystems();
    this._setupInput();
    window.addEventListener('resize', this._onResize.bind(this));
    window.gameScene = this;
    this.turnManager.startInputPhase();
    chatUI.addLog('OC/T',   null, '훈련 개시. 목표: 계곡 중앙 점령 (G-08). 분대를 선택하고 이동 타일을 클릭하십시오.');
    chatUI.addLog('SYSTEM', null, '좌측 패널 또는 맵 클릭으로 분대 선택. CONFIRM으로 턴 실행.', 'system');
    this._tick();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x040604, 1);
    const w = this.container.clientWidth  || 512;
    const h = this.container.clientHeight || 512;
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);
  }

  _initScene() {
    const w = this.container.clientWidth  || 512;
    const h = this.container.clientHeight || 512;

    this.scene3d = new THREE.Scene();
    this.scene3d.fog = new THREE.FogExp2(0x040604, 0.03);

    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 200);
    this.camera.position.set(0, 26, 24);
    this.camera.lookAt(0, 0, 0);

    try {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.set(0, 0, 0);
      this.controls.enableDamping  = true;
      this.controls.dampingFactor  = 0.08;
      this.controls.minDistance    = 5;
      this.controls.maxDistance    = 60;
      this.controls.maxPolarAngle  = Math.PI / 2.05;
    } catch (e) {
      console.warn('[Signal-Fog] OrbitControls 초기화 실패:', e.message);
      this.controls = null;
    }

    const ambient = new THREE.AmbientLight(0x0a2010, 1.2);
    this.scene3d.add(ambient);
    const pLight = new THREE.PointLight(0x39ff8e, 1.4, 60);
    pLight.position.set(0, 12, 0);
    this.scene3d.add(pLight);
    const pLight2 = new THREE.PointLight(0x2277cc, 0.5, 45);
    pLight2.position.set(-7, 8, 7);
    this.scene3d.add(pLight2);

    this.raycaster = new THREE.Raycaster();
  }

  _initSystems() {
    this.gridMap     = new GridMap(this);
    this.comms       = new CommsSystem();
    this.combat      = new CombatSystem();
    this.enemyAI     = new EnemyAI(new GeminiClient(), new FallbackAI());
    this.turnManager = new TurnManager(this);

    this.gridMap.build(_generateMap());
    this._drawObjective();
    this._initSquads();
    this._initFog();
    this._updateFog();
  }

  _initFog() {
    this.fog = new FogOfWar(this.gridMap);
    const s3 = this.scene3d;
    const gm = this.gridMap;

    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const h  = gm._tileHeight(gm.tiles[r][c].terrain.id);
        const wx = c * gm.TILE_W + gm.OFFSET_X;
        const wz = r * gm.TILE_W + gm.OFFSET_Z;

        const geo = new THREE.PlaneGeometry(gm.TILE_W, gm.TILE_W);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x000000, transparent: true, opacity: 0,
          depthWrite: false, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(wx, h + 0.06, wz);
        mesh.renderOrder = 3;
        s3.add(mesh);
        this._fogMeshes[`${c},${r}`] = mesh;
      }
    }

    for (const squad of this.squads.filter(s => s.side === 'enemy')) {
      const ghost = _makeTextSprite('?', '#882222');
      ghost.scale.set(0.7, 0.7, 1);
      ghost.visible = false;
      s3.add(ghost);
      this._ghostMeshes[squad.id] = ghost;
    }
  }

  _updateFog() {
    if (!this.fog) return;
    const allySquads = this.squads.filter(s => s.side === 'ally' && s.alive);
    this.fog.computeVisible(allySquads);
    const gm = this.gridMap;

    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const m = this._fogMeshes[`${c},${r}`];
        if (m) m.material.opacity = this.fog.isVisible(c, r) ? 0 : 0.76;
      }
    }

    for (const squad of this.squads.filter(s => s.side === 'enemy')) {
      const inSight = this.fog.isVisible(squad.pos.col, squad.pos.row);
      if (squad.mesh) squad.mesh.visible = squad.alive && inSight;

      const ghost = this._ghostMeshes[squad.id];
      if (!ghost) continue;

      if (inSight && squad.alive) {
        this.fog.updateLastKnown(squad.id, squad.pos);
        ghost.visible = false;
      } else if (squad.alive) {
        const lk = this.fog.getLastKnown(squad.id);
        if (lk) {
          const wp = gm.toWorld(lk.col, lk.row);
          ghost.position.set(wp.x, wp.y + 0.38, wp.z);
          ghost.visible = true;
        }
      } else {
        ghost.visible = false;
      }
    }
  }

  _drawObjective() {
    const { x, z } = this.gridMap.toWorld(DEMO_OBJECTIVE.col, DEMO_OBJECTIVE.row);
    const tH = this.gridMap._tileHeight(
      this.gridMap.tiles[DEMO_OBJECTIVE.row][DEMO_OBJECTIVE.col].terrain.id
    );
    const pts = [
      new THREE.Vector3(x - 0.46, tH + 0.04, z - 0.46),
      new THREE.Vector3(x + 0.46, tH + 0.04, z - 0.46),
      new THREE.Vector3(x + 0.46, tH + 0.04, z + 0.46),
      new THREE.Vector3(x - 0.46, tH + 0.04, z + 0.46),
      new THREE.Vector3(x - 0.46, tH + 0.04, z - 0.46),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffb84d, linewidth: 2 });
    this.scene3d.add(new THREE.Line(geo, mat));

    const star = _makeTextSprite('★', '#ffb84d');
    star.position.set(x, tH + 0.65, z);
    star.scale.set(0.7, 0.7, 1);
    this.scene3d.add(star);

    const lbl = _makeTextSprite('OBJ', '#ffb84d');
    lbl.position.set(x, tH + 0.22, z);
    lbl.scale.set(0.4, 0.25, 1);
    this.scene3d.add(lbl);
  }

  _initSquads() {
    for (const d of ALLY_SPAWN) {
      const s = this._makeSquad(d.id, 'ally', d.col, d.row);
      this.squads.push(s);
      this._createMesh(s);
    }
    for (const d of ENEMY_SPAWN) {
      const s = this._makeSquad(d.id, 'enemy', d.col, d.row);
      this.squads.push(s);
      this._createMesh(s);
    }
    this._syncPanel();
    this._updateOverlapVisuals();
  }

  _makeSquad(id, side, col, row) {
    return {
      id, side,
      pos:     { col, row },
      troops:  CONFIG.SQUAD_TROOP_MAX,
      ap:      CONFIG.SQUAD_AP_MAX,
      terrain: CONFIG.TERRAIN.OPEN,
      alive:   true,
      mesh:    null,
      mat:     null,
      boxMesh: null,
    };
  }

  _createMesh(squad) {
    const { x, y, z } = this.gridMap.toWorld(squad.pos.col, squad.pos.row);
    const isAlly = squad.side === 'ally';
    const color  = isAlly ? 0x39ff8e : 0xff4444;
    const label  = isAlly ? `A${squad.id}` : `E${squad.id - 3}`;

    const group = new THREE.Group();

    const geo = new THREE.BoxGeometry(0.52, 0.38, 0.52);
    const mat = new THREE.MeshLambertMaterial({
      color, transparent: true, opacity: 0.90,
    });
    const box = new THREE.Mesh(geo, mat);
    box.userData = { squadId: squad.id };
    group.add(box);

    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    edgeLines.raycast = () => {};
    group.add(edgeLines);

    const sprite = _makeTextSprite(label, isAlly ? '#39ff8e' : '#ff4444');
    sprite.position.set(0, 0.52, 0);
    sprite.scale.set(0.72, 0.42, 1);
    sprite.raycast = () => {};
    group.add(sprite);

    group.position.set(x, y, z);
    group.userData = { squadId: squad.id };
    this.scene3d.add(group);

    squad.mesh    = group;
    squad.mat     = mat;
    squad.boxMesh = box;
  }

  /* ──────────────────────────────────────────────
     겹침 관련 메서드
  ────────────────────────────────────────────── */

  /**
   * 특정 타일의 분대 목록 반환
   * @param {number} col
   * @param {number} row
   * @param {string|null} side - 'ally' | 'enemy' | null(전체)
   * @returns {Array<object>}
   */
  _getSquadsOnTile(col, row, side = null) {
    return this.squads.filter(s =>
      s.alive &&
      s.pos.col === col && s.pos.row === row &&
      (side === null || s.side === side)
    );
  }

  /**
   * 겹침 오프셋 계산 — count개 분대를 타일 내에 분산 배치
   * @param {number} count
   * @returns {Array<{dx:number, dz:number}>}
   */
  _calcOffsets(count) {
    const d = 0.20;
    if (count === 2) return [
      { dx: -d,  dz: 0  },
      { dx:  d,  dz: 0  },
    ];
    if (count === 3) return [
      { dx: -d,  dz: -d * 0.6 },
      { dx:  d,  dz: -d * 0.6 },
      { dx:  0,  dz:  d * 0.9 },
    ];
    // 4개 이상: 2×2 격자
    return Array.from({ length: count }, (_, i) => ({
      dx: (i % 2 === 0 ? -d : d),
      dz: (Math.floor(i / 2) - (Math.ceil(count / 2) - 1) / 2) * d * 1.2,
    }));
  }

  /**
   * 겹침 시각화 갱신
   * - 동일 타일 분대 → 약간씩 오프셋 + ×N 뱃지
   * - 단독 분대    → 정위치 복귀
   */
  _updateOverlapVisuals() {
    if (!this.scene3d || !this.gridMap) return;

    // 기존 뱃지 제거
    for (const badge of Object.values(this._overlapBadges)) {
      this.scene3d.remove(badge);
      if (badge.material?.map) badge.material.map.dispose();
      badge.material?.dispose();
    }
    this._overlapBadges = {};

    // 살아있는 분대를 타일별로 그룹화
    const tileGroups = {};
    for (const s of this.squads.filter(q => q.alive && q.mesh)) {
      const key = `${s.pos.col},${s.pos.row}`;
      if (!tileGroups[key]) tileGroups[key] = [];
      tileGroups[key].push(s);
    }

    for (const [key, squads] of Object.entries(tileGroups)) {
      const [col, row] = key.split(',').map(Number);
      const base = this.gridMap.toWorld(col, row);

      if (squads.length === 1) {
        // 단독 → 정위치
        squads[0].mesh.position.set(base.x, base.y, base.z);
      } else {
        // 복수 → 오프셋 분산
        const offsets = this._calcOffsets(squads.length);
        squads.forEach((s, i) => {
          s.mesh.position.set(
            base.x + offsets[i].dx,
            base.y,
            base.z + offsets[i].dz
          );
        });

        // ×N 겹침 뱃지 (앰버색 — 위험 표시)
        const badge = _makeTextSprite(`×${squads.length}`, '#ffb84d');
        badge.position.set(base.x, base.y + 0.78, base.z);
        badge.scale.set(0.52, 0.32, 1);
        badge.renderOrder = 10;
        this.scene3d.add(badge);
        this._overlapBadges[key] = badge;
      }
    }
  }

  /* ──────────────────────────────────────────────
     분대 선택 피커 (DOM 오버레이)
  ────────────────────────────────────────────── */

  /**
   * 같은 타일의 아군 분대가 2개 이상일 때 선택 팝업 표시
   * @param {Array<object>} squads - 선택 가능한 분대 목록
   * @param {number} clientX - 마우스 X (컨테이너 기준)
   * @param {number} clientY - 마우스 Y (컨테이너 기준)
   */
  _showSquadPicker(squads, clientX, clientY) {
    const picker = document.getElementById('squad-picker');
    if (!picker) return;

    this._hideSquadPicker();  // 기존 피커 정리

    // 제목
    const title = document.createElement('div');
    title.className = 'picker-title';
    const col = squads[0].pos.col;
    const row = squads[0].pos.row;
    const coord = `${String.fromCharCode(65 + col)}-${String(row + 1).padStart(2, '0')}`;
    title.textContent = `▸ ${coord} 겹침 분대 선택`;
    picker.appendChild(title);

    // 분대별 선택 버튼
    for (const squad of squads) {
      const q    = this._quality(squad);
      const qColor = q < 50 ? 'var(--col-red)' : q < 70 ? 'var(--col-amber)' : 'var(--col-green)';
      const hasCmd = !!this.pendingCmds.find(c => c.squadId === squad.id);

      const item = document.createElement('div');
      item.className = 'picker-item' + (hasCmd ? ' picker-item-cmd' : '');
      item.innerHTML =
        `<span class="picker-id">A${squad.id}분대</span>` +
        `<span class="picker-stat">병력 ${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}</span>` +
        `<span class="picker-stat">AP <strong>${squad.ap}</strong>/${CONFIG.SQUAD_AP_MAX}</span>` +
        `<span class="picker-stat" style="color:${qColor}">통신 ${q}%</span>` +
        (hasCmd ? `<span class="picker-cmd-badge">명령↑</span>` : '');

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this._hideSquadPicker();
        this.selectSquad(squad);
      });
      picker.appendChild(item);
    }

    // 닫기 버튼
    const closeBtn = document.createElement('div');
    closeBtn.className = 'picker-close';
    closeBtn.textContent = '✕ 닫기';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideSquadPicker();
    });
    picker.appendChild(closeBtn);

    // 위치 결정 (컨테이너 기준, 화면 밖으로 나가지 않도록 클램프)
    const rect    = this.container.getBoundingClientRect();
    const rx      = clientX - rect.left;
    const ry      = clientY - rect.top;
    const pH      = 48 + squads.length * 62 + 32; // 예상 높이
    const pW      = 190;

    picker.style.left    = Math.min(rx + 10, rect.width  - pW  - 4) + 'px';
    picker.style.top     = Math.min(ry + 10, rect.height - pH  - 4) + 'px';
    picker.style.display = 'block';

    // 외부 클릭 시 닫기 (setTimeout으로 현재 이벤트 큐 이후 등록)
    setTimeout(() => {
      document.addEventListener('click', this._pickerOutsideHandler);
    }, 120);

    chatUI.addLog('SYSTEM', null,
      `⚠ ${coord} 겹침(${squads.length}개) — 좌측 패널 또는 팝업에서 분대를 선택하십시오`, 'system');
  }

  _hideSquadPicker() {
    const picker = document.getElementById('squad-picker');
    if (picker) {
      picker.style.display = 'none';
      picker.innerHTML = '';
    }
    document.removeEventListener('click', this._pickerOutsideHandler);
  }

  /* ── 분대 선택 ── */
  selectSquad(squad) {
    if (this.phase !== 'INPUT' || !squad.alive) return;

    this._hideSquadPicker();  // 피커가 열려 있으면 닫기
    this._cancelCmd(squad);

    if (this.selectedSquad && this.selectedSquad.mesh) {
      if (this.selectedSquad.mat) {
        this.selectedSquad.mat.emissive = new THREE.Color(0x000000);
        this.selectedSquad.mat.opacity  = 0.90;
      }
      this.selectedSquad.mesh.scale.set(1, 1, 1);
    }

    this.selectedSquad = squad;

    squad.mat.emissive = new THREE.Color(squad.side === 'ally' ? 0x1a7740 : 0x882222);
    squad.mat.opacity  = 1.0;
    squad.mesh.scale.set(1.2, 1.2, 1.2);

    this.gridMap.clearHighlights();
    this._showMoveTargets(squad);
    this._syncPanel();

    const pos = `${String.fromCharCode(65 + squad.pos.col)}-${String(squad.pos.row + 1).padStart(2,'0')}`;
    chatUI.addLog('SYSTEM', null,
      `A${squad.id}분대 선택 — 위치: ${pos} | AP: ${squad.ap}/${CONFIG.SQUAD_AP_MAX} | 통신: ${this._quality(squad)}%`,
      'system');
  }

  selectSquadById(id) {
    const s = this.squads.find(q => q.side === 'ally' && q.id === id);
    if (s) this.selectSquad(s);
  }

  /* ── 이동 가능 타일 하이라이트 ── */
  _showMoveTargets(squad) {
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const dist = Math.abs(c - squad.pos.col) + Math.abs(r - squad.pos.row);
        if (dist === 0 || dist > squad.ap) continue;
        const cost = this.gridMap.tiles[r][c].terrain.moveCost || 1;
        if (cost > squad.ap) continue;
        // 겹침 타일은 노란색으로 구분
        const stackCount = this._getSquadsOnTile(c, r, 'ally').length;
        const hlColor    = stackCount > 0 ? 0xffb84d : 0x39ff8e;
        const hlAlpha    = stackCount > 0 ? 0.30    : 0.18;
        this.gridMap.highlightTile(c, r, hlColor, hlAlpha);
      }
    }
    for (const e of this.squads.filter(q => q.side === 'enemy' && q.alive)) {
      if (this.combat.inRange(squad.pos, e.pos)) {
        this.gridMap.highlightTile(e.pos.col, e.pos.row, 0xff4444, 0.38);
      }
    }
  }

  /* ── 이동 명령 등록 ── */
  _issueMove(squad, targetPos) {
    const dist = Math.abs(targetPos.col - squad.pos.col) + Math.abs(targetPos.row - squad.pos.row);
    if (dist === 0) return;

    const tileTerrain = this.gridMap.tiles[targetPos.row][targetPos.col].terrain;
    const cost = tileTerrain.moveCost || 1;

    if (cost > squad.ap) {
      chatUI.addLog('SYSTEM', null, `AP 부족 (필요: ${cost}, 보유: ${squad.ap})`, 'system'); return;
    }
    if (dist > squad.ap) {
      chatUI.addLog('SYSTEM', null, `이동 거리 초과 (거리: ${dist}, AP: ${squad.ap})`, 'system'); return;
    }

    this._cancelCmd(squad);

    const quality  = this._quality(squad);
    let finalPos   = targetPos;
    if (this.comms.rollMishear(quality)) {
      const res = this.comms.applyMishear({ type: 'move', squadId: squad.id, targetTile: targetPos });
      if (res.distorted) {
        finalPos = res.command.targetTile;
        chatUI.showMishear(res.originalText, res.distortedText);
      }
    }

    this.pendingCmds.push({ type: 'move', squadId: squad.id, targetPos: finalPos });
    squad.ap -= cost;

    // 이동 목적지에 아군 분대가 있으면 겹침 예고 경고
    const futureStack = this._getSquadsOnTile(finalPos.col, finalPos.row, 'ally');
    if (futureStack.length > 0) {
      const coord = `${String.fromCharCode(65 + finalPos.col)}-${String(finalPos.row + 1).padStart(2,'0')}`;
      chatUI.addLog('SYSTEM', null,
        `⚠ A${squad.id}분대 → ${coord} 이동 시 겹침 발생 예정 (이미 A${futureStack.map(s=>`${s.id}`).join('/') }분대 위치)`,
        'system');
    }

    // 선택 해제
    if (this.selectedSquad?.mat) {
      this.selectedSquad.mat.emissive = new THREE.Color(0x000000);
      this.selectedSquad.mat.opacity  = 0.90;
      this.selectedSquad.mesh.scale.set(1, 1, 1);
    }
    this.selectedSquad = null;
    this.gridMap.clearHighlights();
    this.gridMap.highlightTile(finalPos.col, finalPos.row, 0x39ff8e, 0.50);

    const colLbl = String.fromCharCode(65 + finalPos.col);
    const rowLbl = String(finalPos.row + 1).padStart(2, '0');
    if (finalPos.col === targetPos.col && finalPos.row === targetPos.row) {
      chatUI.addLog(`A${squad.id}`, null, `이동 → ${colLbl}-${rowLbl}`);
    }
    this._syncPanel();
  }

  /* ── 공격 명령 등록 ── */
  _issueAttack(squad, target) {
    if (!this.combat.inRange(squad.pos, target.pos)) {
      chatUI.addLog('SYSTEM', null, '사거리 밖 (최대 4타일)', 'system'); return;
    }
    if (squad.ap < 1) {
      chatUI.addLog('SYSTEM', null, 'AP 부족 — 사격 불가', 'system'); return;
    }

    this._cancelCmd(squad);
    this.pendingCmds.push({ type: 'attack', squadId: squad.id, targetId: target.id });
    squad.ap -= 1;

    if (this.selectedSquad?.mat) {
      this.selectedSquad.mat.emissive = new THREE.Color(0x000000);
      this.selectedSquad.mat.opacity  = 0.90;
      this.selectedSquad.mesh.scale.set(1, 1, 1);
    }
    this.selectedSquad = null;
    this.gridMap.clearHighlights();
    this.gridMap.highlightTile(target.pos.col, target.pos.row, 0xff4444, 0.50);
    chatUI.addLog(`A${squad.id}`, null, `E${target.id - 3}분대 사격 명령`);
    this._syncPanel();
  }

  _cancelCmd(squad) {
    const idx = this.pendingCmds.findIndex(c => c.squadId === squad.id);
    if (idx < 0) return;
    const old = this.pendingCmds[idx];
    if (old.type === 'move') {
      const t = this.gridMap.tiles[old.targetPos.row][old.targetPos.col];
      squad.ap += t.terrain.moveCost || 1;
    } else if (old.type === 'attack') {
      squad.ap += 1;
    }
    this.pendingCmds.splice(idx, 1);
  }

  /* ── 분대 이동 애니메이션 ── */
  moveSquadTo(squad, targetPos, onDone) {
    const from = {
      x: squad.mesh.position.x,
      y: squad.mesh.position.y,
      z: squad.mesh.position.z,
    };
    const to = this.gridMap.toWorld(targetPos.col, targetPos.row);

    this._animations.push({
      type: 'move',
      squad,
      from,
      to,
      duration: 0.38,
      elapsed: 0,
      onComplete: () => {
        squad.pos     = { ...targetPos };
        squad.terrain = this.gridMap.tiles[targetPos.row][targetPos.col].terrain;
        squad.mesh.position.set(to.x, to.y, to.z);
        // 이동 완료 후 겹침 시각화 갱신
        this._updateOverlapVisuals();
        if (onDone) onDone();
      },
    });
  }

  /* ── 교전 판정 ── */
  applyHit(attacker, target) {
    const targetTerrain = this.gridMap.tiles[target.pos.row][target.pos.col].terrain;
    const hit   = this.combat.rollHit(attacker.pos, target.pos, targetTerrain);
    const aSide = attacker.side === 'ally' ? `A${attacker.id}` : `E${attacker.id - 3}`;
    const tSide = target.side   === 'ally' ? `A${target.id}분대` : `E${target.id - 3}분대`;

    if (hit) {
      target.troops = Math.max(0, target.troops - 1);
      chatUI.addLog(aSide, null, `${tSide} 명중! (잔여: ${target.troops}명)`);

      if (target.mat) {
        let n = 0;
        const flash = () => {
          if (!target.mat) return;
          target.mat.opacity = n % 2 === 0 ? 0.15 : 0.90;
          n++;
          if (n < 6) setTimeout(flash, 90);
          else target.mat.opacity = 0.90;
        };
        flash();
      }

      if (target.troops <= 0) {
        target.alive = false;
        setTimeout(() => {
          if (target.mesh) target.mesh.visible = false;
          this._updateOverlapVisuals();  // 전멸 후 겹침 갱신
        }, 6 * 90 + 50);
        chatUI.addLog('SYSTEM', null, `${tSide} 전멸`, 'system');
      }
    } else {
      chatUI.addLog(aSide, null, `사격 — 빗나감`);
    }
  }

  /* ── 좌측 패널 동기화 ── */
  _syncPanel() {
    const allySquads = this.squads.filter(s => s.side === 'ally');
    const cards = document.querySelectorAll('.squad-card');

    allySquads.forEach((squad, i) => {
      const card = cards[i];
      if (!card) return;

      const spans = card.querySelectorAll('.squad-troops span');
      if (spans[0]) spans[0].textContent = `${squad.troops} / ${CONFIG.SQUAD_TROOP_MAX}`;
      if (spans[1]) spans[1].textContent = `${squad.ap} / ${CONFIG.SQUAD_AP_MAX}`;

      const q    = this._quality(squad);
      const fill = card.querySelector('.stat-fill');
      const cVal = card.querySelector('.comms-val');
      if (fill) {
        fill.style.width = q + '%';
        fill.className   = 'stat-fill' + (q < 50 ? ' crit' : q < CONFIG.COMMS_QUALITY_THRESHOLD ? ' warn' : '');
      }
      if (cVal) cVal.textContent = q + '%';

      const tag = card.querySelector('.squad-status-tag');
      if (tag) {
        if (!squad.alive) {
          tag.textContent = '전멸'; tag.className = 'squad-status-tag combat';
        } else if (q < 40) {
          tag.textContent = '통신두절'; tag.className = 'squad-status-tag nocomms';
        } else if (this.selectedSquad?.id === squad.id) {
          tag.textContent = '선택됨'; tag.className = 'squad-status-tag moving';
        } else {
          const hasCmd     = this.pendingCmds.find(c => c.squadId === squad.id);
          // ── 겹침 여부 확인 ──
          const stackCount = squad.alive
            ? this._getSquadsOnTile(squad.pos.col, squad.pos.row, 'ally').length
            : 0;

          if (hasCmd) {
            tag.textContent = '명령↑'; tag.className = 'squad-status-tag moving';
          } else if (stackCount > 1) {
            tag.textContent = `겹침(${stackCount})`; tag.className = 'squad-status-tag nocomms';
          } else {
            tag.textContent = '대기'; tag.className = 'squad-status-tag';
          }
        }
      }

      card.classList.toggle('active', this.selectedSquad?.id === squad.id);
    });

    const allyInValley = this.squads.some(
      s => s.side === 'ally' && s.alive && s.terrain?.id === 'valley'
    );
    const terrainWarn = document.getElementById('terrain-row');
    if (terrainWarn) terrainWarn.style.display = allyInValley ? '' : 'none';

    const batEl = document.querySelector('.commander-block .resource-val');
    if (batEl) {
      const batt = this.comms.batteryLevel;
      batEl.textContent = batt + '%';
      batEl.className   = 'resource-val' + (batt < 30 ? ' crit' : batt < 50 ? ' warn' : '');
    }
  }

  _quality(squad) {
    return this.comms ? Math.round(this.comms.calcQuality({ terrain: squad.terrain })) : 100;
  }

  /* ── 입력 설정 ── */
  _setupInput() {
    const canvas = this.renderer.domElement;
    canvas.style.pointerEvents = 'auto';

    canvas.addEventListener('pointerdown', (e) => {
      this._mouseDownPos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!this._mouseDownPos) return;
      const dx = Math.abs(e.clientX - this._mouseDownPos.x);
      const dy = Math.abs(e.clientY - this._mouseDownPos.y);
      this._mouseDownPos = null;
      if (dx < 6 && dy < 6) this._onCanvasClick(e);
    });

    canvas.addEventListener('pointermove', (e) => {
      const hit = this._raycastTile(e);
      if (hit) {
        const el = document.getElementById('hud-coord');
        if (el) {
          el.textContent =
            `${String.fromCharCode(65 + hit.col)}-${String(hit.row + 1).padStart(2,'0')}`;
        }
      }
    });
  }

  _onCanvasClick(e) {
    if (this.phase !== 'INPUT') return;

    // 피커가 열려 있으면 닫기 (캔버스 클릭 = 피커 외부)
    this._hideSquadPicker();

    const mouse = this._toNDC(e);
    this.raycaster.setFromCamera(mouse, this.camera);

    // ① 분대 박스 메시 정밀 레이캐스트
    const boxMeshes = this.squads
      .filter(s => s.alive && s.boxMesh)
      .map(s => s.boxMesh);
    const squadHits = this.raycaster.intersectObjects(boxMeshes, false);
    if (squadHits.length > 0) {
      const { squadId } = squadHits[0].object.userData;
      if (squadId !== undefined) {
        const clicked = this.squads.find(s => s.id === squadId && s.alive);
        if (clicked) {
          if (clicked.side === 'ally') { this.selectSquad(clicked); return; }
          if (this.selectedSquad)      { this._issueAttack(this.selectedSquad, clicked); return; }
        }
      }
    }

    // ② 타일 평면 레이캐스트
    const tileHits = this.raycaster.intersectObjects(this.gridMap.getTileMeshes());
    if (tileHits.length === 0) return;
    const { col, row } = tileHits[0].object.userData;

    // ── 해당 타일의 아군 분대 목록 ──
    const alliesOnTile = this._getSquadsOnTile(col, row, 'ally');

    if (alliesOnTile.length > 1) {
      // 2개 이상 → 피커 표시
      this._showSquadPicker(alliesOnTile, e.clientX, e.clientY);
      return;
    }
    if (alliesOnTile.length === 1) {
      // 단독 → 바로 선택
      this.selectSquad(alliesOnTile[0]);
      return;
    }

    // 아군 없음 → 이동 또는 공격
    if (!this.selectedSquad) return;

    const enemyOnTile = this.squads.find(
      q => q.side === 'enemy' && q.alive && q.pos.col === col && q.pos.row === row
    );
    if (enemyOnTile) { this._issueAttack(this.selectedSquad, enemyOnTile); return; }

    this._issueMove(this.selectedSquad, { col, row });
  }

  _toNDC(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1
    );
  }

  _raycastTile(e) {
    this.raycaster.setFromCamera(this._toNDC(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.gridMap.getTileMeshes());
    if (hits.length === 0) return null;
    const { col, row } = hits[0].object.userData;
    return { col, row };
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _updateAnimations(delta) {
    const done = [];
    for (const anim of this._animations) {
      anim.elapsed += delta;
      const raw  = Math.min(anim.elapsed / anim.duration, 1);
      const ease = raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw;

      if (anim.type === 'move') {
        anim.squad.mesh.position.x = anim.from.x + (anim.to.x - anim.from.x) * ease;
        anim.squad.mesh.position.z = anim.from.z + (anim.to.z - anim.from.z) * ease;
        const arc = Math.sin(Math.PI * raw) * 0.55;
        anim.squad.mesh.position.y =
          anim.from.y + (anim.to.y - anim.from.y) * ease + arc;
      }

      if (raw >= 1) {
        done.push(anim);
        anim.onComplete?.();
      }
    }
    this._animations = this._animations.filter(a => !done.includes(a));
  }

  _tick(timestamp) {
    requestAnimationFrame(this._tick.bind(this));
    const ts    = timestamp || 0;
    const delta = Math.min((ts - (this._lastTime || ts)) / 1000, 0.1);
    this._lastTime = ts;
    this._updateAnimations(delta);
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene3d, this.camera);
  }
}
