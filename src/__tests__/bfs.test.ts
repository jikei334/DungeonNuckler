import { describe, it, expect } from 'vitest';
import { BFSPathfinder } from '../dungeon/BFSPathfinder';
import type { TileType, TileVisibility } from '../types';

/** n×m の全床タイルを生成する */
function makeFloor(rows: number, cols: number): TileType[][] {
  return Array.from({ length: rows }, () => Array<TileType>(cols).fill('floor'));
}

/** n×m の全 visible な視界マップを生成する */
function makeVisible(rows: number, cols: number): TileVisibility[][] {
  return Array.from({ length: rows }, () => Array<TileVisibility>(cols).fill('visible'));
}

/**
 * BFSPathfinderのテスト
 * 経路探索・通行不可タイル・視界制約・経路復元を検証する
 */
describe('BFSPathfinder', () => {
  describe('findPath() – 基本動作', () => {
    it('スタートとゴールが同じなら null を返す', () => {
      const tiles = makeFloor(5, 5);
      const vis   = makeVisible(5, 5);
      expect(BFSPathfinder.findPath({ x: 2, y: 2 }, { x: 2, y: 2 }, tiles, vis)).toBeNull();
    });

    it('直線経路を正しく返す（スタートを含まない）', () => {
      const tiles = makeFloor(5, 5);
      const vis   = makeVisible(5, 5);
      const path  = BFSPathfinder.findPath({ x: 0, y: 0 }, { x: 3, y: 0 }, tiles, vis);
      expect(path).toEqual([
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ]);
    });

    it('縦方向の直線経路を返す', () => {
      const tiles = makeFloor(5, 5);
      const vis   = makeVisible(5, 5);
      const path  = BFSPathfinder.findPath({ x: 2, y: 0 }, { x: 2, y: 3 }, tiles, vis);
      expect(path).not.toBeNull();
      expect(path!.length).toBe(3);
      expect(path![path!.length - 1]).toEqual({ x: 2, y: 3 });
    });

    it('隣接マスへの経路は1要素', () => {
      const tiles = makeFloor(5, 5);
      const vis   = makeVisible(5, 5);
      const path  = BFSPathfinder.findPath({ x: 2, y: 2 }, { x: 2, y: 3 }, tiles, vis);
      expect(path).toEqual([{ x: 2, y: 3 }]);
    });
  });

  describe('findPath() – 壁・視界制約', () => {
    it('壁で塞がれた経路はnullを返す', () => {
      const tiles = makeFloor(5, 5);
      // 縦方向の壁でスタートとゴールを分断する
      for (let y = 0; y < 5; y++) tiles[y][2] = 'wall';
      const vis  = makeVisible(5, 5);
      const path = BFSPathfinder.findPath({ x: 0, y: 2 }, { x: 4, y: 2 }, tiles, vis);
      expect(path).toBeNull();
    });

    it('壁を迂回した最短経路を返す', () => {
      const tiles = makeFloor(3, 5);
      tiles[0][1] = 'wall';
      tiles[1][1] = 'wall';
      const vis   = makeVisible(3, 5);
      const path  = BFSPathfinder.findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, tiles, vis);
      expect(path).not.toBeNull();
      // 壁を避けているので経路は直線より長い
      expect(path!.length).toBeGreaterThan(2);
      expect(path![path!.length - 1]).toEqual({ x: 2, y: 0 });
    });

    it('ゴールが壁タイルならnullを返す', () => {
      const tiles = makeFloor(5, 5);
      tiles[3][3] = 'wall';
      const vis   = makeVisible(5, 5);
      expect(BFSPathfinder.findPath({ x: 0, y: 0 }, { x: 3, y: 3 }, tiles, vis)).toBeNull();
    });

    it('未探索（unseen）タイルはゴールにできない', () => {
      const tiles = makeFloor(5, 5);
      const vis   = makeVisible(5, 5);
      vis[3][3]   = 'unseen';
      expect(BFSPathfinder.findPath({ x: 0, y: 0 }, { x: 3, y: 3 }, tiles, vis)).toBeNull();
    });

    it('未探索タイルを通り抜けて経路を作れない', () => {
      const tiles = makeFloor(3, 5);
      const vis   = makeVisible(3, 5);
      // 縦方向をunseenで分断する
      for (let y = 0; y < 3; y++) vis[y][2] = 'unseen';
      const path = BFSPathfinder.findPath({ x: 0, y: 1 }, { x: 4, y: 1 }, tiles, vis);
      expect(path).toBeNull();
    });

    it('explored タイルは経路として通過できる', () => {
      const tiles = makeFloor(5, 5);
      const vis   = makeVisible(5, 5);
      vis[0][1]   = 'explored';  // explored は通行可能
      const path  = BFSPathfinder.findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, tiles, vis);
      expect(path).not.toBeNull();
      expect(path![path!.length - 1]).toEqual({ x: 2, y: 0 });
    });
  });

  describe('findPath() – マップ境界', () => {
    it('ゴールがマップ外ならnullを返す', () => {
      const tiles = makeFloor(5, 5);
      const vis   = makeVisible(5, 5);
      expect(BFSPathfinder.findPath({ x: 0, y: 0 }, { x: -1, y: 0 }, tiles, vis)).toBeNull();
      expect(BFSPathfinder.findPath({ x: 0, y: 0 }, { x: 5, y: 0 }, tiles, vis)).toBeNull();
      expect(BFSPathfinder.findPath({ x: 0, y: 0 }, { x: 0, y: 5 }, tiles, vis)).toBeNull();
    });
  });

  describe('findPath() – 経路の正確さ', () => {
    it('返された経路の全タイルが連続している（4方向隣接）', () => {
      const tiles = makeFloor(10, 10);
      const vis   = makeVisible(10, 10);
      // 障害物を置いて複雑な経路を生成する
      tiles[2][1] = 'wall';
      tiles[2][2] = 'wall';
      tiles[2][3] = 'wall';
      tiles[3][3] = 'wall';

      const start = { x: 0, y: 0 };
      const goal  = { x: 5, y: 5 };
      const path  = BFSPathfinder.findPath(start, goal, tiles, vis);
      expect(path).not.toBeNull();

      // 経路の各ステップがスタートまたは前のタイルと4方向隣接していることを確認する
      let prev = start;
      for (const step of path!) {
        const dx = Math.abs(step.x - prev.x);
        const dy = Math.abs(step.y - prev.y);
        expect(dx + dy).toBe(1);  // 4方向隣接のみ
        prev = step;
      }
      // 経路の最後がゴールと一致することを確認する
      expect(path![path!.length - 1]).toEqual(goal);
    });
  });
});
