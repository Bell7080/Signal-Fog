/* ============================================================
   TurnManager.js — 턴 순서 및 페이즈 전환 관리
   페이즈 흐름: INPUT → EXECUTE_ALLY → EXECUTE_ENEMY → CHECK → (next) INPUT
   ============================================================ */

class TurnManager {

  /** @param {GameScene} scene */
  constructor(scene) {
    this.scene = scene;
    this.turn  = 1;
  }

  /* ── INPUT 페이즈 시작 ── */
  startInputPhase() {
    this.scene.phase = 'INPUT';

    // 선택 분대 스케일 리셋
    if (this.scene.selectedSquad) {
      const prev = this.scene.selectedSquad;
      if (prev.mat)  { prev.mat.emissive = new THREE.Color(0x000000); prev.mat.opacity = 0.90; }
      if (prev.mesh) { prev.mesh.scale.set(1, 1, 1); }
    }
    this.scene.selectedSquad = null;
    this.scene.pendingCmds   = [];
    this.scene.gridMap.clearHighlights();

    // HUD 갱신
    document.getElementById('hud-turn').textContent  = String(this.turn).padStart(2, '0');
    document.getElementById('hud-phase').textContent = '입력';
    document.getElementById('phase-val').textContent = '명령 입력';

    hud.startTurnTimer();
    hud.setStatus(`턴 ${this.turn} — 각 분대에 이동·사격 명령을 입력하십시오`);

    // 모든 분대 AP 초기화
    for (const s of this.scene.squads) {
      if (s.alive) s.ap = CONFIG.SQUAD_AP_MAX;
    }
    // 배터리 소모
    this.scene.comms.drainBattery();
    // 포그 오브 워 갱신
    if (typeof this.scene._updateFog === 'function') this.scene._updateFog();
    this.scene._syncPanel();
  }

  /* ── CONFIRM 진입점 ── */
  async confirmInput() {
    if (this.scene.phase !== 'INPUT') return;
    this.scene.phase = 'EXECUTE';
    hud.stopTimer();

    document.getElementById('hud-phase').textContent = '실행';
    document.getElementById('phase-val').textContent = '실행 중';
    hud.setStatus('실행 페이즈 — 아군 행동 중...');

    await this._executeAlly();
    await this._wait(400);

    hud.setStatus('실행 페이즈 — 적군 행동 중...');
    chatUI.addLog('SYSTEM', null, '--- 적군 행동 ---', 'system');
    await this._executeEnemy();
    await this._wait(400);

    this._checkResult();
  }

  /* ── 아군 명령 순차 실행 ── */
  async _executeAlly() {
    const cmds = [...this.scene.pendingCmds];
    this.scene.pendingCmds = [];
    this.scene.gridMap.clearHighlights();

    if (cmds.length === 0) {
      chatUI.addLog('SYSTEM', null, '아군 명령 없음 — HOLD', 'system');
    }

    for (const cmd of cmds) {
      const squad = this.scene.squads.find(s => s.id === cmd.squadId);
      if (!squad || !squad.alive) continue;

      if (cmd.type === 'move') {
        await new Promise(resolve => this.scene.moveSquadTo(squad, cmd.targetPos, resolve));
        await this._wait(80);
      } else if (cmd.type === 'attack') {
        const target = this.scene.squads.find(s => s.id === cmd.targetId);
        if (target && target.alive) {
          this.scene.applyHit(squad, target);
          await this._wait(320);
        }
      }
    }
    this.scene._syncPanel();
  }

  /* ── 적군 행동 (FallbackAI) ── */
  async _executeEnemy() {
    const allySquads  = this.scene.squads.filter(s => s.side === 'ally'  && s.alive);
    const enemySquads = this.scene.squads.filter(s => s.side === 'enemy' && s.alive);

    if (enemySquads.length === 0) return;

    // FallbackAI 우선 (Gemini는 API 키 설정 후 EnemyAI.decideTurn으로 교체)
    const actions = this.scene.enemyAI.fallback.decide(enemySquads, allySquads);

    for (const action of actions) {
      const squad = this.scene.squads.find(s => s.id === action.squadId);
      if (!squad || !squad.alive) continue;

      if (action.action === 'move') {
        const targetPos = { col: action.targetCol, row: action.targetRow };
        if (this.scene.gridMap.isInBounds(targetPos.col, targetPos.row)) {
          await new Promise(resolve => this.scene.moveSquadTo(squad, targetPos, resolve));
          await this._wait(100);
        }
      } else if (action.action === 'attack') {
        const targetId = parseInt(action.targetId.replace('ally_', ''));
        const target   = this.scene.squads.find(s => s.id === targetId);
        if (target && target.alive) {
          this.scene.applyHit(squad, target);
          await this._wait(320);
        }
      }
    }
    this.scene._syncPanel();
  }

  /* ── 승패 판정 ── */
  _checkResult() {
    const allyAll    = this.scene.squads.filter(s => s.side === 'ally');
    const enemyAll   = this.scene.squads.filter(s => s.side === 'enemy');
    const allyAlive  = allyAll.filter(s => s.alive);
    const enemyAlive = enemyAll.filter(s => s.alive);

    if (allyAlive.length === 0) {
      this._showResult(false, {
        turns: this.turn, reason: '아군 전멸',
        allyAlive: 0,                allyTotal: allyAll.length,
        enemyAlive: enemyAlive.length, enemyTotal: enemyAll.length,
      });
      return;
    }
    if (enemyAlive.length === 0) {
      this._showResult(true, {
        turns: this.turn, reason: '적군 전멸',
        allyAlive: allyAlive.length,  allyTotal: allyAll.length,
        enemyAlive: 0,               enemyTotal: enemyAll.length,
      });
      return;
    }
    if (this.turn >= CONFIG.TURN_LIMIT) {
      const allyTroops  = allyAlive.reduce((a, s) => a + s.troops, 0);
      const enemyTroops = enemyAlive.reduce((a, s) => a + s.troops, 0);
      this._showResult(allyTroops >= enemyTroops, {
        turns: this.turn, reason: `${CONFIG.TURN_LIMIT}턴 경과`,
        allyAlive: allyAlive.length,  allyTotal: allyAll.length,
        enemyAlive: enemyAlive.length, enemyTotal: enemyAll.length,
      });
      return;
    }

    // 목표 지점 점령 알림
    const obj   = DEMO_OBJECTIVE;
    const onObj = allyAlive.find(s => s.pos.col === obj.col && s.pos.row === obj.row);
    if (onObj) {
      chatUI.addLog('SYSTEM', null,
        `A${onObj.id}분대 목표 지점(D-04) 점령 중 — ${CONFIG.CAPTURE_HOLD_TURNS}턴 유지 시 승리`, 'system');
    }

    this._nextTurn();
  }

  /* ── 결과 오버레이 표시 ── */
  _showResult(win, data) {
    hud.stopTimer();
    this.scene.phase = 'RESULT';
    document.getElementById('hud-phase').textContent = '종료';
    hud.setStatus(win ? '훈련 완료 — 승리' : '훈련 종료 — 패배');
    chatUI.addLog('SYSTEM', null,
      win ? `훈련 완료 — 승리 (${data.reason})` : `훈련 종료 — 패배 (${data.reason})`,
      'system');

    const overlay = document.getElementById('result-overlay');
    if (!overlay) return;

    document.getElementById('result-reason').textContent = `종료 사유 // ${data.reason}`;

    const title = document.getElementById('result-title');
    title.textContent = win ? '승리' : '패배';
    title.className   = win ? '' : 'lose';

    const enemyClass = data.enemyAlive > 0 ? ' red' : '';
    document.getElementById('result-body').innerHTML =
      `소요 턴<span class="rv">${data.turns} / ${CONFIG.TURN_LIMIT}</span><br>` +
      `아군 잔존<span class="rv">${data.allyAlive} / ${data.allyTotal}</span><br>` +
      `적군 잔존<span class="rv${enemyClass}">${data.enemyAlive} / ${data.enemyTotal}</span>`;

    overlay.classList.add('show');
  }

  _nextTurn() {
    this.turn++;
    this.startInputPhase();
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
