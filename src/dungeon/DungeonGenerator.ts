import { PRNG } from '../utils/prng';
import type { TileType, TileVisibility, DungeonFloor, Room, EnemyData, AttackPattern } from '../types';
import {
  MAP_WIDTH, MAP_HEIGHT,
  MIN_ROOMS, MAX_ROOMS, MIN_ROOM_SIZE, MAX_ROOM_SIZE,
  BASE_ENEMY_HP, BASE_ENEMY_ATK, BASE_ENEMY_DEF, ENEMY_EXP_REWARD,
  BOSS_FLOOR_INTERVAL, BOSS_BASE_HP, BOSS_GROWTH_RATE, BOSS_EXP_REWARD,
  TELEGRAPH_TURNS_NORMAL, TELEGRAPH_TURNS_STRONG, TELEGRAPH_TURNS_BOSS,
  ENEMY_DETECTION_RANGE,
} from '../constants';

/** ランダムダンジョンフロア生成クラス（部屋＋通路方式） */
export class DungeonGenerator {
  /**
   * フロア番号とシードからダンジョンフロアを生成する
   * @param floorNumber - フロア番号（1始まり）
   * @param baseSeed - 乱数のベースシード
   * @returns 生成されたDungeonFloor
   */
  static generate(floorNumber: number, baseSeed: number): DungeonFloor {
    // フロアごとに異なるシードを生成して再現性を確保
    const seed = (baseSeed ^ (floorNumber * 0x9e3779b9)) >>> 0;
    const prng = new PRNG(seed);

    const tiles = DungeonGenerator.initTiles();
    const rooms = DungeonGenerator.placeRooms(prng, tiles);
    DungeonGenerator.connectRooms(prng, tiles, rooms);

    // プレイヤー開始地点は最初の部屋の中央
    const firstRoom = rooms[0];
    const playerStart = {
      x: Math.floor(firstRoom.x + firstRoom.width / 2),
      y: Math.floor(firstRoom.y + firstRoom.height / 2),
    };

    // 階段は最後の部屋の中央
    const lastRoom = rooms[rooms.length - 1];
    const stairsPos = {
      x: Math.floor(lastRoom.x + lastRoom.width / 2),
      y: Math.floor(lastRoom.y + lastRoom.height / 2),
    };
    tiles[stairsPos.y][stairsPos.x] = 'stairs';

    // 視界は全タイル未探索で初期化
    const visibility: TileVisibility[][] = Array.from({ length: MAP_HEIGHT }, () =>
      Array<TileVisibility>(MAP_WIDTH).fill('unseen')
    );

    const enemies = DungeonGenerator.placeEnemies(prng, rooms, floorNumber, playerStart);

    return {
      floorNumber,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tiles,
      visibility,
      playerStart,
      stairsPos,
      enemies,
      rooms,
      // ボスフロアではボス撃破まで階段が出現しない
      bossDefeated: !DungeonGenerator.isBossFloor(floorNumber),
    };
  }

  /**
   * 全タイルをwallで初期化した2次元配列を返す
   * @returns wall で埋まったタイル配列（height×width）
   */
  static initTiles(): TileType[][] {
    return Array.from({ length: MAP_HEIGHT }, () =>
      Array<TileType>(MAP_WIDTH).fill('wall')
    );
  }

  /**
   * ランダムに部屋を配置してタイルを床にする（重複チェックあり）
   * @param prng - 乱数生成器
   * @param tiles - タイル配列（in-place更新）
   * @returns 配置した部屋一覧
   */
  private static placeRooms(prng: PRNG, tiles: TileType[][]): Room[] {
    const roomCount = prng.nextInt(MIN_ROOMS, MAX_ROOMS);
    const rooms: Room[] = [];
    const maxAttempts = 200;

    for (let i = 0; i < maxAttempts && rooms.length < roomCount; i++) {
      const w = prng.nextInt(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
      const h = prng.nextInt(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
      // マップ端を1タイル分の壁として残す
      const x = prng.nextInt(1, MAP_WIDTH - w - 2);
      const y = prng.nextInt(1, MAP_HEIGHT - h - 2);
      const candidate: Room = { x, y, width: w, height: h };

      // 他の部屋と重ならないかチェック（1タイルの余白を設ける）
      const overlaps = rooms.some(
        (r) =>
          candidate.x <= r.x + r.width + 1 &&
          candidate.x + candidate.width + 1 >= r.x &&
          candidate.y <= r.y + r.height + 1 &&
          candidate.y + candidate.height + 1 >= r.y
      );

      if (!overlaps) {
        rooms.push(candidate);
        DungeonGenerator.carveRoom(tiles, candidate);
      }
    }

    // 最低1部屋を保証するフォールバック
    if (rooms.length === 0) {
      const fallback: Room = { x: 2, y: 2, width: 5, height: 5 };
      rooms.push(fallback);
      DungeonGenerator.carveRoom(tiles, fallback);
    }

    return rooms;
  }

  /**
   * 隣接する部屋同士をL字通路で接続する
   * @param prng - 乱数生成器
   * @param tiles - タイル配列（in-place更新）
   * @param rooms - 部屋一覧
   */
  private static connectRooms(prng: PRNG, tiles: TileType[][], rooms: Room[]): void {
    for (let i = 0; i < rooms.length - 1; i++) {
      const a = rooms[i];
      const b = rooms[i + 1];
      const ax = Math.floor(a.x + a.width / 2);
      const ay = Math.floor(a.y + a.height / 2);
      const bx = Math.floor(b.x + b.width / 2);
      const by = Math.floor(b.y + b.height / 2);

      // ランダムにL字の方向を決める（横→縦 or 縦→横）
      if (prng.nextFloat() < 0.5) {
        DungeonGenerator.carveCorridor(tiles, ax, ay, bx, ay);
        DungeonGenerator.carveCorridor(tiles, bx, ay, bx, by);
      } else {
        DungeonGenerator.carveCorridor(tiles, ax, ay, ax, by);
        DungeonGenerator.carveCorridor(tiles, ax, by, bx, by);
      }
    }
  }

  /**
   * 部屋の内部タイルをすべて床にする
   * @param tiles - タイル配列（in-place更新）
   * @param room - 対象部屋
   */
  private static carveRoom(tiles: TileType[][], room: Room): void {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (y >= 0 && y < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH) {
          tiles[y][x] = 'floor';
        }
      }
    }
  }

  /**
   * 2点間の水平または垂直な通路を床にする
   * @param tiles - タイル配列（in-place更新）
   * @param x1 - 始点X
   * @param y1 - 始点Y
   * @param x2 - 終点X
   * @param y2 - 終点Y
   */
  private static carveCorridor(tiles: TileType[][], x1: number, y1: number, x2: number, y2: number): void {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    // 横方向の通路
    for (let x = minX; x <= maxX; x++) {
      if (y1 >= 0 && y1 < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH) {
        tiles[y1][x] = 'floor';
      }
    }
    // 縦方向の通路
    for (let y = minY; y <= maxY; y++) {
      if (y >= 0 && y < MAP_HEIGHT && x2 >= 0 && x2 < MAP_WIDTH) {
        tiles[y][x2] = 'floor';
      }
    }
  }

  /**
   * フロアに敵を配置する（フロア深度に応じた数・強さ）
   * @param prng - 乱数生成器
   * @param rooms - 部屋一覧
   * @param floorNumber - フロア番号
   * @param playerStart - プレイヤー開始位置（この位置には敵を配置しない）
   * @returns 生成された敵データ一覧
   */
  static placeEnemies(
    prng: PRNG,
    rooms: Room[],
    floorNumber: number,
    playerStart: { x: number; y: number }
  ): EnemyData[] {
    const enemies: EnemyData[] = [];
    const isBoss = DungeonGenerator.isBossFloor(floorNumber);
    const bossIndex = Math.floor(floorNumber / BOSS_FLOOR_INTERVAL);

    // プレイヤー開始部屋（index 0）と階段部屋（最後）を除いた部屋
    const enemyRooms = rooms.length > 2 ? rooms.slice(1, -1) : rooms.slice(1);

    // ボスフロアの場合：最後から2番目の部屋にボスを1体配置
    if (isBoss && rooms.length >= 2) {
      const bossRoom = rooms[Math.max(1, rooms.length - 2)];
      const bossPos = {
        x: Math.floor(bossRoom.x + bossRoom.width / 2),
        y: Math.floor(bossRoom.y + bossRoom.height / 2),
      };
      if (!(bossPos.x === playerStart.x && bossPos.y === playerStart.y)) {
        enemies.push(
          DungeonGenerator.createEnemy(
            `enemy-boss-${floorNumber}`,
            bossPos,
            floorNumber,
            true,
            bossIndex
          )
        );
      }
    }

    // 通常敵の配置数（フロア深度に応じて増加、最大8体）
    const enemyCount = Math.min(8, Math.floor(floorNumber / 3) + 2);
    const roomsForEnemies = enemyRooms.length > 0 ? enemyRooms : rooms.slice(1, 2);

    let enemyId = 0;
    for (let i = 0; i < enemyCount; i++) {
      if (roomsForEnemies.length === 0) break;
      const room = roomsForEnemies[prng.nextInt(0, roomsForEnemies.length - 1)];
      const pos = {
        x: prng.nextInt(room.x, room.x + room.width - 1),
        y: prng.nextInt(room.y, room.y + room.height - 1),
      };

      // プレイヤー開始位置・他の敵との重複を回避
      if (pos.x === playerStart.x && pos.y === playerStart.y) continue;
      if (enemies.some((e) => e.pos.x === pos.x && e.pos.y === pos.y)) continue;

      enemies.push(
        DungeonGenerator.createEnemy(
          `enemy-${floorNumber}-${enemyId}`,
          pos,
          floorNumber,
          false,
          0
        )
      );
      enemyId++;
    }

    return enemies;
  }

  /**
   * 敵エンティティデータを生成する（フロア番号に基づいてパラメータを計算）
   * @param id - 敵の一意ID
   * @param pos - 初期位置
   * @param floorNumber - フロア番号
   * @param isBoss - ボスフラグ
   * @param bossIndex - ボスの何体目か（1体目=1）
   * @returns 生成されたEnemyData
   */
  static createEnemy(
    id: string,
    pos: { x: number; y: number },
    floorNumber: number,
    isBoss: boolean,
    bossIndex: number
  ): EnemyData {
    if (isBoss) {
      const hp = Math.round(BOSS_BASE_HP * Math.pow(BOSS_GROWTH_RATE, Math.max(0, bossIndex - 1)));
      return {
        id,
        pos: { ...pos },
        hp,
        maxHp: hp,
        atk: BASE_ENEMY_ATK + Math.floor(floorNumber / 3),
        def: Math.floor(floorNumber / 5),
        state: 'idle',
        isBoss: true,
        detectionRange: ENEMY_DETECTION_RANGE + 2,
        telegraphTurns: TELEGRAPH_TURNS_BOSS,
        attackPattern: 'cross',
        cooldownTurns: 2,
        currentCooldown: 0,
        expReward: BOSS_EXP_REWARD,
      };
    } else {
      // 雑魚敵HP: フロアが深いほど緩やかに増加
      const hp = Math.round(BASE_ENEMY_HP * (1 + floorNumber * 0.05));
      // 深いフロアでは30%の確率で強攻撃パターンを使用
      const useStrongPattern = floorNumber >= 4 && (id.charCodeAt(id.length - 1) % 10) < 3;
      const attackPattern: AttackPattern = useStrongPattern ? 'line' : 'single';
      const telegraphTurns = useStrongPattern ? TELEGRAPH_TURNS_STRONG : TELEGRAPH_TURNS_NORMAL;

      return {
        id,
        pos: { ...pos },
        hp,
        maxHp: hp,
        atk: BASE_ENEMY_ATK,
        def: BASE_ENEMY_DEF,
        state: 'idle',
        isBoss: false,
        detectionRange: ENEMY_DETECTION_RANGE,
        telegraphTurns,
        attackPattern,
        cooldownTurns: 1,
        currentCooldown: 0,
        expReward: ENEMY_EXP_REWARD,
      };
    }
  }

  /**
   * 指定フロアがボスフロアかどうか判定する
   * @param floorNumber - フロア番号
   * @returns ボスフロアならtrue
   */
  static isBossFloor(floorNumber: number): boolean {
    return floorNumber % BOSS_FLOOR_INTERVAL === 0;
  }
}
