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
  backgroundColor: '#000000',
  scene: [TitleScene, GameScene, GameOverScene],
  parent: document.body,
  // スマホ含む全画面サイズに対応するスケール設定
  // FIT: アスペクト比を維持しながら親要素に収まるよう CSS スケーリング
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
  },
};

new Phaser.Game(config);
