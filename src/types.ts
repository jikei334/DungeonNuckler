/** タイルの種類 */
export type TileType = 'wall' | 'floor' | 'stairs';

/** 敵のAI状態 */
export type EnemyState = 'idle' | 'chase' | 'telegraph' | 'execute' | 'cooldown';

/** タイルの視界状態 */
export type TileVisibility = 'unseen' | 'explored' | 'visible';

/** 攻撃パターン */
export type AttackPattern = 'single' | 'line' | 'cross' | 'area';

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
  /** 攻撃パターン */
  pattern: AttackPattern;
}

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
  isBoss: boolean;
  /** 見た目バリアント（0=円, 1=ひし形, 2=星型） */
  variant: 0 | 1 | 2;
  /** 索敵範囲（タイル数） */
  detectionRange: number;
  /** テレグラフ開始ターン数 */
  telegraphTurns: number;
  /** 攻撃パターン候補一覧（テレグラフ開始時にランダム選択） */
  attackPatterns: AttackPattern[];
  /** クールダウン期間（ターン数） */
  cooldownTurns: number;
  /** 現在のクールダウン残り */
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
