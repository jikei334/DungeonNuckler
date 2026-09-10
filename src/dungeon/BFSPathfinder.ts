import type { Vec2, TileType, TileVisibility } from '../types';
import { isBlockingTile } from '../types';

/** BFS（幅優先探索）による最短経路探索ユーティリティ */
export class BFSPathfinder {
  /**
   * BFS でスタートからゴールへの最短経路を探索する
   * 壁タイルおよび未探索（unseen）タイルは通行不可とする
   * 4方向（上下左右）移動のみ対応する
   *
   * @param start - 開始座標（結果に含まない）
   * @param goal - 目標座標（結果に含む）
   * @param tiles - タイルデータ
   * @param visibility - 視界状態（unseen は通行不可）
   * @returns スタートを除いたゴールまでの座標列、到達不可能なら null
   */
  static findPath(
    start: Vec2,
    goal: Vec2,
    tiles: TileType[][],
    visibility: TileVisibility[][]
  ): Vec2[] | null {
    if (start.x === goal.x && start.y === goal.y) return null;

    const height = tiles.length;
    const width = tiles[0]?.length ?? 0;

    // ゴールが範囲外・壁・未探索なら探索しない
    if (goal.x < 0 || goal.x >= width || goal.y < 0 || goal.y >= height) return null;
    if (isBlockingTile(tiles[goal.y][goal.x])) return null;
    if (visibility[goal.y][goal.x] === 'unseen') return null;

    // 訪問済みマスと前マスを記録（startの前マスはnull）
    const prev = new Map<string, Vec2 | null>();
    const toKey = (x: number, y: number) => `${x},${y}`;
    prev.set(toKey(start.x, start.y), null);

    const queue: Vec2[] = [{ ...start }];
    let head = 0;

    const DIRS: Vec2[] = [
      { x: 0, y: -1 },
      { x: 0, y:  1 },
      { x: -1, y: 0 },
      { x:  1, y: 0 },
    ];

    while (head < queue.length) {
      const cur = queue[head++];
      if (cur.x === goal.x && cur.y === goal.y) break;

      for (const d of DIRS) {
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (isBlockingTile(tiles[ny][nx])) continue;
        if (visibility[ny][nx] === 'unseen') continue;

        const nk = toKey(nx, ny);
        if (prev.has(nk)) continue;

        prev.set(nk, { ...cur });
        queue.push({ x: nx, y: ny });
      }
    }

    // ゴールに到達できなかった場合
    if (!prev.has(toKey(goal.x, goal.y))) return null;

    // 経路を逆順に辿ってスタートを除いた座標列を生成する
    const path: Vec2[] = [];
    let cur: Vec2 | null = { ...goal };
    while (cur !== null && (cur.x !== start.x || cur.y !== start.y)) {
      path.unshift({ x: cur.x, y: cur.y });
      cur = prev.get(toKey(cur.x, cur.y)) ?? null;
    }

    return path.length > 0 ? path : null;
  }
}
