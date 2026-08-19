import Phaser from 'phaser';
import { Phase1PreviewScene } from './scenes/GameScene';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './constants';

/**
 * Phaser.Game のエントリーポイント
 * Phase 1: フロア生成確認用シーンを起動する
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: VIEWPORT_WIDTH,
  height: VIEWPORT_HEIGHT,
  backgroundColor: '#000000',
  scene: [Phase1PreviewScene],
  parent: document.body,
};

new Phaser.Game(config);
