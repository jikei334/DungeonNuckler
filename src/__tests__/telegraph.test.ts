import { describe, it, expect } from 'vitest';
import { Enemy } from '../entities/Enemy';
import type { EnemyData, PlayerData, TileType } from '../types';

/** テスト用EnemyDataを生成する */
function makeEnemy(overrides: Partial<EnemyData> = {}): EnemyData {
  return {
    id: 'test-enemy',
    pos: { x: 5, y: 6 },
    hp: 5, maxHp: 5, atk: 1, def: 0,
    state: 'chase',
    isBoss: false,
    variant: 0,
    detectionRange: 8,
    facing: 'down' as const,
    attackPatterns: [{ name: 'single', telegraphTurns: 2, cooldownTurns: 0 }],
    currentCooldown: 0,
    expReward: 10,
    ...overrides,
  };
}

/** テスト用PlayerDataを生成する */
function makePlayer(pos = { x: 5, y: 5 }): PlayerData {
  return { pos, hp: 3, maxHp: 3, atk: 2, level: 1, exp: 0, facing: 'down' };
}

/** n×n の全床タイルを生成する */
function makeFloor(size = 20): TileType[][] {
  return Array.from({ length: size }, () => Array<TileType>(size).fill('floor'));
}

/**
 * テレグラフ（攻撃予告）システムのテスト
 * CHASE→TELEGRAPH→EXECUTE→COOLDOWN の状態遷移と
 * テレグラフカウントダウン・対象タイル生成を検証する
 */
describe('Telegraph System', () => {
  describe('CHASE → TELEGRAPH 遷移', () => {
    it('プレイヤーに隣接したターンにTELEGRAPH状態になる', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 6 }, state: 'chase' });
      const player = makePlayer({ x: 5, y: 5 }); // 真上に隣接
      const tiles = makeFloor();
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.state).toBe('telegraph');
    });

    it('TELEGRAPH開始時にテレグラフデータが設定される', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 6 }, state: 'chase',
        attackPatterns: [{ name: 'single', telegraphTurns: 2, cooldownTurns: 0 }] });
      const player = makePlayer({ x: 5, y: 5 });
      const tiles = makeFloor();
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.telegraph).toBeDefined();
      expect(enemy.telegraph!.turnsUntilExecute).toBe(2);
      expect(enemy.telegraph!.targetTiles.length).toBeGreaterThan(0);
    });

    it('テレグラフの対象タイルが記録される', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 6 }, state: 'chase',
        attackPatterns: [{ name: 'single', telegraphTurns: 2, cooldownTurns: 0 }] });
      const player = makePlayer({ x: 5, y: 5 });
      const tiles = makeFloor();
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.telegraph!.targetTiles).toContainEqual({ x: 5, y: 5 });
    });
  });

  describe('TELEGRAPH カウントダウン', () => {
    it('TELEGRAPHターンごとにturnsUntilExecuteが減少する', () => {
      const enemy = makeEnemy({ state: 'telegraph' });
      const player = makePlayer();
      const tiles = makeFloor();
      // TELEGRAPHデータをセットしておく
      enemy.telegraph = {
        targetTiles: [{ x: 5, y: 5 }],
        turnsUntilExecute: 3,
        pattern: { name: 'single', telegraphTurns: 3, cooldownTurns: 0 },
      };
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.telegraph!.turnsUntilExecute).toBe(2);
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.telegraph!.turnsUntilExecute).toBe(1);
    });

    it('turnsUntilExecuteが0になったらEXECUTEに遷移する', () => {
      const enemy = makeEnemy({ state: 'telegraph' });
      const player = makePlayer();
      const tiles = makeFloor();
      enemy.telegraph = {
        targetTiles: [{ x: 5, y: 5 }],
        turnsUntilExecute: 1,
        pattern: { name: 'single', telegraphTurns: 1, cooldownTurns: 0 },
      };
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.state).toBe('execute');
    });

    it('telegraphTurns=1 のパターンを持つ敵は2ターン目に即EXECUTE', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 6 }, state: 'chase',
        attackPatterns: [{ name: 'single', telegraphTurns: 1, cooldownTurns: 0 }] });
      const player = makePlayer({ x: 5, y: 5 });
      const tiles = makeFloor();
      // 1回目: CHASE→TELEGRAPH（turnsUntilExecute=1）
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.state).toBe('telegraph');
      // 2回目: turnsUntilExecute-- → 0 → EXECUTE
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.state).toBe('execute');
    });
  });

  describe('EXECUTE → COOLDOWN', () => {
    it('EXECUTEはCOOLDOWNに遷移してtrueを返す（クールダウンはパターンから取得）', () => {
      const enemy = makeEnemy({ state: 'execute' });
      enemy.telegraph = {
        targetTiles: [{ x: 5, y: 5 }],
        turnsUntilExecute: 0,
        pattern: { name: 'single', telegraphTurns: 2, cooldownTurns: 2 },
      };
      const player = makePlayer();
      const tiles = makeFloor();
      const result = Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(result).toBe(true);
      expect(enemy.state).toBe('cooldown');
      expect(enemy.currentCooldown).toBe(2);
      expect(enemy.telegraph).toBeUndefined();
    });

    it('COOLDOWNが明けたらCHASEに戻る', () => {
      const enemy = makeEnemy({ state: 'cooldown', currentCooldown: 1 });
      const player = makePlayer();
      const tiles = makeFloor();
      Enemy.updateAI(enemy, player, tiles, [enemy]); // currentCooldown: 0
      expect(enemy.currentCooldown).toBe(0);
      Enemy.updateAI(enemy, player, tiles, [enemy]); // → chase
      expect(enemy.state).toBe('chase');
    });
  });

  describe('ボスの TELEGRAPH', () => {
    it('ボスのtelephraphTurnsが通常より多い', () => {
      const boss = makeEnemy({
        isBoss: true, pos: { x: 5, y: 6 }, state: 'chase',
        attackPatterns: [{ name: 'cross', telegraphTurns: 3, cooldownTurns: 1 }],
      });
      const player = makePlayer({ x: 5, y: 5 });
      const tiles = makeFloor();
      Enemy.updateAI(boss, player, tiles, [boss]);
      expect(boss.state).toBe('telegraph');
      expect(boss.telegraph!.turnsUntilExecute).toBe(3);
    });

    it('crossパターンのボスは5タイルをマーキングする', () => {
      const boss = makeEnemy({
        isBoss: true,
        attackPatterns: [{ name: 'cross', telegraphTurns: 3, cooldownTurns: 1 }],
        pos: { x: 5, y: 6 }, state: 'chase',
      });
      const player = makePlayer({ x: 5, y: 5 });
      const tiles = makeFloor();
      Enemy.updateAI(boss, player, tiles, [boss]);
      expect(boss.telegraph!.targetTiles).toHaveLength(5);
    });
  });

  describe('isTelegraphTarget()', () => {
    it('テレグラフ対象タイルを正しく判定する', () => {
      const enemy = makeEnemy();
      enemy.telegraph = {
        targetTiles: [{ x: 3, y: 4 }, { x: 3, y: 5 }],
        turnsUntilExecute: 1,
        pattern: { name: 'line', telegraphTurns: 2, cooldownTurns: 0 },
      };
      expect(Enemy.isTelegraphTarget(enemy, { x: 3, y: 4 })).toBe(true);
      expect(Enemy.isTelegraphTarget(enemy, { x: 3, y: 6 })).toBe(false);
    });

    it('テレグラフがない場合はfalseを返す', () => {
      const enemy = makeEnemy();
      expect(Enemy.isTelegraphTarget(enemy, { x: 0, y: 0 })).toBe(false);
    });
  });
});
