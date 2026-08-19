import Phaser from 'phaser';
import { DungeonGenerator } from '../dungeon/DungeonGenerator';
import type { DungeonFloor } from '../types';
import {
  TILE_SIZE,
  MAP_WIDTH, MAP_HEIGHT,
  VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
} from '../constants';

/** タイル色定数 */
const COLOR_WALL = 0x333333;
const COLOR_FLOOR = 0x555555;
const COLOR_STAIRS = 0xccaa00;
const COLOR_UNSEEN = 0x000000;
const COLOR_EXPLORED_OVERLAY = 0x000000;
const ALPHA_EXPLORED = 0.65;

/** ゲームメインシーン（Phase 1: タイルマップ描画のみ） */
export class GameScene extends Phaser.Scene {
  private floor!: DungeonFloor;
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private fogGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameScene' });
  }

  /**
   * シーン初期化：フロア生成・グラフィックス設定・カメラ設定
   */
  create(): void {
    const floorNumber = (this.scene.settings.data as { floorNumber?: number })?.floorNumber ?? 1;
    const seed = 12345;

    this.floor = DungeonGenerator.generate(floorNumber, seed);

    // グラフィックスオブジェクト初期化
    this.tileGraphics = this.add.graphics();
    this.fogGraphics = this.add.graphics();

    // タイルマップ全体を描画
    this.drawTiles();

    // カメラ範囲をマップ全体に設定
    this.cameras.main.setBounds(
      0, 0,
      MAP_WIDTH * TILE_SIZE,
      MAP_HEIGHT * TILE_SIZE
    );

    // カメラをプレイヤー開始位置に移動
    const startX = this.floor.playerStart.x * TILE_SIZE + TILE_SIZE / 2;
    const startY = this.floor.playerStart.y * TILE_SIZE + TILE_SIZE / 2;
    this.cameras.main.centerOn(startX, startY);

    // デバッグ情報表示（Phase 1確認用）
    this.add.text(10, VIEWPORT_HEIGHT - 30, `Floor ${floorNumber} | MAP: ${MAP_WIDTH}x${MAP_HEIGHT}`, {
      fontSize: '14px',
      color: '#ffffff',
    }).setScrollFactor(0).setDepth(100);
  }

  /**
   * タイルマップを描画する（視界状態に応じた色分けあり）
   * unseen: 完全黒塗り、explored: グレーアウト、visible: 通常色
   */
  private drawTiles(): void {
    this.tileGraphics.clear();
    this.fogGraphics.clear();

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = this.floor.tiles[y][x];
        const vis = this.floor.visibility[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (vis === 'unseen') {
          // 未探索タイルは黒一色
          this.tileGraphics.fillStyle(COLOR_UNSEEN, 1);
          this.tileGraphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          continue;
        }

        // タイル種類に応じた色で描画
        const color =
          tile === 'wall' ? COLOR_WALL :
          tile === 'stairs' ? COLOR_STAIRS :
          COLOR_FLOOR;

        this.tileGraphics.fillStyle(color, 1);
        this.tileGraphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // タイル境界線（bed/stairsのみ）
        if (tile !== 'wall') {
          this.tileGraphics.lineStyle(1, 0x444444, 0.3);
          this.tileGraphics.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }

        // 探索済みだが現在見えていないタイルは半透明オーバーレイ
        if (vis === 'explored') {
          this.fogGraphics.fillStyle(COLOR_EXPLORED_OVERLAY, ALPHA_EXPLORED);
          this.fogGraphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  /**
   * タイルマップを再描画する（視界更新後に呼ぶ）
   */
  redrawTiles(): void {
    this.drawTiles();
  }

  /**
   * デバッグ用：マップ全体をvisibleにして全タイルを表示する
   */
  revealAll(): void {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        this.floor.visibility[y][x] = 'visible';
      }
    }
    this.drawTiles();
  }

  /**
   * フロアデータを返す（テスト・デバッグ用）
   * @returns 現在のDungeonFloor
   */
  getFloor(): DungeonFloor {
    return this.floor;
  }

  /**
   * マップサイズ（ピクセル）を返す
   * @returns { width, height }
   */
  getMapSize(): { width: number; height: number } {
    return {
      width: MAP_WIDTH * TILE_SIZE,
      height: MAP_HEIGHT * TILE_SIZE,
    };
  }

  update(): void {
    // Phase 1では更新処理なし
  }
}

/** Phase 1確認用：フロアを全表示するデバッグシーン */
export class DebugFloorScene extends Phaser.Scene {
  constructor() {
    super({ key: 'DebugFloorScene' });
  }

  create(): void {
    const scene = this.scene.get('GameScene') as GameScene | null;
    scene?.revealAll();

    this.add.text(10, 10, 'DEBUG: 全タイル表示中\nWASD/矢印キー: カメラ移動', {
      fontSize: '13px',
      color: '#ffff00',
    }).setScrollFactor(0).setDepth(200);
  }
}

/**
 * ビューポートに収まる確認シーン（Phase 1の最終確認用）
 * 全タイルをvisibleにしてマップを表示する
 */
export class Phase1PreviewScene extends Phaser.Scene {
  private floor!: DungeonFloor;
  private graphics!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super({ key: 'Phase1PreviewScene' });
  }

  create(): void {
    this.floor = DungeonGenerator.generate(1, 12345);

    // 全タイルをvisibleにする（Phase 1確認用）
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        this.floor.visibility[y][x] = 'visible';
      }
    }

    this.graphics = this.add.graphics();
    this.drawMap();

    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    const sx = this.floor.playerStart.x * TILE_SIZE;
    const sy = this.floor.playerStart.y * TILE_SIZE;
    this.cameras.main.centerOn(sx, sy);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    // 操作説明
    this.add.text(8, 8, `Floor 1 | ↑↓←→: カメラ移動\n部屋数: ${this.floor.rooms.length} | 敵数: ${this.floor.enemies.length}`, {
      fontSize: '13px',
      color: '#fff',
      backgroundColor: '#000000aa',
      padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100);
  }

  /**
   * マップ全体をGraphicsで描画する
   */
  private drawMap(): void {
    this.graphics.clear();
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = this.floor.tiles[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        const color =
          tile === 'wall' ? COLOR_WALL :
          tile === 'stairs' ? COLOR_STAIRS :
          COLOR_FLOOR;

        this.graphics.fillStyle(color, 1);
        this.graphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        if (tile !== 'wall') {
          this.graphics.lineStyle(1, 0x444444, 0.25);
          this.graphics.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // プレイヤー開始位置（緑）
    const ps = this.floor.playerStart;
    this.graphics.fillStyle(0x00ff44, 1);
    this.graphics.fillRect(
      ps.x * TILE_SIZE + 4, ps.y * TILE_SIZE + 4,
      TILE_SIZE - 8, TILE_SIZE - 8
    );

    // 敵位置（赤）
    for (const e of this.floor.enemies) {
      const color = e.isBoss ? 0xff8800 : 0xff4444;
      const padding = e.isBoss ? 2 : 5;
      this.graphics.fillStyle(color, 1);
      this.graphics.fillRect(
        e.pos.x * TILE_SIZE + padding, e.pos.y * TILE_SIZE + padding,
        TILE_SIZE - padding * 2, TILE_SIZE - padding * 2
      );
    }
  }

  /**
   * カメラ移動の更新処理
   */
  update(): void {
    const speed = 4;
    if (!this.cursors) return;
    if (this.cursors.left.isDown) this.cameras.main.scrollX -= speed;
    if (this.cursors.right.isDown) this.cameras.main.scrollX += speed;
    if (this.cursors.up.isDown) this.cameras.main.scrollY -= speed;
    if (this.cursors.down.isDown) this.cameras.main.scrollY += speed;
  }

  /** @returns ビューポートサイズ */
  getViewportSize(): { width: number; height: number } {
    return { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT };
  }
}
