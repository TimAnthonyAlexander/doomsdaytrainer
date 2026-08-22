/**
 * The reminder layer. `<AppChrome />` from `@/features/pwa` mounts it; the
 * settings screen only needs `useReminderCapability` and
 * `requestReminderPermission`.
 */
export { useReminderCapability } from './useReminderCapability';
export { requestReminderPermission, refreshReminderCapability } from './capabilityStore';
export type { ReminderCapability } from './capability';
export { EVENING_REMINDER_TIME, nextReminderAt, formatClock } from './reminderSchedule';
