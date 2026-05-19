import * as fs from 'fs';
import * as path from 'path';

/** A single calibration example with expected scores for a given band. */
export interface CalibrationExample {
  /** The expected maturity band for this example. */
  band: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  /** Synthetic input responses used as judge input during validation. */
  input: {
    /** Exactly 4 response strings corresponding to Q1–Q4. */
    responses: [string, string, string, string];
  };
  /** Reference scores the scoring engine should reproduce within tolerance. */
  expected_scores: {
    /** Overall score as an integer percentage (0–100). */
    overall: number;
    /** Per-dimension scores as integers (1–5). */
    dimensions: Record<string, number>;
  };
  /** Narrative explanation of why this example belongs to its band. */
  rationale: string;
}

/** Result of validating the entire calibration set for structural and score correctness. */
export interface ValidationResult {
  /** True if there are zero structural errors (warnings do not affect validity). */
  valid: boolean;
  /** Structural errors that must be fixed before score validation can proceed. */
  errors: string[];
  /** Non-blocking observations about example quality or coverage. */
  warnings: string[];
  /** Aggregate counts for reporting. */
  stats: {
    /** Total number of examples across all bands. */
    total: number;
    /** Per-band example counts. */
    byBand: Record<string, number>;
  };
}

const BANDS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;
const REQUIRED_DIMENSIONS = [
  'clarity_of_purpose',
  'boundary_definition',
  'tradeoff_articulation',
  'architectural_intentionality',
  'failure_mode_awareness',
  'blast_radius_articulation',
  'reflection_depth',
  'ai_override_evidence',
];

const BAND_RANGES: Record<string, { min: number; max: number }> = {
  L1: { min: 0, max: 29 },
  L2: { min: 30, max: 49 },
  L3: { min: 50, max: 69 },
  L4: { min: 70, max: 84 },
  L5: { min: 85, max: 100 },
};

/**
 * Reads all calibration examples from the `examples/calibration/` directory tree.
 *
 * Iterates over each band subdirectory in alphabetical order, loading every `.json`
 * file within it. Files are expected to conform to the CalibrationExample schema.
 *
 * @returns All parsed CalibrationExample objects across all bands.
 */
export function loadCalibrationExamples(): CalibrationExample[] {
  const calibrationDir = path.resolve(__dirname, '../../examples/calibration');
  const examples: CalibrationExample[] = [];

  for (const band of BANDS) {
    const bandDir = path.join(calibrationDir, band);
    if (!fs.existsSync(bandDir)) continue;

    const files = fs.readdirSync(bandDir).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      const raw = fs.readFileSync(path.join(bandDir, file), 'utf-8');
      const parsed = JSON.parse(raw) as CalibrationExample;
      examples.push(parsed);
    }
  }

  return examples;
}

/**
 * Validates the structure and score ranges of a loaded calibration set.
 *
 * Checks each example for: valid band assignment, 4-string responses array,
 * overall score within the band's numeric range, and all 8 required dimensions
 * scoring as integers 1–5. Emits warnings for short responses, brief rationales,
 * and bands with fewer than 4 examples.
 *
 * @param examples - Array of CalibrationExample objects to validate.
 * @returns A ValidationResult with errors, warnings, and per-band counts.
 */
export function validateCalibrationSet(examples: CalibrationExample[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byBand: Record<string, number> = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 };

  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    const label = `example[${i}] (band=${ex.band})`;

    if (!BANDS.includes(ex.band)) {
      errors.push(`${label}: invalid band "${ex.band}"`);
      continue;
    }

    byBand[ex.band] = (byBand[ex.band] ?? 0) + 1;

    if (!Array.isArray(ex.input?.responses) || ex.input.responses.length !== 4) {
      errors.push(`${label}: input.responses must be an array of exactly 4 strings`);
    }

    for (let q = 0; q < 4; q++) {
      if (typeof ex.input?.responses?.[q] !== 'string' || ex.input.responses[q].length < 50) {
        warnings.push(`${label}: response[${q}] is very short — may not be a realistic example`);
      }
    }

    const overall = ex.expected_scores?.overall;
    if (typeof overall !== 'number' || overall < 0 || overall > 100) {
      errors.push(`${label}: expected_scores.overall must be a number between 0 and 100`);
    } else {
      const range = BAND_RANGES[ex.band];
      if (overall < range.min || overall > range.max) {
        errors.push(
          `${label}: overall score ${overall} is outside expected range for ${ex.band} (${range.min}-${range.max})`
        );
      }
    }

    for (const dim of REQUIRED_DIMENSIONS) {
      const score = ex.expected_scores?.dimensions?.[dim];
      if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
        errors.push(`${label}: dimension "${dim}" must be an integer between 1 and 5`);
      }
    }

    if (!ex.rationale || ex.rationale.trim().length < 20) {
      warnings.push(`${label}: rationale is missing or too brief`);
    }
  }

  for (const band of BANDS) {
    const count = byBand[band] ?? 0;
    if (count < 4) {
      warnings.push(`Band ${band} has only ${count} examples (minimum recommended: 4)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: { total: examples.length, byBand },
  };
}
