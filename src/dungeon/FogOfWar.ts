import type { PlayerData, DungeonFloor, Vec2, TileType } from '../types';
import { isBlockingTile } from '../types';
import { FOV_RANGE, FOV_ANGLE_DEG, FOV_SURROUNDINGS_RADIUS } from '../constants';

/** 方向ベクトルのマッピング */
const FACING_VEC: Record<string, Vec2> = {
  up:    { x:  0, y: -1 },
  down:  { x:  0, y:  1 },
  left:  { x: -1, y:  0 },
  right: { x:  1, y:  0 },
};

/** フォグオブウォー（視界コーン＋壁遮蔽）管理クラス */
export class FogOfWar {
  /**
   * プレイヤーの位置・向きに基づいて視界を更新し、フロアのvisibilityを書き換える
   * 視界コーン内かつ壁に遮蔽されていないタイルを 'visible' に、
   * コーン外のタイルは 'explored'（過去に見た）または 'unseen' のまま保持する
   *
   * @param player - プレイヤーデータ（pos, facing）
   * @param floor - ダンジョンフロアデータ（visibility を in-place更新）
   */
  static updateVisibility(player: PlayerData, floor: DungeonFloor): void {
    const { tiles, visibility, width, height } = floor;

    // 前フレームの visible を explored に格下げする
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (visibility[y][x] === 'visible') {
          visibility[y][x] = 'explored';
        }
      }
    }

    const range = FOV_RANGE;
    const px = player.pos.x;
    const py = player.pos.y;

    // プレイヤー自身のタイルと周囲 FOV_SURROUNDINGS_RADIUS マスは常に visible
    // （向きや壁遮蔽に関わらず、真隣は常に見える）
    for (let dy = -FOV_SURROUNDINGS_RADIUS; dy <= FOV_SURROUNDINGS_RADIUS; dy++) {
      for (let dx = -FOV_SURROUNDINGS_RADIUS; dx <= FOV_SURROUNDINGS_RADIUS; dx++) {
        const sx = px + dx;
        const sy = py + dy;
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          visibility[sy][sx] = 'visible';
        }
      }
    }

    // 視界コーン内の各タイルを判定

    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const tx = px + dx;
        const ty = py + dy;

        // マップ範囲外はスキップ
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue;

        // コーン判定（距離＋角度）
        if (!FogOfWar.isInCone(player.pos, player.facing, { x: tx, y: ty }, range, FOV_ANGLE_DEG)) {
          continue;
        }

        // 壁遮蔽判定
        if (!FogOfWar.hasLineOfSight(player.pos, { x: tx, y: ty }, tiles)) {
          continue;
        }

        visibility[ty][tx] = 'visible';
      }
    }
  }

  /**
   * 対象タイルがプレイヤーの視界コーン内かどうかを判定する
   * コーンは向き方向を中心に angleDeg/2 の扇形、range タイル以内
   *
   * @param playerPos - プレイヤー座標
   * @param facing - プレイヤーの向き文字列
   * @param target - 判定対象タイル座標
   * @param range - 視界距離（タイル数）
   * @param angleDeg - 視界角度（度、片側ではなく全体の開き角）
   * @returns コーン内ならtrue
   */
  static isInCone(
    playerPos: Vec2,
    facing: string,
    target: Vec2,
    range: number,
    angleDeg: number
  ): boolean {
    const dx = target.x - playerPos.x;
    const dy = target.y - playerPos.y;

    // 自分自身は常に視界内
    if (dx === 0 && dy === 0) return true;

    // 距離チェック（チェビシェフ距離）
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > range) return false;

    // 向きベクトル
    const fv = FACING_VEC[facing] ?? { x: 0, y: 1 };

    // ターゲット方向と向きベクトルのなす角を計算
    const targetAngle = Math.atan2(dy, dx);
    const facingAngle = Math.atan2(fv.y, fv.x);
    let diff = Math.abs(targetAngle - facingAngle);

    // 角度差を 0〜π に正規化
    if (diff > Math.PI) diff = 2 * Math.PI - diff;

    const halfAngleRad = (angleDeg / 2) * (Math.PI / 180);
    return diff <= halfAngleRad;
  }

  /**
   * 2点間の直線上に壁がないかチェックする（Bresenhamの直線アルゴリズム）
   * プレイヤーから対象タイルへのパス上に壁タイルがあればfalseを返す
   *
   * @param from - 開始点（プレイヤー位置）
   * @param to - 終了点（チェック対象タイル）
   * @param tiles - タイルデータ
   * @returns 視線が通る（遮蔽なし）ならtrue
   */
  static hasLineOfSight(from: Vec2, to: Vec2, tiles: TileType[][]): boolean {
    const height = tiles.length;
    const width = tiles[0]?.length ?? 0;

    let x0 = from.x;
    let y0 = from.y;
    const x1 = to.x;
    const y1 = to.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      // 終点に到達したら視線が通っている
      if (x0 === x1 && y0 === y1) return true;

      // 範囲外は遮蔽とみなす
      if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) return false;

      // 中間タイルが壁なら遮蔽（始点・終点は除く）
      if (!(x0 === from.x && y0 === from.y) && !(x0 === x1 && y0 === y1)) {
        if (isBlockingTile(tiles[y0][x0])) return false;
      }

      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx)  { err += dx; y0 += sy; }
    }
  }
}
