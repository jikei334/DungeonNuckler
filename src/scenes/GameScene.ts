import Phaser from 'phaser';
import { DungeonGenerator } from '../dungeon/DungeonGenerator';
import { FogOfWar } from '../dungeon/FogOfWar';
import { BFSPathfinder } from '../dungeon/BFSPathfinder';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { TimerSystem } from '../systems/TimerSystem';
import { CombatSystem } from '../systems/CombatSystem';
import type { DungeonFloor, PlayerData, Direction, Vec2 } from '../types';
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT,
  VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
  LOG_LINES, UI_PANEL_HEIGHT, TIMER_BAR_HEIGHT, MAX_LEVEL,
} from '../constants';

// --- クリック/タッチ BFS移動の間隔(ms) ---
/** 経路自動移動の1ステップ間隔 */
const BFS_MOVE_INTERVAL_MS = 160;

// --- 描画色定数 ---

// 現在視界内タイル（明るく表示）
const C_WALL_VISIBLE    = 0x888888;  // 中明度グレー
const C_FLOOR_VISIBLE   = 0x666666;  // やや暗いグレー
const C_STAIRS_VISIBLE  = 0xccaa00;  // 明るい金色

// 過去に見たが現在視界外のタイル（暗く・青みがかった記憶色）
const C_WALL_EXPLORED   = 0x3a3a4a;  // 暗青灰（壁の輪郭が見える程度）
const C_FLOOR_EXPLORED  = 0x1e1e2a;  // 極暗・青みがかった暗色
const C_STAIRS_EXPLORED = 0x664400;  // 暗い金色

// 未探索エリア
const C_UNSEEN          = 0x000000;  // 完全な黒

const C_PLAYER            = 0x33dd66;
const C_ENEMY             = 0xff4444;
const C_ENEMY_BOSS        = 0xff8800;
const C_HP_RED            = 0xdd2222;
const C_HP_GREEN          = 0x22dd44;
const C_TIMER_BG          = 0x222222;
const C_TIMER_GREEN       = 0x22cc44;
const C_TIMER_YELLOW      = 0xcccc22;
const C_TIMER_RED         = 0xcc2222;
const C_TELEGRAPH_WARN    = 0xddaa00;  // テレグラフ警告色（黄）
const C_TELEGRAPH_DANGER  = 0xdd2200;  // テレグラフ最終ターン色（赤）
const ALPHA_TELEGRAPH     = 0.40;      // テレグラフ通常アルファ
const ALPHA_TELEGRAPH_MAX = 0.72;      // テレグラフ最終ターン最大アルファ

/** タイマーバーのY座標 */
const TIMER_BAR_Y = 54;
/** タイマーバーのX余白 */
const TIMER_BAR_MARGIN = 8;
/** タイマーバーの幅 */
const TIMER_BAR_WIDTH = VIEWPORT_WIDTH - TIMER_BAR_MARGIN * 2;
/** EXPバーのY座標（レベルテキストとタイマーバーの間） */
const EXP_BAR_Y = 42;
/** EXPバーの高さ */
const EXP_BAR_HEIGHT = 4;

/** フロア遷移時に引き継ぐプレイヤーの永続ステータス */
interface SavedPlayer {
  hp: number;
  atk: number;
  level: number;
  exp: number;
}

/** GameSceneへ渡すシーン起動データ */
interface GameSceneData {
  floorNumber?: number;
  seed?: number;
  /** フロア遷移時のみ設定。未設定なら新規ゲームとして初期値で生成する */
  savedPlayer?: SavedPlayer;
}

/** ゲームメインシーン */
export class GameScene extends Phaser.Scene {
  private floor!: DungeonFloor;
  private player!: PlayerData;
  private timer!: TimerSystem;
  /** フロア生成に使うベースシード（フロア遷移で引き継ぐ） */
  private baseSeed = 0;

  // グラフィックスレイヤー（描画順: タイル→フォグ→テレグラフ→経路→エンティティ→UI→タイマー）
  private tileGfx!: Phaser.GameObjects.Graphics;
  private fogGfx!: Phaser.GameObjects.Graphics;
  /** テレグラフ予告表示レイヤー（フォグより上、経路より下） */
  private telegraphGfx!: Phaser.GameObjects.Graphics;
  /** BFS経路表示レイヤー（テレグラフより上、エンティティより下） */
  private pathGfx!: Phaser.GameObjects.Graphics;
  private entityGfx!: Phaser.GameObjects.Graphics;
  private uiGfx!: Phaser.GameObjects.Graphics;
  /** タイマーバー専用レイヤー（毎フレーム更新） */
  private timerGfx!: Phaser.GameObjects.Graphics;

  // UIテキスト
  private logTexts: Phaser.GameObjects.Text[] = [];
  private logMessages: string[] = [];
  private floorText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private timerLabel!: Phaser.GameObjects.Text;

  // ターン制御
  private isWaitingForInput = false;
  private turnCount = 0;

  // BFS経路自動移動の状態管理
  private bfsPath: Vec2[] = [];
  private bfsMoveEvent: Phaser.Time.TimerEvent | null = null;

  // キー入力
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyUp!: Phaser.Input.Keyboard.Key;
  private keyDown!: Phaser.Input.Keyboard.Key;
  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEnter!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'GameScene' });
  }

  /**
   * シーン初期化：フロア生成・グラフィックス・カメラ・キー・タイマー設定
   */
  create(): void {
    const data = this.scene.settings.data as GameSceneData | undefined;
    const floorNumber = data?.floorNumber ?? 1;
    const seed = data?.seed ?? Math.floor(Date.now() % 1000000);
    this.baseSeed = seed;

    this.floor = DungeonGenerator.generate(floorNumber, seed);

    // フロア遷移時はステータスを引き継ぐ、新規ゲームは初期値で生成
    this.player = Player.createInitial(this.floor.playerStart);
    if (data?.savedPlayer) {
      this.player.hp    = data.savedPlayer.hp;
      this.player.atk   = data.savedPlayer.atk;
      this.player.level = data.savedPlayer.level;
      this.player.exp   = data.savedPlayer.exp;
    }

    this.timer = new TimerSystem(floorNumber);

    // Phaserはシーン再起動時に同一インスタンスを再利用するため、
    // フィールドを明示的にリセットしないと前フロアのデータが残留する
    this.logTexts    = [];  // setupUI()で新規Textオブジェクトを追加するため必ずクリア
    this.logMessages = [];
    this.bfsPath     = [];  // BFS経路もフロア遷移時にクリアする

    // グラフィックスレイヤー（描画順: タイル→フォグ→テレグラフ→経路→エンティティ→UI→タイマー）
    this.tileGfx      = this.add.graphics();
    this.fogGfx       = this.add.graphics();
    this.telegraphGfx = this.add.graphics();
    this.pathGfx      = this.add.graphics();  // BFS経路表示
    this.entityGfx    = this.add.graphics();
    this.uiGfx        = this.add.graphics().setScrollFactor(0).setDepth(50);
    this.timerGfx     = this.add.graphics().setScrollFactor(0).setDepth(60);

    // UIテキスト初期化
    this.setupUI();

    // カメラ設定
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    this.cameras.main.setZoom(1);

    // キー登録
    this.setupKeys();

    // タッチ/クリック入力を登録
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointerup', this.onPointerUp, this);

    // タブ非アクティブ時にタイマーを一時停止する
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    // 初期視界計算と描画
    FogOfWar.updateVisibility(this.player, this.floor);
    this.redraw();

    // 最初のターンを開始
    this.startPlayerTurn();
  }

  /**
   * UIコンポーネントを初期化する
   */
  private setupUI(): void {
    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
    };

    // フロア番号（左上）
    this.floorText = this.add.text(TIMER_BAR_MARGIN, 6, '', { ...baseStyle, color: '#aaffff' })
      .setScrollFactor(0).setDepth(100);

    // レベル・ATK・EXP（フロアの右隣）
    this.levelText = this.add.text(TIMER_BAR_MARGIN, 22, '', baseStyle)
      .setScrollFactor(0).setDepth(100);

    // タイマーラベル（タイマーバーの右端）
    this.timerLabel = this.add.text(
      VIEWPORT_WIDTH - TIMER_BAR_MARGIN, TIMER_BAR_Y - 2, '',
      { fontSize: '11px', color: '#aaaaaa', fontFamily: 'monospace' }
    ).setScrollFactor(0).setDepth(100).setOrigin(1, 1);

    // 戦闘ログ（画面下部）
    const logY = VIEWPORT_HEIGHT - UI_PANEL_HEIGHT + 6;
    for (let i = 0; i < LOG_LINES; i++) {
      this.logTexts.push(
        this.add.text(TIMER_BAR_MARGIN, logY + i * 15, '', {
          ...baseStyle,
          fontSize: '12px',
          color: '#dddddd',
        }).setScrollFactor(0).setDepth(100)
      );
    }

    this.updateUIText();
  }

  /**
   * キーボード入力を登録する（WASD＋矢印キー＋スペース・Enter）
   */
  private setupKeys(): void {
    if (!this.input.keyboard) return;
    const kb = this.input.keyboard;
    this.keyW     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyUp    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keyDown  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keyLeft  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyRight = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEnter = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  /**
   * プレイヤーターンを開始する（入力待ち状態に移行し、タイマーをスタート）
   */
  startPlayerTurn(): void {
    this.isWaitingForInput = true;
    this.timer.start();
  }

  /**
   * プレイヤーのアクションを処理し、敵ターンへ移行する
   * @param action - 移動方向または 'wait'（棒立ち含む）
   */
  private processPlayerAction(action: Direction | 'wait'): void {
    if (!this.isWaitingForInput) return;
    this.isWaitingForInput = false;
    this.timer.stop();
    this.turnCount++;

    if (action === 'wait') {
      this.addLog('その場で待機した。');
    } else {
      const enemyPositions = this.floor.enemies.map((e) => ({ id: e.id, pos: e.pos }));
      const { moved, bumpedEnemyId } = Player.tryMove(
        this.player, action, this.floor.tiles, enemyPositions
      );

      if (bumpedEnemyId) {
        // バンプアタック：隣接敵に攻撃を実行する
        const enemy = this.floor.enemies.find((e) => e.id === bumpedEnemyId);
        if (enemy) {
          const name = enemy.isBoss ? '【ボス】' : '敵';
          const { damage, killed } = CombatSystem.playerAttack(this.player, enemy);
          this.addLog(`${name}に${damage}ダメージ！（HP: ${enemy.hp}/${enemy.maxHp}）`);

          // 敵タイルの中央上部にダメージ数値を浮かせる
          const ex = enemy.pos.x * TILE_SIZE + TILE_SIZE / 2;
          const ey = enemy.pos.y * TILE_SIZE;
          this.showFloatingText(ex, ey, `-${damage}`, '#ff4444');

          if (killed) {
            // 撃破：敵リストから削除し、EXPを獲得する
            this.floor.enemies = this.floor.enemies.filter((e) => e.id !== bumpedEnemyId);
            this.addLog(`${name}を倒した！`);
            const levelsGained = CombatSystem.gainExp(this.player, enemy.expReward);
            this.addLog(`EXP +${enemy.expReward}`);
            if (levelsGained > 0) {
              this.addLog(`レベルアップ！ Lv.${this.player.level}  ATK: ${this.player.atk}`);
              this.showLevelUpEffect();
            }
            // ボスフロアでボスを倒したら階段を出現させる
            if (enemy.isBoss && !this.floor.bossDefeated) {
              this.floor.bossDefeated = true;
              this.addLog('封印が解けた！階段が現れた！');
            }
          }
        }
      } else if (moved) {
        FogOfWar.updateVisibility(this.player, this.floor);

        // 階段チェック：ボス未撃破なら通過できない
        const { stairsPos } = this.floor;
        if (this.player.pos.x === stairsPos.x && this.player.pos.y === stairsPos.y) {
          if (!this.floor.bossDefeated) {
            this.addLog('ボスを倒すまで先へは進めない！');
          } else {
            this.redraw();
            this.goToNextFloor();
            return; // 敵ターンは発生させない
          }
        }
      }
    }

    // プレイヤー行動後の初回描画（敵ターン後にも redraw するため二重になるが意図的）
    this.redraw();
    this.processEnemyTurns();
    // プレイヤーが死亡している場合はhandleGameOver()によりシーン遷移済み
    // startPlayerTurn()を呼ぶとタイマーが再起動してgameoverループになるため跳ばす
    if (!Player.isAlive(this.player)) return;
    this.startPlayerTurn();
  }

  /**
   * 敵のターン処理：全敵のAIを1ターン更新し、攻撃発動・ダメージ・ログを処理する
   * IDLE→CHASE: 「気づいた」ログ
   * CHASE→TELEGRAPH: 「攻撃予告」ログ
   * EXECUTE: プレイヤーが対象タイルにいれば固定1ダメージ
   */
  private processEnemyTurns(): void {
    for (const enemy of this.floor.enemies) {
      const prevState = enemy.state;
      // テレグラフの対象タイルを攻撃発動前に保存（execute後に消去されるため）
      const telegraphTiles = enemy.telegraph ? [...enemy.telegraph.targetTiles] : [];

      const didExecute = Enemy.updateAI(enemy, this.player, this.floor.tiles, this.floor.enemies);

      const name = enemy.isBoss ? '【ボス】' : '敵';
      // 状態変化をログに出力（視界内の敵のみ）
      const isVisible =
        this.floor.visibility[enemy.pos.y]?.[enemy.pos.x] === 'visible';

      if (isVisible) {
        if (prevState === 'idle' && enemy.state === 'chase') {
          this.addLog(`${name}が気づいた！`);
        }
        if (prevState === 'chase' && enemy.state === 'telegraph') {
          this.addLog(`${name}が攻撃の構えを取った！`);
        }
      }

      // 攻撃発動：テレグラフ対象にプレイヤーがいれば固定1ダメージ
      if (didExecute && telegraphTiles.length > 0) {
        const hit = telegraphTiles.some(
          (t) => t.x === this.player.pos.x && t.y === this.player.pos.y
        );
        if (hit) {
          Player.takeDamage(this.player, 1);
          this.addLog(`${name}の攻撃が命中！ HP残り ${this.player.hp}/${this.player.maxHp}`);

          // 被弾演出：画面フラッシュ＋カメラ揺れ＋ダメージ数値
          this.showDamageFlash();
          const ppx = this.player.pos.x * TILE_SIZE + TILE_SIZE / 2;
          const ppy = this.player.pos.y * TILE_SIZE;
          this.showFloatingText(ppx, ppy, '-1', '#ff8888');

          if (!Player.isAlive(this.player)) {
            this.handleGameOver();
            return;
          }
        } else if (isVisible) {
          this.addLog(`${name}の攻撃を回避した！`);
        }
      }
    }

    // 敵行動後に視界を再計算・再描画
    FogOfWar.updateVisibility(this.player, this.floor);
    this.redraw();
  }

  /**
   * 次フロアへ遷移する
   * プレイヤーのHP・ATK・レベル・EXPを引き継ぎ、タイマーは次フロア用に短縮される
   */
  private goToNextFloor(): void {
    this.timer.stop();
    this.isWaitingForInput = false;
    this.clearBfsPath();

    const nextFloor = this.floor.floorNumber + 1;
    this.addLog(`${nextFloor}階へ降りる…`);

    this.scene.start('GameScene', {
      floorNumber: nextFloor,
      seed: this.baseSeed,
      savedPlayer: {
        hp:    this.player.hp,
        atk:   this.player.atk,
        level: this.player.level,
        exp:   this.player.exp,
      },
    } as GameSceneData);
  }

  /**
   * ゲームオーバー処理：GameOverSceneへ遷移する
   */
  private handleGameOver(): void {
    this.timer.stop();
    this.isWaitingForInput = false;
    this.clearBfsPath();
    this.scene.start('GameOverScene', {
      floorNumber: this.floor.floorNumber,
      level: this.player.level,
      turnCount: this.turnCount,
    });
  }

  /**
   * 戦闘ログにメッセージを追加する（最新LOG_LINES件を保持）
   * @param message - 追加するログメッセージ
   */
  addLog(message: string): void {
    this.logMessages.unshift(message);
    if (this.logMessages.length > LOG_LINES) {
      this.logMessages.length = LOG_LINES;
    }
    this.updateLogText();
  }

  /**
   * 上部UIテキスト（フロア・ターン・レベル・ATK・EXP）を更新する
   */
  private updateUIText(): void {
    this.floorText.setText(`Floor ${this.floor.floorNumber} | Turn ${this.turnCount}`);
    const nextExp = CombatSystem.getNextLevelExp(this.player);
    const expStr = this.player.level >= MAX_LEVEL
      ? 'MAX'
      : `${this.player.exp}/${nextExp}`;
    this.levelText.setText(`Lv.${this.player.level}  ATK: ${this.player.atk}  EXP: ${expStr}`);
  }

  /**
   * 戦闘ログテキストを更新する（古いほど薄く表示）
   */
  private updateLogText(): void {
    for (let i = 0; i < LOG_LINES; i++) {
      this.logTexts[i].setText(this.logMessages[i] ?? '');
      this.logTexts[i].setAlpha(i === 0 ? 1.0 : Math.max(0.25, 1.0 - i * 0.22));
    }
  }

  /**
   * 全グラフィックスを再描画する（ターン切り替わり時に呼ぶ）
   */
  private redraw(): void {
    this.drawTiles();
    this.drawTelegraphs();
    this.drawBfsPath();
    this.drawEntities();
    this.drawUIOverlay();
    this.updateUIText();
    this.centerCameraOnPlayer();
  }

  /**
   * タイルマップを描画する（視界状態に応じた3段階の色分け）
   * visible: 明るい通常色、explored: 暗青灰の記憶色、unseen: 純黒
   */
  private drawTiles(): void {
    this.tileGfx.clear();
    this.fogGfx.clear();  // fogGfxは使用しないがリソース解放のためクリア

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = this.floor.tiles[y][x];
        const vis  = this.floor.visibility[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (vis === 'unseen') {
          this.tileGfx.fillStyle(C_UNSEEN, 1);
          this.tileGfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          continue;
        }

        // ボスフロアでボス未撃破の場合、階段タイルを床として描画する
        const effectiveTile = (!this.floor.bossDefeated && tile === 'stairs') ? 'floor' : tile;

        // 視界内と探索済みで明確に異なる色を直接使用（オーバーレイ方式より識別しやすい）
        let color: number;
        if (vis === 'visible') {
          color = effectiveTile === 'wall' ? C_WALL_VISIBLE : effectiveTile === 'stairs' ? C_STAIRS_VISIBLE : C_FLOOR_VISIBLE;
        } else {
          color = effectiveTile === 'wall' ? C_WALL_EXPLORED : effectiveTile === 'stairs' ? C_STAIRS_EXPLORED : C_FLOOR_EXPLORED;
        }

        this.tileGfx.fillStyle(color, 1);
        this.tileGfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // グリッド線は visible タイルの床・階段のみ（explored はノイズを減らすため省略）
        if (vis === 'visible' && tile !== 'wall') {
          this.tileGfx.lineStyle(1, 0x3a3a3a, 0.4);
          this.tileGfx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  /**
   * 敵の攻撃予告（テレグラフ）を描画する
   * 視界内（visible）タイルのテレグラフのみ表示する
   * - 通常予告: 黄色半透明オーバーレイ
   * - 最終予告ターン（turnsUntilExecute === 1）: 赤で点滅（強調）
   */
  private drawTelegraphs(): void {
    this.telegraphGfx.clear();

    for (const enemy of this.floor.enemies) {
      if (!enemy.telegraph || enemy.state === 'cooldown') continue;

      const { targetTiles, turnsUntilExecute } = enemy.telegraph;
      const isFinal = turnsUntilExecute <= 1;

      for (const tile of targetTiles) {
        // 視界内のタイルのみ表示（視界外の予告は見えない）
        const vis = this.floor.visibility[tile.y]?.[tile.x];
        if (vis !== 'visible') continue;

        const px = tile.x * TILE_SIZE;
        const py = tile.y * TILE_SIZE;

        if (isFinal) {
          // 最終ターン：赤で点滅（sin波でアルファを変化させる）
          const blinkAlpha = ALPHA_TELEGRAPH + (ALPHA_TELEGRAPH_MAX - ALPHA_TELEGRAPH)
            * (0.5 + 0.5 * Math.sin(this.time.now / 120));
          this.telegraphGfx.fillStyle(C_TELEGRAPH_DANGER, blinkAlpha);
        } else {
          // 通常予告：黄色半透明
          this.telegraphGfx.fillStyle(C_TELEGRAPH_WARN, ALPHA_TELEGRAPH);
        }

        this.telegraphGfx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);

        // 枠線（最終ターンのみ）
        if (isFinal) {
          this.telegraphGfx.lineStyle(2, C_TELEGRAPH_DANGER, 0.9);
          this.telegraphGfx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
      }
    }
  }

  /**
   * プレイヤーと敵を描画する（視界外の敵は非表示）
   */
  private drawEntities(): void {
    this.entityGfx.clear();

    for (const enemy of this.floor.enemies) {
      const vis = this.floor.visibility[enemy.pos.y]?.[enemy.pos.x];
      if (vis !== 'visible') continue;

      const px = enemy.pos.x * TILE_SIZE;
      const py = enemy.pos.y * TILE_SIZE;
      const color = enemy.isBoss ? C_ENEMY_BOSS : C_ENEMY;
      const pad = enemy.isBoss ? 2 : 5;

      this.entityGfx.fillStyle(color, 1);
      this.entityGfx.fillRect(px + pad, py + pad, TILE_SIZE - pad * 2, TILE_SIZE - pad * 2);
      this.drawEnemyHpBar(px, py, enemy.hp, enemy.maxHp);
    }

    // プレイヤー
    const px = this.player.pos.x * TILE_SIZE;
    const py = this.player.pos.y * TILE_SIZE;
    this.entityGfx.fillStyle(C_PLAYER, 1);
    this.entityGfx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
    this.drawFacingIndicator(px, py);
  }

  /**
   * 敵のHPバーをエンティティの上部に描画する
   * @param px - 敵の描画X（ピクセル）
   * @param py - 敵の描画Y（ピクセル）
   * @param hp - 現在HP
   * @param maxHp - 最大HP
   */
  private drawEnemyHpBar(px: number, py: number, hp: number, maxHp: number): void {
    const barW = TILE_SIZE - 4;
    const barH = 4;
    const ratio = hp / maxHp;
    this.entityGfx.fillStyle(C_HP_RED, 1);
    this.entityGfx.fillRect(px + 2, py - 6, barW, barH);
    this.entityGfx.fillStyle(C_HP_GREEN, 1);
    this.entityGfx.fillRect(px + 2, py - 6, Math.round(barW * ratio), barH);
  }

  /**
   * プレイヤーの向きを示す三角形を描画する
   * @param px - プレイヤーの描画X（ピクセル）
   * @param py - プレイヤーの描画Y（ピクセル）
   */
  private drawFacingIndicator(px: number, py: number): void {
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;
    const r = 5;
    let pts: { x: number; y: number }[];

    switch (this.player.facing) {
      case 'up':
        pts = [{ x: cx, y: cy - r - 4 }, { x: cx - r, y: cy - 2 }, { x: cx + r, y: cy - 2 }];
        break;
      case 'down':
        pts = [{ x: cx, y: cy + r + 4 }, { x: cx - r, y: cy + 2 }, { x: cx + r, y: cy + 2 }];
        break;
      case 'left':
        pts = [{ x: cx - r - 4, y: cy }, { x: cx - 2, y: cy - r }, { x: cx - 2, y: cy + r }];
        break;
      case 'right':
        pts = [{ x: cx + r + 4, y: cy }, { x: cx + 2, y: cy - r }, { x: cx + 2, y: cy + r }];
        break;
    }

    this.entityGfx.fillStyle(0xffffff, 0.85);
    this.entityGfx.fillTriangle(
      pts[0].x, pts[0].y,
      pts[1].x, pts[1].y,
      pts[2].x, pts[2].y
    );
  }

  /**
   * UIオーバーレイ（上部パネル・ログパネル・HPハート・EXPバー）を描画する
   */
  private drawUIOverlay(): void {
    this.uiGfx.clear();

    // 上部UIパネル背景
    this.uiGfx.fillStyle(0x000000, 0.65);
    this.uiGfx.fillRect(0, 0, VIEWPORT_WIDTH, TIMER_BAR_Y + TIMER_BAR_HEIGHT + 4);

    // ログパネル背景
    this.uiGfx.fillStyle(0x000000, 0.72);
    this.uiGfx.fillRect(0, VIEWPORT_HEIGHT - UI_PANEL_HEIGHT, VIEWPORT_WIDTH, UI_PANEL_HEIGHT);

    this.drawHpHearts();
    this.drawExpBar();
  }

  /**
   * EXPバーを描画する（レベルテキストとタイマーバーの間に配置）
   * 最大レベル時は満タン表示
   */
  private drawExpBar(): void {
    const ratio = this.player.level >= MAX_LEVEL
      ? 1
      : this.player.exp / CombatSystem.getNextLevelExp(this.player);
    const barW = Math.round(TIMER_BAR_WIDTH * Math.min(ratio, 1));

    // バー背景
    this.uiGfx.fillStyle(0x111133, 1);
    this.uiGfx.fillRect(TIMER_BAR_MARGIN, EXP_BAR_Y, TIMER_BAR_WIDTH, EXP_BAR_HEIGHT);

    // バー前景（青色）
    if (barW > 0) {
      this.uiGfx.fillStyle(0x2255dd, 1);
      this.uiGfx.fillRect(TIMER_BAR_MARGIN, EXP_BAR_Y, barW, EXP_BAR_HEIGHT);
    }
  }

  /**
   * プレイヤーHPをハートアイコン（矩形）で描画する
   */
  private drawHpHearts(): void {
    const heartSize = 18;
    const startX = VIEWPORT_WIDTH - (this.player.maxHp * (heartSize + 4)) - TIMER_BAR_MARGIN;
    const startY = 10;

    for (let i = 0; i < this.player.maxHp; i++) {
      const hx = startX + i * (heartSize + 4);
      const filled = i < this.player.hp;
      this.uiGfx.fillStyle(filled ? 0xdd2222 : 0x444444, 1);
      this.uiGfx.fillRect(hx, startY, heartSize, heartSize);
      if (filled) {
        this.uiGfx.fillStyle(0xff6666, 0.45);
        this.uiGfx.fillRect(hx + 2, startY + 2, heartSize - 8, 4);
      }
    }
  }

  /**
   * 行動制限タイマーバーを描画する（毎フレーム更新）
   * 残り割合に応じて緑→黄→赤に変化し、残り10%以下でバーが点滅する
   */
  private drawTimerBar(): void {
    this.timerGfx.clear();

    const ratio = this.timer.getRemainingRatio();
    const filledW = Math.round(TIMER_BAR_WIDTH * ratio);

    // バー背景
    this.timerGfx.fillStyle(C_TIMER_BG, 1);
    this.timerGfx.fillRect(TIMER_BAR_MARGIN, TIMER_BAR_Y, TIMER_BAR_WIDTH, TIMER_BAR_HEIGHT);

    // バー前景（残り割合で色変化）
    const barColor =
      ratio > 0.5 ? C_TIMER_GREEN :
      ratio > 0.25 ? C_TIMER_YELLOW :
      C_TIMER_RED;

    // 残り10%以下は時刻に応じて点滅（Phaser.time.now を使って sin波）
    let alpha = 1.0;
    if (ratio <= 0.1 && this.isWaitingForInput) {
      alpha = 0.5 + 0.5 * Math.sin(this.time.now / 80);
    }

    if (filledW > 0) {
      this.timerGfx.fillStyle(barColor, alpha);
      this.timerGfx.fillRect(TIMER_BAR_MARGIN, TIMER_BAR_Y, filledW, TIMER_BAR_HEIGHT);
    }

    // 残り秒数ラベル
    const remainSec = (this.timer.getRemainingMs() / 1000).toFixed(1);
    this.timerLabel.setText(`${remainSec}s`);
  }

  /**
   * カメラをプレイヤー座標の中心に合わせる
   */
  private centerCameraOnPlayer(): void {
    const tx = this.player.pos.x * TILE_SIZE + TILE_SIZE / 2;
    const ty = this.player.pos.y * TILE_SIZE + TILE_SIZE / 2;
    this.cameras.main.centerOn(tx, ty);
  }

  /**
   * タブ非アクティブ時にタイマーを一時停止し、復帰時に再開する
   */
  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.timer.pause();
    } else if (this.isWaitingForInput) {
      this.timer.resume();
    }
  };

  /**
   * フレーム毎の更新処理
   * ・タイマーバーの毎フレーム再描画
   * ・タイマー切れ判定（棒立ち処理）
   * ・キー入力検知
   */
  update(): void {
    // タイマーバーは常時更新（入力待ち中のみ）
    if (this.isWaitingForInput) {
      this.drawTimerBar();

      // タイマー切れ → 棒立ち（待機と同じ扱い）
      if (this.timer.isExpired()) {
        this.addLog('…（棒立ち）');
        this.processPlayerAction('wait');
        return;
      }
    }

    if (!this.isWaitingForInput) return;

    // キー入力（JustDown でチャタリング防止）
    // BFS自動移動中にキーを押すと経路をキャンセルして通常移動に切り替える
    const JD = Phaser.Input.Keyboard.JustDown;
    if (JD(this.keyW) || JD(this.keyUp))         { this.clearBfsPath(); this.processPlayerAction('up');    return; }
    if (JD(this.keyS) || JD(this.keyDown))        { this.clearBfsPath(); this.processPlayerAction('down');  return; }
    if (JD(this.keyA) || JD(this.keyLeft))        { this.clearBfsPath(); this.processPlayerAction('left');  return; }
    if (JD(this.keyD) || JD(this.keyRight))       { this.clearBfsPath(); this.processPlayerAction('right'); return; }
    if (JD(this.keySpace) || JD(this.keyEnter))   { this.clearBfsPath(); this.processPlayerAction('wait');  return; }
  }

  /**
   * シーン終了時のクリーンアップ（イベントリスナー解除・タッチ状態リセット）
   */
  shutdown(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointerup', this.onPointerUp, this);
    this.clearBfsPath();
  }

  // --- クリック/タッチ BFS経路移動 ---

  /**
   * ポインタ押下イベント：進行中のBFS経路をキャンセルする
   */
  private onPointerDown = (): void => {
    this.clearBfsPath();
  };

  /**
   * ポインタ離上イベント：クリックしたタイルへのBFS経路を計算して自動移動を開始する
   * 壁・未探索タイル・敵のいるタイルは目標にできない
   * 経路が見つからない場合は何もしない
   *
   * @param pointer - Phaserポインタオブジェクト
   */
  private onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (!this.isWaitingForInput) return;

    // スクリーン座標をワールド座標に変換してタイル位置を算出する
    const worldX = pointer.x + this.cameras.main.scrollX;
    const worldY = pointer.y + this.cameras.main.scrollY;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) return;
    if (tileX === this.player.pos.x && tileY === this.player.pos.y) return;
    if (this.floor.tiles[tileY][tileX] === 'wall') return;
    if (this.floor.visibility[tileY][tileX] === 'unseen') return;
    // 敵タイルをクリックした場合：プレイヤーが隣接していれば攻撃、離れていれば無視
    const clickedEnemy = this.floor.enemies.find((e) => e.pos.x === tileX && e.pos.y === tileY);
    if (clickedEnemy) {
      const dx = tileX - this.player.pos.x;
      const dy = tileY - this.player.pos.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const dir: Direction = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
        this.processPlayerAction(dir);
      }
      return;
    }

    const path = BFSPathfinder.findPath(
      this.player.pos,
      { x: tileX, y: tileY },
      this.floor.tiles,
      this.floor.visibility
    );
    if (!path || path.length === 0) return;

    this.bfsPath = path;
    this.redraw();
    this.startBfsNavigation();
  };

  /**
   * BFS経路の自動移動を開始する
   * 最初のステップを即時実行し、以降 BFS_MOVE_INTERVAL_MS 間隔で繰り返す
   */
  private startBfsNavigation(): void {
    if (this.bfsPath.length === 0) return;

    this.tickBfsMove();

    if (this.bfsPath.length > 0) {
      this.bfsMoveEvent = this.time.addEvent({
        delay: BFS_MOVE_INTERVAL_MS,
        loop: true,
        callback: () => {
          if (!this.isWaitingForInput || this.bfsPath.length === 0) return;
          this.tickBfsMove();
        },
      });
    }
  }

  /**
   * BFS経路の次のステップを1つ実行する
   * 次のタイルに敵がいれば経路をキャンセルして停止する（攻撃しない）
   */
  private tickBfsMove(): void {
    if (this.bfsPath.length === 0) {
      this.clearBfsPath();
      return;
    }

    const next = this.bfsPath[0];

    // 次タイルに敵がいれば自動移動を停止する
    if (this.floor.enemies.some((e) => e.pos.x === next.x && e.pos.y === next.y)) {
      this.clearBfsPath();
      return;
    }

    // 次タイルへの方向を計算して移動する
    const dx = next.x - this.player.pos.x;
    const dy = next.y - this.player.pos.y;
    const dir: Direction = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';

    this.bfsPath.shift();
    this.processPlayerAction(dir);
  }

  /**
   * BFS経路と関連タイマーをクリアし、経路表示を消去する
   */
  private clearBfsPath(): void {
    this.bfsPath = [];
    if (this.bfsMoveEvent) {
      this.bfsMoveEvent.remove(false);
      this.bfsMoveEvent = null;
    }
    if (this.pathGfx) {
      this.pathGfx.clear();
    }
  }

  /**
   * BFS経路を半透明のドットで描画する
   * 通過予定タイルを青色で、目標タイルを明るく強調表示する
   */
  private drawBfsPath(): void {
    this.pathGfx.clear();
    if (this.bfsPath.length === 0) return;

    for (let i = 0; i < this.bfsPath.length; i++) {
      const tile = this.bfsPath[i];
      const px = tile.x * TILE_SIZE;
      const py = tile.y * TILE_SIZE;
      const isGoal = i === this.bfsPath.length - 1;

      const size   = isGoal ? 14 : 8;
      const alpha  = isGoal ? 0.75 : 0.40;
      const offset = (TILE_SIZE - size) / 2;

      this.pathGfx.fillStyle(0x44aaff, alpha);
      this.pathGfx.fillRect(px + offset, py + offset, size, size);
    }
  }

  // --- 演出エフェクト ---

  /**
   * 被弾演出：画面を赤くフラッシュしカメラを揺らす
   */
  private showDamageFlash(): void {
    this.cameras.main.shake(120, 0.008);
    this.cameras.main.flash(180, 200, 0, 0, true);
  }

  /**
   * レベルアップ演出：金色フラッシュ＋中央に "LEVEL UP!" テキストを浮かせる
   */
  private showLevelUpEffect(): void {
    this.cameras.main.flash(300, 255, 200, 0, true);
    const cx = VIEWPORT_WIDTH / 2;
    const cy = VIEWPORT_HEIGHT / 2;
    const txt = this.add.text(cx, cy, 'LEVEL UP!', {
      fontSize: '28px',
      color: '#ffdd00',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(300).setOrigin(0.5);

    this.tweens.add({
      targets: txt,
      y: cy - 48,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
  }

  /**
   * ワールド座標にフローティングテキストを表示して上方向へ消える演出を行う
   * @param worldX - テキスト表示ワールドX座標（中心）
   * @param worldY - テキスト表示ワールドY座標（下端）
   * @param text - 表示する文字列
   * @param color - テキスト色（'#rrggbb' 形式）
   */
  private showFloatingText(worldX: number, worldY: number, text: string, color: string): void {
    const txt = this.add.text(worldX, worldY, text, {
      fontSize: '16px',
      color,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5, 1).setDepth(200);

    this.tweens.add({
      targets: txt,
      y: worldY - 36,
      alpha: 0,
      duration: 600,
      ease: 'Power1',
      onComplete: () => txt.destroy(),
    });
  }

  // --- テスト・デバッグ用アクセサ ---

  /** @returns 現在のDungeonFloor */
  getFloor(): DungeonFloor { return this.floor; }

  /** @returns 現在のPlayerData */
  getPlayer(): PlayerData { return this.player; }

  /** @returns ターンカウント */
  getTurnCount(): number { return this.turnCount; }

  /** @returns TimerSystemインスタンス */
  getTimer(): TimerSystem { return this.timer; }
}
