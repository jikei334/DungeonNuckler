import { describe, it, expect } from 'vitest';
import { FogOfWar } from '../dungeon/FogOfWar';
import { DungeonGenerator } from '../dungeon/DungeonGenerator';
import { FOV_SURROUNDINGS_RADIUS } from '../constants';
import type { TileType } from '../types';

/**
 * FogOfWarクラスのテスト
 * 視界コーン判定・壁遮蔽・視界更新を検証する
 */
describe('FogOfWar', () => {
  describe('isInCone()', () => {
    const pos = { x: 5, y: 5 };

    it('自分自身の位置は常に視界内', () => {
      expect(FogOfWar.isInCone(pos, 'down', pos, 6, 90)).toBe(true);
    });

    it('正面方向のタイルは視界内', () => {
      // 下向き → y が増える方向が正面
      expect(FogOfWar.isInCone(pos, 'down', { x: 5, y: 8 }, 6, 90)).toBe(true);
    });

    it('真後ろのタイルは視界外', () => {
      // 下向き → 真後ろは上方向
      expect(FogOfWar.isInCone(pos, 'down', { x: 5, y: 2 }, 6, 90)).toBe(false);
    });

    it('視界距離より遠いタイルは視界外', () => {
      expect(FogOfWar.isInCone(pos, 'down', { x: 5, y: 20 }, 6, 90)).toBe(false);
    });

    it('90度の半開き角内のタイルは視界内', () => {
      // 下向き・右斜め45度方向
      expect(FogOfWar.isInCone(pos, 'down', { x: 6, y: 6 }, 6, 90)).toBe(true);
    });
  });

  describe('hasLineOfSight()', () => {
    // 壁なし10x10フロア
    const openTiles = (): TileType[][] =>
      Array.from({ length: 10 }, () => Array<TileType>(10).fill('floor'));

    it('壁がなければ視線が通る', () => {
      const tiles = openTiles();
      expect(FogOfWar.hasLineOfSight({ x: 0, y: 0 }, { x: 5, y: 5 }, tiles)).toBe(true);
    });

    it('同じ位置は視線が通る', () => {
      const tiles = openTiles();
      expect(FogOfWar.hasLineOfSight({ x: 3, y: 3 }, { x: 3, y: 3 }, tiles)).toBe(true);
    });

    it('壁があれば視線が通らない', () => {
      const tiles = openTiles();
      // 中間に壁を置く
      tiles[3][3] = 'wall';
      expect(FogOfWar.hasLineOfSight({ x: 0, y: 0 }, { x: 5, y: 5 }, tiles)).toBe(false);
    });

    it('壁が終点の場合は視線が通る（終点は除外）', () => {
      const tiles = openTiles();
      tiles[5][5] = 'wall';
      // 終点自体の壁は遮蔽として扱わない（終点タイル自体は見える）
      expect(FogOfWar.hasLineOfSight({ x: 0, y: 0 }, { x: 5, y: 5 }, tiles)).toBe(true);
    });
  });

  describe('updateVisibility()', () => {
    it('プレイヤー自身のタイルは必ず visible になる', () => {
      const floor = DungeonGenerator.generate(1, 42);
      const player = { pos: floor.playerStart, facing: 'down' as const, hp: 3, maxHp: 3, atk: 2, level: 1, exp: 0 };

      FogOfWar.updateVisibility(player, floor);

      expect(floor.visibility[player.pos.y][player.pos.x]).toBe('visible');
    });

    it('プレイヤー周囲1マスは向き・遮蔽に関わらず visible になる', () => {
      const floor = DungeonGenerator.generate(1, 42);
      // 上向きにしてコーン外（後方）のタイルでも visible を確認
      const player = { pos: floor.playerStart, facing: 'up' as const, hp: 3, maxHp: 3, atk: 2, level: 1, exp: 0 };

      FogOfWar.updateVisibility(player, floor);

      const { x, y } = player.pos;
      for (let dy = -FOV_SURROUNDINGS_RADIUS; dy <= FOV_SURROUNDINGS_RADIUS; dy++) {
        for (let dx = -FOV_SURROUNDINGS_RADIUS; dx <= FOV_SURROUNDINGS_RADIUS; dx++) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx >= 0 && sx < floor.width && sy >= 0 && sy < floor.height) {
            expect(floor.visibility[sy][sx]).toBe('visible');
          }
        }
      }
    });

    it('探索済みタイルが次のターンに explored に格下げされる', () => {
      const floor = DungeonGenerator.generate(1, 42);
      const player = { pos: { ...floor.playerStart }, facing: 'down' as const, hp: 3, maxHp: 3, atk: 2, level: 1, exp: 0 };

      // 1ターン目：視界を更新して visible なタイルを確認
      FogOfWar.updateVisibility(player, floor);
      const firstVisibleCount = floor.visibility.flat().filter((v) => v === 'visible').length;
      expect(firstVisibleCount).toBeGreaterThan(0);

      // プレイヤーを別の位置に移動（視界が変わるよう離れた位置に）
      player.pos = { x: floor.playerStart.x + 15, y: floor.playerStart.y };
      player.facing = 'down';
      FogOfWar.updateVisibility(player, floor);

      // 元の位置が explored になっているタイルがある
      const exploredCount = floor.visibility.flat().filter((v) => v === 'explored').length;
      expect(exploredCount).toBeGreaterThan(0);
    });

    it('unseen タイルが visible や explored に変わることはない（視界外）', () => {
      const floor = DungeonGenerator.generate(1, 42);
      const player = { pos: floor.playerStart, facing: 'down' as const, hp: 3, maxHp: 3, atk: 2, level: 1, exp: 0 };

      FogOfWar.updateVisibility(player, floor);

      // unseen タイルが残っていることを確認（40x30の広いマップで、一部は必ず見えないはず）
      const unseenCount = floor.visibility.flat().filter((v) => v === 'unseen').length;
      expect(unseenCount).toBeGreaterThan(0);
    });
  });
});
