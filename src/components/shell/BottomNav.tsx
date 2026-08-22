import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { BarChart3, CalendarDays, Hash, Route, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Numeral } from '@/components/ui/Numeral';
import { space, stroke, typeScale } from '@/theme/tokens';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Five entries, and Concept is second because it is the one screen that says
 * what the other four are for: a date walked to its weekday, every step
 * answered. `Route` is the icon for the same reason — a path with stops on it,
 * which is what the screen is.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'Weekday', icon: CalendarDays },
  { path: '/concept', label: 'Concept', icon: Route },
  { path: '/year-codes', label: 'Year codes', icon: Hash },
  { path: '/stats', label: 'Stats', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Screens that name themselves, because the nav cannot name them.
 *
 * `isNavActive` matches the whole subtree under a path, which is what lights
 * one nav entry on all four year-code screens. Read for a title it gives the
 * wrong answer: the bar would say "Year codes" while the user is on Learn. So
 * this map is consulted first and a child always wins. A screen kept out of the
 * bar entirely needs an entry here too, or the bar calls it "Not found" while
 * it works perfectly.
 */
const SCREEN_TITLES: Readonly<Record<string, string>> = {
  '/year-codes/learn': 'Learn',
  '/year-codes/revise': 'Revise',
  '/year-codes/calc': 'Calc',
  '/year-codes/trouble': 'Trouble spots',
};

export const ICON_SIZE = 20;
export const ICON_STROKE = 1.75;

export function isNavActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** What the top bar calls the current screen. */
export function screenTitle(pathname: string): string {
  const named = SCREEN_TITLES[pathname];
  if (named) return named;
  const item = NAV_ITEMS.find((entry) => isNavActive(pathname, entry.path));
  return item?.label ?? 'Not found';
}

/** The one nav entry the due count belongs to. Codes are what fall due. */
export const DUE_COUNT_PATH = '/year-codes';

interface BottomNavProps {
  /** Shown next to "Year codes" when above zero. A real number, not a badge dot. */
  dueCount: number;
}

/**
 * Mobile navigation. Separated from the content by one 1px rule, nothing else:
 * no shadow, no blur, no floating pill.
 */
export function BottomNav({ dueCount }: BottomNavProps) {
  const { pathname } = useLocation();

  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        display: { xs: 'block', md: 'none' },
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: 2,
        bgcolor: 'var(--bg)',
        borderTop: stroke.hairline,
        pb: 'var(--safe-bottom)',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          // minmax(0, …) rather than 1fr: at five columns a 375px phone gives
          // each entry 67px of room, and "Year codes" with a two-digit due
          // count beside it is wider than that. A plain 1fr would let the
          // column grow to fit and push the whole bar past the viewport, so
          // the label gives way instead and the bar keeps its width.
          gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))`,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item.path);
          const Icon = item.icon;
          const count = item.path === DUE_COUNT_PATH ? dueCount : 0;
          return (
            <ButtonBase
              key={item.path}
              component={RouterLink}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              sx={{
                minHeight: 'var(--nav-height)',
                minWidth: 0,
                px: `${space[1]}px`,
                py: `${space[2]}px`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: `${space[1]}px`,
                // --brand-deep rather than --brand: at 11px the label has to
                // clear 4.5:1 on the page ground, and --brand does not in light
                // mode.
                color: active ? 'var(--brand-deep)' : 'var(--text-secondary)',
              }}
            >
              <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
              <Typography
                component="span"
                sx={{
                  fontSize: typeScale.caption.size,
                  fontWeight: active ? 500 : 400,
                  letterSpacing: typeScale.caption.tracking,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'center',
                  gap: `${space[1]}px`,
                  maxWidth: '100%',
                }}
              >
                <Box
                  component="span"
                  sx={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </Box>
                {/* The count never shrinks. A clipped label is still readable;
                    a clipped number is a different number. */}
                {count > 0 ? (
                  <Numeral
                    size={typeScale.caption.size}
                    weight={500}
                    color="var(--brand-deep)"
                    sx={{ flexShrink: 0 }}
                  >
                    {count}
                  </Numeral>
                ) : null}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
