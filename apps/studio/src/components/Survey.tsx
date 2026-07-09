import { useId } from 'react';
import type { SurveyQuestion } from '@visual-brainstorm/protocol';

// The question SHAPE is protocol-owned (it rides the open_studio handoff on
// SeedBrief.questions); re-exported here so the studio's survey module stays the
// one import site for everything survey-related.
export type { SurveyQuestion };

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

export type SurveyAnswer = { picked: string[]; other: string };
export type SurveyAnswers = Record<string, SurveyAnswer>;

const EMPTY: SurveyAnswer = { picked: [], other: '' };

export const answerOf = (answers: SurveyAnswers, id: string): SurveyAnswer => answers[id] ?? EMPTY;

/** Pure: toggle an option (multi = checkbox add/remove; single = radio replace/clear). */
export function pickAnswer(
  answers: SurveyAnswers,
  q: SurveyQuestion,
  option: string,
): SurveyAnswers {
  const a = answerOf(answers, q.id);
  const picked = q.multi
    ? a.picked.includes(option)
      ? a.picked.filter((o) => o !== option)
      : [...a.picked, option]
    : a.picked[0] === option
      ? []
      : [option];
  return { ...answers, [q.id]: { ...a, picked } };
}

/** Pure: set the free-text "other" for a question. */
export function setOtherAnswer(answers: SurveyAnswers, id: string, other: string): SurveyAnswers {
  return { ...answers, [id]: { ...answerOf(answers, id), other } };
}

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

/**
 * One question's INNER controls: tappable answer pills + optional free-text
 * "other". The box shell (title, collapse) is the caller's shared Box, so a
 * survey question sits in the exact same container as every other intake box.
 */
export function SurveyField({
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
    <div data-testid="survey-field" data-question={question.id}>
      <div
        role={question.multi ? 'group' : 'radiogroup'}
        aria-label={question.question}
        className="flex flex-wrap gap-2"
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
    </div>
  );
}
