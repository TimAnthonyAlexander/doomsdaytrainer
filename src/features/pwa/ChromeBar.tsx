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
 *
 * A row of the shell's frame, so it must not be squeezed by the scroller beside
 * it — hence `flexShrink: 0`.
 */
export function ChromeBar({ children, action, onDismiss, dismissLabel = 'Dismiss' }: ChromeBarProps) {
  return (
    <Box
      role="status"
      sx={{
        width: '100%',
        flexShrink: 0,
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
          // A grid rather than a wrapping row, because the dismiss control has
          // to stay on the sentence's first line at every width. Stacked as a
          // column it dropped to a line of its own under the button on a phone,
          // which made a one-sentence notice three rows tall.
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr) auto',
            sm: 'minmax(0, 1fr) auto auto',
          },
          alignItems: 'center',
          columnGap: 1,
          rowGap: 1,
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ gridColumn: '1', gridRow: '1', minWidth: 0 }}
        >
          {children}
        </Typography>

        {action ? (
          <Box
            sx={{
              // Under the sentence on a phone, beside it from 600px up.
              gridColumn: { xs: '1', sm: '2' },
              gridRow: { xs: '2', sm: '1' },
              justifySelf: 'start',
              display: 'flex',
              gap: 1,
              alignItems: 'center',
            }}
          >
            {action}
          </Box>
        ) : null}

        {onDismiss ? (
          <IconButton
            onClick={onDismiss}
            aria-label={dismissLabel}
            sx={{
              gridColumn: { xs: '2', sm: '3' },
              gridRow: '1',
              width: 40,
              height: 40,
              color: 'text.secondary',
            }}
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </IconButton>
        ) : null}
      </Box>
    </Box>
  );
}
