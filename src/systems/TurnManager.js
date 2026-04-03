/* ============================================================
   TurnManager.js v0.5
   ────────────────────────────────────────────────────────────
   v0.5 변경:
   · [E] AARSystem 연동: 턴 시작/통신 품질/배급소 피해/결과 표시
   · [F] daynight-val HUD 엘리먼트 연동 (누락 수정)
   · RadioInterceptSystem 연동 유지
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

    if (this.scene.selectedSquad) {
      const prev = this.scene.selectedSquad;
      if (prev.mat)  { prev.mat.emissive = new THREE.Color(0x000000); prev.mat.opacity = 0.90; }
      if (prev.mesh) { prev.mesh.scale.set(1, 1, 1); }
    }
    this.scene.selectedSquad  = null;
    this.scene.pendingCmds    = [];
    this.scene.commandedSquadId = null;
    this.scene.gridMap.clearHighlights();
    if (typeof this.scene._clearBlinkHighlights === 'function') this.scene._clearBlinkHighlights();
    if (typeof this.scene._hideProceedBtn === 'function') this.scene._hideProceedBtn();
    if (typeof this.scene._hideSquadPicker === 'function') this.scene._hideSquadPicker();

    document.getElementById('hud-turn').textContent  = String(this.turn).padStart(2, '0');
    document.getElementById('hud-phase').textContent = '입력';
    document.getElementById('phase-val').textContent = '명령 입력';

    hud.startTurnTimer();
    hud.setStatus(`턴 ${this.turn} — 각 분대에 이동·사격 명령을 입력하십시오`);

    for (const s of this.scene.squads) {
      if (!s.alive) continue;
      let ap = CONFIG.SQUAD_AP_MAX;
      if (s.suppressed) { ap = Math.max(1, ap - 1); }
      if (s._apPenalty) { ap = Math.max(0, ap - s._apPenalty); }
      s.ap = ap;
    }

    // ── [E] AAR 턴 시작 기록 ──
    if (this.scene.aar) {
      this.scene.aar.onTurnStart(this.turn, this.scene.dayNight);
    }

    // ── [F] 낮/밤 사이클 tick ──
    if (this.scene.dayNight && CONFIG.DAY_NIGHT_ENABLED) {
      const { phaseChanged, log } = this.scene.dayNight.tick();
      if (phaseChanged && log) {
        chatUI.addLog('SYSTEM', null, log, 'system');
        if (typeof this.scene._updateFog === 'function') this.scene._updateFog();
      }

      // ── [F] daynight-val HUD 갱신 ──
      const dnVal  = document.getElementById('daynight-val');
      const dnIcon = document.getElementById('daynight-icon');
      if (dnVal || dnIcon) {
        const p = this.scene.dayNight.phase;
        const colorMap = {
          day:   'var(--col-green)',
          dusk:  'var(--col-amber)',
          night: '#4466cc',
          dawn:  '#cc88ff',
        };
        const iconMap = { day: '🌅', dusk: '🌆', night: '🌙', dawn: '🌄' };
        if (dnVal) {
          dnVal.textContent = p.label;
          dnVal.style.color = colorMap[p.id] || 'var(--col-green)';
        }
        if (dnIcon) dnIcon.textContent = iconMap[p.id] || '🌅';
      }

      // phase-val에 낮밤 정보 포함
      const pvEl = document.getElementById('phase-val');
      if (pvEl) pvEl.textContent = this.scene.dayNight.getStatusText();
    }

    // ── [E] AAR 통신 품질 기록 ──
    if (this.scene.aar) {
      const allyAlive = this.scene.squads.filter(s => s.side === 'ally' && s.alive);
      if (allyAlive.length > 0) {
        const avgQ = Math.round(
          allyAlive.reduce((sum, s) => sum + this.scene._quality(s), 0) / allyAlive.length
        );
        this.scene.aar.recordCommsQuality(avgQ);
      }
    }

    // 수면 처리
    if (this.scene.survival) {
      const allAlive = this.scene.squads.filter(s => s.alive);
      const sleepEvts = this.scene.survival.processSleep(allAlive);
      for (const { squad: s, event } of sleepEvts) {
        const lbl = s.side === 'ally' ? `A${s.id}분대` : `E${s.id - CONFIG.SQUAD_COUNT}분대`;
        if (event === 'sleep') chatUI.addLog('SYSTEM', null, `${lbl} 정신력 저하 — 수면 돌입`, 'system');
        if (event === 'wake')  chatUI.addLog('SYSTEM', null, `${lbl} 수면 회복 — 행동 가능`, 'system');
      }
      const starveEvts = this.scene.survival.processStarvation(allAlive);
      for (const { squad: s } of starveEvts) {
        const lbl = s.side === 'ally' ? `A${s.id}분대` : `E${s.id - CONFIG.SQUAD_COUNT}분대`;
        if (!s.alive) chatUI.addLog('SYSTEM', null, `${lbl} 아사 — 전원 사망`, 'system');
        else          chatUI.addLog('SYSTEM', null, `${lbl} 아사 피해 — 병력 감소`, 'system');
      }
    }

    // 보급 tick
    if (this.scene.supply) {
      this.scene.supply.tick(this.scene.squads);
      const starved = this.scene.squads.filter(s =>
        s.side === 'ally' && s.alive && s.supply &&
        (s.supply.water < 30 || s.supply.ration < 20)
      );
      if (starved.length > 0) {
        const ids = starved.map(s => `A${s.id}`).join(', ');
        chatUI.addLog('SYSTEM', null, `⚠ ${ids} — 보급 부족! AP 패널티 적용됨`, 'system');
      }
      for (const d of this.scene.supply.depots) {
        this.scene.supply.updateDepotVisual(d);
      }
      if (this.turn % 5 === 0) {
        const status = this.scene.supply.getDepotStatusHTML();
        if (status) chatUI.addLog('SYSTEM', null, status, 'system');
      }
    }

    // 무기 쿨다운
    if (this.scene.weapon) {
      this.scene.weapon.tickCooldowns(this.scene.squads.filter(s => s.alive));
    }

    // 보급 차량 tick
    if (this.scene.supplyVehicles && this.scene.supply) {
      this.scene.supplyVehicles.tick(this.scene.supply, msg => chatUI.addLog('SYSTEM', null, msg, 'system'));
    }

    // ── 무전기 도청 시스템 tick ──
    if (this.scene.radioIntercept) {
      const allyAlive = this.scene.squads.filter(s => s.side === 'ally' && s.alive);
      this.scene.radioIntercept.checkPickup(allyAlive);
      this.scene.radioIntercept.tick();

      const el = document.getElementById('dot-comms');
      if (el) {
        if (this.scene.radioIntercept.isIntercepting) {
          el.style.background = '#ffcc00';
          el.style.boxShadow  = '0 0 6px #ffcc00';
        } else {
          el.style.background = '';
          el.style.boxShadow  = '';
        }
      }
    }

    this.scene.comms.drainBattery();
    if (typeof this.scene._updateFog === 'function')            this.scene._updateFog();
    if (typeof this.scene._updateOverlapVisuals === 'function') this.scene._updateOverlapVisuals();
    this.scene._syncPanel();
    if (typeof this.scene._syncCaptureHUD === 'function')       this.scene._syncCaptureHUD();
  }

  /* ── CONFIRM 진입점 ── */
  async confirmInput() {
    if (this.scene.phase !== 'INPUT') return;
    this.scene.phase = 'EXECUTE';
    hud.stopTimer();
    if (typeof this.scene._hideSquadPicker === 'function') this.scene._hideSquadPicker();

    document.getElementById('hud-phase').textContent = '실행';
    document.getElementById('phase-val').textContent = '실행 중';
    hud.setStatus('실행 페이즈 — 아군 행동 중...');

    // AllyAI 자율 행동 주입
    if (this.scene.allyAI) {
      const allyAlive  = this.scene.squads.filter(s => s.side === 'ally'  && s.alive);
      const enemyAlive = this.scene.squads.filter(s => s.side === 'enemy' && s.alive);
      const aiCmds = this.scene.allyAI.decide(
        allyAlive, enemyAlive,
        this.scene.objective,
        this.scene.commandedSquadId
      );
      for (const cmd of aiCmds) {
        if (!this.scene.pendingCmds.find(c => c.squadId === cmd.squadId)) {
          this.scene.pendingCmds.push(cmd);
        }
      }
    }

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
    if (cmds.length === 0) chatUI.addLog('SYSTEM', null, '아군 명령 없음 — HOLD', 'system');

    for (const cmd of cmds) {
      const squad = this.scene.squads.find(s => s.id === cmd.squadId);
      if (!squad || !squad.alive) continue;

      if (cmd.type === 'rest') {
        if (this.scene.survival) {
          const ok = this.scene.survival.autonomousRestore(squad, cmd.restType);
          if (ok) {
            const lbl = squad.side === 'ally' ? `A${squad.id}` : `E${squad.id - CONFIG.SQUAD_COUNT}`;
            chatUI.addLog(lbl, null, `자율 ${cmd.restType === 'eat' ? '식사' : '음수'} — 인벤토리 소모`, 'system');
          }
        }
        await this._wait(60);
      } else if (cmd.type === 'move') {
        await new Promise(resolve => this.scene.moveSquadTo(squad, cmd.targetPos, resolve));
        if (this.scene.survival) this.scene.survival.consumeMove(squad);
        await this._wait(80);
      } else if (cmd.type === 'attack') {
        const target = this.scene.squads.find(s => s.id === cmd.targetId);
        if (target && target.alive) { this.scene.applyHit(squad, target); await this._wait(320); }
      } else if (cmd.type === 'mortar') {
        if (typeof this.scene.applyMortarFire === 'function') {
          this.scene.applyMortarFire(squad, cmd.targetPos);
          await this._wait(500);
        }
      }
    }
    if (typeof this.scene._updateOverlapVisuals === 'function') this.scene._updateOverlapVisuals();
    this.scene._syncPanel();
  }

  /* ── 적군 행동 ── */
  async _executeEnemy() {
    const allySquads  = this.scene.squads.filter(s => s.side === 'ally'  && s.alive);
    const enemySquads = this.scene.squads.filter(s => s.side === 'enemy' && s.alive);
    if (enemySquads.length === 0) { chatUI.addLog('SYSTEM', null, '적군 전멸 — 행동 없음', 'system'); return; }

    const avgComms = allySquads.length > 0
      ? Math.round(allySquads.reduce((sum, s) => sum + this.scene._quality(s), 0) / allySquads.length)
      : 100;

    const mapState = this.scene.enemyAI.serializeMap(this.scene.gridMap, allySquads, enemySquads, avgComms);

    let actions = [];
    try {
      actions = await this.scene.enemyAI.decideTurn(mapState);
    } catch (err) {
      console.error('decideTurn 오류:', err);
      actions = this.scene.enemyAI.fallback.decide(mapState.enemy, mapState.ally, mapState);
    }
    if (!Array.isArray(actions)) {
      actions = this.scene.enemyAI.fallback.decide(mapState.enemy, mapState.ally, mapState);
    }

    console.log(`[TurnManager] 적군 액션 ${actions.length}개:`, actions);
    chatUI.addLog('SYSTEM', null, `적군 행동 ${actions.length}개 수신`, 'system');

    // 도청 인터셉트
    if (this.scene.radioIntercept?.isIntercepting) {
      this.scene.radioIntercept.interceptActions(actions, enemySquads);
    }

    for (const action of actions) {
      const squad = this.scene.squads.find(s => s.side === 'enemy' && s.id === action.squadId && s.alive);
      if (!squad) { console.warn(`[TurnManager] 적군 분대 ID ${action.squadId} 없음`); continue; }

      if (action.action === 'move') {
        const targetPos = { col: Math.round(action.targetCol), row: Math.round(action.targetRow) };
        if (!this.scene.gridMap.isInBounds(targetPos.col, targetPos.row)) continue;
        if (targetPos.col === squad.pos.col && targetPos.row === squad.pos.row) continue;
        chatUI.addLog(`E${squad.id - CONFIG.SQUAD_COUNT}`, null,
          `이동 → ${String.fromCharCode(65+(targetPos.col%26))}-${String(targetPos.row+1).padStart(3,'0')}`);
        await new Promise(resolve => this.scene.moveSquadTo(squad, targetPos, resolve));
        await this._wait(100);
      } else if (action.action === 'attack') {
        const rawId    = action.targetId;
        const targetId = typeof rawId === 'number' ? rawId : parseInt(String(rawId).replace(/\D/g, ''));
        const target   = this.scene.squads.find(s => s.side === 'ally' && s.id === targetId && s.alive);
        if (!target) { console.warn(`[TurnManager] 공격 대상 ID ${rawId} 없음`); continue; }
        chatUI.addLog(`E${squad.id - CONFIG.SQUAD_COUNT}`, null, `A${target.id}분대 사격`);
        this.scene.applyHit(squad, target);
        await this._wait(320);
      }
    }
    if (typeof this.scene._updateOverlapVisuals === 'function') this.scene._updateOverlapVisuals();
    this.scene._syncPanel();
  }

  /* ── 승패 판정 ── */
  _checkResult() {
    const allyAll    = this.scene.squads.filter(s => s.side === 'ally');
    const enemyAll   = this.scene.squads.filter(s => s.side === 'enemy');
    const allyAlive  = allyAll.filter(s => s.alive);
    const enemyAlive = enemyAll.filter(s => s.alive);

    if (allyAlive.length === 0) {
      this._showResult(false, { turns: this.turn, reason: '아군 전멸', allyAlive: 0, allyTotal: allyAll.length, enemyAlive: enemyAlive.length, enemyTotal: enemyAll.length });
      return;
    }
    if (enemyAlive.length === 0) {
      this._showResult(true, { turns: this.turn, reason: '적군 전멸', allyAlive: allyAlive.length, allyTotal: allyAll.length, enemyAlive: 0, enemyTotal: enemyAll.length });
      return;
    }
    if (this.turn >= CONFIG.TURN_LIMIT) {
      const allyTroops  = allyAlive.reduce((a, s) => a + s.troops, 0);
      const enemyTroops = enemyAlive.reduce((a, s) => a + s.troops, 0);
      this._showResult(allyTroops >= enemyTroops, { turns: this.turn, reason: `${CONFIG.TURN_LIMIT}턴 경과`, allyAlive: allyAlive.length, allyTotal: allyAll.length, enemyAlive: enemyAlive.length, enemyTotal: enemyAll.length });
      return;
    }

    const objSys = this.scene.objective;
    if (objSys) {
      objSys.checkDiscovery(allyAlive);
      const { allyCount, enemyCount, delta } = objSys.tick(allyAlive, enemyAlive);
      if (objSys.discovered) {
        const pct = objSys.getGaugePct();
        if (allyCount > 0 || enemyCount > 0) {
          const dir = delta > 0 ? `▲+${delta}` : delta < 0 ? `▼${delta}` : '교착';
          chatUI.addLog('SYSTEM', null, `점령지 — 아군 ${allyCount}분대 / 적군 ${enemyCount}분대 | 게이지 ${pct}% (${dir})`, 'system');
        }
        if (objSys.isWon()) {
          this._showResult(true, { turns: this.turn, reason: '점령지 완전 점령', allyAlive: allyAlive.length, allyTotal: allyAll.length, enemyAlive: enemyAlive.length, enemyTotal: enemyAll.length });
          return;
        }
      }
    }
    this._nextTurn();
  }

  /* ── [E] 결과 오버레이 — AAR 통합 ── */
  _showResult(win, data) {
    hud.stopTimer();
    this.scene.phase = 'RESULT';
    document.getElementById('hud-phase').textContent = '종료';
    hud.setStatus(win ? '훈련 완료 — 승리' : '훈련 종료 — 패배');
    chatUI.addLog('SYSTEM', null, win ? `훈련 완료 — 승리 (${data.reason})` : `훈련 종료 — 패배 (${data.reason})`, 'system');

    const overlay = document.getElementById('result-overlay');
    if (!overlay) return;

    // ── [E] AAR 통합 결과 화면 ──
    if (this.scene.aar) {
      this.scene.aar.show({ win, ...data }, this.scene.squads);
    } else {
      // 폴백: 기존 간단 표시
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
  }

  _nextTurn() { this.turn++; this.startInputPhase(); }
  _wait(ms)   { return new Promise(resolve => setTimeout(resolve, ms)); }
}
