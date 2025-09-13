export const IST_TIMEZONE = "Asia/Kolkata";

// Return YYYY-MM-DD string for given date in IST
export function istDateString(date: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return formatted; // en-CA => YYYY-MM-DD
}

export function getISTYMD(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = istDateString(date).split("-").map(Number);
  return { year: y, month: m, day: d };
}

// Milliseconds for midnight (00:00) IST of the given date, expressed in UTC epoch ms
export function istMidnightUTCms(date: Date = new Date()): number {
  const { year, month, day } = getISTYMD(date);
  // Convert local IST midnight to UTC by subtracting 5h30m (330 minutes)
  return Date.UTC(year, month - 1, day, 0, 0) - 330 * 60 * 1000;
}

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

// Construct a Date in UTC epoch corresponding to the given HH:mm at IST date
export function istHMToUTCDate(hm: string, baseDate: Date = new Date()): Date {
  const minutes = hmToMinutes(hm);
  const baseMidnightUTC = istMidnightUTCms(baseDate);
  return new Date(baseMidnightUTC + minutes * 60 * 1000);
}

export function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
