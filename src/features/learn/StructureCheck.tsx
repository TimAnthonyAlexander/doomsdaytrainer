import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Numeral } from '@/components/ui/Numeral';
import { codeFor, formatYear } from '@/domain/yearCodes';
import { structureExamples, type StructureExample } from './blocks';

interface StructureCheckProps {
  /** The decade just finished. The examples come from years already learned. */
  decade: number;
  onDone: () => void;
}

/** "Year 41 has code 2, and year 42 has code 3." Both numbers of both pairs named. */
function Pair({ example }: { example: StructureExample }) {
  return (
    <Typography variant="body1">
      {'Year '}
      <Numeral color="inherit">{formatYear(example.from)}</Numeral>
      {' has code '}
      <Numeral color="inherit">{codeFor(example.from)}</Numeral>
      {'. Year '}
      <Numeral color="inherit">{formatYear(example.to)}</Numeral>
      {' has code '}
      <Numeral color="inherit">{codeFor(example.to)}</Numeral>
      {'.'}
    </Typography>
  );
}

/**
 * The +1/+2 structure, shown once, after a decade has been learned.
 *
 * Two isolated pairs and no run. Placed after rather than before, and that
 * placement is the whole design: shown first it becomes the route the ten are
 * produced by, and a route that starts at the first year of a decade is the
 * thing this app spent a rewrite getting out of. Shown last it can only be an
 * explanation of a table the user already has, and a way to check one answer
 * they are unsure of.
 */
export function StructureCheck({ decade, onDone }: StructureCheckProps) {
  const { rise, jump } = structureExamples(decade);

  return (
    <>
      <Box>
        <Typography variant="h2" sx={{ fontSize: 22, fontWeight: 500 }}>
          How the codes step
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          You have the ten. Here is what they were doing while you learned them.
        </Typography>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Inside a run of four years
        </Typography>
        <Pair example={rise} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          One higher. A common year is <Numeral color="inherit">365</Numeral> days, which is{' '}
          <Numeral color="inherit">52</Numeral> weeks and <Numeral color="inherit">1</Numeral> day
          over, so the same date lands one weekday later next year.
        </Typography>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Across a leap year
        </Typography>
        <Pair example={jump} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Two higher. Year <Numeral color="inherit">{formatYear(jump.to)}</Numeral> is a leap year,
          so it is <Numeral color="inherit">366</Numeral> days, and the extra day moves the date on
          twice.
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary">
        This is for checking an answer you have already given, not for finding one. Counting up from
        the start of a decade does get there, slowly, and it stops working the moment nobody hands
        you a year to start from.
      </Typography>

      <Box>
        <Button variant="contained" onClick={onDone}>
          Continue
        </Button>
      </Box>
    </>
  );
}
