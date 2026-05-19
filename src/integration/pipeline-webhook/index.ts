import type { PipelineWebhook, ScoringResult, WebhookMetadata } from '../../types';

export type { PipelineWebhook, WebhookMetadata };

export class HttpWebhook implements PipelineWebhook {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

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
