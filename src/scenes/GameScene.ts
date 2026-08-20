import Phaser from 'phaser';
import { DungeonGenerator } from '../dungeon/DungeonGenerator';
import { FogOfWar } from '../dungeon/FogOfWar';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { TimerSystem } from '../systems/TimerSystem';
import type { DungeonFloor, PlayerData, Direction } from '../types';
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT,
  VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
  LOG_LINES, UI_PANEL_HEIGHT, TIMER_BAR_HEIGHT,
} from '../constants';

// --- 描画色定数 ---
const C_WALL              = 0x333333;
const C_FLOOR             = 0x4a4a4a;
const C_STAIRS            = 0xccaa00;
const C_UNSEEN            = 0x000000;
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
const ALPHA_EXPLORED      = 0.62;
const ALPHA_TELEGRAPH     = 0.40;      // テレグラフ通常アルファ
const ALPHA_TELEGRAPH_MAX = 0.72;      // テレグラフ最終ターン最大アルファ

/** タイマーバーのY座標（上部UIの下） */
const TIMER_BAR_Y = 48;
/** タイマーバーのX余白 */
const TIMER_BAR_MARGIN = 8;
/** タイマーバーの幅 */
const TIMER_BAR_WIDTH = VIEWPORT_WIDTH - TIMER_BAR_MARGIN * 2;

/** ゲームメインシーン */
export class GameScene extends Phaser.Scene {
  private floor!: DungeonFloor;
  private player!: PlayerData;
  private timer!: TimerSystem;

  // グラフィックスレイヤー（描画順: タイル→フォグ→テレグラフ→エンティティ→UI→タイマー）
  private tileGfx!: Phaser.GameObjects.Graphics;
  private fogGfx!: Phaser.GameObjects.Graphics;
  /** テレグラフ予告表示レイヤー（フォグより上、エンティティより下） */
  private telegraphGfx!: Phaser.GameObjects.Graphics;
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
    const data = this.scene.settings.data as { floorNumber?: number; seed?: number } | undefined;
    const floorNumber = data?.floorNumber ?? 1;
    const seed = data?.seed ?? Math.floor(Date.now() % 1000000);

    this.floor = DungeonGenerator.generate(floorNumber, seed);
    this.player = Player.createInitial(this.floor.playerStart);
    this.timer = new TimerSystem(floorNumber);

    // グラフィックスレイヤー（描画順: タイル→フォグ→テレグラフ→エンティティ→UI→タイマー）
    this.tileGfx      = this.add.graphics();
    this.fogGfx       = this.add.graphics();
    this.telegraphGfx = this.add.graphics();
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
    this.floorText = this.add.text(TIMER_BAR_MARGIN, 8, '', { ...baseStyle, color: '#aaffff' })
      .setScrollFactor(0).setDepth(100);

    // レベル・ATK（フロアの右隣）
    this.levelText = this.add.text(TIMER_BAR_MARGIN, 28, '', baseStyle)
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
        // バンプアタック（Phase 6で戦闘解決を実装）
        const enemy = this.floor.enemies.find((e) => e.id === bumpedEnemyId);
        if (enemy) {
          this.addLog(`${enemy.isBoss ? '【ボス】' : '敵'}に体当たり！（Phase 6で実装）`);
        }
      } else if (moved) {
        FogOfWar.updateVisibility(this.player, this.floor);

        // 階段チェック（Phase 7で実装）
        const { stairsPos } = this.floor;
        if (this.player.pos.x === stairsPos.x && this.player.pos.y === stairsPos.y) {
          this.addLog('階段を発見！（Phase 7で実装）');
        }
      }
    }

    // プレイヤー行動後の初回描画（敵ターン後にも redraw するため二重になるが意図的）
    this.redraw();
    this.processEnemyTurns();
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
   * ゲームオーバー処理：GameOverSceneへ遷移する
   */
  private handleGameOver(): void {
    this.timer.stop();
    this.isWaitingForInput = false;
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
   * 上部UIテキスト（フロア・ターン・レベル・ATK）を更新する
   */
  private updateUIText(): void {
    this.floorText.setText(`Floor ${this.floor.floorNumber} | Turn ${this.turnCount}`);
    this.levelText.setText(`Lv.${this.player.level}  ATK: ${this.player.atk}`);
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
    this.drawEntities();
    this.drawUIOverlay();
    this.updateUIText();
    this.centerCameraOnPlayer();
  }

  /**
   * タイルマップを描画する（視界状態に応じた色分け）
   */
  private drawTiles(): void {
    this.tileGfx.clear();
    this.fogGfx.clear();

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

        const color = tile === 'wall' ? C_WALL : tile === 'stairs' ? C_STAIRS : C_FLOOR;
        this.tileGfx.fillStyle(color, 1);
        this.tileGfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        if (tile !== 'wall') {
          this.tileGfx.lineStyle(1, 0x3a3a3a, 0.4);
          this.tileGfx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }

        if (vis === 'explored') {
          this.fogGfx.fillStyle(C_UNSEEN, ALPHA_EXPLORED);
          this.fogGfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
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
   * UIオーバーレイ（上部パネル・ログパネル・HPハート）を描画する
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
    const JD = Phaser.Input.Keyboard.JustDown;
    if (JD(this.keyW) || JD(this.keyUp))         { this.processPlayerAction('up');    return; }
    if (JD(this.keyS) || JD(this.keyDown))        { this.processPlayerAction('down');  return; }
    if (JD(this.keyA) || JD(this.keyLeft))        { this.processPlayerAction('left');  return; }
    if (JD(this.keyD) || JD(this.keyRight))       { this.processPlayerAction('right'); return; }
    if (JD(this.keySpace) || JD(this.keyEnter))   { this.processPlayerAction('wait');  return; }
  }

  /**
   * シーン終了時のクリーンアップ（イベントリスナー解除）
   */
  shutdown(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
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
