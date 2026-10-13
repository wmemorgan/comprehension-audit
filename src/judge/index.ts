import type { AuditInput, JudgeResult } from '../types';
import { WEIGHTS } from '../scoring';
import { sanitizeText } from '../sanitization';

const JUDGE_SYSTEM_PROMPT = `You are a scoring judge for the Comprehension Audit. You evaluate enterprise AI project comprehension across 8 dimensions.

Score each dimension on a 1–5 integer scale using the rubric below. Be precise and consistent.

RUBRIC:

1. clarity_of_purpose (sourced from Q1, weight 0.20):
   1 = No clear purpose stated
   2 = Vague purpose, no specifics
   3 = Clear purpose with some specifics
   4 = Clear purpose with concrete business outcomes
   5 = Precise purpose with measurable outcomes and stakeholder alignment

2. boundary_definition (sourced from Q1, weight 0.15):
   1 = No boundaries mentioned
   2 = Vague scope references
   3 = Some boundaries defined but gaps remain
   4 = Clear boundaries with explicit inclusions/exclusions
   5 = Comprehensive boundaries with edge cases addressed

3. tradeoff_articulation (sourced from Q2, weight 0.25):
   1 = No alternatives mentioned
   2 = One alternative mentioned but no tradeoff analysis
   3 = Two alternatives with surface-level tradeoffs (cost, speed)
   4 = Two+ alternatives with substantive tradeoffs (capability, fit, risk)
   5 = Two+ alternatives, substantive tradeoffs, AND explicit naming of what the chosen approach gives up

4. architectural_intentionality (sourced from Q2, weight 0.15):
   1 = No architecture discussed
   2 = Technology mentioned without rationale
   3 = Architecture described with basic rationale
   4 = Architecture with clear design principles and constraints
   5 = Architecture with design principles, constraints, AND evolution path

5. failure_mode_awareness (sourced from Q3, weight 0.15):
   1 = No failure modes identified
   2 = One failure mode mentioned generically
   3 = Multiple failure modes with basic mitigation
   4 = Comprehensive failure modes with specific mitigation strategies
   5 = Failure modes with mitigation, monitoring, AND recovery procedures

6. blast_radius_articulation (sourced from Q3, weight 0.10):
   1 = No blast radius awareness
   2 = Acknowledges things could go wrong
   3 = Identifies affected systems/users
   4 = Quantifies impact scope with containment strategy
   5 = Full blast radius map with progressive containment and rollback

7. reflection_depth (sourced from Q4, weight 0.10):
   1 = No reflection or learning
   2 = Surface acknowledgment of challenges
   3 = Specific lessons with context
   4 = Deep reflection connecting lessons to methodology changes
   5 = Reflection showing systemic thinking and process evolution

8. ai_override_evidence (sourced from Q4, weight 0.05):
   1 = No evidence of overriding AI suggestions
   2 = Mentions disagreeing with AI once
   3 = Specific example of overriding AI with reasoning
   4 = Pattern of critical AI evaluation with judgment calls
   5 = Systematic framework for when to accept vs override AI

OUTPUT FORMAT:
Respond with ONLY a valid JSON object. No preamble, no explanation, no markdown code fences. Example:
{"clarity_of_purpose":3,"boundary_definition":2,"tradeoff_articulation":4,"architectural_intentionality":3,"failure_mode_awareness":3,"blast_radius_articulation":2,"reflection_depth":3,"ai_override_evidence":2}`;

function buildUserMessage(q1: string, q2: string, q3: string, q4: string): string {
  return [
    `<visitor_response question="1">\n  ${sanitizeText(q1)}\n</visitor_response>`,
    `<visitor_response question="2">\n  ${sanitizeText(q2)}\n</visitor_response>`,
    `<visitor_response question="3">\n  ${sanitizeText(q3)}\n</visitor_response>`,
    `<visitor_response question="4">\n  ${sanitizeText(q4)}\n</visitor_response>`,
  ].join('\n\n');
}

function mergeDualRunScores(
  run1: Record<string, number>,
  run2: Record<string, number>
): { merged: Record<string, number>; disagreements: string[] } {
  const merged: Record<string, number> = {};
  const disagreements: string[] = [];

  for (const dim of Object.keys(WEIGHTS)) {
    const s1 = run1[dim] ?? 1;
    const s2 = run2[dim] ?? 1;
    const diff = Math.abs(s1 - s2);
    if (diff > 1) {
      disagreements.push(`${dim}: run1=${s1}, run2=${s2}, diff=${diff}`);
    }
    merged[dim] = Math.round((s1 + s2) / 2);
  }

  return { merged, disagreements };
}

async function callLLM(userMessage: string): Promise<Record<string, number>> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY not set');

  const model = process.env.LLM_MODEL ?? 'claude-sonnet-4-6';

  const payload = {
    model,
    max_tokens: 500,
    temperature: 0.0,
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const rawText = data.content?.[0]?.text?.trim();
  if (!rawText) throw new Error('Empty response from LLM');

  const parsed = JSON.parse(rawText) as Record<string, number>;

  for (const dim of Object.keys(WEIGHTS)) {
    const val = parsed[dim];
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 5) {
      throw new Error(`Invalid score for dimension ${dim}: ${val}`);
    }
  }

  return parsed;
}

async function callLLMWithRetry(userMessage: string): Promise<Record<string, number>> {
  try {
    return await callLLM(userMessage);
  } catch (err) {
    console.error('LLM run failed, retrying in 2s:', err);
    await new Promise((r) => setTimeout(r, 2_000));
    return await callLLM(userMessage);
  }
}

/**
 * Evaluates a submission using dual-run LLM analysis.
 *
 * Sends the sanitized input to the configured LLM twice at temperature 0.0,
 * then merges both evaluations by averaging per-dimension scores. Disagreements
 * (diff > 1 point) are recorded for downstream logging.
 *
 * @param input - Sanitized audit input with 4 response strings.
 * @returns Judge result with per-dimension scores and any disagreement annotations.
 * @throws {Error} If both LLM runs fail after one retry each.
 */
export async function evaluateSubmission(input: AuditInput): Promise<JudgeResult> {
  const userMessage = buildUserMessage(input.q1, input.q2, input.q3, input.q4);

  const run1 = await callLLMWithRetry(userMessage);
  const run2 = await callLLMWithRetry(userMessage);

  const { merged, disagreements } = mergeDualRunScores(run1, run2);

  if (disagreements.length > 0) {
    console.warn('Dual-run disagreements detected (avg used):', disagreements);
  }

  return { scores: merged, disagreements };
}
