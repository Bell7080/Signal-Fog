/* ============================================================
   DayNightCycle.js — 낮/밤 사이클 관리
   ────────────────────────────────────────────────────────────
   · 매 N턴마다 낮 → 저녁 → 밤 → 새벽 → 낮 순환
   · FogOfWar와 연동: 밤에는 기본 시야 축소
   · Three.js AmbientLight/PointLight 색온도 변화
   · CONFIG에 추가된 DAY_NIGHT_* 값 참조
   ============================================================ */

class DayNightCycle {

  /* ── 페이즈 정의 ──────────────────────────────────────────
     각 페이즈별:
       label       : 화면 표시 이름
       turnsLength : 이 페이즈가 지속되는 턴 수
       sightMod    : 기본 시야 반경에 더하는 가감치
       ambientHex  : AmbientLight 색상
       ambientInt  : AmbientLight 강도
       pointHex    : PointLight (태양/달) 색상
       pointInt    : PointLight 강도
       fogHex      : scene.fog 색상 (Three.FogExp2)
       skyBg       : CSS --col-bg 오버라이드용 (선택)
  ─────────────────────────────────────────────────────────── */
  static PHASES = [
    {
      id:          'day',
      label:       '낮',
      turnsLength: 4,
      sightMod:    0,          // 기본 시야 유지
      ambientHex:  0x1a4022,
      ambientInt:  1.5,
      pointHex:    0x39ff8e,
      pointInt:    1.5,
      fogHex:      0x040604,
    },
    {
      id:          'dusk',
      label:       '저녁',
      turnsLength: 2,
      sightMod:    -1,         // 시야 -1
      ambientHex:  0x3a2010,
      ambientInt:  1.0,
      pointHex:    0xff8c40,
      pointInt:    1.0,
      fogHex:      0x120804,
    },
    {
      id:          'night',
      label:       '밤',
      turnsLength: 4,
      sightMod:    -2,         // 시야 -2 (주간 대비 절반)
      ambientHex:  0x060a18,
      ambientInt:  0.5,
      pointHex:    0x4466cc,
      pointInt:    0.6,
      fogHex:      0x020408,
    },
    {
      id:          'dawn',
      label:       '새벽',
      turnsLength: 2,
      sightMod:    -1,         // 시야 -1
      ambientHex:  0x1a1830,
      ambientInt:  0.8,
      pointHex:    0xcc88ff,
      pointInt:    0.9,
      fogHex:      0x080410,
    },
  ];

  constructor() {
    this._phaseIndex = 0;      // 현재 페이즈 인덱스
    this._turnInPhase = 0;     // 현재 페이즈 내 경과 턴
    this._totalTurn = 0;       // 전체 경과 턴
    this._lights = null;       // { ambient, point } Three.js light 참조
  }

  /* ── 초기화: Three.js 조명 참조 주입 ─────────────────────── */
  /**
   * @param {{ ambient: THREE.AmbientLight, point: THREE.PointLight, scene: THREE.Scene }} lights
   */
  init(lights) {
    this._lights = lights;
    this._applyLighting();
  }

  /* ── 현재 페이즈 정보 ─────────────────────────────────────── */
  get phase()     { return DayNightCycle.PHASES[this._phaseIndex]; }
  get isNight()   { return this.phase.id === 'night'; }
  get isDusk()    { return this.phase.id === 'dusk'; }
  get isDawn()    { return this.phase.id === 'dawn'; }
  get phaseLabel(){ return this.phase.label; }

  /**
   * 현재 페이즈의 시야 가감치 반환
   * @returns {number} 음수 = 시야 감소
   */
  get sightMod()  { return this.phase.sightMod; }

  /* ── 턴 진행: TurnManager.startInputPhase()에서 호출 ─────── */
  /**
   * @returns {{ phaseChanged: boolean, newPhase: object, log: string|null }}
   */
  tick() {
    this._totalTurn++;
    this._turnInPhase++;

    const current = DayNightCycle.PHASES[this._phaseIndex];
    const phaseChanged = this._turnInPhase >= current.turnsLength;

    let log = null;
    if (phaseChanged) {
      this._turnInPhase = 0;
      this._phaseIndex  = (this._phaseIndex + 1) % DayNightCycle.PHASES.length;
      const next = DayNightCycle.PHASES[this._phaseIndex];
      log = this._phaseChangeLog(next);
      this._applyLighting();
    }

    return { phaseChanged, newPhase: this.phase, log };
  }

  /* ── HUD용 상태 문자열 ────────────────────────────────────── */
  getStatusText() {
    const p = this.phase;
    const remaining = p.turnsLength - this._turnInPhase;
    const sightStr  = p.sightMod === 0 ? '시야 정상' :
                      `시야 ${p.sightMod > 0 ? '+' : ''}${p.sightMod}`;
    return `${p.label} (${sightStr}, 잔여 ${remaining}턴)`;
  }

  /* ── 총 시야 반경 계산 ────────────────────────────────────── */
  /**
   * CONFIG.FOG_SIGHT_RANGE에 현재 페이즈 보정치 적용
   * 최소 1 보장
   * @returns {number}
   */
  getSightRange() {
    return Math.max(1, CONFIG.FOG_SIGHT_RANGE + this.sightMod);
  }

  /* ── Three.js 조명 업데이트 ───────────────────────────────── */
  _applyLighting() {
    if (!this._lights) return;
    const p = this.phase;

    const { ambient, point, scene } = this._lights;
    if (ambient) {
      ambient.color.setHex(p.ambientHex);
      ambient.intensity = p.ambientInt;
    }
    if (point) {
      point.color.setHex(p.pointHex);
      point.intensity = p.pointInt;
    }
    if (scene && scene.fog) {
      scene.fog.color.setHex(p.fogHex);
    }
  }

  /* ── 페이즈 전환 로그 메시지 ──────────────────────────────── */
  _phaseChangeLog(phase) {
    const msgs = {
      day:   '🌅 날이 밝았다. 시야 정상 복구.',
      dusk:  '🌆 해가 기울기 시작한다. 시야 -1.',
      night: '🌙 야간 작전 돌입. 시야 대폭 감소.',
      dawn:  '🌄 동이 튼다. 시야 서서히 회복 중.',
    };
    return msgs[phase.id] || `페이즈 전환: ${phase.label}`;
  }
}
