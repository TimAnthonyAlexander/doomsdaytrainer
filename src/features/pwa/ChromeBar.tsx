import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { palette } from '@/theme/palette';

interface ChromeBarProps {
  /** One or two plain sentences. No heading, no icon, no colour. */
  children: ReactNode;
  /** Buttons, right of the text on wide screens and below it on phones. */
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}

/**
 * The one piece of chrome this app draws around itself.
 *
 * A hairline rule and the ground colour, nothing else. It sits above the screen
 * rather than over it: a reload notice or a missed reminder must never take the
 * eye off the answer pad, and it must never take focus.
 */
export function ChromeBar({ children, action, onDismiss, dismissLabel = 'Dismiss' }: ChromeBarProps) {
  return (
    <Box
      role="status"
      sx={{
        width: '100%',
        bgcolor: 'background.default',
        borderBottom: `1px solid ${palette.rule}`,
      }}
    >
      <Box
        sx={{
          // The same 560px column the screens use, so the line starts on the
          // page's left edge rather than the window's.
          width: '100%',
          maxWidth: 560,
          mx: 'auto',
          px: { xs: '20px', sm: '32px' },
          py: 1.25,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
          {children}
        </Typography>

        {action ? (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexShrink: 0 }}>{action}</Box>
        ) : null}

        {onDismiss ? (
          <IconButton
            onClick={onDismiss}
            aria-label={dismissLabel}
            sx={{
              width: 40,
              height: 40,
              alignSelf: { xs: 'flex-end', sm: 'center' },
              color: 'text.secondary',
              flexShrink: 0,
            }}
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </IconButton>
        ) : null}
      </Box>
    </Box>
  );
}
