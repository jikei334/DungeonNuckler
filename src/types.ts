/** タイルの種類 */
export type TileType = 'wall' | 'floor' | 'stairs' | 'rock';

/**
 * 移動・視線を遮るタイルかどうかを返す
 * @param tile - 判定対象タイル
 * @returns wall または rock なら true
 */
export function isBlockingTile(tile: TileType): boolean {
  return tile === 'wall' || tile === 'rock';
}

/** 敵のAI状態 */
export type EnemyState = 'idle' | 'chase' | 'telegraph' | 'execute' | 'cooldown';

/** タイルの視界状態 */
export type TileVisibility = 'unseen' | 'explored' | 'visible';

/** 攻撃範囲の種類 */
export type AttackPatternName = 'single' | 'line' | 'cross' | 'area';

/** 攻撃パターン（攻撃範囲・テレグラフターン・クールダウンターンをひとまとめにしたもの） */
export interface AttackPattern {
  name: AttackPatternName;
  /** テレグラフ（予告）ターン数 */
  telegraphTurns: number;
  /** 攻撃後のクールダウンターン数 */
  cooldownTurns: number;
}

/** プレイヤーの向き */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** 2D座標 */
export interface Vec2 {
  x: number;
  y: number;
}

/** ダンジョンの部屋 */
export interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 敵の攻撃予告データ */
export interface EnemyAttackTelegraph {
  /** 攻撃対象のタイル一覧 */
  targetTiles: Vec2[];
  /** 攻撃発動までの残りターン数（0で発動） */
  turnsUntilExecute: number;
  /** 選択された攻撃パターン（クールダウン計算にも使用） */
  pattern: AttackPattern;
}

/**
 * 敵のカテゴリ（強さ階層）
 * overlord: 大ボス（10の倍数フロア）
 * boss: 中ボス（5の倍数フロア）
 * elite: 強敵（フロアに1〜2体）
 * soldier: 兵士（通常より少し強い雑魚）
 * minion: 最弱雑魚（スライム・コウモリ等）
 */
export type EnemyCategory = 'overlord' | 'boss' | 'elite' | 'soldier' | 'minion';

/** 敵エンティティデータ */
export interface EnemyData {
  id: string;
  pos: Vec2;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  state: EnemyState;
  telegraph?: EnemyAttackTelegraph;
  /** ボス（overlord/boss）かどうか（演出・ステアロック判定に使用） */
  isBoss: boolean;
  /** 敵カテゴリ */
  category: EnemyCategory;
  /** 見た目バリアント（0=円, 1=ひし形, 2=星型） */
  variant: 0 | 1 | 2;
  /** 索敵範囲（タイル数） */
  detectionRange: number;
  /** 向いている方向（視界コーンの向き） */
  facing: Direction;
  /** 攻撃パターン候補一覧（テレグラフ開始時にランダム選択、ターン数も各パターンで保持） */
  attackPatterns: AttackPattern[];
  /** 現在のクールダウン残りターン数 */
  currentCooldown: number;
  /** 撃破時のEXP */
  expReward: number;
}

/** プレイヤーエンティティデータ */
export interface PlayerData {
  pos: Vec2;
  hp: number;
  maxHp: number;
  atk: number;
  level: number;
  exp: number;
  facing: Direction;
}

/** ダンジョンフロアデータ */
export interface DungeonFloor {
  floorNumber: number;
  width: number;
  height: number;
  tiles: TileType[][];
  visibility: TileVisibility[][];
  playerStart: Vec2;
  stairsPos: Vec2;
  enemies: EnemyData[];
  rooms: Room[];
  /** ボスフロアでボスが倒されたか（非ボスフロアは常にtrue） */
  bossDefeated: boolean;
}
