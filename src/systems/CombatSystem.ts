import type { PlayerData, EnemyData } from '../types';
import { BASE_ATK, ATK_GROWTH_PER_LEVEL, EXP_TABLE, MAX_LEVEL } from '../constants';

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
   * プレイヤーのEXPを加算し、必要EXPを超えていればレベルアップする
   * レベルアップ時はATKのみ上昇（最大レベルに達している場合は何もしない）
   *
   * @param player - プレイヤーデータ（exp/level/atk in-place更新）
   * @param exp - 加算するEXP量
   * @returns 上がったレベル数（レベルアップなし: 0）
   */
  static gainExp(player: PlayerData, exp: number): number {
    if (player.level >= MAX_LEVEL) return 0;

    player.exp += exp;
    let levelsGained = 0;

    // EXP_TABLE[player.level] が次のレベルに必要な累積EXP
    while (player.level < MAX_LEVEL && player.exp >= EXP_TABLE[player.level]) {
      player.level++;
      player.atk = CombatSystem.calcAtk(player.level);
      levelsGained++;
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
   * 次のレベルアップに必要なEXPを返す（最大レベルの場合は現在EXPを返す）
   *
   * @param player - プレイヤーデータ
   * @returns 次のレベルに必要な累積EXP
   */
  static getNextLevelExp(player: PlayerData): number {
    if (player.level >= MAX_LEVEL) return player.exp;
    return EXP_TABLE[player.level];
  }
}
