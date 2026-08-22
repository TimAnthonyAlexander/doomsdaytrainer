import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { space } from '@/theme/tokens';

interface EmptyStateProps {
  icon: LucideIcon;
  /** One line, plain and specific. "Next review in 4 hours." */
  children: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, children, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: `${space[4]}px`,
        py: `${space[7]}px`,
      }}
    >
      <Icon size={24} strokeWidth={1.75} color="var(--text-muted)" aria-hidden />
      <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>
        {children}
      </Typography>
      {action}
    </Box>
  );
}
