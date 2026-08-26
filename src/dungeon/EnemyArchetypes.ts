import type { AttackPattern, EnemyCategory } from '../types';
import {
  TELEGRAPH_TURNS_NORMAL, TELEGRAPH_TURNS_STRONG, TELEGRAPH_TURNS_BOSS,
  ENEMY_DETECTION_RANGE,
} from '../constants';

/**
 * 敵アーキタイプの定義テンプレート
 * ここで定義したパラメータをベースにフロア番号でスケーリングして EnemyData を生成する
 */
export interface EnemyArchetypeDef {
  /** アーキタイプ固有ID */
  id: string;
  /** 敵カテゴリ */
  category: EnemyCategory;
  /** 出現最低フロア番号（これ未満のフロアでは選択されない） */
  minFloor: number;
  /** 基本HP（フロアスケーリング前） */
  baseHp: number;
  /** 基本攻撃力 */
  baseAtk: number;
  /** 基本防御力 */
  baseDef: number;
  /** HPのフロアスケーリング係数（hp = baseHp * (1 + floor * hpScaling)） */
  hpScaling: number;
  /** ATKのフロアスケーリング係数（atk = baseAtk + floor(floor * atkScaling)） */
  atkScaling: number;
  /** DEFのフロアスケーリング係数（def = baseDef + floor(floor * defScaling)） */
  defScaling: number;
  /** 見た目バリアント（0=円, 1=ひし形, 2=星型） */
  variant: 0 | 1 | 2;
  /** 攻撃パターン候補一覧 */
  attackPatterns: AttackPattern[];
  /** 索敵範囲（タイル数） */
  detectionRange: number;
  /** 撃破時のEXP報酬 */
  expReward: number;
}

/**
 * 全敵アーキタイプのテンプレート定義
 *
 * カテゴリ別の出現フロア:
 *   overlord: 10の倍数フロア（10, 20, 30...）
 *   boss:     5の倍数フロア（5, 15, 25...）
 *   elite:    全フロア（minFloor以降）に1〜2体
 *   soldier:  全フロア（minFloor以降）に複数体
 *   minion:   全フロア（minFloor以降）に複数体（最弱）
 *
 * バランス設計方針:
 *   - defScaling をプレイヤーATK成長率（約0.45/F）に近づけることで
 *     深層ほど1撃ダメージが抑制され、HPの増加分が撃数に反映される
 *   - hpScaling は0.22〜0.25と高めに設定し、HP成長で撃数を段階的に増加させる
 *   - 目標撃数: minion F1≈5, F10≈10, F20≈15 / boss F5≈15, F20≈40
 */
export const ENEMY_ARCHETYPES: EnemyArchetypeDef[] = [

  // ========== overlord（大ボス）==========

  {
    id: 'dragon',
    category: 'overlord',
    minFloor: 10,
    baseHp: 25,
    baseAtk: 3,
    baseDef: 1,
    hpScaling: 0.20,
    atkScaling: 0.2,
    defScaling: 0.38,
    variant: 0,
    attackPatterns: [
      { name: 'area',  telegraphTurns: TELEGRAPH_TURNS_BOSS, cooldownTurns: 1 },
      { name: 'cross', telegraphTurns: TELEGRAPH_TURNS_BOSS, cooldownTurns: 1 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE + 3,
    expReward: 100,
  },
  {
    id: 'demon_god',
    category: 'overlord',
    minFloor: 20,
    baseHp: 28,
    baseAtk: 4,
    baseDef: 0,
    hpScaling: 0.18,
    atkScaling: 0.3,
    defScaling: 0.38,
    variant: 0,
    attackPatterns: [
      { name: 'area',  telegraphTurns: TELEGRAPH_TURNS_BOSS, cooldownTurns: 1 },
      { name: 'cross', telegraphTurns: TELEGRAPH_TURNS_BOSS, cooldownTurns: 1 },
      { name: 'line',  telegraphTurns: TELEGRAPH_TURNS_BOSS, cooldownTurns: 0 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE + 4,
    expReward: 100,
  },

  // ========== boss（中ボス）==========

  {
    id: 'knight',
    category: 'boss',
    minFloor: 5,
    baseHp: 22,
    baseAtk: 2,
    baseDef: 0,
    hpScaling: 0.22,
    atkScaling: 0.15,
    defScaling: 0.42,
    variant: 2,
    attackPatterns: [
      { name: 'cross', telegraphTurns: TELEGRAPH_TURNS_BOSS, cooldownTurns: 1 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE + 2,
    expReward: 50,
  },
  {
    id: 'dark_mage',
    category: 'boss',
    minFloor: 15,
    baseHp: 20,
    baseAtk: 3,
    baseDef: 0,
    hpScaling: 0.20,
    atkScaling: 0.2,
    defScaling: 0.40,
    variant: 1,
    attackPatterns: [
      { name: 'line',  telegraphTurns: TELEGRAPH_TURNS_BOSS, cooldownTurns: 0 },
      { name: 'cross', telegraphTurns: TELEGRAPH_TURNS_BOSS, cooldownTurns: 1 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE + 2,
    expReward: 50,
  },
  {
    id: 'assassin',
    category: 'boss',
    minFloor: 25,
    baseHp: 20,
    baseAtk: 4,
    baseDef: 0,
    hpScaling: 0.20,
    atkScaling: 0.25,
    defScaling: 0.40,
    variant: 2,
    attackPatterns: [
      { name: 'single', telegraphTurns: TELEGRAPH_TURNS_NORMAL, cooldownTurns: 0 },
      { name: 'line',   telegraphTurns: TELEGRAPH_TURNS_STRONG,  cooldownTurns: 0 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE + 2,
    expReward: 50,
  },

  // ========== elite（強敵）==========

  {
    id: 'warrior',
    category: 'elite',
    minFloor: 3,
    baseHp: 14,
    baseAtk: 2,
    baseDef: 0,
    hpScaling: 0.22,
    atkScaling: 0.1,
    defScaling: 0.42,
    variant: 1,
    attackPatterns: [
      { name: 'single', telegraphTurns: TELEGRAPH_TURNS_NORMAL, cooldownTurns: 0 },
      { name: 'line',   telegraphTurns: TELEGRAPH_TURNS_STRONG,  cooldownTurns: 0 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE,
    expReward: 25,
  },
  {
    id: 'archer',
    category: 'elite',
    minFloor: 5,
    baseHp: 12,
    baseAtk: 2,
    baseDef: 0,
    hpScaling: 0.20,
    atkScaling: 0.12,
    defScaling: 0.38,
    variant: 2,
    attackPatterns: [
      { name: 'line', telegraphTurns: TELEGRAPH_TURNS_STRONG, cooldownTurns: 0 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE + 2,
    expReward: 25,
  },
  {
    id: 'shaman',
    category: 'elite',
    minFloor: 8,
    baseHp: 14,
    baseAtk: 2,
    baseDef: 0,
    hpScaling: 0.22,
    atkScaling: 0.12,
    defScaling: 0.42,
    variant: 0,
    attackPatterns: [
      { name: 'cross', telegraphTurns: TELEGRAPH_TURNS_STRONG, cooldownTurns: 1 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE,
    expReward: 25,
  },

  // ========== soldier（兵士：通常より少し強い雑魚）==========

  {
    id: 'skeleton',
    category: 'soldier',
    minFloor: 3,
    baseHp: 10,
    baseAtk: 1,
    baseDef: 0,
    hpScaling: 0.22,
    atkScaling: 0.08,
    defScaling: 0.40,
    variant: 2,
    attackPatterns: [
      { name: 'single', telegraphTurns: TELEGRAPH_TURNS_NORMAL, cooldownTurns: 0 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE,
    expReward: 12,
  },
  {
    id: 'goblin',
    category: 'soldier',
    minFloor: 4,
    baseHp: 11,
    baseAtk: 1,
    baseDef: 0,
    hpScaling: 0.22,
    atkScaling: 0.1,
    defScaling: 0.40,
    variant: 1,
    attackPatterns: [
      { name: 'single', telegraphTurns: TELEGRAPH_TURNS_NORMAL, cooldownTurns: 0 },
      { name: 'line',   telegraphTurns: TELEGRAPH_TURNS_STRONG,  cooldownTurns: 0 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE,
    expReward: 12,
  },

  // ========== minion（最弱雑魚）==========

  {
    id: 'slime',
    category: 'minion',
    minFloor: 1,
    baseHp: 8,
    baseAtk: 1,
    baseDef: 0,
    hpScaling: 0.25,
    atkScaling: 0.05,
    defScaling: 0.40,
    variant: 0,
    attackPatterns: [
      { name: 'single', telegraphTurns: TELEGRAPH_TURNS_NORMAL, cooldownTurns: 0 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE - 2,
    expReward: 8,
  },
  {
    id: 'bat',
    category: 'minion',
    minFloor: 2,
    baseHp: 7,
    baseAtk: 1,
    baseDef: 0,
    hpScaling: 0.22,
    atkScaling: 0.05,
    defScaling: 0.38,
    variant: 1,
    attackPatterns: [
      { name: 'single', telegraphTurns: TELEGRAPH_TURNS_NORMAL, cooldownTurns: 0 },
    ],
    detectionRange: ENEMY_DETECTION_RANGE,
    expReward: 8,
  },
];
