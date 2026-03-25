/* ════════════════════════════════════════════════════════════
   js/scenes/GameScene.js  —  메인 게임 씬
   Signal-Fog  /  팀 LNG
════════════════════════════════════════════════════════════ */

import bus         from '../EventBus.js';
import { HexGrid } from '../systems/HexGrid.js';
import { EVT, MAP_COLS_PROTO, MAP_ROWS_PROTO, HEX_SIZE } from '../config.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this._grid = null;
    this._gfx  = null;
    this._turn = 0;
    this._drag = { active: false, moved: false, startX: 0, startY: 0 };
    this._unsub = [];
  }

  init(data) {
    this._role   = data.role   ?? 'SOLDIER';
    this._roomId = data.roomId ?? 'DEV_ROOM';
    this._uid    = data.uid    ?? 'DEV_UID';
  }

  create() {
    // 그리드 초기화
    this._grid = new HexGrid(MAP_COLS_PROTO, MAP_ROWS_PROTO, HEX_SIZE);
    this._grid.refreshCommsZones();
    this._gfx  = this.add.graphics();

    // 임시: 모든 타일 visible (포그 오브 워 구현 전)
    this._grid['_tiles'].forEach(t => { t.visible = true; });
    this._grid.draw(this._gfx);

    // 마우스 좌표 → HUD 그리드 표시
    this.input.on('pointermove', ptr => {
      const { q, r } = this._grid.fromPixel(
        ptr.x + this.cameras.main.scrollX,
        ptr.y + this.cameras.main.scrollY,
      );
      const el = document.getElementById('hud-coord');
      if (el) el.textContent = `${String.fromCharCode(65 + q)}-${String(r + 1).padStart(2, '0')}`;
    });

    this._setupDrag();

    this.input.on('pointerup', ptr => {
      if (this._drag.moved) return;
      this._onHexClick(ptr);
    });

    // EventBus 구독
    this._unsub = [
      bus.on(EVT.ACTION_CONFIRM,   () => this._onConfirm()),
      bus.on(EVT.ACTION_HOLD,      () => this._onHold()),
      bus.on(EVT.ACTION_SURRENDER, () => this._onSurrender()),
      bus.on(EVT.TURN_EXPIRED,     () => this._onHold()),
    ];

    this._startTurn();
  }

  shutdown() {
    this._unsub.forEach(fn => fn());
  }

  // ── 턴 관리 ───────────────────────────────────────────────

  _startTurn() {
    this._turn++;
    bus.emit(EVT.TURN_NUMBER, this._turn);
    bus.emit(EVT.TURN_START,  null);
    bus.emit(EVT.STATUS, `TURN ${this._turn} — 행동을 입력하세요`);
    bus.emit(EVT.LOG, { sender: 'SYSTEM', text: `=== TURN ${this._turn} 시작 ===`, type: 'system' });
  }

  _onConfirm() {
    bus.emit(EVT.LOG, { text: '입력 확정 — 실행 페이즈 대기', type: 'system' });
    // TODO: Firebase turnInputs/{roomId}/{uid} = { confirmed: true }
  }

  _onHold() {
    bus.emit(EVT.LOG, { text: '행동 → HOLD (대기)', type: 'system' });
  }

  _onSurrender() {
    bus.emit(EVT.LOG, { text: '⚠ 항복 신호 송신됨', type: 'system' });
  }

  /** 실행 페이즈 (지휘계통 우선순위 순) */
  _executeTurn(allInputs) {
    const ORDER = [
      'COMPANY_CO','XO','PLATOON_LDR','RADIOMAN',
      'SQUAD_LDR','ENGINEER','MEDIC','SUPPLY','WEAPONS_LDR','SOLDIER',
    ];
    const sorted = Object.values(allInputs)
      .sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));

    sorted.forEach((input, i) => {
      this.time.delayedCall(i * 400, () => this._applyInput(input));
    });
    this.time.delayedCall(sorted.length * 400 + 200, () => this._startTurn());
  }

  _applyInput(input) {
    // TODO: 이동·사격·보급 처리
    console.log('[GameScene] 액션 처리:', input);
  }

  // ── 헥스 클릭 ─────────────────────────────────────────────

  _onHexClick(ptr) {
    const { q, r } = this._grid.fromPixel(
      ptr.x + this.cameras.main.scrollX,
      ptr.y + this.cameras.main.scrollY,
    );
    const tile = this._grid.tile(q, r);
    if (!tile) return;
    bus.emit(EVT.LOG, { sender: 'HEX', text: `선택: (${q}, ${r}) 지형: ${tile.terrain}` });
    // TODO: 유닛 선택 → 이동 범위 하이라이트
  }

  // ── 드래그 스크롤 ─────────────────────────────────────────

  _setupDrag() {
    this.input.on('pointerdown', ptr => {
      this._drag = {
        active: true, moved: false,
        startX: ptr.x + this.cameras.main.scrollX,
        startY: ptr.y + this.cameras.main.scrollY,
      };
    });
    this.input.on('pointermove', ptr => {
      if (!this._drag.active) return;
      this._drag.moved       = true;
      this.cameras.main.scrollX = this._drag.startX - ptr.x;
      this.cameras.main.scrollY = this._drag.startY - ptr.y;
    });
    this.input.on('pointerup', () => { this._drag.active = false; });
  }
}
