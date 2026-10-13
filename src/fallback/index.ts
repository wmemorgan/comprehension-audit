import type { AuditInput, ScoringResult } from '../types';
import { WEIGHTS, TOTAL_WEIGHT } from '../scoring';

/**
 * Generates a neutral fallback ScoringResult when the LLM judge fails.
 *
 * Assigns a uniform score of 3 (middle of the 1–5 scale) to every dimension,
 * producing an L3 band result. Used only when both LLM runs in the judge
 * module throw an error.
 *
 * @param _input - The original audit input (unused; retained for interface consistency).
 * @returns A ScoringResult with all dimensions at score 3 and band L3.
 */
export function generateFallbackResult(_input: AuditInput): ScoringResult {
  const fallbackScore = 3;

  const scores = Object.fromEntries(Object.keys(WEIGHTS).map((dim) => [dim, fallbackScore]));

  const weightedSum = Object.entries(WEIGHTS).reduce(
    (sum, [dim, weight]) => sum + (scores[dim] / 5.0) * weight,
    0
  );
  const rawScore = weightedSum / TOTAL_WEIGHT;

  const contributions = Object.fromEntries(
    Object.entries(WEIGHTS).map(([dim, weight]) => [
      dim,
      Math.round(((scores[dim] / 5.0) * weight / TOTAL_WEIGHT) * 1000) / 1000,
    ])
  );

  const strongest = Object.entries(contributions).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  const weakest = Object.entries(contributions).reduce((a, b) => a[1] < b[1] ? a : b)[0];

  return {
    raw_score: Math.round(rawScore * 1000) / 1000,
    maturity_band: 'L3',
    dimension_breakdown: contributions,
    strongest_dimension: strongest,
    weakest_dimension: weakest,
  };
}
