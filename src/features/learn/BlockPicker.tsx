import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { Numeral } from '@/components/ui/Numeral';
import { PageTitle } from '@/components/ui/PageTitle';
import { palette } from '@/theme/palette';
import { BLOCK_SIZE, nextBlock, type DailyAllowance, type DecadeBlock } from './blocks';

interface BlockPickerProps {
  blocks: DecadeBlock[];
  allowance: DailyAllowance;
  onStart: (decade: number) => void;
}

function StateLabel({ block }: { block: DecadeBlock }) {
  if (!block.available) {
    return (
      <Typography variant="body2" color="text.disabled">
        {block.reason}
      </Typography>
    );
  }

  if (block.status === 'introduced') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'primary.main' }}>
        <Check size={16} strokeWidth={2} aria-hidden />
        <Typography component="span" variant="body2" color="inherit">
          Learned · redo
        </Typography>
      </Box>
    );
  }

  if (block.locked) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.disabled' }}>
        <Lock size={14} strokeWidth={1.75} aria-hidden />
        <Typography component="span" variant="body2" color="inherit">
          {block.lockReason}
        </Typography>
      </Box>
    );
  }

  if (block.status === 'in-progress') {
    return (
      <Typography variant="body2" color="text.secondary">
        <Numeral color="inherit">{block.introducedCount}</Numeral>
        {' of '}
        <Numeral color="inherit">{BLOCK_SIZE}</Numeral>
        {' introduced'}
      </Typography>
    );
  }

  return (
    <Typography variant="body2" color="text.secondary">
      Not started
    </Typography>
  );
}

/**
 * The landing view of Learn. Ten rows, one rule between them, no cards. Decades
 * outside the scope stay on the list, greyed, with the reason on the row.
 */
export function BlockPicker({ blocks, allowance, onStart }: BlockPickerProps) {
  const next = nextBlock(blocks);

  return (
    <>
      <PageTitle subtitle="Ten codes at a time, three or four of them at once. Each pair is shown on its own before it is ever asked for, and years that sit next to each other are never taught together.">
        Learn
      </PageTitle>

      <Box>
        <Typography variant="body2" color="text.secondary">
          {allowance.message}
        </Typography>
        {next ? (
          <Button
            variant="contained"
            disabled={!allowance.canStart}
            onClick={() => onStart(next.decade)}
            sx={{ mt: 2 }}
          >
            Start&nbsp;
            <Numeral size={15} weight={600} color="inherit">
              {next.label}
            </Numeral>
          </Button>
        ) : null}
      </Box>

      {next ? null : (
        <EmptyState
          icon={Check}
          action={
            <Button component={RouterLink} to="/year-codes/revise" variant="outlined">
              Go to Revise
            </Button>
          }
        >
          Every block in scope is introduced. The rest is review.
        </EmptyState>
      )}

      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {blocks.map((block, index) => {
          // Redoing a learned block introduces nothing new, so the daily cap
          // has no business blocking it.
          const isRedo = block.status === 'introduced';
          const startable = block.available && !block.locked && (isRedo || allowance.canStart);
          return (
            <Box
              component="li"
              key={block.decade}
              sx={{ borderTop: index === 0 ? 'none' : `1px solid ${palette.rule}` }}
            >
              <ButtonBase
                disabled={!startable}
                onClick={() => onStart(block.decade)}
                aria-label={`${isRedo ? 'Redo' : 'Learn'} ${block.label}`}
                sx={{
                  width: '100%',
                  minHeight: 56,
                  px: 1,
                  py: 1,
                  gap: 2,
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  opacity: block.available ? 1 : 0.5,
                  '&.Mui-disabled': { opacity: block.available ? 0.72 : 0.5 },
                }}
              >
                <Numeral size={20} weight={600} color={palette.ink}>
                  {block.label}
                </Numeral>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <StateLabel block={block} />
                  {startable ? (
                    <ChevronRight size={18} strokeWidth={1.75} color={palette.inkFaint} aria-hidden />
                  ) : null}
                </Box>
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
    </>
  );
}
