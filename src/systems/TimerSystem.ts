import { BASE_TIME_MS, DECAY_MS, MIN_TIME_MS } from '../constants';

/**
 * 行動制限タイマーのロジック管理クラス
 * フロア深度に応じた制限時間の計算と経過時間追跡を担う
 */
export class TimerSystem {
  /** 現在フロアの制限時間（ミリ秒） */
  private limitMs: number;
  /** タイマー開始時刻（Date.now()）。停止中は -1 */
  private startedAt = -1;
  /** 一時停止中に経過していた時間（ミリ秒）の累計 */
  private pausedElapsedMs = 0;
  /** タイマーが動いているか */
  private running = false;

  /**
   * @param floorNumber - フロア番号（1始まり）。制限時間の計算に使用
   */
  constructor(floorNumber: number) {
    this.limitMs = TimerSystem.calcLimitMs(floorNumber);
  }

  /**
   * フロア番号から行動制限時間を計算する
   * timeLimitMs = max(MIN_TIME_MS, BASE_TIME_MS - (floor - 1) * DECAY_MS)
   *
   * @param floorNumber - フロア番号（1始まり）
   * @returns 制限時間（ミリ秒）
   */
  static calcLimitMs(floorNumber: number): number {
    return Math.max(MIN_TIME_MS, BASE_TIME_MS - (floorNumber - 1) * DECAY_MS);
  }

  /**
   * タイマーを開始する（既に動いている場合はリセットして再開）
   */
  start(): void {
    this.pausedElapsedMs = 0;
    this.startedAt = Date.now();
    this.running = true;
  }

  /**
   * タイマーを停止する（elapsedMsを保持）
   */
  stop(): void {
    if (this.running) {
      this.pausedElapsedMs = this.getElapsedMs();
      this.running = false;
      this.startedAt = -1;
    }
  }

  /**
   * タイマーを一時停止する（タブ非アクティブ時などに使用）
   */
  pause(): void {
    if (this.running) {
      this.pausedElapsedMs = this.getElapsedMs();
      this.startedAt = -1;
      this.running = false;
    }
  }

  /**
   * 一時停止したタイマーを再開する
   */
  resume(): void {
    if (!this.running) {
      this.startedAt = Date.now();
      this.running = true;
    }
  }

  /**
   * タイマーが動いているか返す
   * @returns 動いていればtrue
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * タイマー開始からの経過時間を返す（ミリ秒）
   * 停止中は停止直前の経過時間を返す
   *
   * @returns 経過時間（ミリ秒）
   */
  getElapsedMs(): number {
    if (this.running && this.startedAt >= 0) {
      return this.pausedElapsedMs + (Date.now() - this.startedAt);
    }
    return this.pausedElapsedMs;
  }

  /**
   * 残り時間を返す（ミリ秒）。0未満にはならない
   * @returns 残り時間（ミリ秒）
   */
  getRemainingMs(): number {
    return Math.max(0, this.limitMs - this.getElapsedMs());
  }

  /**
   * 残り時間の割合を返す（0.0〜1.0）
   * @returns 残り割合（1.0 = 満タン、0.0 = 時間切れ）
   */
  getRemainingRatio(): number {
    return this.getRemainingMs() / this.limitMs;
  }

  /**
   * 時間切れかどうかを返す
   * @returns 時間切れならtrue
   */
  isExpired(): boolean {
    return this.getElapsedMs() >= this.limitMs;
  }

  /**
   * 制限時間（ミリ秒）を返す
   * @returns 制限時間
   */
  getLimitMs(): number {
    return this.limitMs;
  }

  /**
   * 新しいフロアに対応した制限時間に更新し、タイマーをリセットする
   * @param floorNumber - 新しいフロア番号
   */
  updateForFloor(floorNumber: number): void {
    this.limitMs = TimerSystem.calcLimitMs(floorNumber);
    this.pausedElapsedMs = 0;
    this.startedAt = -1;
    this.running = false;
  }
}
