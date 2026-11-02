/** Offset in minutes between UTC and the given IANA zone at an instant. */
function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The instant for a wall-clock date ("2026-11-03") and time ("08:30") in a time zone. */
export function zonedDate(date: string, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return new Date(guess.getTime() - zoneOffsetMinutes(guess, timeZone) * 60000);
}
