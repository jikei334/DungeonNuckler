/**
 * シード付き疑似乱数生成器（mulberry32アルゴリズム）
 * Math.random()を使わず再現性のある乱数を生成する
 */
export class PRNG {
  private seed: number;

  /**
   * @param seed - 乱数シード値
   */
  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  /**
   * 0.0〜1.0未満の乱数を生成する（mulberry32）
   * @returns 0以上1未満の浮動小数点数
   */
  nextFloat(): number {
    this.seed |= 0;
    this.seed = (this.seed + 0x6D2B79F5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * 指定範囲の整数乱数を生成する（両端含む）
   * @param min - 最小値（含む）
   * @param max - 最大値（含む）
   * @returns min以上max以下の整数
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }
}
