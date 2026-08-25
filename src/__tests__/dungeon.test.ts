import { describe, it, expect } from 'vitest';
import { DungeonGenerator } from '../dungeon/DungeonGenerator';
import { ENEMY_ARCHETYPES } from '../dungeon/EnemyArchetypes';
import { MAP_WIDTH, MAP_HEIGHT, BOSS_FLOOR_INTERVAL, MAJOR_BOSS_FLOOR_INTERVAL } from '../constants';

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

    it('Floor4未満では岩が生成されない', () => {
      for (const seed of [1, 42, 100, 200, 999]) {
        const floor = DungeonGenerator.generate(1, seed);
        const hasRock = floor.tiles.some((row) => row.some((t) => t === 'rock'));
        expect(hasRock).toBe(false);
      }
    });

    it('Floor12以降では岩が生成される', () => {
      // 複数シードで試してどれかに岩が含まれることを確認
      const seeds = [1, 42, 100, 200, 555, 999, 1234, 5678];
      const anyHasRock = seeds.some((seed) => {
        const floor = DungeonGenerator.generate(12, seed);
        return floor.tiles.some((row) => row.some((t) => t === 'rock'));
      });
      expect(anyHasRock).toBe(true);
    });

    it('プレイヤー開始地点に岩は配置されない', () => {
      for (const seed of [1, 42, 100, 200, 999]) {
        const floor = DungeonGenerator.generate(12, seed);
        const { x, y } = floor.playerStart;
        expect(floor.tiles[y][x]).not.toBe('rock');
      }
    });

    it('階段タイルに岩は配置されない', () => {
      for (const seed of [1, 42, 100, 200, 999]) {
        const floor = DungeonGenerator.generate(12, seed);
        const { x, y } = floor.stairsPos;
        expect(floor.tiles[y][x]).toBe('stairs');
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

  describe('isOverlordFloor()', () => {
    it('MAJOR_BOSS_FLOOR_INTERVAL の倍数で大ボスフロアになる', () => {
      expect(DungeonGenerator.isOverlordFloor(MAJOR_BOSS_FLOOR_INTERVAL)).toBe(true);
      expect(DungeonGenerator.isOverlordFloor(MAJOR_BOSS_FLOOR_INTERVAL * 2)).toBe(true);
    });

    it('5の倍数でも10の倍数でなければ大ボスフロアではない', () => {
      expect(DungeonGenerator.isOverlordFloor(5)).toBe(false);
      expect(DungeonGenerator.isOverlordFloor(15)).toBe(false);
    });
  });

  describe('isMinorBossFloor()', () => {
    it('5の倍数かつ10の倍数でないフロアが中ボスフロア', () => {
      expect(DungeonGenerator.isMinorBossFloor(5)).toBe(true);
      expect(DungeonGenerator.isMinorBossFloor(15)).toBe(true);
    });

    it('10の倍数は中ボスフロアではない（大ボスフロア）', () => {
      expect(DungeonGenerator.isMinorBossFloor(10)).toBe(false);
      expect(DungeonGenerator.isMinorBossFloor(20)).toBe(false);
    });
  });

  describe('bossDefeated フラグ', () => {
    it('非ボスフロアは生成時から bossDefeated=true', () => {
      const floor = DungeonGenerator.generate(1, 42);
      expect(floor.bossDefeated).toBe(true);
    });

    it('中ボスフロアは生成時 bossDefeated=false', () => {
      const floor = DungeonGenerator.generate(BOSS_FLOOR_INTERVAL, 42);
      expect(floor.bossDefeated).toBe(false);
    });

    it('大ボスフロアは生成時 bossDefeated=false', () => {
      const floor = DungeonGenerator.generate(MAJOR_BOSS_FLOOR_INTERVAL, 42);
      expect(floor.bossDefeated).toBe(false);
    });
  });

  describe('createEnemyFromArchetype()', () => {
    it('overlordアーキタイプは isBoss=true かつ category=overlord になっている', () => {
      const arch = ENEMY_ARCHETYPES.find((a) => a.category === 'overlord')!;
      const enemy = DungeonGenerator.createEnemyFromArchetype('test', { x: 0, y: 0 }, arch, 10);
      expect(enemy.isBoss).toBe(true);
      expect(enemy.category).toBe('overlord');
    });

    it('bossアーキタイプは isBoss=true かつ category=boss になっている', () => {
      const arch = ENEMY_ARCHETYPES.find((a) => a.category === 'boss')!;
      const enemy = DungeonGenerator.createEnemyFromArchetype('test', { x: 0, y: 0 }, arch, 5);
      expect(enemy.isBoss).toBe(true);
      expect(enemy.category).toBe('boss');
    });

    it('minionアーキタイプは isBoss=false', () => {
      const arch = ENEMY_ARCHETYPES.find((a) => a.category === 'minion')!;
      const enemy = DungeonGenerator.createEnemyFromArchetype('test', { x: 0, y: 0 }, arch, 1);
      expect(enemy.isBoss).toBe(false);
    });

    it('フロア番号が高いほどHPが増加する', () => {
      const arch = ENEMY_ARCHETYPES.find((a) => a.category === 'minion')!;
      const floor1 = DungeonGenerator.createEnemyFromArchetype('e1', { x: 0, y: 0 }, arch, 1);
      const floor10 = DungeonGenerator.createEnemyFromArchetype('e10', { x: 0, y: 0 }, arch, 10);
      expect(floor10.maxHp).toBeGreaterThan(floor1.maxHp);
    });

    it('overlordのHPは同フロアのminionより高い', () => {
      const overlordArch = ENEMY_ARCHETYPES.find((a) => a.category === 'overlord')!;
      const minionArch = ENEMY_ARCHETYPES.find((a) => a.category === 'minion')!;
      const overlord = DungeonGenerator.createEnemyFromArchetype('o', { x: 0, y: 0 }, overlordArch, 10);
      const minion = DungeonGenerator.createEnemyFromArchetype('m', { x: 0, y: 0 }, minionArch, 10);
      expect(overlord.maxHp).toBeGreaterThan(minion.maxHp);
    });

    it('HPが0より大きい', () => {
      const arch = ENEMY_ARCHETYPES.find((a) => a.category === 'minion')!;
      const enemy = DungeonGenerator.createEnemyFromArchetype('test', { x: 1, y: 1 }, arch, 1);
      expect(enemy.hp).toBeGreaterThan(0);
      expect(enemy.maxHp).toBeGreaterThan(0);
    });

    it('Floor1 の minion(slime) は ATK=2 で3撃必要な値', () => {
      // slimeはFloor1で最もHPが低い雑魚だが、3撃以上必要であること
      const slime = ENEMY_ARCHETYPES.find((a) => a.id === 'slime')!;
      const enemy = DungeonGenerator.createEnemyFromArchetype('e', { x: 0, y: 0 }, slime, 1);
      const BASE_ATK = 2;
      expect(Math.ceil(enemy.maxHp / BASE_ATK)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getAvailableArchetypes()', () => {
    it('minFloor以上のアーキタイプのみ返す', () => {
      // minion/minionはfloor1から出現するが、soldierはfloor3以降
      const floor1 = DungeonGenerator.getAvailableArchetypes('minion', 1);
      expect(floor1.length).toBeGreaterThan(0);
      expect(floor1.every((a) => a.minFloor <= 1)).toBe(true);
    });

    it('eliteはfloor3以降に出現する', () => {
      const floor2 = DungeonGenerator.getAvailableArchetypes('elite', 2);
      const floor3 = DungeonGenerator.getAvailableArchetypes('elite', 3);
      expect(floor2.length).toBe(0);
      expect(floor3.length).toBeGreaterThan(0);
    });
  });
});
