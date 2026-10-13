import React, { useState, useCallback } from "react";
import RadarChart from "./RadarChart";
import auditData from "./comprehension-audit.json";

const API_URL = import.meta.env.PUBLIC_AUDIT_API_URL || '/api/audit-submit';

const USE_MOCK = false;

const MOCK_RESPONSE = {
  raw_score: 0.72,
  maturity_band: "L3",
  dimension_breakdown: {
    clarity_of_purpose: 0.156,
    boundary_definition: 0.074,
    tradeoff_articulation: 0.164,
    architectural_intentionality: 0.084,
    failure_mode_awareness: 0.105,
    blast_radius_articulation: 0.060,
    reflection_depth: 0.057,
    ai_override_evidence: 0.020,
  },
  strongest_dimension: "tradeoff_articulation",
  weakest_dimension: "ai_override_evidence",
};

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "throwaway.email",
  "10minutemail.com",
  "trashmail.com",
  "fakeinbox.com",
  "sharklasers.com",
  "yopmail.com",
]);

type UXState = "intro" | "question" | "email" | "loading" | "result";

interface AuditResult {
  raw_score: number;
  maturity_band: string;
  dimension_breakdown: Record<string, number>;
  strongest_dimension: string;
  weakest_dimension: string;
}

function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email address is required.";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return "Please enter a valid email address.";
  const domain = email.trim().split("@")[1]?.toLowerCase();
  if (domain && DISPOSABLE_DOMAINS.has(domain))
    return "Please use a permanent email address.";
  return null;
}

function getCharCountColor(current: number, min: number, max: number): string {
  if (current >= max - 200) return "text-red-400";
  if (current >= min) return "text-amber-400";
  return "text-slate-500";
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`block rounded-full transition-all duration-300 ${
            i < current
              ? "w-6 h-1 bg-amber-400"
              : i === current
              ? "w-6 h-1 bg-amber-400/60"
              : "w-2 h-1 bg-slate-700"
          }`}
        />
      ))}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-xs text-slate-400">Comprehension Score</span>
        <span className="font-mono text-sm text-amber-400 font-semibold">{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ComprehensionAudit() {
  const { intro, questions, dimensions, maturityBands } = auditData;

  const [uxState, setUxState] = useState<UXState>("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>(["", "", "", ""]);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const q = questions[currentQ];

  const handleBegin = useCallback(() => {
    setUxState("question");
    setCurrentQ(0);
  }, []);

  const handleAnswerChange = useCallback(
    (val: string) => {
      const next = [...answers];
      next[currentQ] = val;
      setAnswers(next);
      if (answerError && val.length >= q.minChars) setAnswerError(null);
    },
    [answers, currentQ, answerError, q.minChars]
  );

  const handleContinue = useCallback(() => {
    const text = answers[currentQ];
    if (text.length < q.minChars) {
      setAnswerError("Please add more detail.");
      return;
    }
    setAnswerError(null);
    if (currentQ < questions.length - 1) {
      setCurrentQ((prev) => prev + 1);
    } else {
      setUxState("email");
    }
  }, [answers, currentQ, q.minChars, questions.length]);

  const handleBack = useCallback(() => {
    setAnswerError(null);
    if (currentQ > 0) {
      setCurrentQ((prev) => prev - 1);
    } else {
      setUxState("intro");
    }
  }, [currentQ]);

  const handleEmailBack = useCallback(() => {
    setUxState("question");
    setCurrentQ(questions.length - 1);
    setEmailError(null);
  }, [questions.length]);

  const handleSubmit = useCallback(async () => {
    const err = validateEmail(email);
    if (err) {
      setEmailError(err);
      return;
    }
    setEmailError(null);
    setApiError(null);
    setUxState("loading");

    try {
      if (USE_MOCK) {
        await new Promise((res) => setTimeout(res, 3000));
        setResult(MOCK_RESPONSE);
        setUxState("result");
        return;
      }

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q1: answers[0],
          q2: answers[1],
          q3: answers[2],
          q4: answers[3],
          email: email.trim(),
        }),
      });

      if (res.status === 200) {
        const data: AuditResult = await res.json();
        setResult(data);
        setUxState("result");
      } else if (res.status === 429) {
        setApiError("You have already taken this audit recently.");
        setUxState("email");
      } else if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        setApiError(data?.message ?? "There was a problem with your submission. Please review your responses.");
        setUxState("email");
      } else {
        setApiError("Something went wrong on our end. Please try again in a moment.");
        setUxState("email");
      }
    } catch {
      setApiError("Unable to reach the server. Please check your connection and try again.");
      setUxState("email");
    }
  }, [email, answers]);

  return (
    <div className="animate-fade-in">
      {uxState === "intro" && (
        <IntroState intro={intro} onBegin={handleBegin} />
      )}
      {uxState === "question" && (
        <QuestionState
          q={q}
          totalQ={questions.length}
          currentQ={currentQ}
          answer={answers[currentQ]}
          error={answerError}
          onChange={handleAnswerChange}
          onContinue={handleContinue}
          onBack={handleBack}
        />
      )}
      {uxState === "email" && (
        <EmailState
          email={email}
          emailError={emailError}
          apiError={apiError}
          onEmailChange={(v) => {
            setEmail(v);
            if (emailError) setEmailError(null);
          }}
          onSubmit={handleSubmit}
          onBack={handleEmailBack}
        />
      )}
      {uxState === "loading" && <LoadingState />}
      {uxState === "result" && result && (
        <ResultState
          result={result}
          dimensions={dimensions as Record<string, string>}
          maturityBands={maturityBands as Record<string, { name: string; oneLiner: string; description: string }>}
        />
      )}
    </div>
  );
}

function IntroState({
  intro,
  onBegin,
}: {
  intro: typeof auditData.intro;
  onBegin: () => void;
}) {
  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3 mb-8">
        <span className="inline-block w-8 h-px bg-amber-400/60" />
        <span className="text-xs font-mono text-slate-400 tracking-widest uppercase">{intro.sectionLabel}</span>
      </div>

      <h1
        className="font-bold text-slate-100 leading-tight mb-6"
        style={{ fontSize: "clamp(2rem, 5vw, 3rem)", letterSpacing: "-0.02em" }}
      >
        {intro.headline.includes(intro.headlineHighlight) ? (
          <>
            {intro.headline.substring(0, intro.headline.indexOf(intro.headlineHighlight))}
            <span className="text-amber-400">{intro.headlineHighlight}</span>
            {intro.headline.substring(
              intro.headline.indexOf(intro.headlineHighlight) + intro.headlineHighlight.length
            )}
          </>
        ) : (
          intro.headline
        )}
      </h1>

      <p
        className="text-slate-400 mb-10 leading-relaxed"
        style={{ fontSize: "1.0625rem", lineHeight: "1.75" }}
      >
        {intro.subtext}
      </p>

      <div className="space-y-4 mb-10">
        {intro.details.map((detail, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="mt-2 flex-shrink-0 w-1 h-1 rounded-full bg-amber-400/60" />
            <p className="text-slate-300" style={{ fontSize: "0.9375rem", lineHeight: "1.7" }}>
              {detail}
            </p>
          </div>
        ))}
      </div>

      <div className="w-full h-px bg-amber-400/10 mb-10" />

      <button
        onClick={onBegin}
        className="inline-flex items-center gap-2 px-6 py-3 bg-amber-400 text-slate-900 font-semibold rounded-lg hover:bg-amber-300 transition-colors duration-200"
      >
        {intro.cta}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

function QuestionState({
  q,
  totalQ,
  currentQ,
  answer,
  error,
  onChange,
  onContinue,
  onBack,
}: {
  q: (typeof auditData.questions)[0];
  totalQ: number;
  currentQ: number;
  answer: string;
  error: string | null;
  onChange: (val: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const charColor = getCharCountColor(answer.length, q.minChars, q.maxChars);
  const isLast = currentQ === totalQ - 1;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <ProgressDots total={totalQ} current={currentQ} />
        <span className="font-mono text-xs text-slate-500 tracking-wider">
          {currentQ + 1} / {totalQ}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <span className="inline-block w-6 h-px bg-amber-400/50" />
        <span className="text-xs font-mono text-slate-400 tracking-widest uppercase">Comprehension Audit</span>
      </div>

      <h2
        className="font-bold text-slate-100 mb-2 leading-tight"
        style={{ fontSize: "clamp(1.5rem, 3.5vw, 2rem)", letterSpacing: "-0.02em" }}
      >
        <span className="text-amber-400/70 font-mono text-sm mr-3">
          Question {q.number} of {totalQ}
        </span>
        <br />
        {q.title}
      </h2>

      <p
        className="text-slate-400 mb-6 leading-relaxed"
        style={{ fontSize: "1rem", lineHeight: "1.75" }}
      >
        {q.prompt}
      </p>

      <div className="relative">
        <textarea
          value={answer}
          onChange={(e) => onChange(e.target.value)}
          maxLength={q.maxChars}
          placeholder="Write your response here…"
          rows={8}
          className={`w-full bg-slate-900/50 border rounded-lg px-4 py-3 text-slate-100
            text-base leading-relaxed resize-y transition-colors duration-200
            placeholder:text-slate-600 focus:outline-none
            ${error ? "border-red-500/50 focus:border-red-400" : "border-amber-400/20 focus:border-amber-400/60"}
          `}
          style={{ minHeight: "200px" }}
          aria-label={`Answer to question ${q.number}`}
          aria-describedby={error ? `q${q.number}-error` : undefined}
        />
      </div>

      <div className="flex items-start justify-between mt-2 mb-6 gap-4">
        {error ? (
          <p
            id={`q${q.number}-error`}
            className="font-mono text-xs text-red-400"
            role="alert"
          >
            {error}
          </p>
        ) : (
          <span />
        )}
        <span className={`font-mono text-xs ${charColor} ml-auto flex-shrink-0`}>
          {answer.length.toLocaleString()} / {q.maxChars.toLocaleString()} characters
          {answer.length < q.minChars && (
            <span className="text-slate-600 ml-1">
              ({q.minChars - answer.length} more needed)
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={onContinue}
          disabled={answer.length < q.minChars}
          className={`inline-flex items-center gap-2 px-6 py-3 bg-amber-400 text-slate-900 font-semibold rounded-lg transition-all duration-200 ${
            answer.length < q.minChars ? "opacity-40 cursor-not-allowed" : "hover:bg-amber-300"
          }`}
          aria-disabled={answer.length < q.minChars}
        >
          {isLast ? "Continue to Submit" : "Continue"}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          onClick={onBack}
          className="px-4 py-3 text-slate-400 hover:text-slate-200 font-medium transition-colors duration-200"
        >
          Back
        </button>
      </div>
    </div>
  );
}

function EmailState({
  email,
  emailError,
  apiError,
  onEmailChange,
  onSubmit,
  onBack,
}: {
  email: string;
  emailError: string | null;
  apiError: string | null;
  onEmailChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSubmit();
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <ProgressDots total={4} current={4} />
        <span className="font-mono text-xs text-slate-500 tracking-wider">4 / 4</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <span className="inline-block w-6 h-px bg-amber-400/50" />
        <span className="text-xs font-mono text-slate-400 tracking-widest uppercase">Comprehension Audit</span>
      </div>

      <h2
        className="font-bold text-slate-100 mb-3 leading-tight"
        style={{ fontSize: "clamp(1.5rem, 3.5vw, 2rem)", letterSpacing: "-0.02em" }}
      >
        Where should we send your report?
      </h2>

      <p
        className="text-slate-400 mb-8 leading-relaxed"
        style={{ fontSize: "1rem", lineHeight: "1.75" }}
      >
        Enter your work email address. Your comprehension report — including your maturity band,
        per-dimension breakdown, and interpretation — will be delivered to this address.
      </p>

      {apiError && (
        <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg" role="alert">
          <p className="font-mono text-xs text-red-400">{apiError}</p>
        </div>
      )}

      <div className="mb-2">
        <input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="you@company.com"
          autoComplete="email"
          className={`w-full bg-slate-900/50 border rounded-lg px-4 py-3 text-slate-100
            text-base transition-colors duration-200
            placeholder:text-slate-600 focus:outline-none
            ${emailError ? "border-red-500/50 focus:border-red-400" : "border-amber-400/20 focus:border-amber-400/60"}
          `}
          aria-label="Email address"
          aria-describedby={emailError ? "email-error" : undefined}
        />
      </div>
      {emailError && (
        <p id="email-error" className="font-mono text-xs text-red-400 mb-6" role="alert">
          {emailError}
        </p>
      )}
      {!emailError && <div className="mb-6" />}

      <div className="flex items-center gap-4">
        <button
          onClick={onSubmit}
          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-400 text-slate-900 font-semibold rounded-lg hover:bg-amber-300 transition-colors duration-200"
        >
          Submit for Scoring
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          onClick={onBack}
          className="px-4 py-3 text-slate-400 hover:text-slate-200 font-medium transition-colors duration-200"
        >
          Back
        </button>
      </div>

      <p className="font-mono text-xs text-slate-600 mt-6 leading-relaxed">
        Your responses are used only to generate your comprehension report. No spam.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
      <div className="relative mb-8">
        <div
          className="w-16 h-16 rounded-full border-2 border-amber-400/30"
          style={{ animation: "spin 2s linear infinite" }}
        />
        <div
          className="absolute inset-2 rounded-full border-t-2 border-amber-400"
          style={{ animation: "spin 1.2s linear infinite" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
        </div>
      </div>

      <p
        className="font-semibold text-slate-100 mb-2 text-center"
        style={{ fontSize: "1.125rem" }}
      >
        Scoring your responses…
      </p>
      <p className="font-mono text-xs text-slate-500 text-center tracking-wider">
        Evaluating 8 comprehension dimensions
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ResultState({
  result,
  dimensions,
  maturityBands,
}: {
  result: AuditResult;
  dimensions: Record<string, string>;
  maturityBands: Record<string, { name: string; oneLiner: string; description: string }>;
}) {
  const band = maturityBands[result.maturity_band];
  const strongestLabel = dimensions[result.strongest_dimension] ?? result.strongest_dimension;
  const weakestLabel = dimensions[result.weakest_dimension] ?? result.weakest_dimension;

  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-block w-8 h-px bg-amber-400/60" />
          <span className="text-xs font-mono text-slate-400 tracking-widest uppercase">Comprehension Audit — Results</span>
        </div>

        <div className="mb-2">
          <span className="font-mono text-sm text-amber-400/70 tracking-widest uppercase">
            {result.maturity_band}
          </span>
        </div>

        <h2
          className="font-bold text-slate-100 leading-tight mb-3"
          style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", letterSpacing: "-0.02em" }}
        >
          {result.maturity_band} —{" "}
          <span className="text-amber-400">{band?.name ?? result.maturity_band}</span>
        </h2>

        <p className="font-mono text-sm text-slate-400 mb-6 tracking-wide">
          {band?.oneLiner}
        </p>

        <ScoreBar score={result.raw_score} />
      </div>

      <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-6 sm:p-8">
        <p className="text-xs font-mono text-slate-400 tracking-widest uppercase mb-6">Dimension Breakdown</p>
        <div className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl mx-auto">
          <RadarChart
            dimensions={result.dimension_breakdown}
            dimensionLabels={dimensions}
            strongest={result.strongest_dimension}
            weakest={result.weakest_dimension}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-5 border-l-2 border-l-amber-400">
          <p className="font-mono text-xs text-amber-400 tracking-wider uppercase mb-2">
            Strongest Dimension
          </p>
          <p className="font-semibold text-slate-100 text-base">
            {strongestLabel}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="font-mono text-xs text-slate-400">
              Score: {((result.dimension_breakdown[result.strongest_dimension] ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-5 border-l-2 border-l-sky-400">
          <p className="font-mono text-xs text-sky-400 tracking-wider uppercase mb-2">
            Growth Opportunity
          </p>
          <p className="font-semibold text-slate-100 text-base">
            {weakestLabel}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0" />
            <span className="font-mono text-xs text-slate-400">
              Score: {((result.dimension_breakdown[result.weakest_dimension] ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-6 sm:p-8">
        <p className="text-xs font-mono text-slate-400 tracking-widest uppercase mb-4">Interpretation</p>
        <p
          className="text-slate-300 leading-relaxed max-w-prose"
          style={{ fontSize: "1rem", lineHeight: "1.8" }}
        >
          {band?.description}
        </p>
      </div>

      <div className="flex items-start gap-3 px-4 py-3 bg-amber-400/5 border border-amber-400/20 rounded-lg">
        <svg
          className="flex-shrink-0 mt-0.5"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" className="text-amber-400" />
          <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-amber-400" />
        </svg>
        <p className="font-mono text-xs text-slate-400 leading-relaxed">
          Your full comprehension report has been sent to your email.
        </p>
      </div>
    </div>
  );
}
