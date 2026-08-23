import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { AppData } from '@/domain/types';
import { downloadExport } from '@/storage/exportImport';
import { Field, SettingsSection } from './SettingsSection';

interface DataSettingsProps {
  data: AppData;
  /** Rejects with the message from `parseImportFile`, which is written for the user. */
  onImport: (json: string) => Promise<void>;
  onReset: () => Promise<void>;
}

interface PendingImport {
  name: string;
  json: string;
}

/**
 * FileReader rather than `file.text()`: the promise form is missing from some
 * older mobile browsers, and this reads the same file in every one of them.
 */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('That file could not be read.'));
    reader.readAsText(file);
  });
}

export function DataSettings({ data, onImport, onReset }: DataSettingsProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setPending({ name: file.name, json: await readFileText(file) });
    } catch {
      setError('That file could not be read.');
    }
  };

  const runImport = async () => {
    if (!pending) return;
    const { json } = pending;
    setPending(null);
    try {
      await onImport(json);
      setError(null);
    } catch (err) {
      // parseImportFile writes these for a person to read. Passing them through
      // beats replacing a real reason with "something went wrong".
      setError(err instanceof Error ? err.message : 'That file could not be imported.');
    }
  };

  return (
    <SettingsSection title="Data">
      <Field
        label="Export"
        note="One JSON file with all of it: the year codes, the month doomsdays and century anchors, the weekday, day-step, calculation and verify history, drill records and settings. It is the only way to move progress to another device."
      >
        <Button variant="outlined" color="inherit" onClick={() => downloadExport(data)}>
          Export data
        </Button>
      </Field>

      <Field
        label="Import"
        note="Reads a file this app exported. It replaces everything currently stored here."
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'flex-start' }}>
          <Button variant="outlined" color="inherit" onClick={() => fileRef.current?.click()}>
            Choose a file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="Import file"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so choosing the same file twice still fires a change.
              event.target.value = '';
              void pickFile(file);
            }}
          />
          {error ? (
            <Typography role="alert" variant="body2" color="error.main">
              {error}
            </Typography>
          ) : null}
        </Box>
      </Field>

      <Field
        label="Reset progress"
        note="This clears everything, not just the codes. The 100 year codes and the sixteen tables go back to unlearned, and the weekday, day-step, calculation, verify and drill history is deleted along with your settings. The app starts again at onboarding. Export first if you might want any of it back."
      >
        <Button variant="outlined" color="error" onClick={() => setResetOpen(true)}>
          Reset progress
        </Button>
      </Field>

      <ConfirmDialog
        open={pending !== null}
        title="Replace everything?"
        description={`Importing ${pending?.name ?? 'this file'} overwrites everything stored on this device. There is no undo.`}
        confirmLabel="Replace all data"
        onConfirm={() => void runImport()}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={resetOpen}
        title="Reset progress?"
        description="Intervals, lapses and attempt history on the year codes and the tables, every weekday, day-step, calculation and verify answer on record, drill records and settings all go back to their starting values."
        // Not "delete all 100 codes' progress", which the button said while
        // the action wiped the tables, the weekday log, the day step, calc and
        // verify as well. A confirm button is the last thing read before an
        // irreversible write, so it names the whole of what it does.
        confirmLabel="Delete everything"
        onConfirm={() => {
          setResetOpen(false);
          void onReset();
        }}
        onCancel={() => setResetOpen(false)}
      />
    </SettingsSection>
  );
}
