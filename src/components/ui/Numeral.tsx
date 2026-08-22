import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { fontFamily } from '@/theme/tokens';

/** 400 or 500. 600 is accepted so existing call sites compile, and is read as 500. */
export type NumeralWeight = 400 | 500 | 600;

interface NumeralProps {
  children: ReactNode;
  /** CSS font-size. Numbers are treated as px. */
  size?: number | string;
  weight?: NumeralWeight;
  color?: string;
  /** Defaults to 1 so large numerals sit on their own optical baseline. */
  lineHeight?: number;
  sx?: SxProps<Theme>;
}

/**
 * Every numeral in the app renders through here.
 *
 * Not a stylistic choice: the seven-button pad and the year prompt must keep
 * identical glyph widths between renders, so figures are monospaced and
 * tabular. A proportional "1" next to a "0" would shift the pad under the thumb
 * mid-session.
 *
 * Only 400 and 500 are loaded. A call site asking for 600 is mapped down rather
 * than left to the browser, which would answer with a synthesised bold — a
 * smeared, slightly wider digit, which is exactly what tabular figures exist to
 * prevent. Those call sites are sweep targets; the mapping is the stopgap.
 */
export function Numeral({
  children,
  size = 'inherit',
  weight = 400,
  color = 'inherit',
  lineHeight = 1,
  sx,
}: NumeralProps) {
  return (
    <Box
      component="span"
      sx={[
        {
          fontFamily: fontFamily.mono,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum" 1, "zero" 1',
          fontSize: size,
          fontWeight: weight === 400 ? 400 : 500,
          lineHeight,
          color,
          letterSpacing: 0,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
