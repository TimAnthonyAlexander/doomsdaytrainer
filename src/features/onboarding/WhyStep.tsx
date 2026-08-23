import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { PageTitle } from '@/components/ui/PageTitle';
import { Numeral } from '@/components/ui/Numeral';
import { formatYear } from '@/domain/yearCodes';
import { palette } from '@/theme/palette';
import { EXAMPLE_YEAR, derivation } from './onboardingModel';

/**
 * The one screen in the flow that is allowed to be about arithmetic. Every
 * number in the worked example is computed, `code` through `deriveCode`, so the
 * example and the shipped table cannot disagree.
 */
export function WhyStep() {
  const { yy, leaps, sum, code } = derivation(EXAMPLE_YEAR);
  const year = formatYear(yy);

  const lines = [
    `${year} + floor(${year} / 4)`,
    `= ${year} + ${leaps}`,
    `= ${sum}`,
  ];

  return (
    <>
      <PageTitle>Where the year codes come from</PageTitle>
      <Typography variant="body1" color="text.secondary">
        Nothing in the table is arbitrary. Every year shifts the calendar one weekday forward, and
        every leap year that has passed shifts it one more. Add those up and take the remainder
        after dividing by seven.
      </Typography>

      <Numeral size={19} weight={600} sx={{ display: 'block', py: 1 }}>
        (YY + floor(YY / 4)) mod 7
      </Numeral>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {lines.map((line) => (
          <Numeral key={line} size={15} color={palette.inkMuted} lineHeight={1.4}>
            {line}
          </Numeral>
        ))}
        <Numeral size={15} weight={600} color={palette.brandDeep} lineHeight={1.4}>
          {`${sum} mod 7 = ${code}`}
        </Numeral>
      </Box>

      <Typography variant="body1" color="text.secondary">
        The table gives <Numeral weight={600} color={palette.ink}>{code}</Numeral> for{' '}
        <Numeral weight={600} color={palette.ink}>{year}</Numeral> too. You could derive all
        hundred this way, and the Calc screen teaches you how. It costs a few seconds each time
        though, and the year code is one of four numbers a date needs, so it is worth knowing
        outright.
      </Typography>
    </>
  );
}
