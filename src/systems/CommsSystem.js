/* ============================================================
   CommsSystem.js — 통신 오류 (오청) 판정 시스템
   예선 MVP: 오청 1종 (좌표·방향 변형)

   오청 발생 조건: 통신 품질 < CONFIG.COMMS_QUALITY_THRESHOLD
   통신 품질에 영향을 주는 요소:
     - 현재 지형 (계곡: 대폭 감소, 고지: 범위 +1)
     - 무전기 배터리 잔량

   구현 순서 (하나씩 추가):
     1. calcQuality()     — 분대별 통신 품질 수치 계산
     2. rollMishear()     — 오청 발생 여부 판정
     3. applyMishear()    — 명령 텍스트 또는 좌표 변형
     4. drainBattery()    — 턴당 배터리 소모 처리
   ============================================================ */

class CommsSystem {

  constructor() {
    this.batteryLevel = 100; // 무전기 배터리 (%)
  }

  /**
   * 분대의 현재 통신 품질 계산 (0~100)
   * @param {object} squad       - 분대 데이터 (현재 지형 포함)
   * @returns {number}           - 통신 품질 수치
   */
  calcQuality(squad) {
    let quality = 100;

    // 지형 패널티
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
   * @param {number} quality - 통신 품질 수치
   * @returns {boolean}
   */
  rollMishear(quality) {
    if (quality >= CONFIG.COMMS_QUALITY_THRESHOLD) return false;
    // 품질이 낮을수록 오청 확률 증가
    const mishearChance = (CONFIG.COMMS_QUALITY_THRESHOLD - quality) / 100;
    return Math.random() < mishearChance;
  }

  /**
   * 명령에 오청 변형 적용
   * @param {{ type: string, squadId: number, targetTile?: object }} command
   * @returns {{ command: object, distorted: boolean, originalText: string, distortedText: string }}
   */
  applyMishear(command) {
    if (command.type !== 'move' || !command.targetTile) {
      return { command, distorted: false };
    }

    const original = { ...command.targetTile };

    // 좌표 변형: ±1 범위 내 무작위 이동
    const dc = Math.floor(Math.random() * 3) - 1;
    const dr = Math.floor(Math.random() * 3) - 1;

    const distorted = {
      ...command,
      targetTile: {
        col: Math.max(0, Math.min(CONFIG.GRID_COLS - 1, command.targetTile.col + dc)),
        row: Math.max(0, Math.min(CONFIG.GRID_ROWS - 1, command.targetTile.row + dr)),
      },
    };

    const colLabel  = (c) => String.fromCharCode(65 + c);
    const origText  = `${colLabel(original.col)}-${String(original.row + 1).padStart(2,'0')}`;
    const distText  = `${colLabel(distorted.targetTile.col)}-${String(distorted.targetTile.row + 1).padStart(2,'0')}`;

    return {
      command: distorted,
      distorted: true,
      originalText:  `이동 명령: ${origText}`,
      distortedText: `이동 명령: ${distText}`,
    };
  }

  /** 턴 종료 시 배터리 소모 */
  drainBattery() {
    this.batteryLevel = Math.max(0, this.batteryLevel - CONFIG.BATTERY_DRAIN_PER_TURN);
    return this.batteryLevel;
  }
}
