/** タイルサイズ（ピクセル） */
export const TILE_SIZE = 32;

/** マップ幅（タイル数） */
export const MAP_WIDTH = 40;
/** マップ高さ（タイル数） */
export const MAP_HEIGHT = 30;

/** ビューポート幅（ピクセル） */
export const VIEWPORT_WIDTH = 800;
/** ビューポート高さ（ピクセル） */
export const VIEWPORT_HEIGHT = 600;

// --- プレイヤー定数 ---

/** プレイヤーの最大HP（固定） */
export const PLAYER_MAX_HP = 3;
/** プレイヤーの基本攻撃力 */
export const BASE_ATK = 2;
/** レベルアップ時の攻撃力上昇量 */
export const ATK_GROWTH_PER_LEVEL = 1;

// --- 行動制限タイマー ---

/** 最初のフロアの制限時間（ミリ秒） */
export const BASE_TIME_MS = 6000;
/** フロアごとの制限時間減少量（ミリ秒） */
export const DECAY_MS = 300;
/** 制限時間の下限（ミリ秒） */
export const MIN_TIME_MS = 1500;

// --- 敵パラメータ ---

/** 雑魚敵の基本HP（Floor1でATK=2に対して約3撃必要な値） */
export const BASE_ENEMY_HP = 5;
/** 雑魚敵の基本攻撃力 */
export const BASE_ENEMY_ATK = 1;
/** 雑魚敵の基本防御力 */
export const BASE_ENEMY_DEF = 0;
/** 雑魚敵撃破時のEXP獲得量 */
export const ENEMY_EXP_REWARD = 10;
/** 敵の索敵範囲（タイル数） */
export const ENEMY_DETECTION_RANGE = 8;

/** ボスフロアの間隔（N階ごとにボス） */
export const BOSS_FLOOR_INTERVAL = 5;
/** ボスの基本HP */
export const BOSS_BASE_HP = 15;
/** ボスのHP成長率（ボスIndex-1乗する） */
export const BOSS_GROWTH_RATE = 1.5;
/** ボス撃破時のEXP獲得量 */
export const BOSS_EXP_REWARD = 50;

// --- テレグラフ予告ターン数 ---

/** 通常の雑魚敵の予告ターン数 */
export const TELEGRAPH_TURNS_NORMAL = 1;
/** 強めの敵の予告ターン数 */
export const TELEGRAPH_TURNS_STRONG = 2;
/** ボスの予告ターン数 */
export const TELEGRAPH_TURNS_BOSS = 3;

// --- 視界設定 ---

/** 視界距離（タイル数） */
export const FOV_RANGE = 6;
/** 視界角度（度） */
export const FOV_ANGLE_DEG = 90;
/** プレイヤー周囲の常時表示半径（向き・遮蔽に関わらず visible にするマス数） */
export const FOV_SURROUNDINGS_RADIUS = 1;

// --- EXPテーブル（index=レベル、値=そのレベルになるのに必要な累積EXP） ---
export const EXP_TABLE: number[] = [0, 20, 50, 90, 140, 200, 270, 350, 440, 540, 650];

/** 最大レベル */
export const MAX_LEVEL = EXP_TABLE.length - 1;

// --- 部屋生成パラメータ ---

/** フロアあたりの最小部屋数 */
export const MIN_ROOMS = 6;
/** フロアあたりの最大部屋数 */
export const MAX_ROOMS = 10;
/** 部屋の最小サイズ（タイル数） */
export const MIN_ROOM_SIZE = 4;
/** 部屋の最大サイズ（タイル数） */
export const MAX_ROOM_SIZE = 8;

// --- UI設定 ---

/** 戦闘ログの表示行数 */
export const LOG_LINES = 5;

/** タイマーバーの高さ（ピクセル） */
export const TIMER_BAR_HEIGHT = 12;

/** UIパネルの高さ（ピクセル） */
export const UI_PANEL_HEIGHT = 80;
