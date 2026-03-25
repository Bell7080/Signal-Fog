/* ============================================================
   GameScene.js — Three.js 3D 메인 게임 씬
   Phaser 대체: Three.js WebGLRenderer + OrbitControls + Raycaster
   공개 API(squads, pendingCmds, phase, moveSquadTo, applyHit, _syncPanel)는
   TurnManager / HUD 와의 연동을 위해 동일하게 유지.
   ============================================================ */

/* ── 랜덤 맵 생성 (12×16 소대급 전투 지형) ──
   Row 0~1       : 항상 개활지 (적군 스폰 버퍼)
   Row 14~15     : 항상 개활지 (아군 스폰 버퍼)
   Row 7, 8      : 항상 계곡 — 중앙 통신 음영 지대 (2행)
   Row 2~6, 9~13 : 랜덤 FOREST/HILL/OPEN
*/
function _generateMap() {
  const rows = CONFIG.GRID_ROWS;  // 16
  const cols = CONFIG.GRID_COLS;  // 12
  const map  = [];

  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      let t;
      if (r <= 1 || r >= rows - 2) {
        t = 'OPEN';                               // 스폰 버퍼 — 2행
      } else if (r === 7 || r === 8) {
        t = 'VALLEY';                             // 중앙 계곡 2행 — 통신 장애
      } else {
        const rnd = Math.random();
        if (rnd < 0.25)      t = 'FOREST';       // 수풀 25%
        else if (rnd < 0.42) t = 'HILL';         // 고지 17%
        else                  t = 'OPEN';         // 개활지 58%
      }
      row.push(t);
    }
    map.push(row);
  }
  return map;
}

// G-08: 계곡 중앙 목표지점 (col=6 → 'G', row=7 → '08')
const DEMO_OBJECTIVE = { col: 6, row: 7 };

// 아군: 맨 아래(row=15), 적: 맨 위(row=0) — cols 2·6·10으로 균등 분산
const ALLY_SPAWN  = [{ id:1, col:2, row:15 }, { id:2, col:6, row:15 }, { id:3, col:10, row:15 }];
const ENEMY_SPAWN = [{ id:4, col:2, row:0  }, { id:5, col:6, row:0  }, { id:6, col:10, row:0  }];

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

    // FogOfWar
    this.fog          = null;
    this._fogMeshes   = {};   // 'col,row' → THREE.Mesh (dark overlay)
    this._ghostMeshes = {};   // squadId  → THREE.Sprite (last-known marker)
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
    chatUI.addLog('OC/T',   null, '훈련 개시. 목표: 계곡 중앙 점령 (G-08). 분대를 선택하고 이동 타일을 클릭하십시오.');
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
    this.scene3d.fog = new THREE.FogExp2(0x040604, 0.03);  // 넓은 맵 → 안개 얇게

    this.camera  = new THREE.PerspectiveCamera(48, w / h, 0.1, 200);
    this.camera.position.set(0, 26, 24);
    this.camera.lookAt(0, 0, 0);

    // OrbitControls (로드 실패 시 null — 정적 카메라로 폴백)
    try {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.set(0, 0, 0);
      this.controls.enableDamping  = true;
      this.controls.dampingFactor  = 0.08;
      this.controls.minDistance    = 5;
      this.controls.maxDistance    = 60;
      this.controls.maxPolarAngle  = Math.PI / 2.05;
    } catch (e) {
      console.warn('[Signal-Fog] OrbitControls 초기화 실패 — 정적 카메라 사용:', e.message);
      this.controls = null;
    }

    // 조명 (홀로그램 느낌: 어두운 배경 + 초록 포인트 라이트)
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

  /* ── 게임 시스템 초기화 + 맵 빌드 ── */
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

  /* ── FogOfWar 초기화 — 타일 안개 오버레이 + 적 고스트 메시 생성 ── */
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

    // 적군 고스트 (시야 밖으로 사라진 뒤 마지막 위치 표시)
    for (const squad of this.squads.filter(s => s.side === 'enemy')) {
      const ghost = _makeTextSprite('?', '#882222');
      ghost.scale.set(0.7, 0.7, 1);
      ghost.visible = false;
      s3.add(ghost);
      this._ghostMeshes[squad.id] = ghost;
    }
  }

  /* ── FogOfWar 갱신 — 아군 시야 재계산 후 오버레이·적군 가시성 업데이트 ── */
  _updateFog() {
    if (!this.fog) return;
    const allySquads = this.squads.filter(s => s.side === 'ally' && s.alive);
    this.fog.computeVisible(allySquads);
    const gm = this.gridMap;

    // 타일 안개 오버레이
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const m = this._fogMeshes[`${c},${r}`];
        if (m) m.material.opacity = this.fog.isVisible(c, r) ? 0 : 0.76;
      }
    }

    // 적군 표시·은닉 + 고스트 갱신
    for (const squad of this.squads.filter(s => s.side === 'enemy')) {
      const inSight = this.fog.isVisible(squad.pos.col, squad.pos.row);
      if (squad.mesh) squad.mesh.visible = squad.alive && inSight;

      const ghost = this._ghostMeshes[squad.id];
      if (!ghost) continue;

      if (inSight && squad.alive) {
        // 현재 시야 내 → 마지막 위치 갱신, 고스트 숨김
        this.fog.updateLastKnown(squad.id, squad.pos);
        ghost.visible = false;
      } else if (squad.alive) {
        // 시야 밖 생존 → 마지막 목격 위치에 고스트 표시
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
      mesh:    null,    // THREE.Group
      mat:     null,    // 박스 재질 (플래시 효과용)
      boxMesh: null,    // 정밀 레이캐스팅 전용 박스 메시
    };
  }

  _createMesh(squad) {
    const { x, y, z } = this.gridMap.toWorld(squad.pos.col, squad.pos.row);
    const isAlly = squad.side === 'ally';
    const color  = isAlly ? 0x39ff8e : 0xff4444;
    const label  = isAlly ? `A${squad.id}` : `E${squad.id - 3}`;

    const group = new THREE.Group();

    // 분대 박스 — 레이캐스팅 대상 (squadId 저장)
    const geo = new THREE.BoxGeometry(0.52, 0.38, 0.52);
    const mat = new THREE.MeshLambertMaterial({
      color, transparent: true, opacity: 0.90,
    });
    const box = new THREE.Mesh(geo, mat);
    box.userData = { squadId: squad.id };  // ← 정밀 클릭용 ID
    group.add(box);

    // 박스 엣지 — 레이캐스팅 비활성화
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    edgeLines.raycast = () => {};  // ← 엣지선은 클릭 무시
    group.add(edgeLines);

    // 라벨 스프라이트 — 레이캐스팅 비활성화 (카메라 향해 항상 크게 보임)
    const sprite = _makeTextSprite(label, isAlly ? '#39ff8e' : '#ff4444');
    sprite.position.set(0, 0.52, 0);
    sprite.scale.set(0.72, 0.42, 1);
    sprite.raycast = () => {};     // ← 스프라이트는 클릭 무시
    group.add(sprite);

    group.position.set(x, y, z);
    group.userData = { squadId: squad.id };
    this.scene3d.add(group);

    squad.mesh    = group;
    squad.mat     = mat;
    squad.boxMesh = box;  // ← 정밀 레이캐스팅 전용
  }

  /* ── 분대 선택 ── */
  selectSquad(squad) {
    if (this.phase !== 'INPUT' || !squad.alive) return;

    // 재선택 시 기존 명령 취소 → AP 복원 → 정확한 이동 범위 표시
    this._cancelCmd(squad);

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
        } else if (q < 40) {
          tag.textContent = '통신두절'; tag.className = 'squad-status-tag combat';
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

    // 음영구역(계곡) 경고 표시
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

  /* ── 통신 품질 계산 헬퍼 ── */
  _quality(squad) {
    return this.comms ? Math.round(this.comms.calcQuality({ terrain: squad.terrain })) : 100;
  }

  /* ── 입력 설정 (pointerdown/up → OrbitControls 충돌 방지) ── */
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
    const mouse = this._toNDC(e);
    this.raycaster.setFromCamera(mouse, this.camera);

    // ① 분대 박스 메시만 정밀 레이캐스트 (스프라이트·엣지선 제외, recursive=false)
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
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene3d, this.camera);
  }
}
