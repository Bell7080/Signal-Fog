/* ============================================================
   BootScene.js — 에셋 사전 로딩 (Three.js 전환 후 Phaser 의존 제거)
   실제 로딩은 index.html 부팅 시퀀스 + main.js 에서 처리.
   향후 Three.js TextureLoader 로 에셋 프리로드 시 이 클래스 확장.
   ============================================================ */

class BootScene {
  constructor() {}

  preload() {
    // TODO: Three.js TextureLoader로 지형/유닛 텍스처 로드
    // const loader = new THREE.TextureLoader();
    // loader.load('assets/tiles/open.png', ...);
  }

  create() {
    // 로드 완료 후 GameScene으로 전환 (현재는 main.js에서 직접 처리)
  }
}
