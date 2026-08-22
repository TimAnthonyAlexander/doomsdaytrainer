import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { Link as RouterLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { BottomNav, ICON_SIZE, ICON_STROKE, NAV_ITEMS, isNavActive, screenTitle } from './BottomNav';
import { Numeral } from '@/components/ui/Numeral';
import { dueItems } from '@/domain/scheduler';
import { resolveScope } from '@/domain/scope';
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
 */
export function AppShell() {
  const { pathname } = useLocation();
  const { settings } = useAppState();
  const dueCount = useDueCount();

  const title = screenTitle(pathname);

  if (!settings.onboardingComplete) {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <Box
      sx={{
        minHeight: '100dvh',
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
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
          height: '100dvh',
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
          const count = item.path === '/' ? dueCount : 0;
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

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box
          component="header"
          sx={{
            // Phones only. The rail already names the current destination, so a
            // desktop top bar would put the same word on screen three times.
            display: { xs: 'block', md: 'none' },
            position: 'sticky',
            top: 0,
            zIndex: 2,
            bgcolor: 'var(--bg)',
            borderBottom: stroke.hairline,
            pt: 'var(--safe-top)',
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

        <Box
          component="main"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            pb: { xs: 'calc(var(--nav-height) + var(--safe-bottom))', md: 0 },
          }}
        >
          <Outlet />
        </Box>
      </Box>

      <BottomNav dueCount={dueCount} />
    </Box>
  );
}
