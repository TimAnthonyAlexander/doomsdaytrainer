import Box from '@mui/material/Box';
import { palette } from '@/theme/palette';

interface StepIndicatorProps {
  /** 1-based. */
  current: number;
  total: number;
}

/**
 * Four short rules, the current one filled. No count, no dots: the position of
 * the filled rule already says which step this is.
 */
export function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <Box
      role="group"
      aria-label={`Step ${current} of ${total}`}
      sx={{ display: 'flex', gap: 0.75 }}
    >
      {Array.from({ length: total }, (_unused, index) => (
        <Box
          key={index}
          sx={{
            width: 26,
            height: 2,
            borderRadius: 1,
            bgcolor: index + 1 === current ? palette.brandDeep : palette.rule,
          }}
        />
      ))}
    </Box>
  );
}
