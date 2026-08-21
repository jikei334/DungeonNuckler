import Phaser from 'phaser';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from '../constants';

/** タイトル画面シーン */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  /**
   * タイトル画面を構築する：ゲームタイトル・サブタイトル・スタートボタン
   */
  create(): void {
    const cx = VIEWPORT_WIDTH / 2;
    const cy = VIEWPORT_HEIGHT / 2;

    // 背景グラデーション風（矩形を重ねて表現）
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a1a, 1);
    bg.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    // 装飾ライン
    bg.lineStyle(1, 0x334455, 0.5);
    for (let y = 0; y < VIEWPORT_HEIGHT; y += 32) {
      bg.lineBetween(0, y, VIEWPORT_WIDTH, y);
    }
    for (let x = 0; x < VIEWPORT_WIDTH; x += 32) {
      bg.lineBetween(x, 0, x, VIEWPORT_HEIGHT);
    }

    // タイトルロゴ背景
    bg.fillStyle(0x001133, 0.8);
    bg.fillRect(cx - 240, cy - 100, 480, 80);
    bg.lineStyle(2, 0x4488cc, 1);
    bg.strokeRect(cx - 240, cy - 100, 480, 80);

    // ゲームタイトル
    this.add.text(cx, cy - 60, 'ダンジョンナックラー', {
      fontSize: '36px',
      color: '#eeddaa',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // サブタイトル
    this.add.text(cx, cy + 20, '― Dungeon Knuckler ―', {
      fontSize: '16px',
      color: '#8899bb',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // スタートボタン
    const btnBg = this.add.graphics();
    const btnX = cx - 100;
    const btnY = cy + 80;
    const btnW = 200;
    const btnH = 44;

    const drawBtn = (hover: boolean): void => {
      btnBg.clear();
      btnBg.fillStyle(hover ? 0x446688 : 0x224466, 1);
      btnBg.fillRect(btnX, btnY, btnW, btnH);
      btnBg.lineStyle(2, hover ? 0x88aadd : 0x446688, 1);
      btnBg.strokeRect(btnX, btnY, btnW, btnH);
    };

    drawBtn(false);

    const btnText = this.add.text(cx, btnY + btnH / 2, 'スタート', {
      fontSize: '22px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // クリック領域
    const zone = this.add.zone(btnX, btnY, btnW, btnH).setOrigin(0);
    zone.setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => { drawBtn(true); btnText.setColor('#aaddff'); });
    zone.on('pointerout',  () => { drawBtn(false); btnText.setColor('#ffffff'); });
    zone.on('pointerdown', () => {
      this.scene.start('GameScene', {
        floorNumber: 1,
        seed: Math.floor(Date.now() % 1000000),
      });
    });

    // Enter/スペースでもスタート
    if (this.input.keyboard) {
      this.input.keyboard.once('keydown-ENTER', () => this.startGame());
      this.input.keyboard.once('keydown-SPACE', () => this.startGame());
    }

    // 操作ガイド
    this.add.text(cx, cy + 162, 'WASD / 矢印キー: 移動　スペース/Enter: 待機', {
      fontSize: '13px',
      color: '#556677',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 178, 'クリック/タップ: 見えているマスへ自動移動', {
      fontSize: '13px',
      color: '#556677',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 198, '敵の攻撃予告を読んで、危険なマスから逃げろ！', {
      fontSize: '13px',
      color: '#556677',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // バージョン
    this.add.text(VIEWPORT_WIDTH - 8, VIEWPORT_HEIGHT - 8, 'v0.2', {
      fontSize: '11px',
      color: '#334455',
    }).setOrigin(1, 1);
  }

  /**
   * ゲームシーンを開始する
   */
  private startGame(): void {
    this.scene.start('GameScene', {
      floorNumber: 1,
      seed: Math.floor(Date.now() % 1000000),
    });
  }
}
