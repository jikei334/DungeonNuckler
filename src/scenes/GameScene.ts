import Phaser from 'phaser';
import { DungeonGenerator } from '../dungeon/DungeonGenerator';
import { FogOfWar } from '../dungeon/FogOfWar';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import type { DungeonFloor, PlayerData, Direction } from '../types';
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT,
  VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
  LOG_LINES, UI_PANEL_HEIGHT,
} from '../constants';

// --- 描画色定数 ---
const C_WALL          = 0x333333;
const C_FLOOR         = 0x4a4a4a;
const C_STAIRS        = 0xccaa00;
const C_UNSEEN        = 0x000000;
const C_PLAYER        = 0x33dd66;
const C_ENEMY         = 0xff4444;
const C_ENEMY_BOSS    = 0xff8800;
const C_HP_RED        = 0xdd2222;
const C_HP_GREEN      = 0x22dd44;
const ALPHA_EXPLORED  = 0.62;

/** ゲームメインシーン */
export class GameScene extends Phaser.Scene {
  private floor!: DungeonFloor;
  private player!: PlayerData;
  // グラフィックスレイヤー
  private tileGfx!: Phaser.GameObjects.Graphics;
  private fogGfx!: Phaser.GameObjects.Graphics;
  private entityGfx!: Phaser.GameObjects.Graphics;
  private uiGfx!: Phaser.GameObjects.Graphics;

  // UIテキスト
  private logTexts: Phaser.GameObjects.Text[] = [];
  private logMessages: string[] = [];
  private floorText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;

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
   * シーン初期化：フロア生成・グラフィックス・カメラ・キー設定
   */
  create(): void {
    const data = this.scene.settings.data as { floorNumber?: number; seed?: number } | undefined;
    const floorNumber = data?.floorNumber ?? 1;
    const seed = data?.seed ?? Math.floor(Date.now() % 1000000);

    this.floor = DungeonGenerator.generate(floorNumber, seed);
    this.player = Player.createInitial(this.floor.playerStart);

    // グラフィックスレイヤー（描画順: タイル→フォグ→エンティティ→UI）
    this.tileGfx   = this.add.graphics();
    this.fogGfx    = this.add.graphics();
    this.entityGfx = this.add.graphics();
    this.uiGfx     = this.add.graphics().setScrollFactor(0).setDepth(50);

    // UIテキスト初期化
    this.setupUI();

    // カメラ設定
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    this.cameras.main.setZoom(1);

    // キー登録
    this.setupKeys();

    // ドキュメント非アクティブ時のタイマー一時停止（Phase 3で使用）
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
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
    };

    // フロア番号（左上）
    this.floorText = this.add.text(8, 8, '', { ...textStyle, color: '#aaffff' })
      .setScrollFactor(0).setDepth(100);

    // レベル・EXP（左上、フロアの下）
    this.levelText = this.add.text(8, 28, '', textStyle)
      .setScrollFactor(0).setDepth(100);

    // 戦闘ログ（画面下部）
    const logY = VIEWPORT_HEIGHT - UI_PANEL_HEIGHT + 4;
    for (let i = 0; i < LOG_LINES; i++) {
      this.logTexts.push(
        this.add.text(8, logY + i * 16, '', {
          ...textStyle,
          fontSize: '12px',
          color: i === 0 ? '#ffffff' : '#aaaaaa',
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
   * プレイヤーターンを開始する（入力待ち状態に移行）
   */
  startPlayerTurn(): void {
    this.isWaitingForInput = true;
  }

  /**
   * プレイヤーのアクションを処理し、敵ターンへ移行する
   * @param action - 'up'|'down'|'left'|'right'|'wait'
   */
  private processPlayerAction(action: Direction | 'wait'): void {
    if (!this.isWaitingForInput) return;
    this.isWaitingForInput = false;
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
          this.addLog(`${enemy.isBoss ? '【ボス】' : '敵'}に体当たり！（戦闘はPhase6実装）`);
        }
      } else if (moved) {
        // 移動後に視界を更新
        FogOfWar.updateVisibility(this.player, this.floor);

        // 階段チェック（Phase 7で実装）
        const { stairsPos } = this.floor;
        if (this.player.pos.x === stairsPos.x && this.player.pos.y === stairsPos.y) {
          this.addLog('階段を見つけた！（Phase7で実装）');
        }
      }
    }

    // 再描画
    this.redraw();

    // 敵ターン（Phase 4で実装）
    this.processEnemyTurns();

    // 次のプレイヤーターンへ
    this.startPlayerTurn();
  }

  /**
   * 敵のターン処理（Phase 4で本実装、現在はスタブ）
   */
  private processEnemyTurns(): void {
    for (const enemy of this.floor.enemies) {
      Enemy.updateAI(enemy, this.player, this.floor.tiles, this.floor.enemies);
    }
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
   * UIテキストを更新する
   */
  private updateUIText(): void {
    this.floorText.setText(`Floor ${this.floor.floorNumber} | Turn ${this.turnCount}`);
    this.levelText.setText(`Lv.${this.player.level} | HP: ${this.player.hp}/${this.player.maxHp} | ATK: ${this.player.atk}`);
  }

  /**
   * 戦闘ログテキストを更新する
   */
  private updateLogText(): void {
    for (let i = 0; i < LOG_LINES; i++) {
      const msg = this.logMessages[i] ?? '';
      this.logTexts[i].setText(msg);
      this.logTexts[i].setAlpha(i === 0 ? 1.0 : Math.max(0.3, 1.0 - i * 0.2));
    }
  }

  /**
   * 全グラフィックスを再描画する
   */
  private redraw(): void {
    this.drawTiles();
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

        // タイル本体
        const color = tile === 'wall' ? C_WALL : tile === 'stairs' ? C_STAIRS : C_FLOOR;
        this.tileGfx.fillStyle(color, 1);
        this.tileGfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // グリッド線（床・階段のみ）
        if (tile !== 'wall') {
          this.tileGfx.lineStyle(1, 0x3a3a3a, 0.4);
          this.tileGfx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }

        // 探索済み・現在非視界はオーバーレイで暗くする
        if (vis === 'explored') {
          this.fogGfx.fillStyle(C_UNSEEN, ALPHA_EXPLORED);
          this.fogGfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  /**
   * プレイヤーと敵を描画する
   * 視界外の敵は描画しない（explored タイルの敵は非表示）
   */
  private drawEntities(): void {
    this.entityGfx.clear();

    // 敵を描画（視界コーン内のみ）
    for (const enemy of this.floor.enemies) {
      const vis = this.floor.visibility[enemy.pos.y]?.[enemy.pos.x];
      if (vis !== 'visible') continue;

      const px = enemy.pos.x * TILE_SIZE;
      const py = enemy.pos.y * TILE_SIZE;
      const color = enemy.isBoss ? C_ENEMY_BOSS : C_ENEMY;
      const pad = enemy.isBoss ? 2 : 5;
      const size = TILE_SIZE - pad * 2;

      this.entityGfx.fillStyle(color, 1);
      this.entityGfx.fillRect(px + pad, py + pad, size, size);

      // 敵HPバー
      this.drawEnemyHpBar(px, py, enemy.hp, enemy.maxHp);
    }

    // プレイヤーを描画
    const px = this.player.pos.x * TILE_SIZE;
    const py = this.player.pos.y * TILE_SIZE;
    const pad = 4;
    this.entityGfx.fillStyle(C_PLAYER, 1);
    this.entityGfx.fillRect(px + pad, py + pad, TILE_SIZE - pad * 2, TILE_SIZE - pad * 2);

    // 向きインジケーター（小さな三角形）
    this.drawFacingIndicator(px, py);
  }

  /**
   * 敵のHPバーを描画する
   * @param px - 敵の描画X座標（ピクセル）
   * @param py - 敵の描画Y座標（ピクセル）
   * @param hp - 現在HP
   * @param maxHp - 最大HP
   */
  private drawEnemyHpBar(px: number, py: number, hp: number, maxHp: number): void {
    const barW = TILE_SIZE - 4;
    const barH = 4;
    const barX = px + 2;
    const barY = py - 6;
    const ratio = hp / maxHp;

    // 背景（赤）
    this.entityGfx.fillStyle(C_HP_RED, 1);
    this.entityGfx.fillRect(barX, barY, barW, barH);

    // 前景（緑）
    this.entityGfx.fillStyle(C_HP_GREEN, 1);
    this.entityGfx.fillRect(barX, barY, Math.round(barW * ratio), barH);
  }

  /**
   * プレイヤーの向きインジケーターを描画する（小さな三角形）
   * @param px - プレイヤーの描画X座標
   * @param py - プレイヤーの描画Y座標
   */
  private drawFacingIndicator(px: number, py: number): void {
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;
    const r = 5; // 三角形のサイズ
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

    this.entityGfx.fillStyle(0xffffff, 0.9);
    this.entityGfx.fillTriangle(
      pts[0].x, pts[0].y,
      pts[1].x, pts[1].y,
      pts[2].x, pts[2].y
    );
  }

  /**
   * UIオーバーレイ（ログ背景・HPハート等）を描画する
   */
  private drawUIOverlay(): void {
    this.uiGfx.clear();

    // ログパネル背景
    this.uiGfx.fillStyle(0x000000, 0.7);
    this.uiGfx.fillRect(0, VIEWPORT_HEIGHT - UI_PANEL_HEIGHT, VIEWPORT_WIDTH, UI_PANEL_HEIGHT);

    // 上部UIバー背景
    this.uiGfx.fillStyle(0x000000, 0.6);
    this.uiGfx.fillRect(0, 0, VIEWPORT_WIDTH, 52);

    // プレイヤーHPハート（右上）
    this.drawHpHearts();
  }

  /**
   * プレイヤーHPをハートアイコン（矩形）で描画する
   */
  private drawHpHearts(): void {
    const heartSize = 18;
    const startX = VIEWPORT_WIDTH - (this.player.maxHp * (heartSize + 4)) - 8;
    const startY = 10;

    for (let i = 0; i < this.player.maxHp; i++) {
      const hx = startX + i * (heartSize + 4);
      const filled = i < this.player.hp;
      this.uiGfx.fillStyle(filled ? 0xdd2222 : 0x444444, 1);
      this.uiGfx.fillRect(hx, startY, heartSize, heartSize);
      if (filled) {
        // ハイライト
        this.uiGfx.fillStyle(0xff6666, 0.5);
        this.uiGfx.fillRect(hx + 2, startY + 2, heartSize - 8, 4);
      }
    }
  }

  /**
   * カメラをプレイヤー中心にスムーズに移動する
   */
  private centerCameraOnPlayer(): void {
    const targetX = this.player.pos.x * TILE_SIZE + TILE_SIZE / 2;
    const targetY = this.player.pos.y * TILE_SIZE + TILE_SIZE / 2;
    this.cameras.main.centerOn(targetX, targetY);
  }

  /**
   * タブ非アクティブ時の処理（Phase 3でタイマー一時停止に使用）
   */
  private onVisibilityChange = (): void => {
    // Phase 3のタイマー実装で活用する
  };

  /**
   * フレーム毎の更新処理（キー入力の検知）
   */
  update(): void {
    if (!this.isWaitingForInput) return;

    // 入力をジャストワンショットで処理（JustDown）
    const JD = Phaser.Input.Keyboard.JustDown;

    if (JD(this.keyW) || JD(this.keyUp))    { this.processPlayerAction('up');    return; }
    if (JD(this.keyS) || JD(this.keyDown))  { this.processPlayerAction('down');  return; }
    if (JD(this.keyA) || JD(this.keyLeft))  { this.processPlayerAction('left');  return; }
    if (JD(this.keyD) || JD(this.keyRight)) { this.processPlayerAction('right'); return; }
    if (JD(this.keySpace) || JD(this.keyEnter)) {
      this.processPlayerAction('wait');
      return;
    }
  }

  /**
   * シーン終了時のクリーンアップ
   */
  shutdown(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  // --- デバッグ・テスト用アクセサ ---

  /** @returns 現在のDungeonFloor（テスト用） */
  getFloor(): DungeonFloor { return this.floor; }

  /** @returns 現在のPlayerData（テスト用） */
  getPlayer(): PlayerData { return this.player; }

  /** @returns ターンカウント（テスト用） */
  getTurnCount(): number { return this.turnCount; }
}
