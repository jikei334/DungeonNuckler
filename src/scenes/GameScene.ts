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
  LOG_LINES, UI_PANEL_HEIGHT, UI_TOP_HEIGHT, TIMER_BAR_HEIGHT, MAX_LEVEL,
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
  /** UIカメラ（フルスクリーン・スクロールなし、マップ非表示） */
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;

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

  // 攻撃アニメーション（プレイヤーが攻撃した方向と開始時刻）
  private attackAnim: { dx: number; dy: number; startTime: number } | null = null;
  private static readonly ATTACK_ANIM_MS = 120;

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
  /** Shift+矢印での向き変更用修飾キー */
  private keyShift!: Phaser.Input.Keyboard.Key;

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

    // カメラ設定：メインカメラはUIパネルを除いたマップ表示エリアのみ
    const mapViewHeight = VIEWPORT_HEIGHT - UI_TOP_HEIGHT - UI_PANEL_HEIGHT;
    this.cameras.main.setViewport(0, UI_TOP_HEIGHT, VIEWPORT_WIDTH, mapViewHeight);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    this.cameras.main.setZoom(1);
    // メインカメラはUI要素を描画しない
    this.cameras.main.ignore([
      this.uiGfx, this.timerGfx,
      this.floorText, this.levelText, this.timerLabel,
      ...this.logTexts,
    ]);

    // UIカメラ：フルスクリーン・スクロールなし、マップ描画オブジェクトを除外
    this.uiCamera = this.cameras.add(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, false, 'ui');
    this.uiCamera.ignore([
      this.tileGfx, this.fogGfx, this.telegraphGfx, this.pathGfx, this.entityGfx,
    ]);

    // キー登録
    this.setupKeys();

    // 右クリックのコンテキストメニューを無効化（向き変更操作に使用）
    this.input.mouse?.disableContextMenu();

    // タッチ/クリック入力を登録
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointerup', this.onPointerUp, this);

    // タブ非アクティブ時にタイマーを一時停止する
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    // 初期視界計算と描画
    FogOfWar.updateVisibility(this.player, this.floor);
    this.redraw();

    // フロア遷移後のフェードイン（両カメラ同時）
    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.uiCamera.fadeIn(350, 0, 0, 0);

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
    this.keyShift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  /**
   * プレイヤーターンを開始する（入力待ち状態に移行し、タイマーをスタート）
   */
  startPlayerTurn(): void {
    this.isWaitingForInput = true;
    this.timer.start();
  }

  /**
   * 向き変更アクションを処理する（移動なし・ターン消費）
   * 向き変更後に視界を更新し、通常ターンと同様に敵AIを進める
   * @param dir - 新しい向き
   */
  private processFacingChange(dir: Direction): void {
    if (!this.isWaitingForInput) return;
    this.isWaitingForInput = false;
    this.timer.stop();
    this.turnCount++;

    this.player.facing = dir;
    FogOfWar.updateVisibility(this.player, this.floor);

    const label: Record<Direction, string> = { up: '上', down: '下', left: '左', right: '右' };
    this.addLog(`${label[dir]}を向いた。`);

    this.redraw();
    this.processEnemyTurns();
    if (!Player.isAlive(this.player)) return;
    this.startPlayerTurn();
  }

  /**
   * プレイヤー位置から指定タイルへの4方向を返す
   * 同じタイルの場合は null を返す
   * @param tileX - 目標タイルX座標
   * @param tileY - 目標タイルY座標
   * @returns 4方向いずれか、またはnull
   */
  private calcDirectionToTile(tileX: number, tileY: number): Direction | null {
    const dx = tileX - this.player.pos.x;
    const dy = tileY - this.player.pos.y;
    if (dx === 0 && dy === 0) return null;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
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
          // 攻撃アニメーション：プレイヤーを敵方向へ一瞬スライドさせる
          const DIRS: Record<Direction, { dx: number; dy: number }> = {
            up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
            left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
          };
          this.attackAnim = { ...DIRS[action], startTime: this.time.now };

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

            // 敵撃破パーティクル演出
            this.showEnemyDefeatedEffect(ex, enemy.pos.y * TILE_SIZE + TILE_SIZE / 2, enemy.isBoss);

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
              this.showBossDefeatedEffect();
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
        // 攻撃アニメーション（視界内の敵のみ）
        if (isVisible) {
          this.showAttackEffect(telegraphTiles, enemy.pos);
        }

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

    // フロア移動演出：両カメラをフェードアウト後にシーン遷移
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.uiCamera.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
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
    });
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
   *
   * 色のルール:
   *   TELEGRAPH 状態（予告中）    → 黄色（turnsUntilExecute=1 は強く点滅）
   *   EXECUTE 状態（攻撃発動ターン）→ 赤の高速点滅（即危険）
   */
  private drawTelegraphs(): void {
    this.telegraphGfx.clear();

    for (const enemy of this.floor.enemies) {
      if (!enemy.telegraph) continue;
      // COOLDOWN・IDLE・CHASE では表示しない
      if (enemy.state !== 'telegraph' && enemy.state !== 'execute') continue;

      const { targetTiles, turnsUntilExecute } = enemy.telegraph;
      const isExecuting = enemy.state === 'execute';

      for (const tile of targetTiles) {
        // 視界内のタイルのみ表示（視界外の予告は見えない）
        const vis = this.floor.visibility[tile.y]?.[tile.x];
        if (vis !== 'visible') continue;

        const px = tile.x * TILE_SIZE;
        const py = tile.y * TILE_SIZE;

        if (isExecuting) {
          // 攻撃発動ターン：赤の高速点滅（緊急！）
          const pulseAlpha = 0.65 + 0.35 * Math.sin(this.time.now / 75);
          this.telegraphGfx.fillStyle(C_TELEGRAPH_DANGER, pulseAlpha);
          this.telegraphGfx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          this.telegraphGfx.lineStyle(2, C_TELEGRAPH_DANGER, 1.0);
          this.telegraphGfx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else if (turnsUntilExecute <= 1) {
          // 直前の予告ターン：黄色・中速点滅（注意！）
          const pulseAlpha = ALPHA_TELEGRAPH_MAX * (0.75 + 0.25 * Math.sin(this.time.now / 180));
          this.telegraphGfx.fillStyle(C_TELEGRAPH_WARN, pulseAlpha);
          this.telegraphGfx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          this.telegraphGfx.lineStyle(1, C_TELEGRAPH_WARN, 0.75);
          this.telegraphGfx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else {
          // 余裕のある予告ターン：薄い黄色（早期警告）
          this.telegraphGfx.fillStyle(C_TELEGRAPH_WARN, ALPHA_TELEGRAPH);
          this.telegraphGfx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
      }
    }
  }

  /**
   * 敵攻撃発動時のアニメーション
   * 攻撃元（敵位置）から各対象タイルへ飛翔体を飛ばし、タイルをフラッシュさせる
   * @param tiles - 攻撃対象タイル一覧
   * @param enemyPos - 攻撃元の敵位置（タイル座標）
   */
  private showAttackEffect(tiles: Vec2[], enemyPos: Vec2): void {
    const enemyWx = enemyPos.x * TILE_SIZE + TILE_SIZE / 2;
    const enemyWy = enemyPos.y * TILE_SIZE + TILE_SIZE / 2;

    for (const tile of tiles) {
      const vis = this.floor.visibility[tile.y]?.[tile.x];
      if (vis !== 'visible') continue;

      const tx = tile.x * TILE_SIZE + TILE_SIZE / 2;
      const ty = tile.y * TILE_SIZE + TILE_SIZE / 2;

      // 対象タイルの赤フラッシュ（外側に広がって消える）
      const flashGfx = this.add.graphics();
      flashGfx.fillStyle(C_TELEGRAPH_DANGER, 0.9);
      flashGfx.fillRect(tile.x * TILE_SIZE + 1, tile.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      flashGfx.setDepth(130);
      this.uiCamera.ignore(flashGfx);

      this.tweens.add({
        targets: flashGfx,
        alpha: 0,
        scaleX: 1.5,
        scaleY: 1.5,
        duration: 380,
        ease: 'Power2',
        onComplete: () => flashGfx.destroy(),
      });

      // 飛翔体（敵の位置からターゲットタイルへ移動して消える）
      const projGfx = this.add.graphics();
      projGfx.fillStyle(0xff6600, 1.0);
      projGfx.fillCircle(0, 0, 5);
      projGfx.setPosition(enemyWx, enemyWy);
      projGfx.setDepth(135);
      this.uiCamera.ignore(projGfx);

      this.tweens.add({
        targets: projGfx,
        x: tx,
        y: ty,
        alpha: 0,
        duration: 220,
        ease: 'Power1',
        onComplete: () => projGfx.destroy(),
      });
    }
  }

  /**
   * プレイヤーと敵を描画する（視界外の敵は非表示）
   * 毎フレーム呼ばれ、ボブアニメーションと攻撃アニメーションを反映する
   */
  private drawEntities(): void {
    this.entityGfx.clear();

    for (const enemy of this.floor.enemies) {
      const vis = this.floor.visibility[enemy.pos.y]?.[enemy.pos.x];
      if (vis !== 'visible') continue;

      const tx = enemy.pos.x * TILE_SIZE + TILE_SIZE / 2;
      const ty = enemy.pos.y * TILE_SIZE + TILE_SIZE / 2;
      const bob = this.getBobOffset(enemy.id);
      const cy = ty + bob;
      const color = enemy.isBoss ? C_ENEMY_BOSS : C_ENEMY;

      this.entityGfx.fillStyle(color, 1);
      if (enemy.isBoss) {
        // ボス：大きなひし形
        this.drawDiamond(tx, cy, 10, 12);
      } else {
        switch (enemy.variant) {
          case 0: this.entityGfx.fillCircle(tx, cy, 7); break;
          case 1: this.drawDiamond(tx, cy, 7, 8); break;
          case 2: this.drawStar(tx, cy, 8, 4); break;
        }
      }

      // 向きインジケーター（IDLE時は半透明、CHASE以降は不透明）
      const facingAlpha = enemy.state === 'idle' ? 0.4 : 0.85;
      this.drawFacingIndicator(
        enemy.pos.x * TILE_SIZE,
        enemy.pos.y * TILE_SIZE + bob,
        enemy.facing,
        0xffffff,
        facingAlpha,
      );

      this.drawEnemyHpBar(enemy.pos.x * TILE_SIZE, enemy.pos.y * TILE_SIZE, enemy.hp, enemy.maxHp);
    }

    // プレイヤー（攻撃アニメーション適用）
    let offsetX = 0;
    let offsetY = 0;
    if (this.attackAnim) {
      const elapsed = this.time.now - this.attackAnim.startTime;
      if (elapsed < GameScene.ATTACK_ANIM_MS) {
        const t = elapsed / GameScene.ATTACK_ANIM_MS;
        const push = Math.sin(t * Math.PI) * 7; // 0→最大7px→0
        offsetX = this.attackAnim.dx * push;
        offsetY = this.attackAnim.dy * push;
      } else {
        this.attackAnim = null;
      }
    }
    const px = this.player.pos.x * TILE_SIZE + TILE_SIZE / 2 + offsetX;
    const py = this.player.pos.y * TILE_SIZE + TILE_SIZE / 2 + this.getBobOffset('player') + offsetY;
    const half = 7;
    this.entityGfx.fillStyle(C_PLAYER, 1);
    this.entityGfx.fillRect(px - half, py - half, half * 2, half * 2);
    this.drawFacingIndicator(
      this.player.pos.x * TILE_SIZE + offsetX,
      this.player.pos.y * TILE_SIZE + offsetY + this.getBobOffset('player'),
      this.player.facing,
    );
  }

  /**
   * 上下にゆらゆら動くボブオフセットを返す（エンティティごとに位相をずらす）
   * @param seed - 位相のシード文字列（エンティティIDなど）
   * @returns Y方向オフセット（ピクセル）
   */
  private getBobOffset(seed: string): number {
    const phase = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 0.7;
    return Math.sin(this.time.now / 180 + phase) * 2.5;
  }

  /**
   * ひし形（ロタート45°の矩形）を描画する
   * @param cx - 中心X
   * @param cy - 中心Y
   * @param hw - 半幅
   * @param hh - 半高さ
   */
  private drawDiamond(cx: number, cy: number, hw: number, hh: number): void {
    const g = this.entityGfx;
    g.fillTriangle(cx, cy - hh, cx + hw, cy, cx - hw, cy);
    g.fillTriangle(cx - hw, cy, cx + hw, cy, cx, cy + hh);
  }

  /**
   * 5角星を描画する
   * @param cx - 中心X
   * @param cy - 中心Y
   * @param outerR - 外接円半径
   * @param innerR - 内接円半径
   */
  private drawStar(cx: number, cy: number, outerR: number, innerR: number): void {
    const g = this.entityGfx;
    const pts = 5;
    g.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI / pts) - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
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
  /**
   * 向きを示す小三角形インジケーターを描画する
   * @param px - タイル左上X座標（ピクセル）
   * @param py - タイル左上Y座標（ピクセル）
   * @param facing - 向き文字列
   * @param color - 三角形の色
   * @param alpha - 不透明度
   */
  private drawFacingIndicator(px: number, py: number, facing: string, color = 0xffffff, alpha = 0.85): void {
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;
    const r = 5;
    let pts: { x: number; y: number }[];

    switch (facing) {
      case 'up':
        pts = [{ x: cx, y: cy - r - 4 }, { x: cx - r, y: cy - 2 }, { x: cx + r, y: cy - 2 }];
        break;
      case 'down':
        pts = [{ x: cx, y: cy + r + 4 }, { x: cx - r, y: cy + 2 }, { x: cx + r, y: cy + 2 }];
        break;
      case 'left':
        pts = [{ x: cx - r - 4, y: cy }, { x: cx - 2, y: cy - r }, { x: cx - 2, y: cy + r }];
        break;
      default: // right
        pts = [{ x: cx + r + 4, y: cy }, { x: cx + 2, y: cy - r }, { x: cx + 2, y: cy + r }];
        break;
    }

    this.entityGfx.fillStyle(color, alpha);
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
    // エンティティを毎フレーム再描画してボブ・攻撃アニメーションを滑らかにする
    this.drawEntities();

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

    // Shift+矢印：向き変更（移動なし・ターン消費）
    if (this.keyShift.isDown) {
      if (JD(this.keyW) || JD(this.keyUp))    { this.clearBfsPath(); this.processFacingChange('up');    return; }
      if (JD(this.keyS) || JD(this.keyDown))  { this.clearBfsPath(); this.processFacingChange('down');  return; }
      if (JD(this.keyA) || JD(this.keyLeft))  { this.clearBfsPath(); this.processFacingChange('left');  return; }
      if (JD(this.keyD) || JD(this.keyRight)) { this.clearBfsPath(); this.processFacingChange('right'); return; }
    }

    // 通常移動
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
   * ポインタ押下イベント：2本指タッチで向き変更、それ以外はBFS経路をキャンセルする
   * @param pointer - Phaserポインタオブジェクト
   */
  private onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    // 右クリックは onPointerUp で処理するためここでは何もしない
    if (pointer.button === 2) return;

    // 2本指タッチ：向き変更（ターン消費）
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    if (p1.isDown && p2.isDown && this.isWaitingForInput) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const cam = this.cameras.main;
      const worldX = midX - cam.x + cam.scrollX;
      const worldY = midY - cam.y + cam.scrollY;
      const dir = this.calcDirectionToTile(
        Math.floor(worldX / TILE_SIZE),
        Math.floor(worldY / TILE_SIZE),
      );
      if (dir) {
        this.processFacingChange(dir);
        return;
      }
    }

    this.clearBfsPath();
  };

  /**
   * ポインタ離上イベント：右クリックで向き変更、左クリックでBFS経路移動を開始する
   * 壁・未探索タイル・敵のいるタイルは左クリックの目標にできない
   * 経路が見つからない場合は何もしない
   *
   * @param pointer - Phaserポインタオブジェクト
   */
  private onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (!this.isWaitingForInput) return;

    // UI領域のクリックは無視（カメラビューポート外）
    const cam = this.cameras.main;
    if (pointer.y < cam.y || pointer.y > cam.y + cam.height) return;

    // スクリーン座標をワールド座標に変換してタイル位置を算出する
    // カメラビューポートのY座標オフセット(UI_TOP_HEIGHT)を補正する
    const worldX = pointer.x - cam.x + cam.scrollX;
    const worldY = pointer.y - cam.y + cam.scrollY;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    // 右クリック：向き変更（ターン消費）
    if (pointer.button === 2) {
      const dir = this.calcDirectionToTile(tileX, tileY);
      if (dir) this.processFacingChange(dir);
      return;
    }

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
   * 敵撃破パーティクル演出：爆発状に小片が飛び散り消える
   * @param worldX - 爆発中心ワールドX座標
   * @param worldY - 爆発中心ワールドY座標
   * @param isBoss - ボス撃破かどうか（規模が大きくなる）
   */
  private showEnemyDefeatedEffect(worldX: number, worldY: number, isBoss: boolean): void {
    const color = isBoss ? 0xff8800 : 0xff4444;
    const count = isBoss ? 12 : 8;
    const distance = isBoss ? 55 : 38;
    const duration = isBoss ? 650 : 450;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const size = isBoss ? 6 : 4;

      const gfx = this.add.graphics();
      gfx.fillStyle(color, 1);
      gfx.fillRect(-size / 2, -size / 2, size, size);
      gfx.setPosition(worldX, worldY);
      gfx.setDepth(150);
      // ワールド座標オブジェクトはUIカメラに表示しない
      this.uiCamera.ignore(gfx);

      const tx = worldX + Math.cos(angle) * distance;
      const ty = worldY + Math.sin(angle) * distance;

      this.tweens.add({
        targets: gfx,
        x: tx,
        y: ty,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration,
        ease: 'Power2',
        onComplete: () => gfx.destroy(),
      });
    }
  }

  /**
   * ボス撃破特別演出：白フラッシュ＋ "BOSS DEFEATED!" テキスト
   */
  private showBossDefeatedEffect(): void {
    this.cameras.main.flash(500, 255, 200, 100, true);
    this.uiCamera.flash(500, 255, 200, 100, true);
    const cx = VIEWPORT_WIDTH / 2;
    const cy = VIEWPORT_HEIGHT / 2 - 20;
    const txt = this.add.text(cx, cy, 'BOSS DEFEATED!', {
      fontSize: '30px',
      color: '#ff8800',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setScrollFactor(0).setDepth(300).setOrigin(0.5);
    // スクリーン座標オブジェクトはメインカメラに表示しない
    this.cameras.main.ignore(txt);

    this.tweens.add({
      targets: txt,
      y: cy - 60,
      alpha: 0,
      duration: 1800,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
  }

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
    this.uiCamera.flash(300, 255, 200, 0, true);
    const cx = VIEWPORT_WIDTH / 2;
    const cy = VIEWPORT_HEIGHT / 2;
    const txt = this.add.text(cx, cy, 'LEVEL UP!', {
      fontSize: '28px',
      color: '#ffdd00',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(300).setOrigin(0.5);
    // スクリーン座標オブジェクトはメインカメラに表示しない
    this.cameras.main.ignore(txt);

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
    // ワールド座標テキストはUIカメラに表示しない
    this.uiCamera.ignore(txt);

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
