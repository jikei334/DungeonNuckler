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
export const BASE_TIME_MS = 4000;
/** フロアごとの制限時間減少量（ミリ秒） */
export const DECAY_MS = 200;
/** 制限時間の下限（ミリ秒） */
export const MIN_TIME_MS = 500;

// --- 敵パラメータ ---

/** 敵の索敵範囲（タイル数）：アーキタイプの detectionRange の基準値 */
export const ENEMY_DETECTION_RANGE = 8;

/** 中ボス（boss）の出現フロア間隔（5の倍数: 5, 15, 25...） */
export const BOSS_FLOOR_INTERVAL = 5;
/** 大ボス（overlord）の出現フロア間隔（10の倍数: 10, 20, 30...） */
export const MAJOR_BOSS_FLOOR_INTERVAL = 10;

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

// --- 敵視界設定 ---

/** 敵の視界距離（タイル数） */
export const ENEMY_FOV_RANGE = 5;
/** 敵の視界角度（度）：プレイヤーと同じ90度コーン */
export const ENEMY_FOV_ANGLE_DEG = 90;
/** 敵の周囲常時検知半径：隣接タイルは向き関係なく常に発見 */
export const ENEMY_SURROUNDINGS_RADIUS = 1;
/** Idle状態で1ターンに移動するかどうかの確率（0〜1） */
export const IDLE_WANDER_CHANCE = 0.5;

/**
 * レベルアップに必要なEXPを返す（上限なし）
 * 式: round(20 * level^1.2)
 * L1=20, L5≈96, L10≈201, L20≈422, L50≈1065
 * @param level - 現在のレベル（1以上）
 * @returns 次のレベルへ必要なEXP量
 */
export function expForNextLevel(level: number): number {
  return Math.round(20 * Math.pow(level, 1.2));
}

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

/** 上部UIパネルの高さ（フロア番号・レベル・EXPバー・タイマーバーを含む領域） */
export const UI_TOP_HEIGHT = 72;

/** 下部UIパネルの高さ（戦闘ログ、ピクセル） */
export const UI_PANEL_HEIGHT = 80;
