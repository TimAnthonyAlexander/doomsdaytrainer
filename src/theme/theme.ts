import { createTheme } from '@mui/material/styles';
import type { Shadows, Theme } from '@mui/material/styles';
import {
  colorTokens,
  duration,
  easing,
  fontFamily,
  fontWeight,
  radius,
  typeScale,
  type ThemeMode,
} from './tokens';

/**
 * The MUI theme, built per mode from `./tokens.ts`.
 *
 * Dark is the default and light is the alternative, which is the opposite of
 * what this file used to say. Both modes now have a full token set, a measured
 * mastery ramp and their own grading colours, so the reason for shipping one
 * surface is gone.
 *
 * Values are real hex here rather than `var(--token)` references: MUI runs
 * `alpha()` and `lighten()` over palette entries and cannot parse a custom
 * property. The two are the same numbers from the same file, so a component can
 * mix `color="primary"` and `var(--brand-deep)` without drifting.
 */

export const monoFontFamily = fontFamily.mono;

/**
 * Elevation is flat. STYLEGUIDE.md §6 allows exactly one shadow in the app, the
 * hairline above the keypad, and that is drawn by the keypad rather than by
 * MUI's elevation scale. Every step of the scale is 'none' so a stray
 * `elevation={8}` cannot reintroduce a drop shadow.
 */
const FLAT = Array.from({ length: 25 }, () => 'none') as unknown as Shadows;

/** A §3 step as MUI typography. */
function step(name: keyof typeof typeScale) {
  const value = typeScale[name];
  return {
    fontFamily: fontFamily[value.family],
    fontSize: value.size,
    fontWeight: value.weight,
    letterSpacing: value.tracking,
    lineHeight: value.lineHeight,
  };
}

export function buildTheme(mode: ThemeMode): Theme {
  const t = colorTokens[mode];

  return createTheme({
    palette: {
      mode,
      primary: {
        main: t['brand-deep'],
        light: t['brand-light'],
        dark: t['brand-on-tint'],
        contrastText: t['text-inverse'],
      },
      secondary: {
        main: t.brand,
        light: t['brand-light'],
        dark: t['brand-deep'],
        contrastText: t['text-inverse'],
      },
      // The four grading colours are the app's only non-brand hues, and §2
      // reserves them for the feedback flash and the latency histogram. They are
      // wired up here so MUI's status colours cannot fall back to its own blue
      // and amber, not as an invitation to use them for decoration.
      error: { main: t['grade-wrong'], light: t['grade-wrong-tint'], contrastText: t['text-inverse'] },
      warning: { main: t['grade-medium'], contrastText: t['text-inverse'] },
      success: { main: t['grade-fast'], light: t['grade-fast-tint'], contrastText: t['text-inverse'] },
      info: { main: t.brand, contrastText: t['text-inverse'] },
      background: { default: t.bg, paper: t['surface-2'] },
      text: { primary: t['text-primary'], secondary: t['text-secondary'], disabled: t['text-muted'] },
      divider: t.border,
      // The colours are opaque tokens, not translucent overlays: a hover state
      // is `--surface-1` and a selected state is `--brand-tint`, both of which
      // already sit at the right distance from the ground in each mode. The
      // opacity numbers are left at MUI's defaults because several components
      // add two of them together before handing the result to `alpha()`.
      action: {
        active: t['text-secondary'],
        hover: t['surface-1'],
        selected: t['brand-tint'],
        focus: t['brand-tint'],
        disabled: t['text-muted'],
        disabledBackground: t['surface-1'],
      },
    },

    // MUI's own 8px unit, left alone. §4's base is 4px and 8 is a multiple of
    // it, so `spacing(1)` is `--space-2`, `spacing(2)` is `--space-4` and the
    // half steps land on `--space-1` and `--space-3`. Repointing it at 4 would
    // silently halve every `p:` and `gap:` already written against it. Exact
    // values come from the `space` token, not from `spacing()`.

    // §5. Keys, buttons, inputs and selects. Cards set --radius-lg themselves.
    shape: { borderRadius: radius.md },

    shadows: FLAT,

    transitions: {
      duration: {
        shortest: duration.advance,
        shorter: duration.flash,
        short: duration.ui,
        standard: duration.ui,
        complex: duration.ui,
        enteringScreen: duration.ui,
        leavingScreen: duration.ui,
      },
      easing: {
        easeOut: easing.out,
        easeIn: easing.out,
        easeInOut: easing.out,
        sharp: easing.out,
      },
    },

    typography: {
      fontFamily: fontFamily.sans,
      fontSize: typeScale.body.size,
      // 400 and 500 are the only weights the app loads. Anything MUI asks for
      // beyond them would be synthesised into a fake bold.
      fontWeightLight: fontWeight.regular,
      fontWeightRegular: fontWeight.regular,
      fontWeightMedium: fontWeight.medium,
      fontWeightBold: fontWeight.medium,

      h1: step('title'),
      h2: step('heading'),
      h3: step('heading'),
      h4: step('heading'),
      h5: step('body'),
      h6: step('body'),
      subtitle1: step('heading'),
      subtitle2: step('label'),
      body1: step('body'),
      body2: step('label'),
      caption: step('caption'),
      overline: { ...step('caption'), textTransform: 'none' },
      button: { ...step('body'), fontWeight: fontWeight.medium, textTransform: 'none' },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: mode },
          body: {
            backgroundColor: t.bg,
            color: t['text-primary'],
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'optimizeLegibility',
          },
          '::selection': { backgroundColor: t['brand-tint'], color: t['brand-on-tint'] },
        },
      },

      // §7. No ripple anywhere: it is a 550ms animation on the one control the
      // app times to the millisecond. §11. The focus ring is a 2px brand outline
      // at 2px offset and is never removed, so it is set on the base rather than
      // on each control that might forget it.
      MuiButtonBase: {
        defaultProps: { disableRipple: true, disableTouchRipple: true },
        styleOverrides: {
          root: {
            '&:focus-visible': {
              outline: `2px solid ${t.brand}`,
              outlineOffset: 2,
            },
          },
        },
      },

      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: t['surface-2'],
            border: `1px solid ${t.border}`,
            borderRadius: radius.lg,
          },
        },
      },

      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            textTransform: 'none',
            minHeight: 44,
            paddingInline: 16,
            borderRadius: radius.md,
            // §8: the tap produces a state, not an animation. Nothing scales.
            transform: 'none',
            '&:active': { transform: 'none' },
          },
          sizeSmall: { minHeight: 36, paddingInline: 12, fontSize: typeScale.label.size },
          contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
          outlined: { borderColor: t['border-strong'] },
          text: { '&:hover': { backgroundColor: t['surface-1'] } },
        },
      },

      // MUI ships a 38px switch and a 30px slider, both under the 44px §11 asks
      // for. The padding around each grows to reach it; the track, the thumb and
      // the checked offset are untouched.
      MuiSwitch: {
        styleOverrides: {
          root: { width: 58, height: 48, padding: '17px 12px' },
          switchBase: { padding: '14px 9px' },
        },
      },
      MuiSlider: { styleOverrides: { root: { paddingBlock: 22 } } },

      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            minHeight: 44,
            borderRadius: radius.md,
            borderColor: t.border,
            color: t['text-secondary'],
            '&.Mui-selected': { backgroundColor: t['brand-tint'], color: t['brand-on-tint'] },
            '&.Mui-selected:hover': { backgroundColor: t['brand-tint'] },
          },
        },
      },

      MuiTab: { styleOverrides: { root: { textTransform: 'none', minHeight: 44 } } },
      MuiDivider: { styleOverrides: { root: { borderColor: t.border } } },
      MuiDialog: {
        defaultProps: { transitionDuration: duration.ui },
        styleOverrides: { paper: { borderRadius: radius.lg } },
      },
      MuiTooltip: { defaultProps: { enterDelay: 400 } },

      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: radius.md },
          notchedOutline: { borderColor: t.border },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 6, borderRadius: radius.pill, backgroundColor: t['surface-1'] },
          bar: { borderRadius: radius.pill, backgroundColor: t.brand },
        },
      },
    },
  });
}

/**
 * The default theme. Dark, per STYLEGUIDE.md §2, and what a component rendered
 * outside `ThemeModeProvider` gets. Runtime mode switching goes through the
 * provider, not through this.
 */
export const theme = buildTheme('dark');
