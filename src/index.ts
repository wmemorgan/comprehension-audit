import type { PipelineConfig, ScoringResult } from './types';
import { sanitizeInput } from './sanitization';
import { evaluateSubmission } from './judge';
import { computeScores, DIMENSION_LABELS } from './scoring';
import { generateFallbackResult } from './fallback';
import { buildCorsHeaders, buildResponse, checkRateLimit, generateSubmissionId } from './security';
import { ConsoleRouter } from './integration/band-router';

export type { PipelineConfig, ScoringResult };
export { DIMENSION_LABELS };

/**
 * Factory that wires together all pipeline modules into a single handler object.
 *
 * Accepts optional integrations (band router, email provider, webhook) via config.
 * When no config is provided, uses ConsoleRouter as the default band router and
 * performs no external integrations — safe for local development without any env vars.
 *
 * @param config - Optional pipeline configuration with integration overrides.
 * @returns An object with `corsHeaders`, `handlePreflight()`, and `processSubmission()`.
 */
export function createAuditPipeline(config: PipelineConfig = {}) {
  const router = config.bandRouter ?? new ConsoleRouter();
  const emailProvider = config.emailProvider ?? null;
  const webhook = config.pipelineWebhook ?? null;
  const corsHeaders = buildCorsHeaders(config.allowedOrigin);
  const reportBaseUrl = config.reportBaseUrl ?? process.env.REPORT_BASE_URL ?? '';

  return {
    corsHeaders,

    /** Returns a 204 preflight response with the configured CORS headers. */
    async handlePreflight() {
      return { statusCode: 204, headers: corsHeaders, body: '' };
    },

    /**
     * Validates, scores, and routes a raw submission body.
     *
     * Sanitizes input, checks rate limits, runs the dual-LLM judge, computes
     * weighted scores, triggers routing and CRM integration, and returns a
     * structured HTTP response. Falls back to a neutral L3 result if scoring fails.
     *
     * @param rawBody - The parsed JSON body from the HTTP request.
     * @returns A Netlify-compatible response object with statusCode, headers, and body.
     */
    async processSubmission(rawBody: unknown) {
      const { input, errors } = sanitizeInput(rawBody);

      if (errors.length > 0) {
        return buildResponse(400, { error: errors[0].message }, corsHeaders);
      }

      const rateCheck = await checkRateLimit(input.email, emailProvider);
      if (rateCheck.limited) {
        return buildResponse(429, { error: rateCheck.message }, corsHeaders);
      }

      let scoreResult: ScoringResult;

      try {
        const judgeResult = await evaluateSubmission(input);
        scoreResult = computeScores(judgeResult);

        if (judgeResult.disagreements.length > 0) {
          console.warn('Dual-run disagreements:', judgeResult.disagreements);
        }

        await router.route(scoreResult);
      } catch (err) {
        console.error('Scoring failed, using fallback:', err);
        scoreResult = generateFallbackResult(input);
      }

      const submissionId = generateSubmissionId(input.email);
      const reportData = Buffer.from(JSON.stringify({
        raw_score: scoreResult.raw_score,
        maturity_band: scoreResult.maturity_band,
        dimension_breakdown: scoreResult.dimension_breakdown,
        strongest_dimension: scoreResult.strongest_dimension,
        weakest_dimension: scoreResult.weakest_dimension,
      })).toString('base64url');

      const reportUrl = reportBaseUrl
        ? `${reportBaseUrl}/audit/reports/${submissionId}?data=${reportData}`
        : undefined;

      const timestamp = new Date().toISOString();

      await Promise.allSettled([
        emailProvider?.upsertContact({
          email: input.email,
          attributes: {
            LITMUS_SCORE: scoreResult.raw_score,
            LITMUS_BAND: scoreResult.maturity_band,
            LITMUS_STRONGEST: DIMENSION_LABELS[scoreResult.strongest_dimension] ?? scoreResult.strongest_dimension,
            LITMUS_WEAKEST: DIMENSION_LABELS[scoreResult.weakest_dimension] ?? scoreResult.weakest_dimension,
            LITMUS_REPORT_URL: reportUrl ?? '',
            LITMUS_SUBMITTED_AT: timestamp.split('T')[0],
          },
          listIds: getBandListIds(scoreResult.maturity_band),
        }),
        webhook?.notify(scoreResult, { submissionId, timestamp, reportUrl }),
      ]);

      return buildResponse(200, {
        raw_score: scoreResult.raw_score,
        maturity_band: scoreResult.maturity_band,
        dimension_breakdown: scoreResult.dimension_breakdown,
        strongest_dimension: scoreResult.strongest_dimension,
        weakest_dimension: scoreResult.weakest_dimension,
        ...(reportUrl && { report_url: reportUrl }),
      }, corsHeaders);
    },
  };
}

function getBandListIds(band: string): number[] {
  const low = parseInt(process.env.BREVO_LIST_ID_LOW ?? '0', 10);
  const mid = parseInt(process.env.BREVO_LIST_ID_MID ?? '0', 10);
  const high = parseInt(process.env.BREVO_LIST_ID_HIGH ?? '0', 10);

  if (band === 'L1' || band === 'L2') return low ? [low] : [];
  if (band === 'L3') return mid ? [mid] : [];
  return high ? [high] : [];
}
