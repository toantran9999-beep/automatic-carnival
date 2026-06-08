/**
 * Vietnam timezone utilities.
 * Vietnam is always UTC+7 (no DST).
 */

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Returns the start of "today" in Vietnam timezone (UTC+7),
 * expressed as a UTC Date object.
 */
export function peruStartOfDay(date: Date = new Date()): Date {
  const vietnamTime = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  return new Date(
    Date.UTC(vietnamTime.getUTCFullYear(), vietnamTime.getUTCMonth(), vietnamTime.getUTCDate()) - VIETNAM_OFFSET_MS,
  );
}

/**
 * Returns the end of "today" in Vietnam timezone (UTC+7),
 * expressed as a UTC Date object (start of next day).
 */
export function peruEndOfDay(date: Date = new Date()): Date {
  return new Date(peruStartOfDay(date).getTime() + 24 * 60 * 60 * 1000);
}
