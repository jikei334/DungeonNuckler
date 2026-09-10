import { PRNG } from '../utils/prng';
import type { TileType, TileVisibility, DungeonFloor, Room, EnemyData, Direction, EnemyCategory } from '../types';
import {
  MAP_WIDTH, MAP_HEIGHT,
  MIN_ROOMS, MAX_ROOMS, MIN_ROOM_SIZE, MAX_ROOM_SIZE,
  BOSS_FLOOR_INTERVAL, MAJOR_BOSS_FLOOR_INTERVAL,
} from '../constants';
import { ENEMY_ARCHETYPES, type EnemyArchetypeDef } from './EnemyArchetypes';

/** ランダムダンジョンフロア生成クラス（部屋＋通路方式） */
export class DungeonGenerator {
  /**
   * フロア番号とシードからダンジョンフロアを生成する
   * @param floorNumber - フロア番号（1始まり）
   * @param baseSeed - 乱数のベースシード
   * @returns 生成されたDungeonFloor
   */
  static generate(floorNumber: number, baseSeed: number): DungeonFloor {
    // 10の倍数フロアは固定大部屋のoverlordアリーナ
    if (DungeonGenerator.isOverlordFloor(floorNumber)) {
      return DungeonGenerator.generateOverlordFloor(floorNumber, baseSeed);
    }

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

    // 岩配置（敵・プレイヤー開始地点・階段を除外）
    const reserved = [playerStart, stairsPos, ...enemies.map((e) => e.pos)];
    DungeonGenerator.placeRocks(prng, tiles, rooms, floorNumber, reserved);

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
   * 10の倍数フロア用の固定大部屋アリーナを生成する
   * マップ全体をほぼ覆う1部屋のみで、overlordボスが中央に配置される
   */
  private static generateOverlordFloor(floorNumber: number, baseSeed: number): DungeonFloor {
    const seed = (baseSeed ^ (floorNumber * 0x9e3779b9)) >>> 0;
    const prng = new PRNG(seed);

    const tiles = DungeonGenerator.initTiles();

    // 通常部屋（平均6×6）の約1.5倍サイズをマップ中央に配置
    const ARENA_W = 12;
    const ARENA_H = 10;
    const room: Room = {
      x: Math.floor((MAP_WIDTH - ARENA_W) / 2),
      y: Math.floor((MAP_HEIGHT - ARENA_H) / 2),
      width: ARENA_W,
      height: ARENA_H,
    };
    DungeonGenerator.carveRoom(tiles, room);

    // ボスと階段は部屋の中央より少し上
    const centerX = Math.floor(room.x + room.width / 2);
    const bossPos = { x: centerX, y: room.y + 2 };
    const stairsPos = { ...bossPos };
    tiles[stairsPos.y][stairsPos.x] = 'stairs';

    // プレイヤーは部屋の下方中央
    const playerStart = { x: centerX, y: room.y + room.height - 2 };

    const visibility: TileVisibility[][] = Array.from({ length: MAP_HEIGHT }, () =>
      Array<TileVisibility>(MAP_WIDTH).fill('unseen')
    );

    // overlordをbossPosに1体だけ配置
    const overlordArchetypes = ENEMY_ARCHETYPES.filter(
      (a) => a.category === 'overlord' && a.minFloor <= floorNumber
    );
    const enemies: EnemyData[] = [];
    if (overlordArchetypes.length > 0) {
      const archetype = overlordArchetypes[prng.nextInt(0, overlordArchetypes.length - 1)];
      enemies.push(
        DungeonGenerator.createEnemyFromArchetype(
          `enemy-boss-${floorNumber}`,
          bossPos,
          archetype,
          floorNumber
        )
      );
    }

    // 岩をランダムに数個配置（プレイヤー・ボス・階段位置を除外）
    // 部屋内部（壁から1タイル内側）に限定し、通行を妨げない密度に抑える
    const ARENA_ROCK_COUNT = 6;
    const reserved = [playerStart, bossPos];
    let rocksPlaced = 0;
    let attempts = 0;
    while (rocksPlaced < ARENA_ROCK_COUNT && attempts < ARENA_ROCK_COUNT * 10) {
      attempts++;
      const rx = prng.nextInt(room.x + 1, room.x + room.width - 2);
      const ry = prng.nextInt(room.y + 1, room.y + room.height - 2);
      if (tiles[ry][rx] !== 'floor') continue;
      if (reserved.some((r) => r.x === rx && r.y === ry)) continue;
      tiles[ry][rx] = 'rock';
      rocksPlaced++;
    }

    return {
      floorNumber,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tiles,
      visibility,
      playerStart,
      stairsPos,
      enemies,
      rooms: [room],
      bossDefeated: false,
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
   * 部屋内にランダムな岩障害物を配置する
   * フロアが深くなるほど岩の数が増加する（Floor4未満: 0個/部屋、Floor4〜7: 0〜1個、Floor8〜11: 0〜2個、Floor12〜: 0〜3個）
   * プレイヤー開始地点・階段・敵位置には配置しない
   * 最初の部屋（プレイヤー開始部屋）には配置しない
   *
   * @param prng - 乱数生成器
   * @param tiles - タイル配列（in-place更新）
   * @param rooms - 部屋一覧（rooms[0]がプレイヤー開始部屋）
   * @param floorNumber - フロア番号
   * @param reserved - 岩を配置しない座標一覧
   */
  private static placeRocks(
    prng: PRNG,
    tiles: TileType[][],
    rooms: Room[],
    floorNumber: number,
    reserved: { x: number; y: number }[]
  ): void {
    const maxPerRoom = Math.min(3, Math.floor(floorNumber / 4));
    if (maxPerRoom === 0) return;

    // 最初の部屋はプレイヤー開始部屋のため除外
    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];
      const count = prng.nextInt(0, maxPerRoom);
      let placed = 0;
      let attempts = 0;

      while (placed < count && attempts < count * 8) {
        attempts++;
        const x = prng.nextInt(room.x, room.x + room.width - 1);
        const y = prng.nextInt(room.y, room.y + room.height - 1);

        if (tiles[y][x] !== 'floor') continue;
        if (reserved.some((r) => r.x === x && r.y === y)) continue;

        tiles[y][x] = 'rock';
        placed++;
      }
    }
  }

  /**
   * フロアに敵を配置する（カテゴリ別アーキタイプから選択）
   *
   * 配置ルール:
   *   - ボスフロア（5の倍数）: ボス1体 + 通常敵
   *   - 大ボスフロア（10の倍数）: overlordボス1体 + 通常敵
   *   - 通常フロア（3以降）: elite 1〜2体 + 通常敵
   *   - 通常敵: soldier + minion から構成
   *
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
    const isOverlord = DungeonGenerator.isOverlordFloor(floorNumber);
    const isBoss = DungeonGenerator.isBossFloor(floorNumber);

    // ボス配置用の部屋（最後から2番目）
    const bossRoom = rooms.length >= 2 ? rooms[Math.max(1, rooms.length - 2)] : null;
    // プレイヤー開始部屋と階段部屋を除いた中間部屋
    const midRooms = rooms.length > 2 ? rooms.slice(1, -1) : rooms.slice(1);

    // ---- ボス配置 ----
    if (isBoss && bossRoom) {
      const bossPos = {
        x: Math.floor(bossRoom.x + bossRoom.width / 2),
        y: Math.floor(bossRoom.y + bossRoom.height / 2),
      };
      if (!(bossPos.x === playerStart.x && bossPos.y === playerStart.y)) {
        const bossCategory: EnemyCategory = isOverlord ? 'overlord' : 'boss';
        const bossArchetypes = ENEMY_ARCHETYPES.filter(
          (a) => a.category === bossCategory && a.minFloor <= floorNumber
        );
        if (bossArchetypes.length > 0) {
          const archetype = bossArchetypes[prng.nextInt(0, bossArchetypes.length - 1)];
          enemies.push(
            DungeonGenerator.createEnemyFromArchetype(
              `enemy-boss-${floorNumber}`,
              bossPos,
              archetype,
              floorNumber
            )
          );
        }
      }
    }

    const roomsForRegular = midRooms.length > 0 ? midRooms : (rooms.length > 1 ? rooms.slice(1, 2) : rooms);

    // 大ボスフロア（10の倍数）はoverlordのみ。elite・通常敵は配置しない
    if (!isOverlord) {
      // ---- elite配置 ----
      // Floor10以降はeliteをより多く配置（ボスフロアは控えめ）
      const eliteArchetypes = ENEMY_ARCHETYPES.filter(
        (a) => a.category === 'elite' && a.minFloor <= floorNumber
      );
      if (eliteArchetypes.length > 0) {
        const eliteCount = isBoss
          ? prng.nextInt(0, 1)
          : floorNumber >= 10
            ? prng.nextInt(2, 3)
            : prng.nextInt(1, 2);
        DungeonGenerator.placeEnemiesOfArchetypes(
          prng, enemies, roomsForRegular, eliteArchetypes, eliteCount, floorNumber, playerStart, `elite-${floorNumber}`
        );
      }

      // ---- 通常敵配置（soldier + minion）----
      // Floor10以降: 敵部屋数（rooms.length - 2）を目安に配置（各部屋に約1体）
      // Floor10未満: 線形増加（最大5体）
      const normalArchetypes = ENEMY_ARCHETYPES.filter(
        (a) => (a.category === 'soldier' || a.category === 'minion') && a.minFloor <= floorNumber
      );
      const normalCount = floorNumber >= 10
        ? Math.max(4, rooms.length - 2)
        : Math.min(5, Math.floor(floorNumber / 3) + 2);
      if (normalArchetypes.length > 0) {
        DungeonGenerator.placeEnemiesOfArchetypes(
          prng, enemies, roomsForRegular, normalArchetypes, normalCount, floorNumber, playerStart, `normal-${floorNumber}`
        );
      }
    }

    return enemies;
  }

  /**
   * 指定アーキタイプ群から敵を配置する（重複回避あり）
   * @param prng - 乱数生成器
   * @param enemies - 配置済み敵リスト（in-place追加）
   * @param rooms - 配置候補部屋一覧
   * @param archetypes - 選択候補アーキタイプ一覧
   * @param count - 配置数
   * @param floorNumber - フロア番号
   * @param playerStart - プレイヤー開始位置（除外用）
   * @param idPrefix - 敵IDのプレフィックス
   */
  private static placeEnemiesOfArchetypes(
    prng: PRNG,
    enemies: EnemyData[],
    rooms: Room[],
    archetypes: EnemyArchetypeDef[],
    count: number,
    floorNumber: number,
    playerStart: { x: number; y: number },
    idPrefix: string
  ): void {
    if (rooms.length === 0) return;
    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 10;

    while (placed < count && attempts < maxAttempts) {
      attempts++;
      const room = rooms[prng.nextInt(0, rooms.length - 1)];
      const pos = {
        x: prng.nextInt(room.x, room.x + room.width - 1),
        y: prng.nextInt(room.y, room.y + room.height - 1),
      };

      if (pos.x === playerStart.x && pos.y === playerStart.y) continue;
      if (enemies.some((e) => e.pos.x === pos.x && e.pos.y === pos.y)) continue;

      const archetype = archetypes[prng.nextInt(0, archetypes.length - 1)];
      enemies.push(
        DungeonGenerator.createEnemyFromArchetype(`${idPrefix}-${placed}`, pos, archetype, floorNumber)
      );
      placed++;
    }
  }

  /**
   * アーキタイプテンプレートとフロア番号から EnemyData を生成する
   * HP/ATK/DEF はフロア番号でスケーリングされる
   *
   * @param id - 敵の一意ID
   * @param pos - 初期位置
   * @param archetype - 使用するアーキタイプ定義
   * @param floorNumber - フロア番号（スケーリングに使用）
   * @returns 生成されたEnemyData
   */
  static createEnemyFromArchetype(
    id: string,
    pos: { x: number; y: number },
    archetype: EnemyArchetypeDef,
    floorNumber: number
  ): EnemyData {
    // IDの文字コード合計から初期向きを決定（再現性のためハッシュ使用）
    const idHash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const FACING_LIST: Direction[] = ['up', 'down', 'left', 'right'];
    const initialFacing: Direction = FACING_LIST[idHash % 4];

    const hp = Math.max(1, Math.round(archetype.baseHp * (1 + floorNumber * archetype.hpScaling)));
    const atk = Math.max(1, archetype.baseAtk + Math.floor(floorNumber * archetype.atkScaling));
    const def = archetype.baseDef + Math.floor(floorNumber * archetype.defScaling);
    const isBoss = archetype.category === 'overlord' || archetype.category === 'boss';

    return {
      id,
      pos: { ...pos },
      hp,
      maxHp: hp,
      atk,
      def,
      state: 'idle',
      isBoss,
      category: archetype.category,
      variant: archetype.variant,
      facing: initialFacing,
      detectionRange: archetype.detectionRange,
      attackPatterns: archetype.attackPatterns,
      currentCooldown: 0,
      expReward: archetype.expReward,
    };
  }

  /**
   * 指定フロアがボスフロア（中ボス・大ボスどちらも含む）かどうか判定する
   * 5の倍数フロアがボスフロア（5, 10, 15, 20...）
   * @param floorNumber - フロア番号
   * @returns ボスフロアならtrue
   */
  static isBossFloor(floorNumber: number): boolean {
    return floorNumber % BOSS_FLOOR_INTERVAL === 0;
  }

  /**
   * 指定フロアが大ボス（overlord）フロアかどうか判定する
   * 10の倍数フロアが大ボスフロア（10, 20, 30...）
   * @param floorNumber - フロア番号
   * @returns 大ボスフロアならtrue
   */
  static isOverlordFloor(floorNumber: number): boolean {
    return floorNumber % MAJOR_BOSS_FLOOR_INTERVAL === 0;
  }

  /**
   * 指定フロアが中ボス（boss）フロアかどうか判定する
   * 5の倍数かつ10の倍数ではないフロア（5, 15, 25...）
   * @param floorNumber - フロア番号
   * @returns 中ボスフロアならtrue
   */
  static isMinorBossFloor(floorNumber: number): boolean {
    return floorNumber % BOSS_FLOOR_INTERVAL === 0 && floorNumber % MAJOR_BOSS_FLOOR_INTERVAL !== 0;
  }

  /**
   * フィルタ条件に合う利用可能なアーキタイプ一覧を返す
   * @param category - 絞り込むカテゴリ
   * @param floorNumber - フロア番号（minFloor以下のものを除外）
   * @returns 条件を満たすアーキタイプ一覧
   */
  static getAvailableArchetypes(category: EnemyCategory, floorNumber: number): EnemyArchetypeDef[] {
    return ENEMY_ARCHETYPES.filter(
      (a) => a.category === category && a.minFloor <= floorNumber
    );
  }

  /**
   * アーキタイプIDから定義を取得する
   * @param id - アーキタイプID
   * @returns 見つかった場合はEnemyArchetypeDef、なければundefined
   */
  static getArchetypeById(id: string): EnemyArchetypeDef | undefined {
    return ENEMY_ARCHETYPES.find((a) => a.id === id);
  }
}
