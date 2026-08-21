import Phaser from 'phaser';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from '../constants';

/** ゲームオーバー画面に渡すデータ */
export interface GameOverData {
  floorNumber: number;
  level: number;
  turnCount: number;
}

/** ゲームオーバー・リザルト画面シーン */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  /**
   * ゲームオーバー画面を構築する：結果表示・リトライボタン
   */
  create(): void {
    const data = this.scene.settings.data as Partial<GameOverData>;
    const floorNumber = data.floorNumber ?? 1;
    const level = data.level ?? 1;
    const turnCount = data.turnCount ?? 0;
    const cx = VIEWPORT_WIDTH / 2;
    const cy = VIEWPORT_HEIGHT / 2;

    // 暗い背景
    const bg = this.add.graphics();
    bg.fillStyle(0x050508, 1);
    bg.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    // 赤いアクセントライン
    bg.lineStyle(2, 0x880000, 0.8);
    bg.lineBetween(0, cy - 130, VIEWPORT_WIDTH, cy - 130);
    bg.lineBetween(0, cy + 120, VIEWPORT_WIDTH, cy + 120);

    // GAME OVER テキスト
    this.add.text(cx, cy - 90, 'GAME OVER', {
      fontSize: '48px',
      color: '#cc2222',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // リザルト表示
    const resultStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '20px',
      color: '#cccccc',
      fontFamily: 'monospace',
    };

    this.add.text(cx, cy - 20, `到達フロア: ${floorNumber} 階`, resultStyle).setOrigin(0.5);
    this.add.text(cx, cy + 12, `レベル: ${level}`, resultStyle).setOrigin(0.5);
    this.add.text(cx, cy + 44, `総ターン数: ${turnCount}`, {
      ...resultStyle,
      fontSize: '16px',
      color: '#888888',
    }).setOrigin(0.5);

    // リトライボタン
    const btnBg = this.add.graphics();
    const btnX = cx - 100;
    const btnY = cy + 88;
    const btnW = 200;
    const btnH = 44;

    const drawBtn = (hover: boolean): void => {
      btnBg.clear();
      btnBg.fillStyle(hover ? 0x664444 : 0x442222, 1);
      btnBg.fillRect(btnX, btnY, btnW, btnH);
      btnBg.lineStyle(2, hover ? 0xdd8888 : 0x884444, 1);
      btnBg.strokeRect(btnX, btnY, btnW, btnH);
    };

    drawBtn(false);

    const btnText = this.add.text(cx, btnY + btnH / 2, 'もう一度', {
      fontSize: '22px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const zone = this.add.zone(btnX, btnY, btnW, btnH).setOrigin(0);
    zone.setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => { drawBtn(true); btnText.setColor('#ffaaaa'); });
    zone.on('pointerout',  () => { drawBtn(false); btnText.setColor('#ffffff'); });
    zone.on('pointerdown', () => this.scene.start('TitleScene'));

    // Enter/スペースでもリトライ
    if (this.input.keyboard) {
      this.input.keyboard.once('keydown-ENTER', () => this.scene.start('TitleScene'));
      this.input.keyboard.once('keydown-SPACE', () => this.scene.start('TitleScene'));
    }
  }
}
