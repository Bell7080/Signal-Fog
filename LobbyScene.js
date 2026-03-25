/* ════════════════════════════════════════════════════════════
   js/scenes/LobbyScene.js
   Signal-Fog  /  팀 LNG
════════════════════════════════════════════════════════════ */

import bus from '../EventBus.js';
import { EVT, FB_PATH, ROLE_AP } from '../config.js';

const ROLES = [
  { id: 'COMPANY_CO',  label: '중대장',     max: 1  },
  { id: 'XO',          label: '부중대장',   max: 1  },
  { id: 'PLATOON_LDR', label: '소대장',     max: 3  },
  { id: 'SQUAD_LDR',   label: '분대장',     max: 9  },
  { id: 'RADIOMAN',    label: '무전병',     max: 2  },
  { id: 'MEDIC',       label: '의무병',     max: 2  },
  { id: 'ENGINEER',    label: '공병',       max: 1  },
  { id: 'SUPPLY',      label: '보급관',     max: 1  },
  { id: 'WEAPONS_LDR', label: '화기소대장', max: 1  },
  { id: 'SOLDIER',     label: '병사',       max: 99 },
];

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LobbyScene' });
    this._db           = null;
    this._roomId       = null;
    this._uid          = null;
    this._selectedRole = null;
    this._unsub        = [];
  }

  create() {
    bus.emit(EVT.STATUS, '로비 — 역할 배정 대기 중');
    bus.emit(EVT.LOG, { sender: 'SYSTEM', text: 'Signal-Fog 초기화 완료 — 로비 대기 중', type: 'system' });
    bus.emit(EVT.LOG, { sender: 'OC/T',   text: '훈련 시작 준비. 역할 배정 후 입장하십시오.' });
    bus.emit(EVT.LOG, { sender: '대항군', text: '███ ████ ██ ████████...', type: 'distort' });

    // TODO: firebase.auth().signInAnonymously() → _joinOrCreateRoom()
    this._renderRoleSelect();
  }

  shutdown() {
    this._unsub.forEach(fn => fn());
    this._unsub = [];
  }

  _renderRoleSelect() {
    const container = document.getElementById('game-canvas-container');
    if (!container || document.getElementById('lobby-panel')) return;

    const panel = document.createElement('div');
    panel.id        = 'lobby-panel';
    panel.innerHTML = `
      <div class="lobby-title">▸ 역할 배정</div>
      <div class="lobby-roles" id="lobby-role-list">
        ${ROLES.map(r => `
          <button class="lobby-role-btn" data-role="${r.id}">
            <span class="role-label">${r.label}</span>
            <span class="role-ap">AP ${ROLE_AP[r.id]}</span>
          </button>
        `).join('')}
      </div>
      <button class="btn primary" id="lobby-ready-btn" disabled>준비 완료</button>
    `;
    container.appendChild(panel);

    panel.querySelectorAll('.lobby-role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.lobby-role-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this._selectedRole = btn.dataset.role;
        document.getElementById('lobby-ready-btn').disabled = false;
      });
    });

    document.getElementById('lobby-ready-btn')
      ?.addEventListener('click', () => this._onReady());
  }

  _onReady() {
    if (!this._selectedRole) return;
    bus.emit(EVT.LOG, { sender: 'SYSTEM', text: `역할 배정: ${this._selectedRole}`, type: 'system' });
    bus.emit(EVT.STATUS, '준비 완료 — 다른 플레이어 대기 중');

    // TODO: Firebase players/{uid} 저장 → 전원 ready 감지
    this.time.delayedCall(1000, () => {
      document.getElementById('lobby-panel')?.remove();
      this.scene.start('GameScene', {
        role:   this._selectedRole,
        roomId: this._roomId ?? 'DEV_ROOM',
        uid:    this._uid    ?? 'DEV_UID',
      });
    });
  }
}
