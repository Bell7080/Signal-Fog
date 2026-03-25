/* ════════════════════════════════════════════════════════════
   js/scenes/BootScene.js
   Signal-Fog  /  팀 LNG
════════════════════════════════════════════════════════════ */

import bus from '../EventBus.js';
import { EVT } from '../config.js';

const BOOT_LINES = [
  '> SIGNAL-FOG v0.1 초기화 중...',
  '> Phaser.js 3.90.0 로드 완료',
  '> Firebase SDK 연결 대기...',
  '> Howler.js 사운드 엔진 활성화',
  '> 헥스 그리드 모듈 로드 중...',
  '> TensorFlow.js 봇 엔진 준비',
  '> Firebase Realtime DB 연결...',
  '> 사지방 네트워크 환경 감지',
  '> 로비 씬 진입 준비 완료',
  '> 전술 시뮬레이터 시작',
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
    this._bootIdx = 0;
  }

  preload() {
    // TODO: 에셋 로딩
  }

  create() {
    this._logEl = document.getElementById('boot-log');
    this._barEl = document.getElementById('boot-bar');
    this._scrEl = document.getElementById('boot-screen');

    this._startClock();
    this.time.delayedCall(600, () => this._bootStep());
  }

  _bootStep() {
    if (this._bootIdx >= BOOT_LINES.length) {
      this.time.delayedCall(400, () => this._finish());
      return;
    }
    const line = document.createElement('div');
    line.className   = 'log-line';
    line.textContent = BOOT_LINES[this._bootIdx];
    this._logEl.appendChild(line);
    this._logEl.scrollTop = this._logEl.scrollHeight;

    this._bootIdx++;
    const pct = (this._bootIdx / BOOT_LINES.length) * 100;
    this._barEl.style.width = pct + '%';
    this._barEl.setAttribute('aria-valuenow', pct);

    const delay = 220 + Math.random() * 180;
    this.time.delayedCall(delay, () => this._bootStep());
  }

  _finish() {
    this._scrEl.style.transition = 'opacity .6s';
    this._scrEl.style.opacity    = '0';
    this.time.delayedCall(650, () => {
      this._scrEl.style.display = 'none';
      this.scene.start('LobbyScene');
    });
  }

  _startClock() {
    const update = () => {
      const now = new Date();
      const el  = document.getElementById('clock');
      if (el) {
        el.textContent =
          String(now.getHours()).padStart(2, '0')   + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0') + ' KST';
      }
    };
    update();
    setInterval(update, 1000);   // 씬 전환 후에도 지속
  }
}
