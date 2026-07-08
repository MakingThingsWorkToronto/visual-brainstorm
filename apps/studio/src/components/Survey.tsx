import { useId } from 'react';

/**
 * Survey/forms module — the studio's reusable question surface. Generalizes the
 * single-question ConciergeIntake pattern (tappable answer pills + free text)
 * into a multi-question form, matching the winning intake design
 * (discussion/_completed/2026-07-06-2358-…/artifacts/concierge-living-gallery.svg,
 * panel 2 "As many questions as it takes"): each question is a label + a row of
 * tappable answers, single- or multi-select, one optionally accented as
 * recommended, with an optional free-text "other".
 *
 * Adapted from the donor's shadcn/Radix form primitives (@tradespath/ui —
 * Label / Checkbox / Input) but hand-rolled on the studio's Tailwind pill idiom
 * (the studio mirrors shadcn rather than importing it; .agents/learnings.md).
 *
 * Controlled: the parent owns `answers` and composes them (see `surveyWords`).
 */

export type SurveyQuestion = {
  id: string;
  question: string;
  /** Tappable answer options. */
  options: string[];
  /** Multi-select (checkbox semantics); default single (radio semantics). */
  multi?: boolean;
  /** One option accented + badged as the recommendation (the artifact's ribbon). */
  recommended?: string;
  /** Show a free-text "other" input (default true). */
  allowOther?: boolean;
};

export type SurveyAnswer = { picked: string[]; other: string };
export type SurveyAnswers = Record<string, SurveyAnswer>;

const EMPTY: SurveyAnswer = { picked: [], other: '' };

const answerOf = (answers: SurveyAnswers, id: string): SurveyAnswer => answers[id] ?? EMPTY;

/**
 * Flatten answers to display words in question order — picked options first,
 * then trimmed "other" text. The compose-to-brief source for the intake panel.
 */
export function surveyWords(questions: SurveyQuestion[], answers: SurveyAnswers): string[] {
  const words: string[] = [];
  for (const q of questions) {
    const a = answerOf(answers, q.id);
    words.push(...a.picked);
    const other = a.other.trim();
    if (other) words.push(other);
  }
  return words;
}

export function Survey({
  questions,
  answers,
  onChange,
}: {
  questions: SurveyQuestion[];
  answers: SurveyAnswers;
  onChange: (answers: SurveyAnswers) => void;
}) {
  const set = (id: string, next: SurveyAnswer) => onChange({ ...answers, [id]: next });

  const pick = (q: SurveyQuestion, option: string) => {
    const a = answerOf(answers, q.id);
    if (q.multi) {
      const picked = a.picked.includes(option)
        ? a.picked.filter((o) => o !== option)
        : [...a.picked, option];
      set(q.id, { ...a, picked });
    } else {
      // Single-select: toggle off if re-tapped, else replace.
      set(q.id, { ...a, picked: a.picked[0] === option ? [] : [option] });
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="survey">
      {questions.map((q) => (
        <SurveyField
          key={q.id}
          question={q}
          answer={answerOf(answers, q.id)}
          onPick={(option) => pick(q, option)}
          onOther={(other) => set(q.id, { ...answerOf(answers, q.id), other })}
        />
      ))}
    </div>
  );
}

/** One question: label + tappable answer pills + optional free-text "other". */
function SurveyField({
  question,
  answer,
  onPick,
  onOther,
}: {
  question: SurveyQuestion;
  answer: SurveyAnswer;
  onPick: (option: string) => void;
  onOther: (other: string) => void;
}) {
  const otherId = useId();
  const allowOther = question.allowOther ?? true;

  return (
    <fieldset
      className="rounded-2xl border border-line bg-surface p-4"
      data-testid="survey-field"
      data-question={question.id}
    >
      <legend className="px-1 text-sm font-semibold">{question.question}</legend>
      <div
        role={question.multi ? 'group' : 'radiogroup'}
        aria-label={question.question}
        className="mt-2 flex flex-wrap gap-2"
      >
        {question.options.map((option) => {
          const selected = answer.picked.includes(option);
          const recommended = option === question.recommended;
          return (
            <button
              key={option}
              type="button"
              role={question.multi ? 'checkbox' : 'radio'}
              aria-checked={selected}
              onClick={() => onPick(option)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                selected
                  ? 'border-accent bg-accent/15 text-accent'
                  : recommended
                    ? 'border-accent/60 text-ink hover:bg-accent/10'
                    : 'border-line text-ink-dim hover:border-accent hover:text-ink'
              }`}
            >
              {option}
              {recommended && !selected && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-white">
                  pick
                </span>
              )}
            </button>
          );
        })}
      </div>
      {allowOther && (
        <input
          id={otherId}
          value={answer.other}
          onChange={(e) => onOther(e.target.value)}
          placeholder="or your own…"
          className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      )}
    </fieldset>
  );
}
