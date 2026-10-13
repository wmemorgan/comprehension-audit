import type { JudgeResult, ScoringResult, MaturityBand } from '../types';

/**
 * Per-dimension weights that sum to 1.0.
 * Tradeoff articulation is weighted highest (0.25) as it is the strongest
 * signal of genuine architectural thinking vs surface-level compliance.
 */
export const WEIGHTS: Record<string, number> = {
  clarity_of_purpose: 0.20,
  boundary_definition: 0.15,
  tradeoff_articulation: 0.25,
  architectural_intentionality: 0.15,
  failure_mode_awareness: 0.15,
  blast_radius_articulation: 0.10,
  reflection_depth: 0.10,
  ai_override_evidence: 0.05,
};

/** Sum of all dimension weights; used to normalize the weighted score. */
export const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

/** Human-readable labels for each scoring dimension key. */
export const DIMENSION_LABELS: Record<string, string> = {
  clarity_of_purpose: 'Clarity of Purpose',
  boundary_definition: 'Boundary Definition',
  tradeoff_articulation: 'Tradeoff Analysis',
  architectural_intentionality: 'Architectural Intent',
  failure_mode_awareness: 'Failure Mode Awareness',
  blast_radius_articulation: 'Blast Radius Awareness',
  reflection_depth: 'Reflection Depth',
  ai_override_evidence: 'AI Override Evidence',
};

function assignBand(rawScore: number): MaturityBand {
  if (rawScore >= 0.85) return 'L5';
  if (rawScore >= 0.70) return 'L4';
  if (rawScore >= 0.50) return 'L3';
  if (rawScore >= 0.30) return 'L2';
  return 'L1';
}

/**
 * Converts raw LLM scores into a normalized ScoringResult.
 *
 * Computes a weighted composite score from per-dimension 1–5 scores,
 * normalizes it to [0, 1], assigns a maturity band, and identifies the
 * strongest and weakest dimensions by their weighted contribution.
 *
 * @param judgeResult - Merged scores from the dual-run judge.
 * @returns A complete ScoringResult with band, breakdown, and dimension extremes.
 */
export function computeScores(judgeResult: JudgeResult): ScoringResult {
  const { scores } = judgeResult;

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
    maturity_band: assignBand(rawScore),
    dimension_breakdown: contributions,
    strongest_dimension: strongest,
    weakest_dimension: weakest,
  };
}
