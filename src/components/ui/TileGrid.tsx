import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import type { LucideIcon } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { radius, space, stroke } from '@/theme/tokens';

export interface Tile {
  /** Stable key, and the id the screen's own tests name it by. */
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  /** One true line under the name. Never empty. */
  status: string;
}

interface TileGridProps {
  tiles: Tile[];
}

/**
 * The ways into a subject, as tiles. Year codes has four, Doomsdays has two.
 *
 * A tile is a bounded interactive object, which is the one thing §8 allows a
 * frame for, so each one gets a hairline and nothing else: no shadow, no fill
 * that is not the surface, no colour the rest of the app does not already use.
 * Two columns at 375px and two on a desktop as well — a row of four would make
 * each tile a strip and lose the one line of status that is the point of them.
 */
export function TileGrid({ tiles }: TileGridProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: `${space[3]}px`,
      }}
    >
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <ButtonBase
            key={tile.id}
            component={RouterLink}
            to={tile.path}
            sx={{
              minHeight: 132,
              p: `${space[4]}px`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              gap: `${space[2]}px`,
              textAlign: 'left',
              bgcolor: 'var(--surface-2)',
              border: stroke.hairline,
              borderRadius: `${radius.lg}px`,
              '@media (hover: hover)': {
                '&:hover': { borderColor: 'var(--border-strong)' },
              },
              '&:focus-visible': {
                outline: '2px solid var(--brand)',
                outlineOffset: 2,
              },
            }}
          >
            <Icon size={20} strokeWidth={1.75} color="var(--text-secondary)" aria-hidden />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h3" component="span" sx={{ display: 'block' }}>
                {tile.label}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'var(--text-secondary)', mt: `${space[1]}px` }}
              >
                {tile.status}
              </Typography>
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
