/* ============================================================
   RadioInterceptSystem.js — 무전기 드롭 & 도청 시스템
   ────────────────────────────────────────────────────────────
   · 적 처치 시 50% 확률로 무전기 아이템 드롭
   · 아군 분대가 같은 타일에 있으면 자동 획득
   · 획득 후 3턴 동안 적 이동 경로를 채팅창에 도청 표시
   · 도청 중에는 적군 이동 명령이 채팅에 노출됨
   ============================================================ */

class RadioInterceptSystem {

  constructor() {
    /** @type {Array<RadioItem>} 맵 위의 무전기 아이템 */
    this.droppedRadios = [];
    /** @type {number} 도청 남은 턴 수 (0 = 비활성) */
    this.interceptTurns = 0;
    /** @type {Array<string>} 도청된 적군 이동 로그 */
    this.interceptedMoves = [];
    this._nextId = 1;
    this._scene3d = null;
    this._gridMap = null;
  }

  init(scene3d, gridMap) {
    this._scene3d = scene3d;
    this._gridMap = gridMap;
  }

  /* ── 드롭 시도 (적 처치 시 호출) ── */
  tryDrop(enemySquad) {
    if (Math.random() > 0.5) return null; // 50% 확률

    const radio = {
      id:    this._nextId++,
      col:   enemySquad.pos.col,
      row:   enemySquad.pos.row,
      mesh:  null,
    };
    this._buildMesh(radio);
    this.droppedRadios.push(radio);

    chatUI.addLog('SYSTEM', null,
      `📻 E${enemySquad.id - CONFIG.SQUAD_COUNT}분대 무전기 드롭! (${String.fromCharCode(65+(radio.col%26))}-${String(radio.row+1).padStart(2,'0')})`,
      'system'
    );
    return radio;
  }

  /* ── 아군 이동 후 자동 수집 체크 ── */
  checkPickup(allySquads) {
    const picked = [];
    for (const radio of this.droppedRadios) {
      const finder = allySquads.find(s =>
        s.alive && s.pos.col === radio.col && s.pos.row === radio.row
      );
      if (finder) {
        picked.push(radio);
        this._removeMesh(radio);
        this.interceptTurns += 3; // 3턴 도청 추가
        chatUI.addLog('SYSTEM', null,
          `📻 A${finder.id}분대 무전기 획득! 도청 활성화 (${this.interceptTurns}턴 남음)`,
          'system'
        );
        chatUI.addLog('대항군', null, '███ 채널 ████ 해킹 ████...', 'distort');
      }
    }
    this.droppedRadios = this.droppedRadios.filter(r => !picked.includes(r));
  }

  /* ── 도청: 적군 이동 명령 노출 ── */
  /**
   * EnemyAI 행동 결정 후, 실행 전에 호출
   * @param {Array} actions - enemyAI 행동 배열
   * @param {Array} enemySquads
   */
  interceptActions(actions, enemySquads) {
    if (this.interceptTurns <= 0) return;

    chatUI.addLog('SYSTEM', null,
      `📻 [도청] 적군 통신 감청 중... (${this.interceptTurns}턴 남음)`,
      'system'
    );

    for (const action of actions) {
      const squad = enemySquads.find(s => s.id === action.squadId);
      if (!squad) continue;
      const eLbl = `E${squad.id - CONFIG.SQUAD_COUNT}`;

      if (action.action === 'move') {
        const col = String.fromCharCode(65 + (action.targetCol % 26));
        const row = String(action.targetRow + 1).padStart(2, '0');
        chatUI.addLog('📻도청', null, `${eLbl}분대 → ${col}-${row} 이동 예정`, 'distort');
      } else if (action.action === 'attack') {
        chatUI.addLog('📻도청', null, `${eLbl}분대 → A${action.targetId}분대 사격 예정`, 'distort');
      }
    }
  }

  /* ── 턴 종료 시 도청 카운트 감소 ── */
  tick() {
    if (this.interceptTurns > 0) {
      this.interceptTurns--;
      if (this.interceptTurns === 0) {
        chatUI.addLog('SYSTEM', null, '📻 도청 만료 — 무전기 배터리 소진', 'system');
      }
    }
  }

  get isIntercepting() {
    return this.interceptTurns > 0;
  }

  /* ── 3D 메시 생성 ── */
  _buildMesh(radio) {
    if (!this._scene3d || !this._gridMap) return;
    const gm = this._gridMap;
    const wp = gm.toWorld(radio.col, radio.row);
    const h  = gm.tiles[radio.row][radio.col].height;
    const TW = gm.TILE_W;

    const geo  = new THREE.BoxGeometry(TW * 0.35, TW * 0.20, TW * 0.25);
    const mat  = new THREE.MeshLambertMaterial({ color: 0xffcc00, transparent: true, opacity: 0.95 });
    const box  = new THREE.Mesh(geo, mat);
    box.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xffee44, transparent: true, opacity: 1.0 })
    ));

    // 안테나 (작은 선)
    const antennaGeo = new THREE.CylinderGeometry(TW*0.01, TW*0.01, TW*0.3, 4);
    const antennaMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
    const antenna    = new THREE.Mesh(antennaGeo, antennaMat);
    antenna.position.set(TW*0.1, TW*0.25, 0);
    box.add(antenna);

    // 레이블 스프라이트
    const lbl = _makeTextSprite('📻', '#ffcc00');
    lbl.position.set(0, TW * 0.55, 0);
    lbl.scale.set(TW * 1.0, TW * 0.55, 1);
    lbl.raycast = () => {};

    const group = new THREE.Group();
    group.add(box);
    group.add(lbl);
    group.position.set(wp.x, h + TW * 0.10, wp.z);
    group.userData = { type: 'radio', radioId: radio.id };

    // 깜빡임 애니메이션 (renderOrder로 구분)
    group.renderOrder = 4;
    this._scene3d.add(group);
    radio.mesh = group;

    // 깜빡임 효과
    let blinkOn = true;
    radio._blinkInterval = setInterval(() => {
      if (radio.mesh) {
        blinkOn = !blinkOn;
        mat.opacity = blinkOn ? 0.95 : 0.3;
      } else {
        clearInterval(radio._blinkInterval);
      }
    }, 600);
  }

  _removeMesh(radio) {
    if (radio._blinkInterval) clearInterval(radio._blinkInterval);
    if (!radio.mesh || !this._scene3d) return;
    this._scene3d.remove(radio.mesh);
    radio.mesh.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    radio.mesh = null;
  }

  /* ── 맵 위 무전기 전체 정리 ── */
  clearAll() {
    for (const r of this.droppedRadios) this._removeMesh(r);
    this.droppedRadios = [];
    this.interceptTurns = 0;
  }
}
