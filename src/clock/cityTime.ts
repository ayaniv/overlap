export type CityTime = { hour: number; minute: number; frac: number; label: string };

const padTwoDigits = (value: number) => String(value).padStart(2, '0');

export function getCityTime(date: Date, timeZoneId: string): CityTime {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZoneId,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const part of parts) {
    if (part.type === 'hour') hour = Number(part.value) % 24;
    if (part.type === 'minute') minute = Number(part.value);
    if (part.type === 'second') second = Number(part.value);
  }

  return { hour, minute, frac: hour + minute / 60 + second / 3600, label: `${padTwoDigits(hour)}:${padTwoDigits(minute)}` };
}

export function getCityDateLabel(date: Date, timeZoneId: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZoneId,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).formatToParts(date);

  let weekday = '';
  let day = '';
  let month = '';
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    if (part.type === 'day') day = part.value;
    if (part.type === 'month') month = part.value;
  }

  return `${weekday} ${day} ${month}`.toUpperCase();
}

// comparable YYYY-MM-DD key for "same calendar day" checks in a given timezone
// (en-CA formats as YYYY-MM-DD directly, unlike getCityDateLabel's display string)
export function getCityDateKey(date: Date, timeZoneId: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZoneId, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function isWithinWorkingHours(frac: number, workStart: number, workEnd: number): boolean {
  return frac >= workStart && frac < workEnd;
}
