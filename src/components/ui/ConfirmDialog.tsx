import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import type { ReactNode } from 'react';
import { space } from '@/theme/tokens';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Say what the action does and what it cannot undo. */
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button. Set false for a confirmation that loses nothing. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { p: `${space[1]}px` } } }}
    >
      <DialogTitle sx={{ typography: 'h2' }}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText variant="body1" sx={{ color: 'var(--text-secondary)' }}>
          {description}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: `${space[5]}px`, pb: `${space[4]}px`, gap: `${space[2]}px` }}>
        <Button onClick={onCancel} color="inherit" sx={{ color: 'var(--text-secondary)' }}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={destructive ? 'error' : 'primary'}
          autoFocus
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
