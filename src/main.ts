import Phaser from 'phaser';

/**
 * Phaser.Gameのエントリーポイント
 * シーンは後続フェーズで追加する
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#000000',
  scene: [],
  parent: document.body,
};

new Phaser.Game(config);
