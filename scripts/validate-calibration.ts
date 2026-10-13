/**
 * Validates calibration examples against the scoring engine.
 *
 * Usage: npx ts-node scripts/validate-calibration.ts
 *
 * Runs each calibration example through the scoring pipeline
 * (without LLM — uses pre-scored judge results) and verifies
 * that computed scores match expected values within tolerance.
 */

import { loadCalibrationExamples, validateCalibrationSet } from '../src/calibration';
import { computeScores } from '../src/scoring';
import type { JudgeResult } from '../src/types';

const SCORE_TOLERANCE = 3; // Points of acceptable variance

interface ExampleResult {
  band: string;
  index: number;
  expectedOverall: number;
  computedOverall: number;
  delta: number;
  passed: boolean;
  dimensionMismatches: string[];
}

function runValidation(): void {
  console.log('Loading calibration examples...');
  const examples = loadCalibrationExamples();

  console.log(`Loaded ${examples.length} examples.\n`);

  console.log('Validating calibration set structure...');
  const setValidation = validateCalibrationSet(examples);

  if (setValidation.errors.length > 0) {
    console.error('STRUCTURE ERRORS:');
    for (const err of setValidation.errors) {
      console.error(`  ✗ ${err}`);
    }
  }

  if (setValidation.warnings.length > 0) {
    console.warn('WARNINGS:');
    for (const w of setValidation.warnings) {
      console.warn(`  ⚠ ${w}`);
    }
  }

  console.log(`\nExamples by band: ${JSON.stringify(setValidation.stats.byBand)}\n`);

  if (!setValidation.valid) {
    console.error('Calibration set has structural errors. Fix before running score validation.');
    process.exit(1);
  }

  console.log('Running score validation...\n');

  const results: ExampleResult[] = [];
  const byBand: Record<string, { passed: number; failed: number }> = {};

  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];

    const judgeResult: JudgeResult = {
      scores: ex.expected_scores.dimensions,
      disagreements: [],
    };

    const computed = computeScores(judgeResult);
    const computedOverall = Math.round(computed.raw_score * 100);
    const expectedOverall = ex.expected_scores.overall;
    const delta = Math.abs(computedOverall - expectedOverall);
    const passed = delta <= SCORE_TOLERANCE && computed.maturity_band === ex.band;

    const dimensionMismatches: string[] = [];
    if (computed.maturity_band !== ex.band) {
      dimensionMismatches.push(
        `maturity band: expected ${ex.band}, got ${computed.maturity_band}`
      );
    }

    results.push({ band: ex.band, index: i, expectedOverall, computedOverall, delta, passed, dimensionMismatches });

    if (!byBand[ex.band]) byBand[ex.band] = { passed: 0, failed: 0 };
    if (passed) byBand[ex.band].passed++;
    else byBand[ex.band].failed++;

    const status = passed ? '✓' : '✗';
    const bandLabel = `${ex.band} example-${String(i + 1).padStart(2, '0')}`;
    const scoreStr = `expected=${expectedOverall}%, computed=${computedOverall}%, delta=${delta}`;
    console.log(`  ${status} ${bandLabel}: ${scoreStr}${dimensionMismatches.length > 0 ? ` [${dimensionMismatches.join('; ')}]` : ''}`);
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;

  console.log('\n──────────────────────────────────────────');
  console.log('SUMMARY');
  console.log('──────────────────────────────────────────');
  console.log(`Total:  ${examples.length}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Tolerance: ±${SCORE_TOLERANCE} points`);

  if (totalFailed > 0) {
    console.log('\nFAILED EXAMPLES:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ${r.band} example-${r.index + 1}: expected=${r.expectedOverall}%, computed=${r.computedOverall}%, delta=${r.delta}`);
      for (const m of r.dimensionMismatches) {
        console.log(`    → ${m}`);
      }
    }
    console.log('\nCalibration validation FAILED.');
    process.exit(1);
  } else {
    console.log('\nAll calibration examples passed.');
    process.exit(0);
  }
}

runValidation();
