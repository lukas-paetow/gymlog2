import { inferWeightOptions, normalizeIncrements, normalizeWeights, wheelWeights } from '../weightOptions';

test('infers unconfigured choices from logs, preserves assistance and extends above the maximum', () => {
  expect(inferWeightOptions([4, 5, 6, 8, 5]).weights).toEqual([4, 5, 6, 8, 9, 10, 11, 12, 13]);
  expect(inferWeightOptions([-21, -14, -7]).weights).toEqual([-21, -14, -7, 0, 7, 14, 21, 28]);
  expect(inferWeightOptions([10]).weights).toEqual([10, 11, 12, 13, 14, 15]);
  expect(inferWeightOptions([9]).weights).toEqual([9, 10, 11, 12, 13, 14]);
  expect(inferWeightOptions([9, 10.25]).weights).toEqual([9, 10.25, 11.25, 12.25, 13.25, 14.25, 15.25]);
  expect(inferWeightOptions([10, 11.25]).weights).toEqual([10, 11.25, 12.5, 13.75, 15, 16.25, 17.5]);
  expect(inferWeightOptions([])).toEqual({ weights: [], increments: [] });
});

test('custom weights sort, deduplicate and reject invalid or excessive lists', () => {
  expect(normalizeWeights([17.5, -5, 4, 17.5])).toEqual([-5, 4, 17.5]);
  expect(normalizeWeights([])).toEqual([]);
  expect(() => normalizeWeights([Infinity])).toThrow();
  expect(() => normalizeWeights(Array.from({ length: 1001 }, (_, index) => index))).toThrow();
});

test('open-ended increments change at each start and keep a bounded wheel window', () => {
  const rules = normalizeIncrements([{ start: 10, increment: 3 }, { start: 4, increment: 1 }, { start: 10, increment: 2 }]);
  expect(rules).toEqual([{ start: 4, increment: 1 }, { start: 10, increment: 2 }]);
  const values = wheelWeights([17.5, 20], rules, NaN);
  expect(values.slice(0, 12)).toEqual([4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 17.5, 18]);
  expect(values).not.toContain(11);
  expect(wheelWeights([], [{ start: 0, increment: 0.1 }], 100000)).toContain(100000);
  expect(wheelWeights([], [{ start: 0, increment: 0.1 }], 100000)).toHaveLength(150);
  expect(wheelWeights([], [], NaN)).toEqual([]);
  expect(wheelWeights([], [{ start: -0.3, increment: 0.1 }], 0).slice(0, 7)).toEqual([-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]);
  for (const rule of [{ start: NaN, increment: 1 }, { start: 0, increment: 0 }, { start: 0, increment: -1 }]) {
    expect(() => normalizeIncrements([rule])).toThrow();
  }
});
