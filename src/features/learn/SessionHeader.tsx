import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ArrowLeft } from 'lucide-react';
import { Numeral } from '@/components/ui/Numeral';

interface SessionHeaderProps {
  /** "40–49" */
  label: string;
  /** "Pass 1 of 2" */
  pass: string;
  position: number;
  /** Null for a pass that has no end, where the count stands on its own. */
  total: number | null;
  onExit: () => void;
}

/**
 * Leaving is always one tap away. A half-finished block keeps nothing, so there
 * is no confirmation to click through either.
 */
export function SessionHeader({ label, pass, position, total, onExit }: SessionHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 48 }}>
      <ButtonBase
        onClick={onExit}
        aria-label="Back to blocks"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          minHeight: 48,
          pr: 1,
          borderRadius: 1,
          color: 'text.secondary',
        }}
      >
        <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
        <Typography component="span" variant="body2">
          Blocks
        </Typography>
      </ButtonBase>

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'baseline',
          gap: 1,
        }}
      >
        <Numeral size={14} weight={600}>
          {label}
        </Numeral>
        <Typography variant="body2" color="text.secondary">
          {pass}
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary">
        <Numeral weight={600} color="inherit">
          {position}
        </Numeral>
        {/* A bare number would be an unlabelled number on screen. When there is
            no total to measure it against, the word has to do that job. */}
        {total === null ? ' answered' : ' of '}
        {total === null ? null : <Numeral color="inherit">{total}</Numeral>}
      </Typography>
    </Box>
  );
}
