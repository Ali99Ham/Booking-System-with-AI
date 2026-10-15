import type { Booking } from "../types";

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayLabel(date: string): string {
  const label = new Date(`${date}T12:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return date === todayISO() ? `Today — ${label}` : label;
}

export function timeRange(datetimeISO: string): string {
  const h = Number(datetimeISO.slice(11, 13));
  const pad = (n: number) => String(n % 24).padStart(2, "0");
  return `${pad(h)}:00–${pad(h + 1)}:00`;
}

export function groupByDay(bookings: Booking[]): { day: string; rows: Booking[] }[] {
  const sorted = [...bookings].sort(
    (a, b) => a.datetimeISO.localeCompare(b.datetimeISO) || a.court - b.court
  );
  const days: { day: string; rows: Booking[] }[] = [];
  for (const b of sorted) {
    const day = b.datetimeISO.slice(0, 10);
    const last = days[days.length - 1];
    if (last?.day === day) last.rows.push(b);
    else days.push({ day, rows: [b] });
  }
  return days;
}
