import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { space } from '@/theme/tokens';

interface PageTitleProps {
  children: ReactNode;
  /** One plain line under the title. Omit it rather than padding it out. */
  subtitle?: ReactNode;
}

/** `--type-title` over `--type-body`. Sentence case, no terminal punctuation. */
export function PageTitle({ children, subtitle }: PageTitleProps) {
  return (
    <Box>
      <Typography variant="h1" component="h1">
        {children}
      </Typography>
      {subtitle ? (
        <Typography
          variant="body1"
          sx={{ color: 'var(--text-secondary)', mt: `${space[1]}px` }}
        >
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}
