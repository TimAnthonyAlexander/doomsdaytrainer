import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useRef } from 'react';
import { Link as RouterLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  BottomNav,
  DUE_COUNT_PATH,
  ICON_SIZE,
  ICON_STROKE,
  NAV_ITEMS,
  isNavActive,
  screenTitle,
} from './BottomNav';
import { Numeral } from '@/components/ui/Numeral';
import { dueItems } from '@/domain/scheduler';
import { resolveScope } from '@/domain/scope';
import { AppChrome } from '@/features/pwa';
import { useAppState } from '@/state/useAppState';
import { SCREEN_PADDING_X, radius, space, stroke } from '@/theme/tokens';

/** The answer pad as a mark: three, three, one. Same shape as the favicon. */
function Mark({ size = 20 }: { size?: number }) {
  const cells = [
    [8, 8],
    [38, 8],
    [68, 8],
    [8, 38],
    [38, 38],
    [68, 38],
    [38, 68],
  ];
  return (
    <Box
      component="svg"
      viewBox="0 0 100 100"
      sx={{ width: size, height: size, flexShrink: 0, color: 'var(--brand-deep)' }}
      aria-hidden
    >
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={24} height={24} rx={7} fill="currentColor" />
      ))}
    </Box>
  );
}

function useDueCount(): number {
  const { settings, itemList } = useAppState();
  return useMemo(
    () => dueItems(itemList, resolveScope(settings), Date.now()).length,
    [settings, itemList],
  );
}

/**
 * The app frame. On phones, a slim top bar naming the current screen and a
 * bottom bar; from 900px up, a left rail instead of both. The only line drawn
 * anywhere is a 1px rule between the frame and the content.
 *
 * A frame, not a page: it is exactly one viewport tall and never scrolls, and
 * `main` is the only thing inside it that moves. That is what makes the notice
 * bar cheap. When the shell was `minHeight: 100dvh` with the bar above it, a
 * "new version is ready" line added its own height to a full viewport, so the
 * document grew past the window, a scrollbar appeared on desktop and shifted
 * the centred column sideways, and every screen gained 52px of scroll it did
 * not have a second earlier. Now the bar takes its height out of the scroll
 * area and the rail, the title bar and the bottom bar do not move at all.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const { settings } = useAppState();
  const dueCount = useDueCount();
  const mainRef = useRef<HTMLElement>(null);

  const title = screenTitle(pathname);

  // The window no longer scrolls, so neither the browser nor the router has
  // anything to restore. Without this, arriving on a short screen from a long
  // one starts halfway down it.
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [pathname]);

  if (!settings.onboardingComplete) {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <Box
      sx={{
        height: '100dvh',
        overflow: 'hidden',
        display: 'flex',
        pl: 'var(--safe-left)',
        pr: 'var(--safe-right)',
        bgcolor: 'var(--bg)',
      }}
    >
      <Box
        component="nav"
        aria-label="Main"
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          gap: '2px',
          width: 236,
          flexShrink: 0,
          // Full height by being a flex item of a frame that is exactly one
          // viewport tall, so it needs neither `sticky` nor a height of its own.
          overflowY: 'auto',
          px: `${space[2]}px`,
          py: `${space[5]}px`,
          borderRight: stroke.hairline,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: `${space[3]}px`,
            px: `${space[3]}px`,
            mb: `${space[5]}px`,
          }}
        >
          <Mark size={22} />
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            Doomsday
          </Typography>
        </Box>

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
                minHeight: 44,
                px: `${space[3]}px`,
                borderRadius: `${radius.md}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: `${space[3]}px`,
                color: active ? 'var(--brand-on-tint)' : 'var(--text-secondary)',
                bgcolor: active ? 'var(--brand-tint)' : 'transparent',
                '&:hover': { bgcolor: active ? 'var(--brand-tint)' : 'var(--surface-1)' },
              }}
            >
              <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
              <Typography
                component="span"
                variant="body1"
                sx={{ fontWeight: active ? 500 : 400, flex: 1, textAlign: 'left' }}
              >
                {item.label}
              </Typography>
              {count > 0 ? (
                <Numeral
                  size={14}
                  weight={500}
                  color={active ? 'var(--brand-on-tint)' : 'var(--text-secondary)'}
                >
                  {count}
                </Numeral>
              ) : null}
            </ButtonBase>
          );
        })}
      </Box>

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          // One place for the top inset, so the title bar and the notice bar
          // cannot disagree about which of them clears the notch.
          pt: 'var(--safe-top)',
        }}
      >
        <Box
          component="header"
          sx={{
            // Phones only. The rail already names the current destination, so a
            // desktop top bar would put the same word on screen three times.
            display: { xs: 'block', md: 'none' },
            flexShrink: 0,
            bgcolor: 'var(--bg)',
            borderBottom: stroke.hairline,
          }}
        >
          <Box
            sx={{
              // Same 560px column as Screen, so the bar's name sits directly
              // above the page's h1 instead of drifting to the window edge.
              width: '100%',
              maxWidth: 560,
              mx: 'auto',
              height: 'var(--bar-height)',
              display: 'flex',
              alignItems: 'center',
              gap: `${space[3]}px`,
              px: `${SCREEN_PADDING_X}px`,
            }}
          >
            <Mark size={18} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {title}
            </Typography>
          </Box>
        </Box>

        {/* Between the title bar and the content, and inside the same column,
            so a notice lines up with the page's left edge rather than the
            window's and never sits over the rail. */}
        <AppChrome />

        <Box
          component="main"
          ref={mainRef}
          sx={{
            // The one scroller in the app. `minHeight: 0` is what lets it be
            // shorter than its content instead of growing the frame.
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Outlet />
        </Box>

        <BottomNav dueCount={dueCount} />
      </Box>
    </Box>
  );
}
