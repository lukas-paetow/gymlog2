const MAX_OPTIONS = 1000;

export function normalizeWeights(weights: number[]): number[] {
  if (weights.some(weight => !Number.isFinite(weight))) throw new Error('Weights must be finite numbers.');
  const result = [...new Set(weights)].sort((a, b) => a - b);
  if (result.length > MAX_OPTIONS) throw new Error('Use at most 1000 available weights.');
  return result;
}

export type WeightIncrement = { start: number; increment: number };
export type WeightOptions = { weights: number[]; increments: WeightIncrement[] };

export function normalizeIncrements(rules: WeightIncrement[]): WeightIncrement[] {
  if (rules.some(rule => !Number.isFinite(rule.start) || !Number.isFinite(rule.increment) || rule.increment <= 0)) {
    throw new Error('Enter a valid starting weight and positive increment.');
  }
  return [...new Map(rules.map(rule => [rule.start, rule])).values()].sort((a, b) => a.start - b.start);
}

/** A bounded window of each sequence keeps even distant manual weights cheap. */
export function wheelWeights(weights: number[], increments: WeightIncrement[], anchor: number): number[] {
  const values = [...weights];
  increments.forEach((rule, index) => {
    const next = increments[index + 1]?.start ?? Infinity;
    const center = Number.isFinite(anchor) ? Math.max(0, Math.floor((anchor - rule.start) / rule.increment)) : 0;
    const first = Math.max(0, Math.floor(center / 50) * 50 - 50);
    for (let offset = first; offset < first + 150; offset++) {
      const weight = Number((rule.start + offset * rule.increment).toFixed(6));
      if (weight >= next) break;
      if (Number.isFinite(weight)) values.push(weight);
    }
  });
  return [...new Set(values)].sort((a, b) => a - b);
}
