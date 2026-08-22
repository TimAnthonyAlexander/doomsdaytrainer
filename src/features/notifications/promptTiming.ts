import type { SessionDay } from '@/domain/types';

/**
 * When to ask for notification permission.
 *
 * The spec says "after day 3 of use". That is three distinct days on which the
 * user actually did something, not 72 hours after install: someone who opened
 * the app once on Monday and comes back on Thursday has used it for one day.
 */
export const REMINDER_PROMPT_DAY_THRESHOLD = 3;

/** Days in the session log that carry real activity. */
export function activeDayCount(days: Record<string, SessionDay>): number {
  return Object.values(days).filter(
    (day) => day.reviewsCompleted > 0 || day.newItemsIntroduced > 0,
  ).length;
}

export interface PromptDecisionInput {
  days: Record<string, SessionDay>;
  /** Device-scoped: the user has already been asked once and answered. */
  alreadyAsked: boolean;
  reminderEnabled: boolean;
  /** From the capability check. */
  supported: boolean;
  permission: NotificationPermission;
}

/**
 * Whether to show the in-app explanation that precedes the browser prompt. The
 * browser prompt itself is never fired cold: it only follows a tap.
 */
export function shouldOfferReminderPrompt(input: PromptDecisionInput): boolean {
  if (!input.supported) return false;
  if (input.alreadyAsked) return false;
  if (input.reminderEnabled) return false;
  // 'granted' and 'denied' are both already-answered states; nothing left to ask.
  if (input.permission !== 'default') return false;
  return activeDayCount(input.days) >= REMINDER_PROMPT_DAY_THRESHOLD;
}
