import type { EmailProvider, ContactData } from '../../types';

export type { EmailProvider, ContactData };

export class BrevoProvider implements EmailProvider {
  private apiKey: string;
  private baseUrl = 'https://api.brevo.com/v3';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async upsertContact(contact: ContactData): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/contacts`, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: contact.email,
          attributes: contact.attributes,
          listIds: contact.listIds,
          updateEnabled: true,
        }),
      });
    } catch (err) {
      console.error('[EmailProvider] Network error:', err);
      return;
    }

    if (res.status === 429) {
      console.warn('[EmailProvider] Rate limit (429) — contact not updated');
      return;
    }

    if (!res.ok) {
      const error = await res.text();
      console.error(`[EmailProvider] Brevo API error ${res.status}: ${error}`);
    }
  }

  async checkSubmissionLimit(email: string): Promise<{ limited: boolean; message?: string }> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/contacts/${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: { 'api-key': this.apiKey },
      });
    } catch (err) {
      console.error('[EmailProvider] Rate-limit check network error:', err);
      return { limited: false };
    }

    if (res.status === 404) return { limited: false };
    if (!res.ok) {
      console.warn(`[EmailProvider] Contact lookup failed: ${res.status}`);
      return { limited: false };
    }

    const data = await res.json() as {
      attributes?: { LITMUS_SUBMITTED_AT?: string };
    };

    const submittedAt = data?.attributes?.LITMUS_SUBMITTED_AT;
    if (!submittedAt) return { limited: false };

    const submittedDate = new Date(submittedAt);
    const daysSince = (Date.now() - submittedDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince < 30) {
      const nextDate = new Date(submittedDate);
      nextDate.setDate(nextDate.getDate() + 30);
      return {
        limited: true,
        message: `You've already submitted the Comprehension Audit. You may re-submit after ${nextDate.toISOString().split('T')[0]}.`,
      };
    }

    return { limited: false };
  }
}
