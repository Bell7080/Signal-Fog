/* ============================================================
   GameScene.js — 메인 게임 씬
   역할: 8×8 그리드 렌더링, 턴 진행, 분대 조작, AI 실행.

   주요 시스템 연동:
     - GridMap       : 타일 생성 및 좌표 계산
     - TurnManager   : 페이즈 전환 (입력→실행→결과)
     - CommsSystem   : 오청 판정
     - CombatSystem  : 교전 판정
     - FogOfWar      : 시야 범위 관리
     - EnemyAI       : Gemini API 적군 행동 결정

   구현 순서 (하나씩 추가):
     1. create()     — GridMap 초기화, 분대 배치
     2. update()     — 입력 감지, 포인터 좌표 HUD 갱신
     3. onTileClick  — 분대 이동 명령 처리
     4. onConfirm    — 실행 페이즈 진입 (TurnManager 위임)
     5. onResult     — 교전 결과 표시, ResultScene 전환
   ============================================================ */

class GameScene extends Phaser.Scene {

  constructor() {
    super({ key: 'GameScene' });
    this.gridMap     = null;
    this.turnManager = null;
    this.comms       = null;
    this.combat      = null;
    this.fog         = null;
    this.enemyAI     = null;
  }

  create() {
    const { width, height } = this.scale;

    // TODO: GridMap 초기화
    // this.gridMap = new GridMap(this);
    // this.gridMap.build();

    // TODO: 분대 초기 배치
    // this.squads = [...Array(CONFIG.SQUAD_COUNT)].map((_, i) => new Squad(i + 1));

    // TODO: 시스템 초기화
    // this.turnManager = new TurnManager(this);
    // this.comms       = new CommsSystem();
    // this.combat      = new CombatSystem();
    // this.fog         = new FogOfWar(this.gridMap);
    // this.enemyAI     = new EnemyAI(new GeminiClient(), new FallbackAI());

    // TODO: 타일 클릭 이벤트 연결
    // this.input.on('pointerdown', this.onTileClick, this);

    // 임시 플레이스홀더 텍스트
    this.add.text(width / 2, height / 2,
      '[ 8×8 GRID MAP ]\nGameScene — 구현 대기 중',
      {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '14px',
        color: '#1e6644',
        align: 'center',
      }
    ).setOrigin(0.5);

    // 마우스 좌표 → HUD 갱신
    this.input.on('pointermove', (ptr) => {
      const col = String.fromCharCode(65 + Math.floor(ptr.x / CONFIG.TILE_SIZE));
      const row = String(Math.floor(ptr.y / CONFIG.TILE_SIZE) + 1).padStart(2, '0');
      const el = document.getElementById('hud-coord');
      if (el) el.textContent = `${col}-${row}`;
    });
  }

  update() {
    // TODO: 매 프레임 업데이트 (유닛 애니메이션, 이동 트윈 등)
  }

  onTileClick(pointer) {
    // TODO: 클릭한 타일 좌표 계산 → 선택 분대에 이동 명령 전달
    // const tile = this.gridMap.getTileAt(pointer.x, pointer.y);
    // this.turnManager.issueMove(selectedSquadId, tile);
  }
}
