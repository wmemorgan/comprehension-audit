import type { BandRouter, ScoringResult } from '../../types';
import { DIMENSION_LABELS } from '../../scoring';

export type { BandRouter };

/**
 * Default band router that logs the scoring result to stdout.
 *
 * Used when no custom BandRouter is provided to createAuditPipeline().
 * Suitable for local development and environments without a CRM or
 * automation platform configured.
 */
export class ConsoleRouter implements BandRouter {
  /**
   * Logs the maturity band, score, and dimension extremes to stdout.
   * @param result - The computed scoring result to route.
   */
  async route(result: ScoringResult): Promise<void> {
    console.log(`[BandRouter] Band: ${result.maturity_band}`);
    console.log(`[BandRouter] Score: ${result.raw_score}`);
    console.log(`[BandRouter] Strongest: ${DIMENSION_LABELS[result.strongest_dimension] ?? result.strongest_dimension}`);
    console.log(`[BandRouter] Weakest: ${DIMENSION_LABELS[result.weakest_dimension] ?? result.weakest_dimension}`);
    console.log(`[BandRouter] Would route to sequence for band ${result.maturity_band}`);
  }
}
