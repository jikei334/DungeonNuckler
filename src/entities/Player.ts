import type { PlayerData, Direction, Vec2, TileType } from '../types';
import { PLAYER_MAX_HP, BASE_ATK } from '../constants';

/** 方向からマス移動量へのマッピング */
const DIR_DELTA: Record<Direction, Vec2> = {
  up:    { x:  0, y: -1 },
  down:  { x:  0, y:  1 },
  left:  { x: -1, y:  0 },
  right: { x:  1, y:  0 },
};

/** プレイヤーエンティティの状態管理クラス */
export class Player {
  /**
   * プレイヤーデータを初期状態で生成する
   * @param startPos - 初期座標
   * @returns 初期PlayerData
   */
  static createInitial(startPos: Vec2): PlayerData {
    return {
      pos: { ...startPos },
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      atk: BASE_ATK,
      level: 1,
      exp: 0,
      facing: 'down',
    };
  }

  /**
   * 指定方向への移動を試み、結果を返す
   * 移動先が壁の場合は移動しない（向きは変わる）
   * 移動先に敵がいる場合はバンプアタック候補として通知する
   *
   * @param player - プレイヤーデータ（in-place更新）
   * @param dir - 移動方向
   * @param tiles - タイルデータ
   * @param enemyPositions - 現在の敵座標一覧（衝突判定用）
   * @returns moved: 実際に移動したか、bumpedEnemyId: バンプした敵のID（なければnull）
   */
  static tryMove(
    player: PlayerData,
    dir: Direction,
    tiles: TileType[][],
    enemyPositions: { id: string; pos: Vec2 }[]
  ): { moved: boolean; bumpedEnemyId: string | null } {
    // 向きを更新（移動できなくても向きは変える）
    player.facing = dir;

    const delta = DIR_DELTA[dir];
    const nx = player.pos.x + delta.x;
    const ny = player.pos.y + delta.y;

    // マップ範囲外チェック
    if (ny < 0 || ny >= tiles.length || nx < 0 || nx >= tiles[0].length) {
      return { moved: false, bumpedEnemyId: null };
    }

    // 移動先に敵がいればバンプアタック
    const bumpedEnemy = enemyPositions.find((e) => e.pos.x === nx && e.pos.y === ny);
    if (bumpedEnemy) {
      return { moved: false, bumpedEnemyId: bumpedEnemy.id };
    }

    // 壁チェック
    if (tiles[ny][nx] === 'wall') {
      return { moved: false, bumpedEnemyId: null };
    }

    // 移動実行
    player.pos.x = nx;
    player.pos.y = ny;
    return { moved: true, bumpedEnemyId: null };
  }

  /**
   * プレイヤーがダメージを受ける（HPは0未満にならない）
   * @param player - プレイヤーデータ（in-place更新）
   * @param damage - 受けるダメージ量
   * @returns 更新後のHP
   */
  static takeDamage(player: PlayerData, damage: number): number {
    player.hp = Math.max(0, player.hp - damage);
    return player.hp;
  }

  /**
   * プレイヤーが生存しているか判定する
   * @param player - プレイヤーデータ
   * @returns 生存していればtrue
   */
  static isAlive(player: PlayerData): boolean {
    return player.hp > 0;
  }

  /**
   * 向き方向の隣接座標を返す
   * @param player - プレイヤーデータ
   * @returns 向いている方向の座標
   */
  static getFacingPos(player: PlayerData): Vec2 {
    const delta = DIR_DELTA[player.facing];
    return { x: player.pos.x + delta.x, y: player.pos.y + delta.y };
  }
}
