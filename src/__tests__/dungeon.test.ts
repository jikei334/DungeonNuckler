import { describe, it, expect } from 'vitest';
import { DungeonGenerator } from '../dungeon/DungeonGenerator';
import { MAP_WIDTH, MAP_HEIGHT, BOSS_FLOOR_INTERVAL } from '../constants';

/**
 * DungeonGeneratorのテスト
 * フロア生成の正確性・再現性・各要素の配置を検証する
 */
describe('DungeonGenerator', () => {
  describe('generate()', () => {
    it('同じシードで同じフロアを生成する（再現性）', () => {
      const a = DungeonGenerator.generate(1, 12345);
      const b = DungeonGenerator.generate(1, 12345);
      expect(a.tiles).toEqual(b.tiles);
      expect(a.playerStart).toEqual(b.playerStart);
      expect(a.stairsPos).toEqual(b.stairsPos);
    });

    it('フロア番号が異なれば異なるマップを生成する', () => {
      const floor1 = DungeonGenerator.generate(1, 12345);
      const floor2 = DungeonGenerator.generate(2, 12345);
      // タイル配列が完全一致することはない
      const same = floor1.tiles.every((row, y) =>
        row.every((tile, x) => tile === floor2.tiles[y][x])
      );
      expect(same).toBe(false);
    });

    it('タイル配列のサイズが正しい', () => {
      const floor = DungeonGenerator.generate(1, 42);
      expect(floor.tiles.length).toBe(MAP_HEIGHT);
      expect(floor.tiles[0].length).toBe(MAP_WIDTH);
    });

    it('playerStart が床タイル上にある', () => {
      const floor = DungeonGenerator.generate(1, 100);
      const { x, y } = floor.playerStart;
      expect(floor.tiles[y][x]).not.toBe('wall');
    });

    it('stairsPos が stairs タイルになっている', () => {
      const floor = DungeonGenerator.generate(1, 200);
      const { x, y } = floor.stairsPos;
      expect(floor.tiles[y][x]).toBe('stairs');
    });

    it('playerStart と stairsPos が異なる位置にある', () => {
      const floor = DungeonGenerator.generate(1, 300);
      const start = floor.playerStart;
      const stairs = floor.stairsPos;
      expect(start.x === stairs.x && start.y === stairs.y).toBe(false);
    });

    it('visibility が全て unseen で初期化されている', () => {
      const floor = DungeonGenerator.generate(1, 999);
      const allUnseen = floor.visibility.every((row) =>
        row.every((v) => v === 'unseen')
      );
      expect(allUnseen).toBe(true);
    });

    it('部屋が少なくとも1つ生成される', () => {
      const floor = DungeonGenerator.generate(1, 77);
      expect(floor.rooms.length).toBeGreaterThanOrEqual(1);
    });

    it('マップ外周は壁になっている', () => {
      const floor = DungeonGenerator.generate(1, 555);
      for (let x = 0; x < MAP_WIDTH; x++) {
        expect(floor.tiles[0][x]).toBe('wall');
        expect(floor.tiles[MAP_HEIGHT - 1][x]).toBe('wall');
      }
      for (let y = 0; y < MAP_HEIGHT; y++) {
        expect(floor.tiles[y][0]).toBe('wall');
        expect(floor.tiles[y][MAP_WIDTH - 1]).toBe('wall');
      }
    });
  });

  describe('isBossFloor()', () => {
    it('BOSS_FLOOR_INTERVAL の倍数でボスフロアになる', () => {
      expect(DungeonGenerator.isBossFloor(BOSS_FLOOR_INTERVAL)).toBe(true);
      expect(DungeonGenerator.isBossFloor(BOSS_FLOOR_INTERVAL * 2)).toBe(true);
    });

    it('倍数でないフロアはボスフロアではない', () => {
      expect(DungeonGenerator.isBossFloor(1)).toBe(false);
      expect(DungeonGenerator.isBossFloor(BOSS_FLOOR_INTERVAL - 1)).toBe(false);
      expect(DungeonGenerator.isBossFloor(BOSS_FLOOR_INTERVAL + 1)).toBe(false);
    });
  });

  describe('bossDefeated フラグ', () => {
    it('非ボスフロアは生成時から bossDefeated=true', () => {
      const floor = DungeonGenerator.generate(1, 42);
      expect(floor.bossDefeated).toBe(true);
    });

    it('ボスフロアは生成時 bossDefeated=false', () => {
      const floor = DungeonGenerator.generate(BOSS_FLOOR_INTERVAL, 42);
      expect(floor.bossDefeated).toBe(false);
    });
  });

  describe('createEnemy()', () => {
    it('ボス敵は isBoss=true になっている', () => {
      const boss = DungeonGenerator.createEnemy('boss-1', { x: 5, y: 5 }, 5, true, 1);
      expect(boss.isBoss).toBe(true);
    });

    it('ボスのHPが雑魚より高い', () => {
      const boss = DungeonGenerator.createEnemy('boss', { x: 0, y: 0 }, 5, true, 1);
      const regular = DungeonGenerator.createEnemy('reg', { x: 0, y: 0 }, 5, false, 0);
      expect(boss.maxHp).toBeGreaterThan(regular.maxHp);
    });

    it('フロア番号が高いほど雑魚のHPが増加する', () => {
      const floor1 = DungeonGenerator.createEnemy('e1', { x: 0, y: 0 }, 1, false, 0);
      const floor10 = DungeonGenerator.createEnemy('e10', { x: 0, y: 0 }, 10, false, 0);
      expect(floor10.maxHp).toBeGreaterThan(floor1.maxHp);
    });

    it('Floor1 の雑魚HP はプレイヤー初期ATK(2)で3撃必要な値', () => {
      const enemy = DungeonGenerator.createEnemy('e', { x: 0, y: 0 }, 1, false, 0);
      const BASE_ATK = 2;
      // 2ダメージを何回与えれば倒せるか（ceil(hp/atk) >= 3）
      expect(Math.ceil(enemy.maxHp / BASE_ATK)).toBeGreaterThanOrEqual(3);
    });

    it('敵のHPが0より大きい', () => {
      const enemy = DungeonGenerator.createEnemy('test', { x: 1, y: 1 }, 1, false, 0);
      expect(enemy.hp).toBeGreaterThan(0);
      expect(enemy.maxHp).toBeGreaterThan(0);
    });
  });
});
