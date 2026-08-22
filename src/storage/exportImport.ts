import type { AppData, Attempt, ExportFile, ItemState } from '@/domain/types';
import { SCHEMA_VERSION } from './defaults';
import { migrateAppData, normaliseAppData } from './db';

const APP_ID = 'doomsday-trainer';

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export function toExportFile(data: AppData): ExportFile {
  return {
    app: APP_ID,
    schemaVersion: data.schemaVersion,
    exportedAt: Date.now(),
    data,
  };
}

export function serialiseExport(data: AppData): string {
  return JSON.stringify(toExportFile(data), null, 2);
}

export function exportFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `doomsday-trainer-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/** Browser only. Builds a Blob, clicks a temporary link, revokes the URL. */
export function downloadExport(data: AppData): void {
  const blob = new Blob([serialiseExport(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(Date.now());
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkAttempt(raw: unknown, where: string): Attempt {
  if (!isRecord(raw)) throw new ImportError(`${where}: an attempt is not an object.`);
  if (!finite(raw.timestamp)) throw new ImportError(`${where}: an attempt has no valid timestamp.`);
  if (typeof raw.correct !== 'boolean') throw new ImportError(`${where}: an attempt is missing "correct".`);
  if (!finite(raw.latencyMs)) throw new ImportError(`${where}: an attempt has an invalid latency.`);
  return raw as unknown as Attempt;
}

function checkItem(raw: unknown, key: string): ItemState {
  if (!isRecord(raw)) throw new ImportError(`Item "${key}" is not an object.`);
  const yy = raw.yy;
  if (!finite(yy) || !Number.isInteger(yy) || yy < 0 || yy > 99) {
    throw new ImportError(`Item "${key}" has a year outside 00-99.`);
  }
  if (!finite(raw.easeFactor)) throw new ImportError(`Item "${key}" has a non-numeric ease factor.`);
  if (!finite(raw.interval) || raw.interval < 0) throw new ImportError(`Item "${key}" has an invalid interval.`);
  if (!finite(raw.dueAt)) throw new ImportError(`Item "${key}" has an invalid due date.`);
  if (!finite(raw.repetitions) || raw.repetitions < 0) {
    throw new ImportError(`Item "${key}" has an invalid repetition count.`);
  }
  if (!finite(raw.lapses) || raw.lapses < 0) throw new ImportError(`Item "${key}" has an invalid lapse count.`);
  const history = raw.attemptHistory ?? [];
  if (!Array.isArray(history)) throw new ImportError(`Item "${key}" has an attempt history that is not a list.`);
  for (const attempt of history) checkAttempt(attempt, `Item "${key}"`);
  return { ...(raw as unknown as ItemState), attemptHistory: history as Attempt[] };
}

/**
 * Parses an export file written by this app. Every failure path produces a
 * message that can go straight into the UI. Nothing here trusts the input.
 */
export function parseImportFile(json: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ImportError('That file is not valid JSON.');
  }
  if (!isRecord(parsed)) throw new ImportError('That file does not contain a Doomsday Trainer export.');
  if (parsed.app !== APP_ID) {
    throw new ImportError('That file was not exported by Doomsday Trainer.');
  }

  const version = parsed.schemaVersion;
  if (!finite(version) || !Number.isInteger(version) || version < 1) {
    throw new ImportError('That export has a missing or invalid schema version.');
  }
  if (version > SCHEMA_VERSION) {
    throw new ImportError(
      `That export was written by a newer version of the app (schema v${version}, this build reads v${SCHEMA_VERSION}).`,
    );
  }

  const data = parsed.data;
  if (!isRecord(data)) throw new ImportError('That export has no data section.');
  if (!isRecord(data.items)) throw new ImportError('That export has no items, or items is not an object.');
  if (data.drills !== undefined && !Array.isArray(data.drills)) {
    throw new ImportError('That export has a drill log that is not a list.');
  }
  if (data.days !== undefined && !isRecord(data.days)) {
    throw new ImportError('That export has a session log that is not an object.');
  }
  if (data.settings !== undefined && !isRecord(data.settings)) {
    throw new ImportError('That export has settings that are not an object.');
  }
  if (data.weekdayAttempts !== undefined && !Array.isArray(data.weekdayAttempts)) {
    throw new ImportError('That export has a weekday log that is not a list.');
  }
  // The counts inside are repaired rather than rejected — a bucket that reads
  // as a string is worth less than the rest of the file is worth keeping.
  if (data.weekdayTotals !== undefined && !isRecord(data.weekdayTotals)) {
    throw new ImportError('That export has lifetime weekday totals that are not an object.');
  }

  const items: AppData['items'] = {};
  for (const [key, value] of Object.entries(data.items)) {
    items[key] = checkItem(value, key);
  }

  const now = Date.now();
  const candidate: AppData = {
    ...(data as unknown as AppData),
    schemaVersion: version,
    items,
  };
  return normaliseAppData(migrateAppData(candidate), now);
}
