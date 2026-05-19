/** One of the five comprehension maturity bands, from lowest (L1) to highest (L5). */
export type MaturityBand = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

/** Sanitized input submitted by a user for evaluation. */
export interface AuditInput {
  /** Response to Question 1 (purpose and scope). */
  q1: string;
  /** Response to Question 2 (architecture and tradeoffs). */
  q2: string;
  /** Response to Question 3 (failure modes and blast radius). */
  q3: string;
  /** Response to Question 4 (reflection and AI override). */
  q4: string;
  /** Submitter's email address, validated and checked against disposable domains. */
  email: string;
}

/** Raw output from the dual-run LLM judge. */
export interface JudgeResult {
  /** Per-dimension integer scores (1–5) averaged across both LLM runs. */
  scores: Record<string, number>;
  /** Dimensions where the two LLM runs disagreed by more than 1 point. */
  disagreements: string[];
}

/** Computed scoring result derived from a JudgeResult. */
export interface ScoringResult {
  /** Weighted composite score normalized to [0, 1]. */
  raw_score: number;
  /** Maturity band assignment based on the raw score thresholds. */
  maturity_band: MaturityBand;
  /** Per-dimension weighted contribution to the overall score. */
  dimension_breakdown: Record<string, number>;
  /** Key of the dimension with the highest weighted contribution. */
  strongest_dimension: string;
  /** Key of the dimension with the lowest weighted contribution. */
  weakest_dimension: string;
}

/** Contact record sent to the email marketing provider after scoring. */
export interface ContactData {
  /** Submitter's email address. */
  email: string;
  /** Optional first name for personalization. */
  firstName?: string;
  /** Flat map of CRM attributes to set on the contact. */
  attributes: Record<string, string | number>;
  /** List IDs to subscribe the contact to (band-specific sequences). */
  listIds: number[];
}

/** Metadata attached to a pipeline webhook notification. */
export interface WebhookMetadata {
  /** Stable identifier for this submission (sha256 of email + timestamp). */
  submissionId: string;
  /** ISO 8601 timestamp of when scoring completed. */
  timestamp: string;
  /** URL to the full comprehension report, if a reportBaseUrl is configured. */
  reportUrl?: string;
}

/** Routes a scored result to the appropriate downstream sequence or action. */
export interface BandRouter {
  /**
   * Called with the final scoring result to trigger band-specific routing.
   * @param result - The computed scoring result including band assignment.
   */
  route(result: ScoringResult): Promise<void>;
}

/** Manages contact upserts and submission rate limiting via an email platform. */
export interface EmailProvider {
  /**
   * Creates or updates the contact in the email platform with LITMUS attributes.
   * @param contact - Contact data including email, attributes, and list subscriptions.
   */
  upsertContact(contact: ContactData): Promise<void>;
  /**
   * Checks whether the email address has submitted the audit within the rate-limit window.
   * @param email - The submitter's email address.
   * @returns An object indicating whether the submission is rate-limited.
   */
  checkSubmissionLimit?(email: string): Promise<{ limited: boolean; message?: string }>;
}

/** Sends a webhook notification to an external pipeline after scoring completes. */
export interface PipelineWebhook {
  /**
   * Fires a POST request to the configured webhook URL with the scoring result and metadata.
   * @param result - The computed scoring result.
   * @param metadata - Submission metadata including ID, timestamp, and optional report URL.
   */
  notify(result: ScoringResult, metadata: WebhookMetadata): Promise<void>;
}

/** Configuration object for createAuditPipeline(). All fields are optional. */
export interface PipelineConfig {
  /** Custom band router; defaults to ConsoleRouter when omitted. */
  bandRouter?: BandRouter;
  /** Email marketing provider for contact upserts and rate limiting. */
  emailProvider?: EmailProvider;
  /** External webhook to notify after scoring completes. */
  pipelineWebhook?: PipelineWebhook;
  /** Base URL used to construct per-submission report links. */
  reportBaseUrl?: string;
  /** CORS allowed origin header value; falls back to ALLOWED_ORIGIN env var, then '*'. */
  allowedOrigin?: string;
}
