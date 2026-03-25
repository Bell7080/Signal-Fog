/* ============================================================
   GameScene.js — 메인 게임 씬
   STEP 1: 8×8 그리드 렌더링 + 지형 배치
   STEP 2: 분대 배치 및 렌더링
   STEP 3: 이동 명령 + AP 시스템
   STEP 4: FallbackAI 적군 행동 루프
   STEP 5: 교전 판정 (CombatSystem 연동)
   ============================================================ */

/* ── 데모 맵 레이아웃 (8×8) ──
   O=개활지, F=수풀, V=계곡(오청 발생), H=고지
   ★=목표 지점 (D-04, 계곡 중앙)
*/
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

/* ── 초기 분대 배치 ── */
const ALLY_SPAWN  = [{ id:1, col:1, row:7 }, { id:2, col:3, row:7 }, { id:3, col:6, row:7 }];
const ENEMY_SPAWN = [{ id:4, col:1, row:0 }, { id:5, col:4, row:0 }, { id:6, col:6, row:0 }];

/* ============================================================ */

class GameScene extends Phaser.Scene {

  constructor() {
    super({ key: 'GameScene' });
    this.gridMap        = null;
    this.squads         = [];
    this.selectedSquad  = null;
    this.pendingCmds    = [];   // { squadId, type, targetPos | targetId }
    this.phase          = 'INPUT';
    this.turnManager    = null;
    this.comms          = null;
    this.combat         = null;
    this.enemyAI        = null;
  }

  /* ── 씬 생성 ── */
  create() {
    this.cameras.main.setBackgroundColor('#040604');

    // 시스템 초기화
    this.gridMap     = new GridMap(this);
    this.comms       = new CommsSystem();
    this.combat      = new CombatSystem();
    this.enemyAI     = new EnemyAI(new GeminiClient(), new FallbackAI());
    this.turnManager = new TurnManager(this);

    // 맵 빌드
    this.gridMap.build(DEMO_MAP);

    // 카메라: 512×512 맵 중앙 정렬
    const mapW = CONFIG.GRID_COLS * CONFIG.TILE_SIZE;
    const mapH = CONFIG.GRID_ROWS * CONFIG.TILE_SIZE;
    this.cameras.main.centerOn(mapW / 2, mapH / 2);

    // 목표 지점 표시
    this._drawObjective();

    // 분대 생성
    this._initSquads();

    // 포인터 입력
    this.input.on('pointerdown', this._onPointerDown, this);

    // HUD 좌표 트래킹
    this.input.on('pointermove', (ptr) => {
      const col = Math.floor(ptr.worldX / CONFIG.TILE_SIZE);
      const row = Math.floor(ptr.worldY / CONFIG.TILE_SIZE);
      const el  = document.getElementById('hud-coord');
      if (el && this.gridMap.isInBounds(col, row)) {
        el.textContent = `${String.fromCharCode(65 + col)}-${String(row + 1).padStart(2,'0')}`;
      }
    });

    // 전역 참조 (HUD, 외부 onclick 연결)
    window.gameScene = this;

    // 첫 턴 시작
    this.turnManager.startInputPhase();

    chatUI.addLog('OC/T',   null, '훈련 개시. 목표: 계곡 중앙 점령 (D-04). 분대를 선택하고 이동 타일을 클릭하십시오.');
    chatUI.addLog('SYSTEM', null, '좌측 패널 또는 맵 클릭으로 분대 선택. CONFIRM으로 턴 실행.', 'system');
  }

  /* ── 목표 지점 시각화 ── */
  _drawObjective() {
    const { x, y } = this.gridMap.toPixel(DEMO_OBJECTIVE.col, DEMO_OBJECTIVE.row);
    const gfx = this.add.graphics().setDepth(2);
    gfx.lineStyle(2, 0xffb84d, 0.9);
    gfx.strokeRect(x - 28, y - 28, 56, 56);
    this.add.text(x, y - 4, '★', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffb84d',
    }).setOrigin(0.5).setDepth(3);
    this.add.text(x, y + 16, 'OBJ', {
      fontFamily: "'Share Tech Mono', monospace", fontSize: '8px', color: '#ffb84d',
    }).setOrigin(0.5).setDepth(3);
  }

  /* ── 분대 초기화 ── */
  _initSquads() {
    for (const d of ALLY_SPAWN) {
      const s = this._makeSquad(d.id, 'ally', d.col, d.row);
      this.squads.push(s);
      this._createSprite(s);
    }
    for (const d of ENEMY_SPAWN) {
      const s = this._makeSquad(d.id, 'enemy', d.col, d.row);
      this.squads.push(s);
      this._createSprite(s);
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
      container: null,
      rect:      null,
      troopText: null,
    };
  }

  _createSprite(squad) {
    const { x, y } = this.gridMap.toPixel(squad.pos.col, squad.pos.row);
    const color = squad.side === 'ally' ? 0x39ff8e : 0xff4444;
    const sz    = Math.floor(CONFIG.TILE_SIZE * 0.54);

    const rect = this.add.rectangle(0, 0, sz, sz, color, 0.88);
    const lbl  = this.add.text(0, -2,
      squad.side === 'ally' ? `A${squad.id}` : `E${squad.id - 3}`, {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '11px', color: '#000',
      }).setOrigin(0.5);
    const troop = this.add.text(0, sz / 2 + 1, `◆${squad.troops}`, {
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '8px',
      color: squad.side === 'ally' ? '#39ff8e' : '#ff4444',
    }).setOrigin(0.5, 0);

    squad.rect      = rect;
    squad.troopText = troop;
    squad.container = this.add.container(x, y, [rect, lbl, troop]).setDepth(5);
  }

  /* ── 분대 선택 ── */
  selectSquad(squad) {
    if (this.phase !== 'INPUT' || !squad.alive) return;

    // 이전 선택 해제
    if (this.selectedSquad) {
      this.selectedSquad.rect.setStrokeStyle(0);
    }

    this.selectedSquad = squad;
    squad.rect.setStrokeStyle(2, 0xffffff, 1);
    this.gridMap.clearHighlights();
    this._showMoveTargets(squad);
    this._syncPanel();

    const pos = `${String.fromCharCode(65 + squad.pos.col)}-${String(squad.pos.row + 1).padStart(2,'0')}`;
    chatUI.addLog('SYSTEM', null,
      `A${squad.id}분대 선택 — 위치: ${pos} | AP: ${squad.ap}/${CONFIG.SQUAD_AP_MAX} | 통신: ${this._quality(squad)}%`,
      'system');
  }

  /* 좌측 패널 onclick 연결용 */
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
        this.gridMap.highlightTile(c, r, 0x39ff8e, 0.15);
      }
    }
    // 사거리 내 적 하이라이트 (빨강)
    for (const e of this.squads.filter(q => q.side === 'enemy' && q.alive)) {
      if (this.combat.inRange(squad.pos, e.pos)) {
        this.gridMap.highlightTile(e.pos.col, e.pos.row, 0xff4444, 0.35);
      }
    }
  }

  /* ── 포인터 입력 처리 ── */
  _onPointerDown(ptr) {
    if (this.phase !== 'INPUT') return;

    const tile = this.gridMap.getTileAt(ptr.worldX, ptr.worldY);
    if (!tile) return;
    const { col, row } = tile;

    // 1. 아군 클릭 → 선택
    const ally = this.squads.find(q => q.side === 'ally' && q.alive && q.pos.col === col && q.pos.row === row);
    if (ally) { this.selectSquad(ally); return; }

    if (!this.selectedSquad) return;

    // 2. 적군 클릭 → 공격 명령
    const enemy = this.squads.find(q => q.side === 'enemy' && q.alive && q.pos.col === col && q.pos.row === row);
    if (enemy) { this._issueAttack(this.selectedSquad, enemy); return; }

    // 3. 빈 타일 클릭 → 이동 명령
    this._issueMove(this.selectedSquad, { col, row });
  }

  /* ── 이동 명령 등록 ── */
  _issueMove(squad, targetPos) {
    const dist = Math.abs(targetPos.col - squad.pos.col) + Math.abs(targetPos.row - squad.pos.row);
    if (dist === 0) return;

    const tileTerrain = this.gridMap.tiles[targetPos.row][targetPos.col].terrain;
    const cost = tileTerrain.moveCost || 1;

    if (cost > squad.ap) {
      chatUI.addLog('SYSTEM', null, `AP 부족 (필요: ${cost}, 보유: ${squad.ap})`, 'system');
      return;
    }
    if (dist > squad.ap) {
      chatUI.addLog('SYSTEM', null, `이동 거리 초과 (거리: ${dist}, AP: ${squad.ap})`, 'system');
      return;
    }

    // 기존 명령 취소 → AP 환급
    this._cancelCmd(squad);

    // 오청 판정
    const quality = this._quality(squad);
    let finalPos   = targetPos;

    if (this.comms.rollMishear(quality)) {
      const res = this.comms.applyMishear({ type: 'move', squadId: squad.id, targetTile: targetPos });
      if (res.distorted) {
        finalPos = res.command.targetTile;
        chatUI.showMishear(res.originalText, res.distortedText);
      }
    }

    // 명령 등록 + AP 소모
    this.pendingCmds.push({ type: 'move', squadId: squad.id, targetPos: finalPos });
    squad.ap -= cost;

    this.gridMap.clearHighlights();
    this.gridMap.highlightTile(finalPos.col, finalPos.row, 0x39ff8e, 0.45);

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

    this.gridMap.clearHighlights();
    this.gridMap.highlightTile(target.pos.col, target.pos.row, 0xff4444, 0.5);
    chatUI.addLog(`A${squad.id}`, null, `E${target.id - 3}분대 사격 명령`);
    this._syncPanel();
  }

  /* 기존 명령 취소 + AP 환급 */
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

  /* ── 분대 이동 (트윈 애니메이션) ── */
  moveSquadTo(squad, targetPos, onDone) {
    const { x, y } = this.gridMap.toPixel(targetPos.col, targetPos.row);
    this.tweens.add({
      targets:  squad.container,
      x, y,
      duration: 380,
      ease:     'Sine.easeInOut',
      onComplete: () => {
        squad.pos     = { ...targetPos };
        squad.terrain = this.gridMap.tiles[targetPos.row][targetPos.col].terrain;
        if (onDone) onDone();
      },
    });
  }

  /* ── 교전 판정 적용 ── */
  applyHit(attacker, target) {
    const targetTerrain = this.gridMap.tiles[target.pos.row][target.pos.col].terrain;
    const hit = this.combat.rollHit(attacker.pos, target.pos, targetTerrain);
    const aSide = attacker.side === 'ally' ? `A${attacker.id}` : `E${attacker.id - 3}`;
    const tSide = target.side   === 'ally' ? `A${target.id}분대` : `E${target.id - 3}분대`;

    if (hit) {
      target.troops = Math.max(0, target.troops - 1);
      target.troopText.setText(`◆${target.troops}`);
      chatUI.addLog(aSide, null, `${tSide} 명중! (잔여: ${target.troops}명)`);

      // 피격 플래시
      this.tweens.add({
        targets: target.container, alpha: 0.15,
        duration: 90, yoyo: true, repeat: 3,
        onComplete: () => target.container.setAlpha(1),
      });

      if (target.troops <= 0) {
        target.alive = false;
        target.container.setVisible(false);
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

      // 병력 / AP
      const spans = card.querySelectorAll('.squad-troops span');
      if (spans[0]) spans[0].textContent = `${squad.troops} / ${CONFIG.SQUAD_TROOP_MAX}`;
      if (spans[1]) spans[1].textContent = `${squad.ap} / ${CONFIG.SQUAD_AP_MAX}`;

      // 통신 품질 바
      const q      = this._quality(squad);
      const fill   = card.querySelector('.stat-fill');
      const commsV = card.querySelector('.comms-val');
      if (fill) {
        fill.style.width = q + '%';
        fill.className   = 'stat-fill' + (q < 50 ? ' crit' : q < CONFIG.COMMS_QUALITY_THRESHOLD ? ' warn' : '');
      }
      if (commsV) commsV.textContent = q + '%';

      // 상태 태그
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

      // 선택 카드 활성화
      card.classList.toggle('active', this.selectedSquad?.id === squad.id);
    });

    // 배터리 갱신
    const batEl = document.querySelector('.commander-block .resource-val');
    if (batEl) {
      const batt = this.comms.batteryLevel;
      batEl.textContent = batt + '%';
      batEl.className   = 'resource-val' + (batt < 30 ? ' crit' : batt < 50 ? ' warn' : '');
    }
  }

  /* ── 분대 통신 품질 계산 헬퍼 ── */
  _quality(squad) {
    return this.comms ? Math.round(this.comms.calcQuality({ terrain: squad.terrain })) : 100;
  }
}
