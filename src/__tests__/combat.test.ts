import { describe, it, expect } from 'vitest';
import { CombatSystem } from '../systems/CombatSystem';
import type { PlayerData, EnemyData } from '../types';
import { BASE_ATK, ATK_GROWTH_PER_LEVEL, EXP_TABLE, MAX_LEVEL } from '../constants';

/** テスト用PlayerDataを生成する */
function makePlayer(overrides: Partial<PlayerData> = {}): PlayerData {
  return {
    pos: { x: 0, y: 0 },
    hp: 3, maxHp: 3,
    atk: 2, level: 1, exp: 0, facing: 'down',
    ...overrides,
  };
}

/** テスト用EnemyDataを生成する */
function makeEnemy(overrides: Partial<EnemyData> = {}): EnemyData {
  return {
    id: 'test',
    pos: { x: 1, y: 0 },
    hp: 5, maxHp: 5,
    atk: 1, def: 0,
    state: 'idle',
    isBoss: false,
    variant: 0,
    detectionRange: 5,
    telegraphTurns: 1,
    attackPattern: 'single',
    cooldownTurns: 1,
    currentCooldown: 0,
    expReward: 10,
    ...overrides,
  };
}

/**
 * CombatSystemのテスト
 * ダメージ計算・撃破判定・EXP獲得・レベルアップを検証する
 */
describe('CombatSystem', () => {
  describe('playerAttack()', () => {
    it('ダメージは最低1以上（DEFがATKを超えていても）', () => {
      const player = makePlayer({ atk: 1 });
      const enemy = makeEnemy({ def: 5 }); // def > atk
      // rng=0 → variance=-1 → max(1, 1-5-1) = 1
      const { damage } = CombatSystem.playerAttack(player, enemy, () => 0);
      expect(damage).toBeGreaterThanOrEqual(1);
    });

    it('ダメージ計算: max(1, atk - def + variance)', () => {
      const player = makePlayer({ atk: 3 });
      const enemy = makeEnemy({ def: 1 });
      // rng=0.5 → floor(0.5*3)-1 = 1-1 = 0 → damage = max(1, 3-1+0) = 2
      const { damage } = CombatSystem.playerAttack(player, enemy, () => 0.5);
      expect(damage).toBe(2);
    });

    it('variance=-1 のとき atk-def-1', () => {
      const player = makePlayer({ atk: 4 });
      const enemy = makeEnemy({ def: 1 });
      // rng=0 → floor(0*3)-1 = -1 → damage = max(1, 4-1-1) = 2
      const { damage } = CombatSystem.playerAttack(player, enemy, () => 0);
      expect(damage).toBe(2);
    });

    it('variance=+1 のとき atk-def+1', () => {
      const player = makePlayer({ atk: 3 });
      const enemy = makeEnemy({ def: 1 });
      // rng≈1 → floor(0.999*3)-1 = 2-1 = 1 → damage = max(1, 3-1+1) = 3
      const { damage } = CombatSystem.playerAttack(player, enemy, () => 0.999);
      expect(damage).toBe(3);
    });

    it('敵HPが0以下になったらkilledがtrue', () => {
      const player = makePlayer({ atk: 10 });
      const enemy = makeEnemy({ hp: 2, maxHp: 5, def: 0 });
      const { killed } = CombatSystem.playerAttack(player, enemy, () => 0.5);
      expect(killed).toBe(true);
      expect(enemy.hp).toBe(0);
    });

    it('敵HPが残っていればkilledがfalse', () => {
      const player = makePlayer({ atk: 1 });
      const enemy = makeEnemy({ hp: 10, maxHp: 10, def: 0 });
      const { killed } = CombatSystem.playerAttack(player, enemy, () => 0.5);
      expect(killed).toBe(false);
      expect(enemy.hp).toBeGreaterThan(0);
    });

    it('敵HPは0未満にならない', () => {
      const player = makePlayer({ atk: 100 });
      const enemy = makeEnemy({ hp: 1, maxHp: 5, def: 0 });
      CombatSystem.playerAttack(player, enemy, () => 0.5);
      expect(enemy.hp).toBe(0);
    });

    it('DEFがある敵へのダメージが軽減される', () => {
      const player = makePlayer({ atk: 5 });
      const enemy = makeEnemy({ def: 2 });
      // variance=0 → damage = 5-2 = 3（軽減あり）
      const { damage } = CombatSystem.playerAttack(player, enemy, () => 0.5);
      expect(damage).toBe(3);
    });
  });

  describe('gainExp()', () => {
    it('EXPが加算される', () => {
      const player = makePlayer({ exp: 0 });
      CombatSystem.gainExp(player, 10);
      expect(player.exp).toBe(10);
    });

    it('EXPが閾値に達したらレベルアップする', () => {
      const player = makePlayer({ exp: 0, level: 1 });
      CombatSystem.gainExp(player, EXP_TABLE[1]); // レベル2の閾値（20）
      expect(player.level).toBe(2);
    });

    it('レベルアップ時にATKが上昇する', () => {
      const player = makePlayer({ exp: 0, level: 1, atk: BASE_ATK });
      CombatSystem.gainExp(player, EXP_TABLE[1]);
      expect(player.atk).toBe(BASE_ATK + ATK_GROWTH_PER_LEVEL);
    });

    it('上がったレベル数を返す', () => {
      const player = makePlayer({ exp: 0, level: 1 });
      const gained = CombatSystem.gainExp(player, EXP_TABLE[1]);
      expect(gained).toBe(1);
    });

    it('閾値未満はレベルアップしない', () => {
      const player = makePlayer({ exp: 0, level: 1 });
      CombatSystem.gainExp(player, EXP_TABLE[1] - 1);
      expect(player.level).toBe(1);
    });

    it('大量EXP付与で複数レベルアップする', () => {
      const player = makePlayer({ exp: 0, level: 1 });
      const gained = CombatSystem.gainExp(player, EXP_TABLE[2]); // レベル3の閾値（50）
      expect(gained).toBe(2);
      expect(player.level).toBe(3);
    });

    it('最大レベルではEXPを加算しない（0を返す）', () => {
      const player = makePlayer({ level: MAX_LEVEL, exp: 999 });
      const gained = CombatSystem.gainExp(player, 100);
      expect(gained).toBe(0);
      expect(player.exp).toBe(999); // 変化なし
    });
  });

  describe('calcAtk()', () => {
    it('レベル1はBASE_ATKと一致する', () => {
      expect(CombatSystem.calcAtk(1)).toBe(BASE_ATK);
    });

    it('レベル2はBASE_ATK + ATK_GROWTH_PER_LEVEL', () => {
      expect(CombatSystem.calcAtk(2)).toBe(BASE_ATK + ATK_GROWTH_PER_LEVEL);
    });

    it('レベルが上がるほどATKが線形増加する', () => {
      for (let lv = 1; lv <= 5; lv++) {
        expect(CombatSystem.calcAtk(lv)).toBe(BASE_ATK + (lv - 1) * ATK_GROWTH_PER_LEVEL);
      }
    });
  });

  describe('getNextLevelExp()', () => {
    it('次レベルの必要EXPを返す', () => {
      const player = makePlayer({ level: 1, exp: 0 });
      expect(CombatSystem.getNextLevelExp(player)).toBe(EXP_TABLE[1]);
    });

    it('最大レベルでは現在EXPを返す', () => {
      const player = makePlayer({ level: MAX_LEVEL, exp: 999 });
      expect(CombatSystem.getNextLevelExp(player)).toBe(999);
    });
  });
});
