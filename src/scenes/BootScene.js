/* ============================================================
   BootScene.js — Phaser 에셋 사전 로딩 씬
   역할: 게임 시작 전 이미지·사운드·스프라이트시트 preload.
         로딩 완료 후 GameScene으로 전환.

   구현 순서 (하나씩 추가):
     1. preload()  — 지형 타일, 유닛 스프라이트 로드
     2. create()   — 로딩 완료 확인 후 GameScene 전환
   ============================================================ */

class BootScene extends Phaser.Scene {

  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // TODO: 지형 타일 (Kenney.nl CC0)
    // this.load.image('tile_open',   'assets/tiles/open.png');
    // this.load.image('tile_forest', 'assets/tiles/forest.png');
    // this.load.image('tile_valley', 'assets/tiles/valley.png');
    // this.load.image('tile_hill',   'assets/tiles/hill.png');

    // TODO: 유닛 스프라이트 (Kenney.nl CC0)
    // this.load.image('unit_squad_ally',  'assets/units/squad_ally.png');
    // this.load.image('unit_squad_enemy', 'assets/units/squad_enemy.png');

    // TODO: UI 아이콘
    // this.load.image('icon_radio',   'assets/ui/radio.png');

    // TODO: 사운드 (Freesound.org CC0)
    // this.load.audio('sfx_radio_send',  'assets/sounds/radio_send.mp3');
    // this.load.audio('sfx_radio_noise', 'assets/sounds/radio_noise.mp3');
    // this.load.audio('sfx_gunshot',     'assets/sounds/gunshot.mp3');
  }

  create() {
    // 에셋 로드 완료 → GameScene으로 전환
    this.scene.start('GameScene');
  }
}
