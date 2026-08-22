import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useEffect, useState, type FormEvent } from 'react';
import { useAnswerTimer } from '@/components/answer/useAnswerTimer';
import { fontFamily, radius, space, typeScale } from '@/theme/tokens';

interface NumberInputProps {
  /** What the number being typed is. Sits above the field, never omitted. */
  label: string;
  /** Changing this restarts the latency clock and empties the field. */
  promptKey: string | number;
  /** Largest answer this question can have. Caps the digits the field takes. */
  max: number;
  onAnswer: (value: number, latencyMs: number) => void;
  disabled?: boolean;
  /** Paints the field after a wrong answer. Cleared by the next prompt. */
  wrong?: boolean;
  /**
   * Drops the label above the field, keeping it as the accessible name. For a
   * caller that has already named the number immediately above — the Concept
   * walk prints it on the row being answered — a second copy is one more thing
   * to read past on the way to the thing being answered.
   */
  labelHidden?: boolean;
}

/**
 * The input for answers the seven-button pad cannot take.
 *
 * The pad is exactly seven buttons in fixed positions, and that is the reason
 * it is fast: the thumb learns where 0-6 live and stops reading. Leap-day
 * counts run to 24, sums to 123 and reduced years to 27, so there is no
 * seven-option set to lay out. Building a second pad with a different number of
 * keys would put something that looks like the answer pad, and moves, in the
 * same place on screen — which would cost the real pad the position memory it
 * depends on. So arithmetic answers are typed, and only codes are tapped.
 */
export function NumberInput({
  label,
  promptKey,
  max,
  onAnswer,
  disabled = false,
  wrong = false,
  labelHidden = false,
}: NumberInputProps) {
  const [value, setValue] = useState('');
  const timer = useAnswerTimer(promptKey);
  const digits = String(Math.max(1, max)).length;

  // Callers fold their wrong-answer count into `promptKey`, so this also empties
  // the field for a retry: the second attempt is typed, not edited.
  useEffect(() => {
    setValue('');
  }, [promptKey]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || value === '') return;
    // The prompt has not been painted yet, so this cannot be an answer to it.
    if (!timer.running()) return;
    onAnswer(Number(value), timer.elapsedMs());
  };

  return (
    <Box
      component="form"
      onSubmit={submit}
      sx={{ display: 'flex', flexDirection: 'column', gap: `${space[2]}px` }}
    >
      {labelHidden ? null : (
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {label}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: `${space[3]}px`, alignItems: 'stretch' }}>
        <Box
          // Remounted per prompt so the focus lands on the new question without
          // a ref, and so the browser never restores the previous answer.
          key={promptKey}
          component="input"
          autoFocus
          inputMode="numeric"
          autoComplete="off"
          aria-label={label}
          disabled={disabled}
          maxLength={digits}
          value={value}
          onChange={(event: { target: { value: string } }) =>
            setValue(event.target.value.replace(/\D/g, '').slice(0, digits))
          }
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 56,
            px: `${space[4]}px`,
            bgcolor: 'var(--surface-2)',
            color: 'var(--text-primary)',
            border: `1px solid ${wrong ? 'var(--grade-wrong)' : 'var(--border-strong)'}`,
            borderRadius: `${radius.md}px`,
            fontFamily: fontFamily.mono,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 28,
            letterSpacing: typeScale.stat.tracking,
            outline: 'none',
            '&:focus-visible': { outline: '2px solid var(--brand)', outlineOffset: 2 },
          }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={disabled || value === ''}
          sx={{ minHeight: 56, px: `${space[5]}px` }}
        >
          Check
        </Button>
      </Box>
    </Box>
  );
}
