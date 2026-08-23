import { describe, it, expect } from 'vitest';
import { Enemy } from '../entities/Enemy';
import type { EnemyData, PlayerData, TileType } from '../types';
import { ENEMY_DETECTION_RANGE, TELEGRAPH_TURNS_NORMAL } from '../constants';

/** テスト用の最小EnemyDataを生成する */
function makeEnemy(overrides: Partial<EnemyData> = {}): EnemyData {
  return {
    id: 'test-enemy',
    pos: { x: 5, y: 5 },
    hp: 3,
    maxHp: 3,
    atk: 1,
    def: 0,
    state: 'idle',
    isBoss: false,
    variant: 0,
    detectionRange: ENEMY_DETECTION_RANGE,
    attackPatterns: [{ name: 'single', telegraphTurns: TELEGRAPH_TURNS_NORMAL, cooldownTurns: 0 }],
    currentCooldown: 0,
    expReward: 10,
    ...overrides,
  };
}

/** テスト用の最小PlayerDataを生成する */
function makePlayer(pos: { x: number; y: number }): PlayerData {
  return { pos, hp: 3, maxHp: 3, atk: 2, level: 1, exp: 0, facing: 'down' };
}

/** n×n の全床タイルを生成する */
function makeFloor(size = 20): TileType[][] {
  return Array.from({ length: size }, () => Array<TileType>(size).fill('floor'));
}

/**
 * EnemyクラスのAIテスト
 * 状態遷移・移動・索敵・隣接判定・テレグラフ計算を検証する
 */
describe('Enemy AI', () => {
  describe('canDetectPlayer()', () => {
    it('索敵範囲内のプレイヤーを検知する', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 5 } });
      const player = makePlayer({ x: 5, y: 10 }); // 距離5
      expect(Enemy.canDetectPlayer(enemy, player)).toBe(true);
    });

    it('索敵範囲外のプレイヤーを検知しない', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 5 }, detectionRange: 5 });
      const player = makePlayer({ x: 5, y: 15 }); // 距離10 > 5
      expect(Enemy.canDetectPlayer(enemy, player)).toBe(false);
    });

    it('同じ位置は検知する', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 5 } });
      const player = makePlayer({ x: 5, y: 5 });
      expect(Enemy.canDetectPlayer(enemy, player)).toBe(true);
    });
  });

  describe('isAdjacentToPlayer()', () => {
    it('4方向隣接を正しく判定する', () => {
      const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
      for (const d of dirs) {
        const enemy = makeEnemy({ pos: { x: 5, y: 5 } });
        const player = makePlayer({ x: 5 + d.x, y: 5 + d.y });
        expect(Enemy.isAdjacentToPlayer(enemy, player)).toBe(true);
      }
    });

    it('距離2以上は隣接と判定しない', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 5 } });
      const player = makePlayer({ x: 5, y: 7 }); // 距離2
      expect(Enemy.isAdjacentToPlayer(enemy, player)).toBe(false);
    });

    it('斜めは隣接と判定しない', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 5 } });
      const player = makePlayer({ x: 6, y: 6 }); // 斜め
      expect(Enemy.isAdjacentToPlayer(enemy, player)).toBe(false);
    });
  });

  describe('updateAI() – 状態遷移', () => {
    it('IDLEでプレイヤーを検知したらCHASEに遷移する', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 5 }, state: 'idle' });
      const player = makePlayer({ x: 5, y: 8 }); // 距離3（検知範囲内）
      const tiles = makeFloor();
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.state).toBe('chase');
    });

    it('IDLEでプレイヤーが遠すぎたらIDLEのまま', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 5 }, state: 'idle', detectionRange: 3 });
      const player = makePlayer({ x: 5, y: 15 }); // 距離10 > 3
      const tiles = makeFloor();
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.state).toBe('idle');
    });

    it('CHASEでプレイヤーに隣接したらTELEGRAPH状態になる（Phase 5）', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 5 }, state: 'chase' });
      const player = makePlayer({ x: 5, y: 4 }); // 真上に隣接
      const tiles = makeFloor();
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.pos).toEqual({ x: 5, y: 5 }); // 位置は変わらない
      expect(enemy.state).toBe('telegraph');       // Phase 5: TELEGRAPHへ遷移
      expect(enemy.telegraph).toBeDefined();
    });

    it('EXECUTEはCOOLDOWNに遷移してtrueを返す', () => {
      const enemy = makeEnemy({ state: 'execute' });
      const player = makePlayer({ x: 5, y: 4 });
      const tiles = makeFloor();
      const result = Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(result).toBe(true);
      expect(enemy.state).toBe('cooldown');
    });

    it('COOLDOWNでカウントダウンが0になったらCHASEに戻る', () => {
      const enemy = makeEnemy({ state: 'cooldown', currentCooldown: 1 });
      const player = makePlayer({ x: 5, y: 4 });
      const tiles = makeFloor();
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.currentCooldown).toBe(0);
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      expect(enemy.state).toBe('chase');
    });
  });

  describe('updateAI() – 移動', () => {
    it('CHASEでプレイヤーに近づく方向に移動する', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 10 }, state: 'chase' });
      const player = makePlayer({ x: 5, y: 5 }); // 上方向に5マス
      const tiles = makeFloor();
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      // プレイヤー方向（上）に1マス移動
      expect(enemy.pos.y).toBe(9);
      expect(enemy.pos.x).toBe(5);
    });

    it('壁があれば迂回して移動する', () => {
      const tiles = makeFloor();
      // 直進ルートに壁を配置
      tiles[9][5] = 'wall';
      const enemy = makeEnemy({ pos: { x: 5, y: 10 }, state: 'chase' });
      const player = makePlayer({ x: 5, y: 5 });
      Enemy.updateAI(enemy, player, tiles, [enemy]);
      // 壁があるので横にずれるはず（yはそのままかxが変わる）
      const moved = enemy.pos.x !== 5 || enemy.pos.y !== 10;
      expect(moved).toBe(true);
      expect(tiles[enemy.pos.y][enemy.pos.x]).not.toBe('wall');
    });

    it('他の敵の位置には移動しない', () => {
      const tiles = makeFloor();
      const enemy1 = makeEnemy({ id: 'e1', pos: { x: 5, y: 10 }, state: 'chase' });
      // enemy2が経路上に存在する
      const enemy2 = makeEnemy({ id: 'e2', pos: { x: 5, y: 9 }, state: 'idle' });
      const player = makePlayer({ x: 5, y: 5 });
      Enemy.updateAI(enemy1, player, tiles, [enemy1, enemy2]);
      // enemy2のいる(5,9)には移動しない
      expect(enemy1.pos).not.toEqual({ x: 5, y: 9 });
    });
  });

  describe('canMoveTo()', () => {
    it('床タイルは移動可能', () => {
      const tiles = makeFloor();
      const player = makePlayer({ x: 10, y: 10 });
      expect(Enemy.canMoveTo(5, 5, tiles, [], player)).toBe(true);
    });

    it('壁タイルは移動不可', () => {
      const tiles = makeFloor();
      tiles[5][5] = 'wall';
      const player = makePlayer({ x: 10, y: 10 });
      expect(Enemy.canMoveTo(5, 5, tiles, [], player)).toBe(false);
    });

    it('マップ外は移動不可', () => {
      const tiles = makeFloor(10);
      const player = makePlayer({ x: 5, y: 5 });
      expect(Enemy.canMoveTo(-1, 5, tiles, [], player)).toBe(false);
      expect(Enemy.canMoveTo(5, -1, tiles, [], player)).toBe(false);
      expect(Enemy.canMoveTo(10, 5, tiles, [], player)).toBe(false);
    });

    it('プレイヤーの位置は移動不可', () => {
      const tiles = makeFloor();
      const player = makePlayer({ x: 5, y: 5 });
      expect(Enemy.canMoveTo(5, 5, tiles, [], player)).toBe(false);
    });
  });

  describe('calculateTelegraphTiles()', () => {
    it('single パターンはプレイヤー位置を1マス返す', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 5 } });
      const player = makePlayer({ x: 5, y: 3 });
      const tiles = Enemy.calculateTelegraphTiles(enemy, player, 'single');
      expect(tiles).toHaveLength(1);
      expect(tiles[0]).toEqual({ x: 5, y: 3 });
    });

    it('cross パターンは5マス返す（プレイヤー＋上下左右）', () => {
      const enemy = makeEnemy({ pos: { x: 0, y: 0 } });
      const player = makePlayer({ x: 5, y: 5 });
      const tiles = Enemy.calculateTelegraphTiles(enemy, player, 'cross');
      expect(tiles).toHaveLength(5);
      expect(tiles).toContainEqual({ x: 5, y: 5 });
      expect(tiles).toContainEqual({ x: 5, y: 4 });
      expect(tiles).toContainEqual({ x: 5, y: 6 });
    });

    it('line パターンは3マス返す（プレイヤー方向）', () => {
      const enemy = makeEnemy({ pos: { x: 5, y: 10 } });
      const player = makePlayer({ x: 5, y: 5 }); // 上方向
      const tiles = Enemy.calculateTelegraphTiles(enemy, player, 'line');
      expect(tiles).toHaveLength(3);
      // 上方向の直線（y 9, 8, 7）
      expect(tiles).toContainEqual({ x: 5, y: 9 });
    });

    it('area パターンは9マス返す（プレイヤー周辺3×3）', () => {
      const enemy = makeEnemy({ pos: { x: 0, y: 0 } });
      const player = makePlayer({ x: 5, y: 5 });
      const tiles = Enemy.calculateTelegraphTiles(enemy, player, 'area');
      expect(tiles).toHaveLength(9);
    });
  });
});
