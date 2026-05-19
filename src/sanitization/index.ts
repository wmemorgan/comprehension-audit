import type { AuditInput } from '../types';

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwaway.email',
  'yopmail.com',
  'sharklasers.com',
  'guerrillamailblock.com',
  'grr.la',
  'dispostable.com',
]);

const MIN_RESPONSE_LENGTH = 200;
const MAX_RESPONSE_LENGTH = 4000;

/**
 * Escapes `<` and `>` characters to prevent XML/HTML injection in LLM prompts.
 * @param text - Raw user-supplied text.
 * @returns Escaped text safe to embed in XML-structured prompts.
 */
export function sanitizeText(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Validates basic email format using a permissive regex.
 * @param email - Email address to test.
 * @returns True if the email matches the expected format.
 */
export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Checks whether the email's domain is on the disposable-address blocklist.
 * @param email - Email address to check.
 * @returns True if the domain is a known disposable provider.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

/** A field-level validation error returned when input does not pass sanitization. */
export interface ValidationError {
  /** The input field that failed validation. */
  field: string;
  /** Human-readable description of the validation failure. */
  message: string;
}

/**
 * Validates and normalizes a raw HTTP request body into a typed AuditInput.
 *
 * Checks that the body is a non-null object, that each of the 4 response
 * fields is a string within the allowed length bounds, and that the email
 * is valid and not from a disposable domain.
 *
 * @param raw - The parsed (but unvalidated) request body.
 * @returns An object with the normalized input and any validation errors.
 *   If errors is non-empty, the input fields with errors will be empty strings.
 */
export function sanitizeInput(raw: unknown): { input: AuditInput; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (typeof raw !== 'object' || raw === null) {
    return {
      input: { q1: '', q2: '', q3: '', q4: '', email: '' },
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    };
  }

  const body = raw as Record<string, unknown>;
  const { q1, q2, q3, q4, email } = body;

  const responses: Array<[string, unknown]> = [
    ['q1', q1], ['q2', q2], ['q3', q3], ['q4', q4],
  ];

  for (const [key, val] of responses) {
    if (typeof val !== 'string') {
      errors.push({ field: key, message: `${key} is required and must be a string` });
    } else if (val.length < MIN_RESPONSE_LENGTH) {
      errors.push({ field: key, message: `${key} must be at least ${MIN_RESPONSE_LENGTH} characters (got ${val.length})` });
    } else if (val.length > MAX_RESPONSE_LENGTH) {
      errors.push({ field: key, message: `${key} must be no more than ${MAX_RESPONSE_LENGTH} characters (got ${val.length})` });
    }
  }

  if (typeof email !== 'string' || !validateEmail(email)) {
    errors.push({ field: 'email', message: 'A valid email address is required' });
  } else if (isDisposableEmail(email)) {
    errors.push({ field: 'email', message: 'Disposable email addresses are not accepted' });
  }

  return {
    input: {
      q1: typeof q1 === 'string' ? q1 : '',
      q2: typeof q2 === 'string' ? q2 : '',
      q3: typeof q3 === 'string' ? q3 : '',
      q4: typeof q4 === 'string' ? q4 : '',
      email: typeof email === 'string' ? email : '',
    },
    errors,
  };
}
