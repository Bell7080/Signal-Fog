/* ════════════════════════════════════════════════════════════
   js/EventBus.js  —  모듈 간 통신 허브 (싱글턴)
   Signal-Fog  /  팀 LNG

   ▸ 역할: 파일 간 직접 의존 없이 발행/구독으로 통신
   ▸ 규칙: 비즈니스 로직 없음 — 순수 이벤트 라우팅만

   사용법:
     import bus from '../EventBus.js';
     import { EVT } from '../config.js';

     bus.emit(EVT.LOG, { sender: 'OC/T', text: '훈련 시작' });
     const unsub = bus.on(EVT.LOG, ({ sender, text }) => { ... });
     unsub();   // 구독 해제
════════════════════════════════════════════════════════════ */

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * 이벤트 구독
   * @param   {string}   event
   * @param   {Function} fn
   * @returns {Function} 구독 해제 함수 (Scene destroy 에서 호출)
   */
  on(event, fn) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);   // cleanup 함수 반환
  }

  /**
   * 단발성 구독 — 첫 수신 후 자동 해제
   */
  once(event, fn) {
    const wrapper = (data) => {
      fn(data);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  /** 구독 해제 */
  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
  }

  /**
   * 이벤트 발행
   * @param {string} event
   * @param {*}      data
   */
  emit(event, data) {
    this._listeners.get(event)?.forEach(fn => {
      try {
        fn(data);
      } catch (e) {
        console.error(`[EventBus] "${event}" 핸들러 오류:`, e);
      }
    });
  }

  /** 특정 이벤트 전체 해제 (씬 전환 시 cleanup) */
  clear(event) {
    this._listeners.delete(event);
  }

  /** 전체 리스너 해제 */
  clearAll() {
    this._listeners.clear();
  }
}

const bus = new EventBus();
export default bus;
