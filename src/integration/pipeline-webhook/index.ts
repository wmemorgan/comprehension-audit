import type { PipelineWebhook, ScoringResult, WebhookMetadata } from '../../types';

export type { PipelineWebhook, WebhookMetadata };

/**
 * HTTP implementation of the PipelineWebhook interface.
 *
 * POSTs a JSON payload containing the scoring result and submission metadata
 * to a configured URL. Applies a 10-second timeout and logs failures without
 * re-throwing, so webhook errors never block the main pipeline response.
 */
export class HttpWebhook implements PipelineWebhook {
  private url: string;

  /**
   * @param url - The webhook endpoint URL to POST scoring results to.
   */
  constructor(url: string) {
    this.url = url;
  }

  /**
   * Sends a POST request with the scoring result and submission metadata.
   *
   * Times out after 10 seconds. Non-2xx responses are logged as warnings;
   * network errors are logged and silently swallowed.
   *
   * @param result - The computed scoring result including band and dimension breakdown.
   * @param metadata - Submission metadata with ID, timestamp, and optional report URL.
   */
  async notify(result: ScoringResult, metadata: WebhookMetadata): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result, metadata }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(`[PipelineWebhook] Returned ${res.status}`);
      }
    } catch (error) {
      console.error('[PipelineWebhook] Notification failed:', error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
