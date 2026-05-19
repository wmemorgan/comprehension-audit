import type { EmailProvider, ContactData } from '../../types';

export type { EmailProvider, ContactData };

/**
 * Brevo (formerly Sendinblue) implementation of the EmailProvider interface.
 *
 * Upserts contacts via the Brevo v3 REST API and enforces a 30-day
 * submission rate limit by inspecting the LITMUS_SUBMITTED_AT contact attribute.
 */
export class BrevoProvider implements EmailProvider {
  private apiKey: string;
  private baseUrl = 'https://api.brevo.com/v3';

  /**
   * @param apiKey - Brevo API key (typically from the BREVO_API_KEY env var).
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Creates or updates a contact in Brevo with LITMUS scoring attributes.
   *
   * Uses `updateEnabled: true` so existing contacts are patched rather than
   * rejected. Silently swallows 429 rate-limit responses to avoid blocking
   * the main pipeline.
   *
   * @param contact - Contact data including email, CRM attributes, and list IDs.
   */
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

  /**
   * Returns whether the email has already submitted within the 30-day rate-limit window.
   *
   * Looks up the contact by email and reads the LITMUS_SUBMITTED_AT attribute.
   * Returns `{ limited: false }` on any network or API error to fail open.
   *
   * @param email - The submitter's email address.
   * @returns `{ limited: true, message }` if within the window; `{ limited: false }` otherwise.
   */
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
