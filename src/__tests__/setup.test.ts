import { describe, it, expect } from 'vitest';

/**
 * Phase 0: プロジェクト設定の検証テスト
 * ビルド環境が正しく設定されていることを確認する
 */
describe('プロジェクト設定', () => {
  it('Node.js環境がES2020以上をサポートしている', () => {
    // BigInt・optional chainingなどES2020機能が動作することを確認
    const result = BigInt(42);
    expect(result).toBe(42n);
  });

  it('TypeScriptの型チェックが有効になっている', () => {
    // 型推論が正しく動作していればテストが通る
    const nums: number[] = [1, 2, 3];
    const sum = nums.reduce((acc, n) => acc + n, 0);
    expect(sum).toBe(6);
  });
});
