import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { BarChart3, BookOpen, CalendarDays, Repeat, Settings, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Numeral } from '@/components/ui/Numeral';
import { space, stroke, typeScale } from '@/theme/tokens';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'Review', icon: Repeat },
  { path: '/learn', label: 'Learn', icon: BookOpen },
  { path: '/drills', label: 'Drills', icon: Timer },
  { path: '/weekday', label: 'Weekday', icon: CalendarDays },
  { path: '/stats', label: 'Stats', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Screens that are reachable but deliberately kept out of the nav. They still
 * have to name themselves in the phone's top bar, or the bar calls them "Not
 * found" while the screen underneath works perfectly.
 */
const OFF_NAV_TITLES: Readonly<Record<string, string>> = {
  '/trouble': 'Trouble spots',
};

export const ICON_SIZE = 20;
export const ICON_STROKE = 1.75;

export function isNavActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** What the top bar calls the current screen. */
export function screenTitle(pathname: string): string {
  const item = NAV_ITEMS.find((entry) => isNavActive(pathname, entry.path));
  if (item) return item.label;
  return OFF_NAV_TITLES[pathname] ?? 'Not found';
}

interface BottomNavProps {
  /** Shown next to "Review" when above zero. A real number, not a badge dot. */
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
          gridTemplateColumns: `repeat(${NAV_ITEMS.length}, 1fr)`,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item.path);
          const Icon = item.icon;
          const count = item.path === '/' ? dueCount : 0;
          return (
            <ButtonBase
              key={item.path}
              component={RouterLink}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              sx={{
                minHeight: 'var(--nav-height)',
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
                  gap: `${space[1]}px`,
                }}
              >
                {item.label}
                {count > 0 ? (
                  <Numeral size={typeScale.caption.size} weight={500} color="var(--brand-deep)">
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
