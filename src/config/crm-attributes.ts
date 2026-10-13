/**
 * CRM contact-attribute name map.
 *
 * The pipeline writes a handful of scoring attributes onto the CRM contact
 * record (and reads one of them back for rate limiting). The attribute *names*
 * are not hard-coded: they resolve from environment variables, falling back to
 * neutral `AUDIT_*` defaults. This lets a deployer point the pipeline at the
 * attribute names an existing CRM account already uses without touching code.
 *
 * Example — map onto a CRM that already defines differently-named attributes:
 *
 *   CRM_ATTR_SCORE=MY_SCORE
 *   CRM_ATTR_BAND=MY_BAND
 *   CRM_ATTR_STRONGEST=MY_STRONGEST
 *   CRM_ATTR_WEAKEST=MY_WEAKEST
 *   CRM_ATTR_REPORT_URL=MY_REPORT_URL
 *   CRM_ATTR_SUBMITTED_AT=MY_SUBMITTED_AT
 */

/** Logical-to-CRM attribute name map for the scoring attributes. */
export interface CrmAttributeNames {
  /** Composite score (0–100). */
  score: string;
  /** Maturity band (e.g. L1–L5). */
  band: string;
  /** Label of the strongest dimension. */
  strongest: string;
  /** Label of the weakest dimension. */
  weakest: string;
  /** URL to the full report, if configured. */
  reportUrl: string;
  /** Date of the most recent submission (used for rate limiting). */
  submittedAt: string;
}

/** Resolved CRM attribute names, env-overridable with neutral `AUDIT_*` defaults. */
export const CRM_ATTRIBUTES: CrmAttributeNames = {
  score: process.env.CRM_ATTR_SCORE ?? 'AUDIT_SCORE',
  band: process.env.CRM_ATTR_BAND ?? 'AUDIT_BAND',
  strongest: process.env.CRM_ATTR_STRONGEST ?? 'AUDIT_STRONGEST',
  weakest: process.env.CRM_ATTR_WEAKEST ?? 'AUDIT_WEAKEST',
  reportUrl: process.env.CRM_ATTR_REPORT_URL ?? 'AUDIT_REPORT_URL',
  submittedAt: process.env.CRM_ATTR_SUBMITTED_AT ?? 'AUDIT_SUBMITTED_AT',
};
