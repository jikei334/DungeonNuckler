import type { EnemyData, PlayerData, TileType, Vec2 } from '../types';

/** 方向ベクトル一覧（移動候補） */
const DIRECTIONS: Vec2[] = [
  { x:  0, y: -1 },
  { x:  0, y:  1 },
  { x: -1, y:  0 },
  { x:  1, y:  0 },
];

/** 敵エンティティのAI・状態管理クラス */
export class Enemy {
  /**
   * 敵のAIを1ターン更新する（Phase 2では状態は変えず、位置のみ返す）
   * Phase 4以降でフル実装する
   *
   * @param enemy - 敵データ（in-place更新）
   * @param player - プレイヤーデータ
   * @param tiles - タイルデータ
   * @param allEnemies - 他の敵一覧（衝突回避用）
   * @returns 攻撃が発動したらtrue（Phase 2では常にfalse）
   */
  static updateAI(
    _enemy: EnemyData,
    _player: PlayerData,
    _tiles: TileType[][],
    _allEnemies: EnemyData[]
  ): boolean {
    // Phase 2: 敵はまだ動かない（Phase 4で実装）
    return false;
  }

  /**
   * 敵の次の移動先座標を計算する（プレイヤーへの単純接近）
   * 壁・他の敵がいる方向は回避する
   *
   * @param enemy - 敵データ
   * @param player - プレイヤーデータ
   * @param tiles - タイルデータ
   * @param allEnemies - 他の敵一覧（衝突回避用）
   * @returns 移動先座標（移動できない場合は現在位置）
   */
  static getNextMove(
    enemy: EnemyData,
    player: PlayerData,
    tiles: TileType[][],
    allEnemies: EnemyData[]
  ): Vec2 {
    const { pos } = enemy;
    const dx = player.pos.x - pos.x;
    const dy = player.pos.y - pos.y;

    // xとyの差が大きい方向を優先
    const preferX = Math.abs(dx) >= Math.abs(dy);
    const primaryDir: Vec2 = preferX
      ? { x: Math.sign(dx), y: 0 }
      : { x: 0, y: Math.sign(dy) };
    const secondaryDir: Vec2 = preferX
      ? { x: 0, y: Math.sign(dy) }
      : { x: Math.sign(dx), y: 0 };

    const ordered = [primaryDir, secondaryDir, ...DIRECTIONS].filter(
      (d) => d.x !== 0 || d.y !== 0
    );

    for (const dir of ordered) {
      const nx = pos.x + dir.x;
      const ny = pos.y + dir.y;
      if (!Enemy.canMoveTo(nx, ny, tiles, allEnemies, player)) continue;
      return { x: nx, y: ny };
    }

    return { ...pos };
  }

  /**
   * 指定座標に移動できるか判定する
   * @param x - 移動先X座標
   * @param y - 移動先Y座標
   * @param tiles - タイルデータ
   * @param allEnemies - 他の敵一覧
   * @param player - プレイヤーデータ（プレイヤー位置には移動しない）
   * @returns 移動可能ならtrue
   */
  private static canMoveTo(
    x: number,
    y: number,
    tiles: TileType[][],
    allEnemies: EnemyData[],
    player: PlayerData
  ): boolean {
    // マップ範囲外
    if (y < 0 || y >= tiles.length || x < 0 || x >= tiles[0].length) return false;
    // 壁
    if (tiles[y][x] === 'wall') return false;
    // 他の敵が占有している
    if (allEnemies.some((e) => e.pos.x === x && e.pos.y === y)) return false;
    // プレイヤーの位置（バンプアタックは呼び出し元で処理）
    if (player.pos.x === x && player.pos.y === y) return false;
    return true;
  }

  /**
   * プレイヤーを検知範囲内に捉えているか判定する（距離判定）
   * @param enemy - 敵データ
   * @param player - プレイヤーデータ
   * @returns 検知範囲内ならtrue
   */
  static canDetectPlayer(enemy: EnemyData, player: PlayerData): boolean {
    const dx = Math.abs(player.pos.x - enemy.pos.x);
    const dy = Math.abs(player.pos.y - enemy.pos.y);
    return Math.sqrt(dx * dx + dy * dy) <= enemy.detectionRange;
  }

  /**
   * プレイヤーの隣接マスにいるか判定する（4方向隣接）
   * @param enemy - 敵データ
   * @param player - プレイヤーデータ
   * @returns 隣接していればtrue
   */
  static isAdjacentToPlayer(enemy: EnemyData, player: PlayerData): boolean {
    const dx = Math.abs(enemy.pos.x - player.pos.x);
    const dy = Math.abs(enemy.pos.y - player.pos.y);
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  }

  /**
   * 指定タイルが敵の攻撃テレグラフ対象に含まれているか判定する
   * @param enemy - 敵データ
   * @param tile - 判定タイル
   * @returns 対象ならtrue
   */
  static isTelegraphTarget(enemy: EnemyData, tile: Vec2): boolean {
    return enemy.telegraph?.targetTiles.some(
      (t) => t.x === tile.x && t.y === tile.y
    ) ?? false;
  }
}
