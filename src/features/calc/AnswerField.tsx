import { AnswerPad, type AnswerFeedback, type AnswerOption } from '@/components/answer/AnswerPad';
import { NumberInput } from './NumberInput';

const CODE_OPTIONS: AnswerOption[] = Array.from({ length: 7 }, (_unused, value) => ({
  value,
  label: String(value),
}));

interface AnswerFieldProps {
  /** True when the answer is a code, 0-6, and the seven-button pad can take it. */
  pad: boolean;
  /** What the number is. The pad needs no label; the typed field always shows one. */
  label: string;
  promptKey: string | number;
  /** Largest answer this question can have. Ignored by the pad. */
  max: number;
  onAnswer: (value: number, latencyMs: number) => void;
  disabled?: boolean;
  /** The last wrong answer at this question, or null. */
  wrong?: number | null;
  correct: number;
  keyboard?: boolean;
}

/**
 * One answer, taken by whichever control fits it.
 *
 * Codes go to the shared seven-button pad — the same component, the same seven
 * positions the review screen uses, so the muscle memory is one set and not
 * two. Everything else is typed. See `NumberInput` for why there is no second
 * pad.
 */
export function AnswerField({
  pad,
  label,
  promptKey,
  max,
  onAnswer,
  disabled = false,
  wrong = null,
  correct,
  keyboard = true,
}: AnswerFieldProps) {
  if (!pad) {
    return (
      <NumberInput
        label={label}
        promptKey={promptKey}
        max={max}
        onAnswer={onAnswer}
        disabled={disabled}
        wrong={wrong !== null}
      />
    );
  }

  const feedback: AnswerFeedback | null = wrong === null ? null : { chosen: wrong, correct };

  return (
    <AnswerPad
      options={CODE_OPTIONS}
      onAnswer={onAnswer}
      // Callers fold their wrong-answer count into `promptKey`. Without that the
      // pad would refuse the retry, since a wrong answer leaves the same
      // question on screen and the pad answers each key once.
      promptKey={promptKey}
      feedback={feedback}
      disabled={disabled}
      keyboard={keyboard}
    />
  );
}
