import { describe, it, expect } from 'vitest';
import { Player } from '../entities/Player';
import { DungeonGenerator } from '../dungeon/DungeonGenerator';
import type { TileType } from '../types';

/**
 * Playerクラスのテスト
 * 移動・向き・バンプアタック判定・ダメージ処理を検証する
 */
describe('Player', () => {
  describe('createInitial()', () => {
    it('指定位置でプレイヤーを生成する', () => {
      const p = Player.createInitial({ x: 5, y: 3 });
      expect(p.pos).toEqual({ x: 5, y: 3 });
    });

    it('HP が最大値で初期化される', () => {
      const p = Player.createInitial({ x: 0, y: 0 });
      expect(p.hp).toBe(p.maxHp);
      expect(p.hp).toBeGreaterThan(0);
    });

    it('level が 1 で初期化される', () => {
      const p = Player.createInitial({ x: 0, y: 0 });
      expect(p.level).toBe(1);
      expect(p.exp).toBe(0);
    });
  });

  describe('tryMove()', () => {
    // 3x3の床タイルを作成
    const makeFloorTiles = (w: number, h: number): TileType[][] =>
      Array.from({ length: h }, () => Array<TileType>(w).fill('floor'));

    it('床タイルへ移動できる', () => {
      const tiles = makeFloorTiles(10, 10);
      const p = Player.createInitial({ x: 5, y: 5 });
      const { moved } = Player.tryMove(p, 'up', tiles, []);
      expect(moved).toBe(true);
      expect(p.pos.y).toBe(4);
    });

    it('壁タイルには移動できない', () => {
      const tiles = makeFloorTiles(10, 10);
      tiles[4][5] = 'wall';
      const p = Player.createInitial({ x: 5, y: 5 });
      const { moved } = Player.tryMove(p, 'up', tiles, []);
      expect(moved).toBe(false);
      expect(p.pos.y).toBe(5);
    });

    it('壁でも向きは更新される', () => {
      const tiles = makeFloorTiles(10, 10);
      tiles[4][5] = 'wall';
      const p = Player.createInitial({ x: 5, y: 5 });
      Player.tryMove(p, 'up', tiles, []);
      expect(p.facing).toBe('up');
    });

    it('マップ外には移動できない', () => {
      const tiles = makeFloorTiles(5, 5);
      const p = Player.createInitial({ x: 0, y: 0 });
      const { moved } = Player.tryMove(p, 'up', tiles, []);
      expect(moved).toBe(false);
    });

    it('敵がいる位置はバンプアタックになる', () => {
      const tiles = makeFloorTiles(10, 10);
      const p = Player.createInitial({ x: 5, y: 5 });
      const enemies = [{ id: 'enemy-1', pos: { x: 5, y: 4 } }];
      const { moved, bumpedEnemyId } = Player.tryMove(p, 'up', tiles, enemies);
      expect(moved).toBe(false);
      expect(bumpedEnemyId).toBe('enemy-1');
    });

    it('4方向すべてに移動できる', () => {
      const tiles = makeFloorTiles(10, 10);
      const dirs: Array<{ dir: 'up' | 'down' | 'left' | 'right'; dx: number; dy: number }> = [
        { dir: 'up',    dx:  0, dy: -1 },
        { dir: 'down',  dx:  0, dy:  1 },
        { dir: 'left',  dx: -1, dy:  0 },
        { dir: 'right', dx:  1, dy:  0 },
      ];
      for (const { dir, dx, dy } of dirs) {
        const p = Player.createInitial({ x: 5, y: 5 });
        Player.tryMove(p, dir, tiles, []);
        expect(p.pos).toEqual({ x: 5 + dx, y: 5 + dy });
      }
    });
  });

  describe('takeDamage()', () => {
    it('HPが減少する', () => {
      const p = Player.createInitial({ x: 0, y: 0 });
      Player.takeDamage(p, 1);
      expect(p.hp).toBe(p.maxHp - 1);
    });

    it('HPは0未満にならない', () => {
      const p = Player.createInitial({ x: 0, y: 0 });
      Player.takeDamage(p, 100);
      expect(p.hp).toBe(0);
    });
  });

  describe('isAlive()', () => {
    it('HP > 0 なら生存', () => {
      const p = Player.createInitial({ x: 0, y: 0 });
      expect(Player.isAlive(p)).toBe(true);
    });

    it('HP = 0 なら死亡', () => {
      const p = Player.createInitial({ x: 0, y: 0 });
      Player.takeDamage(p, p.maxHp);
      expect(Player.isAlive(p)).toBe(false);
    });
  });

  describe('実際のダンジョンフロアでの移動', () => {
    it('フロア生成後のプレイヤー開始位置は床タイル', () => {
      const floor = DungeonGenerator.generate(1, 42);
      const p = Player.createInitial(floor.playerStart);
      expect(floor.tiles[p.pos.y][p.pos.x]).not.toBe('wall');
    });
  });
});
