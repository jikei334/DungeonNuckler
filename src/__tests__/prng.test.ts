import { describe, it, expect } from 'vitest';
import { PRNG } from '../utils/prng';

/**
 * PRNGクラスのテスト
 * シード付き乱数の再現性・範囲・分布を検証する
 */
describe('PRNG', () => {
  it('同じシードで同じ数列を生成する（再現性）', () => {
    const a = new PRNG(42);
    const b = new PRNG(42);
    for (let i = 0; i < 20; i++) {
      expect(a.nextFloat()).toBe(b.nextFloat());
    }
  });

  it('異なるシードで異なる数列を生成する', () => {
    const a = new PRNG(1);
    const b = new PRNG(2);
    const resultsA = Array.from({ length: 10 }, () => a.nextFloat());
    const resultsB = Array.from({ length: 10 }, () => b.nextFloat());
    expect(resultsA).not.toEqual(resultsB);
  });

  it('nextFloat は 0以上1未満の値を返す', () => {
    const prng = new PRNG(99);
    for (let i = 0; i < 1000; i++) {
      const v = prng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt は指定範囲内の整数を返す', () => {
    const prng = new PRNG(7);
    for (let i = 0; i < 500; i++) {
      const v = prng.nextInt(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('nextInt の両端値が生成される（境界値確認）', () => {
    const prng = new PRNG(123);
    const values = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      values.add(prng.nextInt(0, 5));
    }
    expect(values.has(0)).toBe(true);
    expect(values.has(5)).toBe(true);
  });
});
