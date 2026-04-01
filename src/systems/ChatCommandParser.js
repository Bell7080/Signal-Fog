/* ============================================================
   ChatCommandParser.js — 채팅 키워드 → 인게임 명령 변환
   ────────────────────────────────────────────────────────────
   지원 명령:
     "N분대 전진"          → N분대 앞으로 1~2칸 이동
     "N분대 후퇴"          → N분대 뒤로 1~2칸 이동
     "N분대 좌측/우측"     → N분대 좌우 이동
     "전 아군 전진/후퇴"   → 모든 아군 이동
     "N분대 공격"          → N분대 가장 가까운 적 사격
     "N분대 대기"          → N분대 해당 턴 스킵
     "전 아군 대기"        → 모든 아군 대기
     "N분대 점령지 이동"   → N분대 점령지 방향으로 이동
   ============================================================ */

class ChatCommandParser {

  constructor(gameScene) {
    this.scene = gameScene;
  }

  /**
   * 채팅 텍스트 파싱 → 인게임 명령 실행
   * @param {string} text - 사용자 입력 채팅
   * @returns {boolean} 명령이 인식됐는지 여부
   */
  parse(text) {
    if (!text || !this.scene || this.scene.phase !== 'INPUT') return false;

    const t = text.trim();

    // ── 전 아군 명령 ──
    if (/전\s*아군\s*(전진|앞으로)/.test(t)) {
      return this._commandAll('forward');
    }
    if (/전\s*아군\s*(후퇴|뒤로|철수)/.test(t)) {
      return this._commandAll('backward');
    }
    if (/전\s*아군\s*(대기|멈춰|정지)/.test(t)) {
      return this._commandAll('hold');
    }
    if (/전\s*아군\s*(점령지|목표)/.test(t)) {
      return this._commandAll('objective');
    }

    // ── 개별 분대 명령 ──
    // "N분대" 또는 "N번 분대" 패턴 추출
    const squadMatch = t.match(/([1-9][0-9]?)\s*(?:번\s*)?분대/);
    if (squadMatch) {
      const squadNum = parseInt(squadMatch[1]);
      const squad    = this.scene.squads.find(s =>
        s.side === 'ally' && s.id === squadNum && s.alive
      );
      if (!squad) {
        chatUI.addLog('SYSTEM', null, `⚠ A${squadNum}분대 없음 또는 전멸`, 'system');
        return true; // 인식은 됐지만 실행 불가
      }

      if (/전진|앞으로/.test(t))           return this._moveSquad(squad, 'forward');
      if (/후퇴|뒤로|철수/.test(t))         return this._moveSquad(squad, 'backward');
      if (/좌측|왼쪽/.test(t))             return this._moveSquad(squad, 'left');
      if (/우측|오른쪽/.test(t))           return this._moveSquad(squad, 'right');
      if (/공격|사격|발사/.test(t))         return this._attackNearest(squad);
      if (/대기|멈춰|정지|홀드/.test(t))   return this._holdSquad(squad);
      if (/점령지|목표/.test(t))           return this._moveToObjective(squad);
    }

    return false; // 명령 미인식
  }

  /* ── 전 아군 명령 ── */
  _commandAll(direction) {
    const allies = this.scene.squads.filter(s => s.side === 'ally' && s.alive && !s.sleeping);
    if (allies.length === 0) return false;

    let count = 0;
    for (const squad of allies) {
      if (direction === 'hold') {
        this._holdSquad(squad);
      } else if (direction === 'objective') {
        this._moveToObjective(squad);
        count++;
      } else {
        const result = this._moveSquad(squad, direction);
        if (result) count++;
      }
    }

    const dirLabel = { forward: '전진', backward: '후퇴', left: '좌측', right: '우측', hold: '대기', objective: '점령지 이동' }[direction] || direction;
    chatUI.addLog('지휘', null, `전 아군 ${dirLabel} 명령 하달 — ${count}개 분대 실행`, 'system');
    return true;
  }

  /* ── 분대 이동 ── */
  _moveSquad(squad, direction) {
    const range = this.scene._getMoveRange(squad);
    if (range === 0) {
      chatUI.addLog('SYSTEM', null, `A${squad.id}분대 이동 불가`, 'system');
      return false;
    }

    // 방향 벡터: 아군 스폰이 하단(row 높음)이므로 '전진'은 row 감소(맵 위쪽)
    const DIRS = {
      forward:  { dc:  0, dr: -1 },
      backward: { dc:  0, dr:  1 },
      left:     { dc: -1, dr:  0 },
      right:    { dc:  1, dr:  0 },
    };

    let dir = DIRS[direction];
    if (!dir) {
      // 목표 방향 전진
      if (direction === 'objective' && this.scene.objective?.center) {
        const obj = this.scene.objective.center;
        const dc  = obj.col - squad.pos.col;
        const dr  = obj.row - squad.pos.row;
        dir = { dc: Math.sign(dc), dr: Math.sign(dr) };
      } else {
        return false;
      }
    }

    // 최대 이동 거리(range)만큼 해당 방향으로 이동
    const steps = Math.min(range, 2);
    let col = squad.pos.col;
    let row = squad.pos.row;

    for (let i = 0; i < steps; i++) {
      const nc = col + dir.dc;
      const nr = row + dir.dr;
      if (!this.scene.gridMap.isInBounds(nc, nr)) break;
      col = nc;
      row = nr;
    }

    if (col === squad.pos.col && row === squad.pos.row) return false;

    const targetPos = { col, row };
    this._enqueueMove(squad, targetPos);

    const coord = `${String.fromCharCode(65 + (col % 26))}-${String(row + 1).padStart(2, '0')}`;
    const dirLabel = { forward: '전진', backward: '후퇴', left: '좌측', right: '우측' }[direction] || '이동';
    chatUI.addLog('지휘', null, `A${squad.id}분대 ${dirLabel} → ${coord}`, 'system');
    return true;
  }

  /* ── 점령지 방향 이동 ── */
  _moveToObjective(squad) {
    const obj = this.scene.objective?.center;
    if (!obj) {
      chatUI.addLog('SYSTEM', null, '점령지 미발견 — 탐색 필요', 'system');
      return false;
    }
    return this._moveSquad(squad, 'objective');
  }

  /* ── 가장 가까운 적 공격 ── */
  _attackNearest(squad) {
    const enemies = this.scene.squads.filter(s => s.side === 'enemy' && s.alive);
    if (enemies.length === 0) return false;

    const wDef = squad.weaponDef || { range: CONFIG.RIFLE_RANGE };
    const inRange = enemies.filter(e => {
      const dist = Math.abs(e.pos.col - squad.pos.col) + Math.abs(e.pos.row - squad.pos.row);
      return dist <= wDef.range;
    });

    if (inRange.length === 0) {
      chatUI.addLog('SYSTEM', null, `A${squad.id}분대 — 사거리 내 적 없음`, 'system');
      return false;
    }

    // 가장 가까운 적
    const target = inRange.reduce((best, e) => {
      const d = Math.abs(e.pos.col - squad.pos.col) + Math.abs(e.pos.row - squad.pos.row);
      const bd = Math.abs(best.pos.col - squad.pos.col) + Math.abs(best.pos.row - squad.pos.row);
      return d < bd ? e : best;
    });

    this._enqueueAttack(squad, target);
    chatUI.addLog('지휘', null, `A${squad.id}분대 → E${target.id - CONFIG.SQUAD_COUNT}분대 사격 명령`, 'system');
    return true;
  }

  /* ── 대기 명령 ── */
  _holdSquad(squad) {
    chatUI.addLog('지휘', null, `A${squad.id}분대 현위치 대기`, 'system');
    // 대기는 pendingCmds에 아무것도 추가하지 않음 (기본 행동)
    return true;
  }

  /* ── 명령 큐 추가 헬퍼 ── */
  _enqueueMove(squad, targetPos) {
    // 기존 해당 분대 명령 제거 후 재등록
    this.scene.pendingCmds = this.scene.pendingCmds.filter(c => c.squadId !== squad.id);
    this.scene.pendingCmds.push({ type: 'move', squadId: squad.id, targetPos });
    // 지형 하이라이트
    this.scene.gridMap.highlightTile(targetPos.col, targetPos.row, 0x39ff8e, 0.40);
    // 진행 버튼 표시
    if (typeof this.scene._showProceedBtn === 'function') {
      this.scene._showProceedBtn('명령 확정');
    }
    this.scene._syncPanel?.();
  }

  _enqueueAttack(squad, target) {
    this.scene.pendingCmds = this.scene.pendingCmds.filter(c => c.squadId !== squad.id);
    this.scene.pendingCmds.push({ type: 'attack', squadId: squad.id, targetId: target.id });
    squad.ap = Math.max(0, squad.ap - 1);
    this.scene.gridMap.highlightTile(target.pos.col, target.pos.row, 0xff4444, 0.45);
    if (typeof this.scene._showProceedBtn === 'function') {
      this.scene._showProceedBtn('명령 확정');
    }
    this.scene._syncPanel?.();
  }
}
