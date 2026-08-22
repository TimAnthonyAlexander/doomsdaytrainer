import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { Numeral } from '@/components/ui/Numeral';
import { decadeLabel, type DailyAllowance, type DecadeBlock } from './blocks';

interface BlockDoneProps {
  decade: number;
  /** How many of the ten were genuinely new. */
  introduced: number;
  wrongTaps: number;
  next: DecadeBlock | null;
  allowance: DailyAllowance;
  onStart: (decade: number) => void;
  onExit: () => void;
}

function Taps({ count }: { count: number }) {
  if (count === 0) return <>no wrong taps</>;
  return (
    <>
      <Numeral color="inherit">{count}</Numeral>
      {count === 1 ? ' wrong tap' : ' wrong taps'}
    </>
  );
}

/** What happened, in one line. No badge, no score, no congratulations. */
export function BlockDone({
  decade,
  introduced,
  wrongTaps,
  next,
  allowance,
  onStart,
  onExit,
}: BlockDoneProps) {
  return (
    <>
      <Box>
        <Numeral size={20} weight={600}>
          {decadeLabel(decade)}
        </Numeral>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          {introduced === 0 ? (
            <>
              {'Already in the queue. '}
              <Taps count={wrongTaps} />
              {'.'}
            </>
          ) : (
            <>
              <Numeral color="inherit">{introduced}</Numeral>
              {introduced === 1 ? ' code now in the queue, ' : ' codes now in the queue, '}
              <Taps count={wrongTaps} />
              {'.'}
            </>
          )}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {next && allowance.canStart ? (
          <Button variant="contained" onClick={() => onStart(next.decade)}>
            Start&nbsp;
            <Numeral size={15} weight={600} color="inherit">
              {next.label}
            </Numeral>
          </Button>
        ) : null}
        <Button component={RouterLink} to="/year-codes/revise" variant="outlined">
          Go to Revise
        </Button>
        <Button onClick={onExit} color="inherit" sx={{ color: 'text.secondary' }}>
          Blocks
        </Button>
      </Box>

      {next && !allowance.canStart ? (
        <Typography variant="body2" color="text.secondary">
          {allowance.message}
        </Typography>
      ) : null}
    </>
  );
}
