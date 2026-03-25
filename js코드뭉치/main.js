/* ════════════════════════════════════════════════════════════
   js/main.js  —  앱 진입점 (조립만, 로직 없음)
   Signal-Fog  /  팀 LNG

   ▸ import 체인:
       main.js
       ├── config.js              ← 전역 상수
       ├── EventBus.js            ← 싱글턴 버스
       ├── scenes/BootScene.js
       ├── scenes/LobbyScene.js
       ├── scenes/GameScene.js    ← systems/HexGrid.js 내부 import
       ├── ui/HUD.js              ← EventBus 구독
       └── ui/ChatUI.js           ← EventBus 구독

   ▸ 새 씬 추가: scenes/ 에 파일 생성 후 아래 config.scene 배열에 추가
   ▸ 새 UI 매니저: ui/ 에 파일 생성 후 아래 초기화 섹션에 추가
════════════════════════════════════════════════════════════ */

import { BootScene  } from './scenes/BootScene.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { GameScene  } from './scenes/GameScene.js';
import { HUD        } from './ui/HUD.js';
import { ChatUI     } from './ui/ChatUI.js';

// ── UI 매니저 초기화 ────────────────────────────────────────
// EventBus 구독 시작. 씬보다 먼저 초기화해야 이벤트를 놓치지 않음.
const hud    = new HUD();
const chatUI = new ChatUI();

// ── Phaser 게임 설정 ────────────────────────────────────────
const phaserConfig = {
  type:            Phaser.AUTO,
  parent:          'game-canvas-container',
  backgroundColor: '#020602',         // --col-bg 와 일치
  scale: {
    mode:       Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // 씬 배열 — 첫 번째가 자동 시작됨
  // 새 씬 추가 시 여기에 append
  scene: [
    BootScene,
    LobbyScene,
    GameScene,
    // TODO: AARScene, DebriefScene, SettingsScene ...
  ],
};

// 전역 노출 (디버깅·콘솔 접근용)
window.phaserGame = new Phaser.Game(phaserConfig);

// ── 개발 편의 노출 (프로덕션에서 제거 예정) ─────────────────
if (import.meta.env?.DEV || location.hostname === 'localhost') {
  window._dev = { hud, chatUI };
  console.info('[SIGNAL-FOG] dev mode: window._dev 사용 가능');
}
