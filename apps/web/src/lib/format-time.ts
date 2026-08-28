/**
 * E01-S024 AC3: Traditional-Chinese relative time for the M3 home
 * "最近對話" list tiles — seconds/minutes/hours/days ago, switching to an
 * absolute date once the gap exceeds 7 days (a "23 天前" reads as vague
 * clutter; a date is more useful once it's been over a week).
 */
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_CUTOFF_DAYS = 7;

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = Math.max(0, now.getTime() - then.getTime());
  const diffDays = Math.floor(diffMs / DAY_MS);

  if (diffDays > RELATIVE_CUTOFF_DAYS) {
    return then.toLocaleDateString("zh-TW");
  }
  if (diffDays >= 1) return `${diffDays} 天前`;

  const diffHours = Math.floor(diffMs / HOUR_MS);
  if (diffHours >= 1) return `${diffHours} 小時前`;

  const diffMinutes = Math.floor(diffMs / MINUTE_MS);
  if (diffMinutes >= 1) return `${diffMinutes} 分鐘前`;

  const diffSeconds = Math.floor(diffMs / 1000);
  return `${diffSeconds} 秒前`;
}
