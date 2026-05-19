import { createHash } from 'crypto';
import type { EmailProvider } from '../types';

/**
 * Builds the standard CORS headers for all API responses.
 * @param allowedOrigin - Explicit allowed origin; falls back to ALLOWED_ORIGIN env var, then '*'.
 * @returns A headers object suitable for inclusion in any HTTP response.
 */
export function buildCorsHeaders(allowedOrigin?: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin ?? process.env.ALLOWED_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * Constructs a Netlify-compatible HTTP response object.
 * @param statusCode - HTTP status code.
 * @param body - Response payload; will be JSON-serialized.
 * @param corsHeaders - Pre-built CORS headers from buildCorsHeaders().
 * @param extraHeaders - Additional headers to merge (e.g. cache-control).
 * @returns A response object with statusCode, headers, and JSON body string.
 */
export function buildResponse(
  statusCode: number,
  body: object,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {}
): { statusCode: number; headers: Record<string, string>; body: string } {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

/**
 * Checks whether a submission should be rate-limited via the email provider.
 *
 * Returns `{ limited: false }` immediately if no provider is configured or
 * if the provider does not implement `checkSubmissionLimit`.
 *
 * @param email - The submitter's email address.
 * @param emailProvider - Optional email provider with rate-limit capability.
 * @returns An object indicating whether the submission is limited and an optional message.
 */
export async function checkRateLimit(
  email: string,
  emailProvider?: EmailProvider | null
): Promise<{ limited: boolean; message?: string }> {
  if (!emailProvider?.checkSubmissionLimit) return { limited: false };
  return emailProvider.checkSubmissionLimit(email);
}

/**
 * Generates a stable 12-character hex submission ID from the email and current timestamp.
 *
 * Not cryptographically unique — two submissions from the same address within the
 * same millisecond would collide — but sufficient for report URL construction.
 *
 * @param email - The submitter's email address.
 * @returns A 12-character lowercase hex string.
 */
export function generateSubmissionId(email: string): string {
  return createHash('sha256')
    .update(email + new Date().toISOString())
    .digest('hex')
    .substring(0, 12);
}
