import ButtonBase from '@mui/material/ButtonBase';
import { Volume2, VolumeX } from 'lucide-react';
import { palette } from '@/theme/palette';

interface SoundToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Sound on or off, as one quiet control.
 *
 * It writes the same setting the Settings screen edits, so there is one value
 * and not two. Neutral ink in both states: it is not a control tapped during a
 * rep and it must not read as feedback, so it takes no brand colour and no
 * grading colour. Its label says which state it is in, because an icon that
 * flips between a speaker and a crossed speaker is ambiguous about whether it
 * shows the current state or the action.
 */
export function SoundToggle({ on, onChange }: SoundToggleProps) {
  return (
    <ButtonBase
      onClick={() => onChange(!on)}
      aria-label={on ? 'Spoken year is on. Turn it off.' : 'Spoken year is off. Turn it on.'}
      aria-pressed={on}
      sx={{
        minWidth: 44,
        minHeight: 44,
        borderRadius: 1,
        color: on ? palette.inkMuted : palette.inkFaint,
        '&:focus-visible': { outline: `2px solid ${palette.brand}`, outlineOffset: 2 },
      }}
    >
      {on ? (
        <Volume2 size={18} strokeWidth={1.75} aria-hidden />
      ) : (
        <VolumeX size={18} strokeWidth={1.75} aria-hidden />
      )}
    </ButtonBase>
  );
}
