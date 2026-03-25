/* ============================================================
   GameScene.js — Three.js 3D 메인 게임 씬
   Phaser 대체: Three.js WebGLRenderer + OrbitControls + Raycaster
   공개 API(squads, pendingCmds, phase, moveSquadTo, applyHit, _syncPanel)는
   TurnManager / HUD 와의 연동을 위해 동일하게 유지.
   ============================================================ */

/* ── 데모 맵 레이아웃 (8×8) ── */
const DEMO_MAP = [
  ['OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN'],  // row 0  적 시작
  ['OPEN',  'FOREST','FOREST','OPEN',  'OPEN',  'HILL',  'HILL',  'OPEN'],  // row 1
  ['OPEN',  'FOREST','OPEN',  'OPEN',  'OPEN',  'OPEN',  'HILL',  'OPEN'],  // row 2
  ['VALLEY','VALLEY','VALLEY','VALLEY','VALLEY','VALLEY','VALLEY','VALLEY'],  // row 3  ← 오청 핵심
  ['OPEN',  'OPEN',  'FOREST','OPEN',  'OPEN',  'FOREST','OPEN',  'OPEN'],  // row 4
  ['OPEN',  'HILL',  'OPEN',  'OPEN',  'OPEN',  'OPEN',  'HILL',  'OPEN'],  // row 5
  ['OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN'],  // row 6
  ['OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN',  'OPEN'],  // row 7  아군 시작
];

const DEMO_OBJECTIVE = { col: 3, row: 3 }; // D-04 계곡 중앙

const ALLY_SPAWN  = [{ id:1, col:1, row:7 }, { id:2, col:3, row:7 }, { id:3, col:6, row:7 }];
const ENEMY_SPAWN = [{ id:4, col:1, row:0 }, { id:5, col:4, row:0 }, { id:6, col:6, row:0 }];

/* ============================================================ */

class GameScene {

  /** @param {HTMLElement} container */
  constructor(container) {
    this.container = container;

    // Three.js 핵심
    this.renderer  = null;
    this.scene3d   = null;
    this.camera    = null;
    this.controls  = null;
    this.raycaster = null;

    // 게임 상태 (TurnManager 연동용 공개 프로퍼티)
    this.gridMap        = null;
    this.squads         = [];
    this.selectedSquad  = null;
    this.pendingCmds    = [];   // { squadId, type, targetPos | targetId }
    this.phase          = 'INPUT';
    this.turnManager    = null;
    this.comms          = null;
    this.combat         = null;
    this.enemyAI        = null;

    // 애니메이션 큐
    this._animations    = [];
    this._lastTime      = null;

    // 마우스 클릭 vs 드래그 구분
    this._mouseDownPos  = null;
  }

  /* ── 초기화 진입점 ── */
  init() {
    this._initRenderer();
    this._initScene();
    this._initSystems();
    this._setupInput();
    window.addEventListener('resize', this._onResize.bind(this));

    window.gameScene = this;

    // 첫 턴 시작
    this.turnManager.startInputPhase();
    chatUI.addLog('OC/T',   null, '훈련 개시. 목표: 계곡 중앙 점령 (D-04). 분대를 선택하고 이동 타일을 클릭하십시오.');
    chatUI.addLog('SYSTEM', null, '좌측 패널 또는 맵 클릭으로 분대 선택. CONFIRM으로 턴 실행.', 'system');

    this._tick();
  }

  /* ── Three.js 렌더러 생성 ── */
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x040604, 1);

    const w = this.container.clientWidth  || 512;
    const h = this.container.clientHeight || 512;
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);
  }

  /* ── 씬 / 카메라 / 조명 / OrbitControls ── */
  _initScene() {
    const w = this.container.clientWidth  || 512;
    const h = this.container.clientHeight || 512;

    this.scene3d = new THREE.Scene();
    this.scene3d.fog = new THREE.FogExp2(0x040604, 0.07);

    this.camera  = new THREE.PerspectiveCamera(42, w / h, 0.1, 120);
    this.camera.position.set(0, 9, 8);
    this.camera.lookAt(0, 0, 0);

    // OrbitControls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.08;
    this.controls.minDistance    = 3;
    this.controls.maxDistance    = 22;
    this.controls.maxPolarAngle  = Math.PI / 2.05;

    // 조명 (홀로그램 느낌: 어두운 배경 + 초록 포인트 라이트)
    const ambient = new THREE.AmbientLight(0x0a2010, 1.2);
    this.scene3d.add(ambient);

    const pLight = new THREE.PointLight(0x39ff8e, 1.4, 25);
    pLight.position.set(0, 10, 0);
    this.scene3d.add(pLight);

    const pLight2 = new THREE.PointLight(0x2277cc, 0.5, 20);
    pLight2.position.set(-5, 6, 5);
    this.scene3d.add(pLight2);

    this.raycaster = new THREE.Raycaster();
  }

  /* ── 게임 시스템 초기화 + 맵 빌드 ── */
  _initSystems() {
    this.gridMap     = new GridMap(this);
    this.comms       = new CommsSystem();
    this.combat      = new CombatSystem();
    this.enemyAI     = new EnemyAI(new GeminiClient(), new FallbackAI());
    this.turnManager = new TurnManager(this);

    this.gridMap.build(DEMO_MAP);
    this._drawObjective();
    this._initSquads();
  }

  /* ── 목표 지점 시각화 ── */
  _drawObjective() {
    const { x, z } = this.gridMap.toWorld(DEMO_OBJECTIVE.col, DEMO_OBJECTIVE.row);
    const tH = this.gridMap._tileHeight(
      this.gridMap.tiles[DEMO_OBJECTIVE.row][DEMO_OBJECTIVE.col].terrain.id
    );

    // 앰버색 사각 프레임
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

    // 별 스프라이트
    const star = _makeTextSprite('★', '#ffb84d');
    star.position.set(x, tH + 0.65, z);
    star.scale.set(0.7, 0.7, 1);
    this.scene3d.add(star);

    // OBJ 레이블
    const lbl = _makeTextSprite('OBJ', '#ffb84d');
    lbl.position.set(x, tH + 0.22, z);
    lbl.scale.set(0.4, 0.25, 1);
    this.scene3d.add(lbl);
  }

  /* ── 분대 초기화 ── */
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
  }

  _makeSquad(id, side, col, row) {
    return {
      id, side,
      pos:     { col, row },
      troops:  CONFIG.SQUAD_TROOP_MAX,
      ap:      CONFIG.SQUAD_AP_MAX,
      terrain: CONFIG.TERRAIN.OPEN,
      alive:   true,
      mesh:    null,   // THREE.Group
      mat:     null,   // 박스 재질 (플래시 효과용)
    };
  }

  _createMesh(squad) {
    const { x, y, z } = this.gridMap.toWorld(squad.pos.col, squad.pos.row);
    const isAlly = squad.side === 'ally';
    const color  = isAlly ? 0x39ff8e : 0xff4444;
    const label  = isAlly ? `A${squad.id}` : `E${squad.id - 3}`;

    const group  = new THREE.Group();

    // 분대 박스
    const geo = new THREE.BoxGeometry(0.40, 0.32, 0.40);
    const mat = new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      opacity: 0.90,
    });
    const box = new THREE.Mesh(geo, mat);
    group.add(box);

    // 박스 엣지
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    group.add(new THREE.LineSegments(edgeGeo, edgeMat));

    // 라벨 스프라이트
    const sprite = _makeTextSprite(label, isAlly ? '#39ff8e' : '#ff4444');
    sprite.position.set(0, 0.42, 0);
    sprite.scale.set(0.55, 0.30, 1);
    group.add(sprite);

    group.position.set(x, y, z);
    group.userData = { squadId: squad.id };
    this.scene3d.add(group);

    squad.mesh = group;
    squad.mat  = mat;
  }

  /* ── 분대 선택 ── */
  selectSquad(squad) {
    if (this.phase !== 'INPUT' || !squad.alive) return;

    // 이전 선택 해제 (원래 크기 + 발광 끔)
    if (this.selectedSquad && this.selectedSquad.mesh) {
      if (this.selectedSquad.mat) {
        this.selectedSquad.mat.emissive = new THREE.Color(0x000000);
        this.selectedSquad.mat.opacity  = 0.90;
      }
      this.selectedSquad.mesh.scale.set(1, 1, 1);
    }

    this.selectedSquad = squad;

    // 선택 분대 강조: 밝은 발광 + 1.2× 스케일
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

  /** 좌측 패널 onclick 연결용 */
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
        this.gridMap.highlightTile(c, r, 0x39ff8e, 0.18);
      }
    }
    // 사거리 내 적 (빨강 하이라이트)
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

    // 오청 판정
    const quality = this._quality(squad);
    let finalPos  = targetPos;
    if (this.comms.rollMishear(quality)) {
      const res = this.comms.applyMishear({ type: 'move', squadId: squad.id, targetTile: targetPos });
      if (res.distorted) {
        finalPos = res.command.targetTile;
        chatUI.showMishear(res.originalText, res.distortedText);
      }
    }

    this.pendingCmds.push({ type: 'move', squadId: squad.id, targetPos: finalPos });
    squad.ap -= cost;

    // 명령 확정 → 선택 해제
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

    // 명령 확정 → 선택 해제
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

  /* ── 분대 이동 애니메이션 (TurnManager 호출) ── */
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
        if (onDone) onDone();
      },
    });
  }

  /* ── 교전 판정 적용 ── */
  applyHit(attacker, target) {
    const targetTerrain = this.gridMap.tiles[target.pos.row][target.pos.col].terrain;
    const hit   = this.combat.rollHit(attacker.pos, target.pos, targetTerrain);
    const aSide = attacker.side === 'ally' ? `A${attacker.id}` : `E${attacker.id - 3}`;
    const tSide = target.side   === 'ally' ? `A${target.id}분대` : `E${target.id - 3}분대`;

    if (hit) {
      target.troops = Math.max(0, target.troops - 1);
      chatUI.addLog(aSide, null, `${tSide} 명중! (잔여: ${target.troops}명)`);

      // 피격 플래시 (setTimeout)
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
        }, 6 * 90 + 50);
        chatUI.addLog('SYSTEM', null, `${tSide} 전멸`, 'system');
      }
    } else {
      chatUI.addLog(aSide, null, `사격 — 빗나감`);
    }
  }

  /* ── 좌측 패널 HTML 동기화 ── */
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
        } else if (this.selectedSquad?.id === squad.id) {
          tag.textContent = '선택됨'; tag.className = 'squad-status-tag moving';
        } else {
          const hasCmd = this.pendingCmds.find(c => c.squadId === squad.id);
          tag.textContent = hasCmd ? '명령↑' : '대기';
          tag.className   = hasCmd ? 'squad-status-tag moving' : 'squad-status-tag';
        }
      }

      card.classList.toggle('active', this.selectedSquad?.id === squad.id);
    });

    const batEl = document.querySelector('.commander-block .resource-val');
    if (batEl) {
      const batt = this.comms.batteryLevel;
      batEl.textContent = batt + '%';
      batEl.className   = 'resource-val' + (batt < 30 ? ' crit' : batt < 50 ? ' warn' : '');
    }
  }

  /* ── 통신 품질 계산 헬퍼 ── */
  _quality(squad) {
    return this.comms ? Math.round(this.comms.calcQuality({ terrain: squad.terrain })) : 100;
  }

  /* ── 입력 설정 (마우스 클릭 + HUD 좌표) ── */
  _setupInput() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      this._mouseDownPos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mouseup', (e) => {
      if (!this._mouseDownPos) return;
      const dx = Math.abs(e.clientX - this._mouseDownPos.x);
      const dy = Math.abs(e.clientY - this._mouseDownPos.y);
      this._mouseDownPos = null;
      if (dx < 5 && dy < 5) this._onCanvasClick(e);
    });

    canvas.addEventListener('mousemove', (e) => {
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
    const mouse = this._toNDC(e);
    this.raycaster.setFromCamera(mouse, this.camera);

    // ① 분대 메시 우선 레이캐스트 (Group 자식 포함)
    const aliveMeshes = this.squads
      .filter(s => s.alive && s.mesh)
      .map(s => s.mesh);
    const squadHits = this.raycaster.intersectObjects(aliveMeshes, true);
    if (squadHits.length > 0) {
      // 부모 Group의 squadId를 탐색
      let obj = squadHits[0].object;
      while (obj && obj.userData.squadId === undefined && obj.parent) {
        obj = obj.parent;
      }
      const squadId = obj && obj.userData.squadId;
      if (squadId !== undefined) {
        const clicked = this.squads.find(s => s.id === squadId && s.alive);
        if (clicked) {
          if (clicked.side === 'ally') { this.selectSquad(clicked); return; }
          if (this.selectedSquad)      { this._issueAttack(this.selectedSquad, clicked); return; }
        }
      }
    }

    // ② 타일 평면 레이캐스트 (빈 타일 이동 or 위치 기반 적 선택)
    const tileHits = this.raycaster.intersectObjects(this.gridMap.getTileMeshes());
    if (tileHits.length === 0) return;
    const { col, row } = tileHits[0].object.userData;

    // 타일 좌표로 분대 재확인 (분대 박스가 가려진 경우 보완)
    const allyOnTile = this.squads.find(
      q => q.side === 'ally' && q.alive && q.pos.col === col && q.pos.row === row
    );
    if (allyOnTile) { this.selectSquad(allyOnTile); return; }

    if (!this.selectedSquad) return;

    const enemyOnTile = this.squads.find(
      q => q.side === 'enemy' && q.alive && q.pos.col === col && q.pos.row === row
    );
    if (enemyOnTile) { this._issueAttack(this.selectedSquad, enemyOnTile); return; }

    this._issueMove(this.selectedSquad, { col, row });
  }

  /** 마우스 이벤트 → NDC [-1,1] 변환 */
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

  /* ── 창 크기 변경 대응 ── */
  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /* ── 애니메이션 큐 처리 ── */
  _updateAnimations(delta) {
    const done = [];
    for (const anim of this._animations) {
      anim.elapsed += delta;
      const raw  = Math.min(anim.elapsed / anim.duration, 1);
      const ease = raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw;

      if (anim.type === 'move') {
        anim.squad.mesh.position.x = anim.from.x + (anim.to.x - anim.from.x) * ease;
        anim.squad.mesh.position.z = anim.from.z + (anim.to.z - anim.from.z) * ease;
        // 이동 아크
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

  /* ── 메인 렌더 루프 ── */
  _tick(timestamp) {
    requestAnimationFrame(this._tick.bind(this));

    const ts    = timestamp || 0;
    const delta = Math.min((ts - (this._lastTime || ts)) / 1000, 0.1);
    this._lastTime = ts;

    this._updateAnimations(delta);
    this.controls.update();
    this.renderer.render(this.scene3d, this.camera);
  }
}
