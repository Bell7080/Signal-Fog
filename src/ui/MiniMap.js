/* ============================================================
   MiniMap.js — 미니맵 및 시야 표시 (본선 확장 우선순위)
   예선 MVP에서는 HUD 오버레이로 대체 가능.
   Phaser Graphics를 이용해 캔버스 위 오버레이로 렌더링.

   구현 순서 (하나씩 추가):
     1. build()         — 미니맵 Graphics 오브젝트 생성
     2. updateUnits()   — 아군·적군 위치 점 갱신
     3. updateFog()     — 시야 범위 음영 갱신
     4. highlight()     — 선택 분대 위치 강조
   ============================================================ */

class MiniMap {

  /**
   * @param {Phaser.Scene} scene
   * @param {number} x - 미니맵 좌상단 x 픽셀
   * @param {number} y - 미니맵 좌상단 y 픽셀
   * @param {number} scale - 타일당 미니맵 픽셀 크기 (기본 8px)
   */
  constructor(scene, x = 0, y = 0, scale = 8) {
    this.scene  = scene;
    this.x      = x;
    this.y      = y;
    this.scale  = scale;
    this.gfx    = null;  // Phaser Graphics 오브젝트
  }

  /** 미니맵 Graphics 초기화 */
  build() {
    // TODO: this.gfx = this.scene.add.graphics();
    // TODO: 배경 사각형 렌더링
  }

  /**
   * 유닛 위치 점 갱신
   * @param {Array<object>} allySquads
   * @param {Array<object>} enemySquads
   * @param {FogOfWar}      fog
   */
  updateUnits(allySquads, enemySquads, fog) {
    // TODO: this.gfx.clear() 후 재렌더링
    // 아군: 녹색 점 / 적군(시야 내): 적색 점
  }

  /**
   * 시야 범위 음영 갱신
   * @param {FogOfWar} fog
   */
  updateFog(fog) {
    // TODO: fog.visibleSet 기준으로 미니맵 타일 색상 조정
  }

  /**
   * 선택 분대 강조 표시
   * @param {number} squadId
   * @param {Array<object>} squads
   */
  highlight(squadId, squads) {
    // TODO: 선택 분대 위치 테두리 표시
  }
}
