/**
 * Relative time formatter, following Apple-style brevity:
 *
 *   < 1 min   → "just now"
 *   < 1 hour  → "Xm"
 *   < 24 hours → "Xh"
 *   < 7 days  → "Xd"
 *   else       → "MMM d" (e.g. "Jan 15")
 *
 * All times are UTC (no timezone conversion) since posts use timestamptz
 * and the feed shows absolute recency.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;

  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`;

  const d = new Date(iso);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}
