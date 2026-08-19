import Phaser from 'phaser';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './constants';

/**
 * Phaser.Game のエントリーポイント
 * シーン: TitleScene → GameScene → GameOverScene → TitleScene
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: VIEWPORT_WIDTH,
  height: VIEWPORT_HEIGHT,
  backgroundColor: '#000000',
  scene: [TitleScene, GameScene, GameOverScene],
  parent: document.body,
};

new Phaser.Game(config);
