import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimerSystem } from '../systems/TimerSystem';
import { BASE_TIME_MS, DECAY_MS, MIN_TIME_MS } from '../constants';

/**
 * TimerSystemのテスト
 * 制限時間計算・タイマー動作・一時停止・時間切れ判定を検証する
 */
describe('TimerSystem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calcLimitMs()', () => {
    it('フロア1はBASE_TIME_MSになる', () => {
      expect(TimerSystem.calcLimitMs(1)).toBe(BASE_TIME_MS);
    });

    it('フロアが深いほど制限時間が短くなる', () => {
      const floor1 = TimerSystem.calcLimitMs(1);
      const floor2 = TimerSystem.calcLimitMs(2);
      expect(floor2).toBe(floor1 - DECAY_MS);
    });

    it('MIN_TIME_MS より短くならない', () => {
      // 十分に深いフロアでも下限以上
      const deepFloor = TimerSystem.calcLimitMs(100);
      expect(deepFloor).toBeGreaterThanOrEqual(MIN_TIME_MS);
    });

    it('MIN_TIME_MSに達するフロアを正しく計算する', () => {
      // BASE_TIME_MS - (floor - 1) * DECAY_MS = MIN_TIME_MS
      // floor = (BASE_TIME_MS - MIN_TIME_MS) / DECAY_MS + 1
      const floorAtMin = Math.ceil((BASE_TIME_MS - MIN_TIME_MS) / DECAY_MS) + 1;
      expect(TimerSystem.calcLimitMs(floorAtMin)).toBe(MIN_TIME_MS);
      expect(TimerSystem.calcLimitMs(floorAtMin + 5)).toBe(MIN_TIME_MS);
    });
  });

  describe('start() / stop() / getElapsedMs()', () => {
    it('開始直後は経過時間がほぼ0', () => {
      const t = new TimerSystem(1);
      t.start();
      expect(t.getElapsedMs()).toBe(0);
    });

    it('経過時間を正しく計測する', () => {
      const t = new TimerSystem(1);
      t.start();
      vi.advanceTimersByTime(1000);
      expect(t.getElapsedMs()).toBeCloseTo(1000, -1);
    });

    it('stop後はそれ以上経過時間が増えない', () => {
      const t = new TimerSystem(1);
      t.start();
      vi.advanceTimersByTime(500);
      t.stop();
      vi.advanceTimersByTime(1000);
      expect(t.getElapsedMs()).toBeCloseTo(500, -1);
    });
  });

  describe('pause() / resume()', () => {
    it('pause中は経過時間が増えない', () => {
      const t = new TimerSystem(1);
      t.start();
      vi.advanceTimersByTime(1000);
      t.pause();
      vi.advanceTimersByTime(2000);
      // pauseした時点の1000ms付近に止まっているはず
      expect(t.getElapsedMs()).toBeCloseTo(1000, -1);
    });

    it('resume後は経過時間が再び増える', () => {
      const t = new TimerSystem(1);
      t.start();
      vi.advanceTimersByTime(1000);
      t.pause();
      vi.advanceTimersByTime(2000); // この間は止まる
      t.resume();
      vi.advanceTimersByTime(500);
      // 1000ms（pause前）+ 500ms（resume後）= 1500ms
      expect(t.getElapsedMs()).toBeCloseTo(1500, -1);
    });
  });

  describe('getRemainingMs() / getRemainingRatio()', () => {
    it('開始直後は制限時間分残っている', () => {
      const t = new TimerSystem(1);
      t.start();
      expect(t.getRemainingMs()).toBeCloseTo(BASE_TIME_MS, -1);
    });

    it('半分経過したら残り半分', () => {
      const t = new TimerSystem(1);
      t.start();
      vi.advanceTimersByTime(BASE_TIME_MS / 2);
      expect(t.getRemainingRatio()).toBeCloseTo(0.5, 1);
    });

    it('残り時間は0未満にならない', () => {
      const t = new TimerSystem(1);
      t.start();
      vi.advanceTimersByTime(BASE_TIME_MS * 2);
      expect(t.getRemainingMs()).toBe(0);
      expect(t.getRemainingRatio()).toBe(0);
    });
  });

  describe('isExpired()', () => {
    it('開始直後は時間切れではない', () => {
      const t = new TimerSystem(1);
      t.start();
      expect(t.isExpired()).toBe(false);
    });

    it('制限時間を超えたら時間切れ', () => {
      const t = new TimerSystem(1);
      t.start();
      vi.advanceTimersByTime(BASE_TIME_MS + 1);
      expect(t.isExpired()).toBe(true);
    });

    it('ちょうど制限時間で時間切れ', () => {
      const t = new TimerSystem(1);
      t.start();
      vi.advanceTimersByTime(BASE_TIME_MS);
      expect(t.isExpired()).toBe(true);
    });
  });

  describe('isRunning()', () => {
    it('start後はrunning', () => {
      const t = new TimerSystem(1);
      t.start();
      expect(t.isRunning()).toBe(true);
    });

    it('stop後はrunningでない', () => {
      const t = new TimerSystem(1);
      t.start();
      t.stop();
      expect(t.isRunning()).toBe(false);
    });

    it('pause後はrunningでない', () => {
      const t = new TimerSystem(1);
      t.start();
      t.pause();
      expect(t.isRunning()).toBe(false);
    });
  });

  describe('updateForFloor()', () => {
    it('フロア変更で制限時間が更新される', () => {
      const t = new TimerSystem(1);
      expect(t.getLimitMs()).toBe(BASE_TIME_MS);
      t.updateForFloor(5);
      expect(t.getLimitMs()).toBe(TimerSystem.calcLimitMs(5));
    });

    it('フロア変更でタイマーがリセットされる', () => {
      const t = new TimerSystem(1);
      t.start();
      vi.advanceTimersByTime(2000);
      t.updateForFloor(2);
      expect(t.getElapsedMs()).toBe(0);
      expect(t.isRunning()).toBe(false);
    });
  });
});
