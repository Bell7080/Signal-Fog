/* ============================================================
   CommsSystem.js — 통신 오류 (오청) 판정 시스템
   예선 MVP: 오청 3종

   오청 종류:
     1. 이동 좌표 변형  — 다른 위치로 이동
     2. 공격 명령 오청  — 이동 명령이 공격으로 둔갑 (or 반대)
     3. 명령 무시       — 통신 두절로 분대가 제자리 대기

   오청 발생 조건: 통신 품질 < CONFIG.COMMS_QUALITY_THRESHOLD
   ============================================================ */

class CommsSystem {

  constructor() {
    this.batteryLevel = 100;
  }

  /**
   * 분대의 현재 통신 품질 계산 (0~100)
   * @param {object} squad - { terrain }
   * @returns {number}
   */
  calcQuality(squad) {
    let quality = 100;

    const terrain = squad.terrain;
    if (terrain && terrain.commsPenalty) {
      quality -= terrain.commsPenalty;
    }

    // 배터리 패널티 (50% 미만부터 선형 감소)
    if (this.batteryLevel < 50) {
      quality -= (50 - this.batteryLevel) * 0.4;
    }

    return Math.max(0, Math.min(100, quality));
  }

  /**
   * 오청 발생 여부 판정
   * @param {number} quality
   * @returns {boolean}
   */
  rollMishear(quality) {
    if (quality >= CONFIG.COMMS_QUALITY_THRESHOLD) return false;
    const mishearChance = (CONFIG.COMMS_QUALITY_THRESHOLD - quality) / 100;
    return Math.random() < mishearChance;
  }

  /**
   * 오청 종류 결정
   * 품질이 낮을수록 심각한 오청(명령 무시) 확률 증가
   * @param {number} quality
   * @returns {'coord' | 'ignore' | 'attack_instead'}
   */
  _rollMishearType(quality) {
    const severity = 1 - (quality / CONFIG.COMMS_QUALITY_THRESHOLD); // 0~1 (클수록 심각)
    const r = Math.random();

    // 품질이 매우 낮으면 명령 무시 확률 증가
    const ignoreThreshold    = 0.15 + severity * 0.35; // 15~50%
    const attackThreshold    = ignoreThreshold + 0.20;  // 20% 고정

    if (r < ignoreThreshold)  return 'ignore';
    if (r < attackThreshold)  return 'attack_instead';
    return 'coord';
  }

  /**
   * 명령에 오청 변형 적용 (3종)
   *
   * @param {object} command     - { type, squadId, targetTile?, targetId? }
   * @param {Array}  allSquads   - 전체 분대 배열 (공격 대상 후보)
   * @param {object} issuerSquad - 명령을 내리는 분대 객체
   *
   * @returns {{
   *   command:        object,
   *   distorted:      boolean,
   *   mishearType:    string,   // 'none' | 'coord' | 'ignore' | 'attack_instead'
   *   originalText:   string,
   *   distortedText:  string,
   * }}
   */
  applyMishear(command, allSquads = [], issuerSquad = null) {
    // 공통 헬퍼
    const colLabel = (c) => String.fromCharCode(65 + c);
    const rowLabel = (r) => String(r + 1).padStart(2, '0');

    // ── 원본 텍스트 생성 ──
    let originalText = '';
    if (command.type === 'move' && command.targetTile) {
      originalText = `이동 명령: ${colLabel(command.targetTile.col)}-${rowLabel(command.targetTile.row)}`;
    } else if (command.type === 'attack' && command.targetId != null) {
      originalText = `사격 명령: E${command.targetId - 3}분대`;
    } else {
      return { command, distorted: false, mishearType: 'none', originalText: '', distortedText: '' };
    }

    const mishearType = this._rollMishearType(
      issuerSquad ? this.calcQuality(issuerSquad) : 0
    );

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 오청 1: 좌표 변형 (이동 명령만)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (mishearType === 'coord' && command.type === 'move' && command.targetTile) {
      // ±1~2 범위 무작위 변위 (품질 낮을수록 더 크게 벗어남)
      const maxShift = 2;
      const dc = Math.floor(Math.random() * (maxShift * 2 + 1)) - maxShift;
      const dr = Math.floor(Math.random() * (maxShift * 2 + 1)) - maxShift;

      // 최소 1칸은 달라져야 의미있는 오청
      const actualDc = (dc === 0 && dr === 0) ? 1 : dc;
      const newCol = Math.max(0, Math.min(CONFIG.GRID_COLS - 1, command.targetTile.col + actualDc));
      const newRow = Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, command.targetTile.row + dr));

      const distortedCmd = {
        ...command,
        targetTile: { col: newCol, row: newRow },
        targetPos:  { col: newCol, row: newRow }, // _issueMove에서 참조하는 필드도 갱신
        _mishear:   true,
      };
      const distortedText = `이동 명령: ${colLabel(newCol)}-${rowLabel(newRow)}`;
      return { command: distortedCmd, distorted: true, mishearType, originalText, distortedText };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 오청 2: 명령 무시 (제자리 대기)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (mishearType === 'ignore') {
      const distortedCmd = { ...command, type: 'ignore', _mishear: true };
      const distortedText = '--- 통신 두절 (명령 미전달) ---';
      return { command: distortedCmd, distorted: true, mishearType, originalText, distortedText };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 오청 3: 이동→공격 명령으로 둔갑
    // (이동 명령일 때만, 근처 적이 있을 때만 발동)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (mishearType === 'attack_instead' && command.type === 'move') {
      // 인접한 적 분대 중 랜덤 선택
      const enemies = allSquads.filter(s => s.side === 'enemy' && s.alive);
      if (enemies.length > 0 && issuerSquad) {
        // 사거리 내 적 우선, 없으면 가장 가까운 적
        const inRange = enemies.filter(e =>
          Math.abs(e.pos.col - issuerSquad.pos.col) + Math.abs(e.pos.row - issuerSquad.pos.row) <= CONFIG.RIFLE_RANGE
        );
        const pool    = inRange.length > 0 ? inRange : enemies;
        const target  = pool[Math.floor(Math.random() * pool.length)];

        const distortedCmd = {
          type:     'attack',
          squadId:  command.squadId,
          targetId: target.id,
          _mishear: true,
        };
        const distortedText = `사격 명령: E${target.id - 3}분대 (원본: 이동 명령)`;
        return { command: distortedCmd, distorted: true, mishearType, originalText, distortedText };
      }
      // 근처 적 없으면 좌표 변형으로 폴백
      return this.applyMishear({ ...command, _retryCoord: true }, allSquads, issuerSquad);
    }

    // 오청 타입이 attack_instead인데 attack 명령인 경우 → coord 폴백
    return { command, distorted: false, mishearType: 'none', originalText, distortedText: originalText };
  }

  /** 턴 종료 시 배터리 소모 */
  drainBattery() {
    this.batteryLevel = Math.max(0, this.batteryLevel - CONFIG.BATTERY_DRAIN_PER_TURN);
    return this.batteryLevel;
  }
}
