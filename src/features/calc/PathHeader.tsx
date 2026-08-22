import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { ArrowLeft } from 'lucide-react';
import { Numeral } from '@/components/ui/Numeral';
import { space } from '@/theme/tokens';

interface PathHeaderProps {
  /** What the user is inside, e.g. "Learn the method". */
  title: string;
  /** Where they are inside it, e.g. "Add the leap days". Optional. */
  detail?: string;
  position?: number;
  total?: number;
  onBack: () => void;
}

/** Leaving is one tap, and nothing here is stored part-finished. */
export function PathHeader({ title, detail, position, total, onBack }: PathHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: `${space[3]}px`, minHeight: 48 }}>
      <ButtonBase
        onClick={onBack}
        aria-label="Back to calculation"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: `${space[2]}px`,
          minHeight: 48,
          pr: `${space[2]}px`,
          borderRadius: `${space[2]}px`,
          color: 'var(--text-secondary)',
        }}
      >
        <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
        <Typography component="span" variant="body2">
          Calculate
        </Typography>
      </ButtonBase>

      <Box sx={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {detail ?? title}
        </Typography>
      </Box>

      {position !== undefined && total !== undefined ? (
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          <Numeral weight={500} color="inherit">
            {position}
          </Numeral>
          {' of '}
          <Numeral color="inherit">{total}</Numeral>
        </Typography>
      ) : null}
    </Box>
  );
}
