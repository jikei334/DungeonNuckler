import type { EnemyData, PlayerData, TileType, Vec2, AttackPattern, AttackPatternName, Direction } from '../types';
import { FogOfWar } from '../dungeon/FogOfWar';
import {
  ENEMY_FOV_RANGE, ENEMY_FOV_ANGLE_DEG, ENEMY_SURROUNDINGS_RADIUS,
  IDLE_WANDER_CHANCE,
} from '../constants';

/** 4方向の移動ベクトル一覧 */
const DIRECTIONS: Vec2[] = [
  { x:  0, y: -1 },
  { x:  0, y:  1 },
  { x: -1, y:  0 },
  { x:  1, y:  0 },
];

/** 移動ベクトルを Direction 文字列に変換する */
function vecToFacing(dx: number, dy: number): Direction {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'down' : 'up';
}

/** 敵エンティティのAI・状態管理クラス */
export class Enemy {
  /**
   * 敵のAIを1ターン更新する（状態遷移・移動・テレグラフカウントダウン）
   * IDLE → CHASE → TELEGRAPH → EXECUTE → COOLDOWN → CHASE のサイクル
   *
   * @param enemy - 敵データ（in-place更新）
   * @param player - プレイヤーデータ
   * @param tiles - タイルデータ
   * @param allEnemies - 全敵一覧（衝突回避・自身を含む）
   * @returns 攻撃が発動（EXECUTE）したらtrue
   */
  static updateAI(
    enemy: EnemyData,
    player: PlayerData,
    tiles: TileType[][],
    allEnemies: EnemyData[]
  ): boolean {
    switch (enemy.state) {
      case 'idle':
        if (Enemy.canDetectPlayer(enemy, player, tiles)) {
          enemy.state = 'chase';
          Enemy.runChase(enemy, player, tiles, allEnemies);
        } else {
          Enemy.runIdle(enemy, tiles, allEnemies, player);
        }
        break;

      case 'chase':
        Enemy.runChase(enemy, player, tiles, allEnemies);
        break;

      case 'telegraph':
        return Enemy.runTelegraph(enemy, player);

      case 'execute': {
        // 攻撃発動：呼び出し元（GameScene）がダメージを処理する
        const cooldownTurns = enemy.telegraph?.pattern.cooldownTurns ?? 0;
        enemy.state = 'cooldown';
        enemy.currentCooldown = cooldownTurns;
        enemy.telegraph = undefined;
        return true;
      }

      case 'cooldown':
        if (enemy.currentCooldown > 0) {
          enemy.currentCooldown--;
        } else {
          enemy.state = 'chase';
        }
        break;
    }
    return false;
  }

  /**
   * IDLE状態の行動：IDLE_WANDER_CHANCE の確率でランダムな方向に1マス移動する
   * 移動時に向きも更新されるため、次ターンの視界方向が変化する
   *
   * @param enemy - 敵データ（in-place更新）
   * @param tiles - タイルデータ
   * @param allEnemies - 全敵一覧
   * @param player - プレイヤーデータ（移動可否判定に使用）
   */
  private static runIdle(
    enemy: EnemyData,
    tiles: TileType[][],
    allEnemies: EnemyData[],
    player: PlayerData
  ): void {
    if (Math.random() >= IDLE_WANDER_CHANCE) return;

    // ランダムな順序で方向を試す
    const shuffled = [...DIRECTIONS].sort(() => Math.random() - 0.5);
    const otherEnemies = allEnemies.filter((e) => e.id !== enemy.id);

    for (const dir of shuffled) {
      const nx = enemy.pos.x + dir.x;
      const ny = enemy.pos.y + dir.y;
      if (!Enemy.canMoveTo(nx, ny, tiles, otherEnemies, player)) continue;
      enemy.pos.x = nx;
      enemy.pos.y = ny;
      enemy.facing = vecToFacing(dir.x, dir.y);
      break;
    }
  }

  /**
   * CHASE状態の行動：攻撃射程内に入ったらTELEGRAPH開始、それ以外は1マス接近する
   * 攻撃射程は各パターンで「今すぐ撃ったら当たるか」で判定する
   * 移動時・隣接時ともにプレイヤー方向へ向きを更新する
   *
   * @param enemy - 敵データ（in-place更新）
   * @param player - プレイヤーデータ
   * @param tiles - タイルデータ
   * @param allEnemies - 全敵一覧
   */
  private static runChase(
    enemy: EnemyData,
    player: PlayerData,
    tiles: TileType[][],
    allEnemies: EnemyData[]
  ): void {
    // 常にプレイヤー方向へ向く
    const faceDx = player.pos.x - enemy.pos.x;
    const faceDy = player.pos.y - enemy.pos.y;
    if (faceDx !== 0 || faceDy !== 0) {
      enemy.facing = vecToFacing(faceDx, faceDy);
    }

    // 今すぐ攻撃したらプレイヤーに当たるパターンを取得
    const applicablePatterns = Enemy.getApplicableAttackPatterns(enemy, player, tiles);
    if (applicablePatterns.length > 0) {
      const pattern = Enemy.pickPattern(applicablePatterns);
      enemy.state = 'telegraph';
      enemy.telegraph = {
        targetTiles: Enemy.calculateTelegraphTiles(enemy, player, pattern.name),
        turnsUntilExecute: pattern.telegraphTurns,
        pattern,
      };
      return;
    }

    const nextPos = Enemy.getNextMove(enemy, player, tiles, allEnemies);
    const moveDx = nextPos.x - enemy.pos.x;
    const moveDy = nextPos.y - enemy.pos.y;
    if (moveDx !== 0 || moveDy !== 0) {
      enemy.facing = vecToFacing(moveDx, moveDy);
    }
    enemy.pos.x = nextPos.x;
    enemy.pos.y = nextPos.y;
  }

  /**
   * 現在の位置から各攻撃パターンを即座に撃った場合にプレイヤーに当たるパターンを返す
   * この結果が空でなければ「射程内」と判断し、TELEGRAPHを開始できる
   *
   * パターン別の判定ルール:
   *   line   : 攻撃タイルを計算してプレイヤーが含まれるか + 視線チェック
   *   single / cross / area : プレイヤーに隣接している場合のみ（近接攻撃）
   *
   * @param enemy - 敵データ
   * @param player - プレイヤーデータ
   * @param tiles - タイルデータ（視線確認用）
   * @returns 今すぐ使用可能な攻撃パターン一覧
   */
  static getApplicableAttackPatterns(
    enemy: EnemyData,
    player: PlayerData,
    tiles: TileType[][]
  ): AttackPattern[] {
    return enemy.attackPatterns.filter((pattern) => {
      if (pattern.name === 'line') {
        // lineパターン: 攻撃タイルにプレイヤーが含まれるかつ視線が通っているか確認
        const attackTiles = Enemy.calculateTelegraphTiles(enemy, player, 'line');
        const playerInPath = attackTiles.some(
          (t) => t.x === player.pos.x && t.y === player.pos.y
        );
        return playerInPath && FogOfWar.hasLineOfSight(enemy.pos, player.pos, tiles);
      }
      // その他（single / cross / area）: 近接攻撃なので隣接必須
      return Enemy.isAdjacentToPlayer(enemy, player);
    });
  }

  /**
   * 攻撃パターン候補からランダムに1つ選ぶ
   * @param patterns - 候補一覧（空の場合は 'single' にフォールバック）
   * @returns 選択された攻撃パターン
   */
  static pickPattern(patterns: AttackPattern[]): AttackPattern {
    if (patterns.length === 0) return { name: 'single', telegraphTurns: 1, cooldownTurns: 0 };
    return patterns[Math.floor(Math.random() * patterns.length)];
  }

  /**
   * TELEGRAPH状態の行動：カウントダウンし、0になったらEXECUTEへ遷移する
   * プレイヤーが離れても予告を維持する（対象タイルは固定）
   *
   * @param enemy - 敵データ（in-place更新）
   * @param player - プレイヤーデータ（対象タイル再計算用）
   * @returns EXECUTEに移行した（= 攻撃発動）ならtrue
   */
  private static runTelegraph(enemy: EnemyData, player: PlayerData): boolean {
    if (!enemy.telegraph) {
      // テレグラフデータが欠損している場合は再生成（パターンも再選択）
      const pattern = Enemy.pickPattern(enemy.attackPatterns);
      enemy.telegraph = {
        targetTiles: Enemy.calculateTelegraphTiles(enemy, player, pattern.name),
        turnsUntilExecute: pattern.telegraphTurns,
        pattern,
      };
    }

    enemy.telegraph.turnsUntilExecute--;

    if (enemy.telegraph.turnsUntilExecute <= 0) {
      enemy.state = 'execute';
    }
    return false;
  }

  /**
   * プレイヤーへの次の移動先を計算する（1マス接近、壁・他敵を回避）
   * x/y の差が大きい軸を優先し、次に垂直方向、最後に全方向を試みる
   *
   * @param enemy - 敵データ
   * @param player - プレイヤーデータ
   * @param tiles - タイルデータ
   * @param allEnemies - 全敵一覧（自身含む）
   * @returns 移動先座標（移動不可なら現在位置）
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

    // x方向とy方向の差が大きい方を優先
    const preferX = Math.abs(dx) >= Math.abs(dy);
    const primaryDir: Vec2 = preferX ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    const secondaryDir: Vec2 = preferX ? { x: 0, y: Math.sign(dy) } : { x: Math.sign(dx), y: 0 };

    // 優先方向 → 垂直方向 → 残り全方向の順に試す
    const candidates = [primaryDir, secondaryDir, ...DIRECTIONS].filter(
      (d) => d.x !== 0 || d.y !== 0
    );

    // 自身は除外して他敵の位置を収集
    const otherEnemyPositions = allEnemies.filter((e) => e.id !== enemy.id);

    for (const dir of candidates) {
      const nx = pos.x + dir.x;
      const ny = pos.y + dir.y;
      if (!Enemy.canMoveTo(nx, ny, tiles, otherEnemyPositions, player)) continue;
      return { x: nx, y: ny };
    }

    return { ...pos };
  }

  /**
   * 指定座標に移動可能か判定する
   * @param x - 移動先X座標
   * @param y - 移動先Y座標
   * @param tiles - タイルデータ
   * @param otherEnemies - 自身を除いた他の敵一覧
   * @param player - プレイヤーデータ（隣接バンプは呼び出し元が処理）
   * @returns 移動可能ならtrue
   */
  static canMoveTo(
    x: number,
    y: number,
    tiles: TileType[][],
    otherEnemies: EnemyData[],
    player: PlayerData
  ): boolean {
    if (y < 0 || y >= tiles.length || x < 0 || x >= tiles[0].length) return false;
    if (tiles[y][x] === 'wall') return false;
    if (otherEnemies.some((e) => e.pos.x === x && e.pos.y === y)) return false;
    // プレイヤーのいるマスには移動しない（バンプは呼び出し元で管理）
    if (player.pos.x === x && player.pos.y === y) return false;
    return true;
  }

  /**
   * 敵の視界コーンにプレイヤーが入っているか判定する
   * 隣接タイルは向き関係なく常に発見、それ以外はコーン＋壁遮蔽チェック
   *
   * @param enemy - 敵データ（pos, facing, detectionRange）
   * @param player - プレイヤーデータ
   * @param tiles - タイルデータ（壁遮蔽チェックに使用）
   * @returns 検知ならtrue
   */
  static canDetectPlayer(enemy: EnemyData, player: PlayerData, tiles: TileType[][]): boolean {
    const dx = player.pos.x - enemy.pos.x;
    const dy = player.pos.y - enemy.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 隣接タイルは向きに関わらず常に検知
    if (dist <= ENEMY_SURROUNDINGS_RADIUS) return true;

    // 索敵範囲を超えている場合は検知しない
    if (dist > Math.min(enemy.detectionRange, ENEMY_FOV_RANGE)) return false;

    // 視界コーン外は検知しない
    if (!FogOfWar.isInCone(enemy.pos, enemy.facing, player.pos, ENEMY_FOV_RANGE, ENEMY_FOV_ANGLE_DEG)) {
      return false;
    }

    // 壁越しは検知しない
    return FogOfWar.hasLineOfSight(enemy.pos, player.pos, tiles);
  }

  /**
   * プレイヤーと4方向隣接しているか判定する
   * @param enemy - 敵データ
   * @param player - プレイヤーデータ
   * @returns 4方向隣接ならtrue
   */
  static isAdjacentToPlayer(enemy: EnemyData, player: PlayerData): boolean {
    const dx = Math.abs(enemy.pos.x - player.pos.x);
    const dy = Math.abs(enemy.pos.y - player.pos.y);
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  }

  /**
   * 指定タイルが敵のテレグラフ対象に含まれるか判定する
   * @param enemy - 敵データ
   * @param tile - チェック対象タイル座標
   * @returns 対象ならtrue
   */
  static isTelegraphTarget(enemy: EnemyData, tile: Vec2): boolean {
    return enemy.telegraph?.targetTiles.some(
      (t) => t.x === tile.x && t.y === tile.y
    ) ?? false;
  }

  /**
   * テレグラフの対象タイルを計算する
   * 指定された attackPattern に応じた攻撃範囲を返す
   *
   * @param enemy - 敵データ（pos）
   * @param player - プレイヤーデータ（ターゲット方向の計算に使用）
   * @param pattern - 今回使用する攻撃パターン
   * @returns 攻撃対象タイル一覧
   */
  static calculateTelegraphTiles(enemy: EnemyData, player: PlayerData, pattern: AttackPatternName): Vec2[] {
    const { pos } = enemy;

    switch (pattern) {
      case 'single':
        // プレイヤーがいるマスを単体攻撃
        return [{ ...player.pos }];

      case 'line': {
        // プレイヤー方向に3マス直線
        const ddx = Math.sign(player.pos.x - pos.x);
        const ddy = Math.sign(player.pos.y - pos.y);
        // 斜め方向は水平優先
        const lineDir = ddx !== 0 ? { x: ddx, y: 0 } : { x: 0, y: ddy };
        return [1, 2, 3].map((i) => ({
          x: pos.x + lineDir.x * i,
          y: pos.y + lineDir.y * i,
        }));
      }

      case 'cross':
        // プレイヤーを中心に上下左右1マス（ボス攻撃）
        return [
          { x: player.pos.x,     y: player.pos.y },
          { x: player.pos.x,     y: player.pos.y - 1 },
          { x: player.pos.x,     y: player.pos.y + 1 },
          { x: player.pos.x - 1, y: player.pos.y },
          { x: player.pos.x + 1, y: player.pos.y },
        ];

      case 'area':
        // プレイヤー周辺3×3マス
        return [-1, 0, 1].flatMap((dy) =>
          [-1, 0, 1].map((ddx) => ({
            x: player.pos.x + ddx,
            y: player.pos.y + dy,
          }))
        );

      default:
        return [{ ...player.pos }];
    }
  }
}
