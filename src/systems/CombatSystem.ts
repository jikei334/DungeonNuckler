import type { PlayerData, EnemyData } from '../types';
import { BASE_ATK, ATK_GROWTH_PER_LEVEL, expForNextLevel } from '../constants';

/** 戦闘・EXP・レベルアップを管理するシステムクラス */
export class CombatSystem {
  /**
   * プレイヤーが敵を攻撃し、ダメージを与える（バンプアタック）
   * ダメージ計算式: max(1, playerAtk - enemyDef + variance(-1, 0, +1))
   * 乱数分散により同じステータスでもダメージが±1変動する
   *
   * @param player - 攻撃するプレイヤーデータ
   * @param enemy - 攻撃対象の敵データ（hp in-place更新）
   * @param rng - 乱数関数（0以上1未満の浮動小数点数を返す、デフォルト: Math.random）
   * @returns ダメージ量と撃破フラグ
   */
  static playerAttack(
    player: PlayerData,
    enemy: EnemyData,
    rng: () => number = Math.random
  ): { damage: number; killed: boolean } {
    const variance = Math.floor(rng() * 3) - 1; // -1, 0, +1 のいずれか
    const damage = Math.max(1, player.atk - enemy.def + variance);
    enemy.hp = Math.max(0, enemy.hp - damage);
    return { damage, killed: enemy.hp <= 0 };
  }

  /**
   * プレイヤーのEXPを加算し、次のレベルに必要なEXPを超えていればレベルアップする
   * レベルアップ時は超過分を次のレベルへ持ち越す（上限なし）
   *
   * @param player - プレイヤーデータ（exp/level/atk in-place更新）
   * @param exp - 加算するEXP量
   * @returns 上がったレベル数（レベルアップなし: 0）
   */
  static gainExp(player: PlayerData, exp: number): number {
    player.exp += exp;
    let levelsGained = 0;

    // 次レベルへ必要なEXPを超えている間レベルアップし続ける（上限なし）
    let needed = expForNextLevel(player.level);
    while (player.exp >= needed) {
      player.exp -= needed;
      player.level++;
      player.atk = CombatSystem.calcAtk(player.level);
      levelsGained++;
      needed = expForNextLevel(player.level);
    }

    return levelsGained;
  }

  /**
   * レベルに応じたATKを計算する
   * ATK = BASE_ATK + (level - 1) * ATK_GROWTH_PER_LEVEL
   *
   * @param level - プレイヤーレベル（1始まり）
   * @returns ATK値
   */
  static calcAtk(level: number): number {
    return BASE_ATK + (level - 1) * ATK_GROWTH_PER_LEVEL;
  }

  /**
   * 次のレベルアップに必要なEXP量を返す
   *
   * @param player - プレイヤーデータ
   * @returns 次レベルまでに必要なEXP量
   */
  static getNextLevelExp(player: PlayerData): number {
    return expForNextLevel(player.level);
  }
}
