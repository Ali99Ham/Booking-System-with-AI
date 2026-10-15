export interface Booking {
  id: string;
  name: string;
  phone: string;
  court: number;
  datetimeISO: string;
  players: number;
  createdAt: string;
}

export interface BookingInput {
  name: string;
  phone: string;
  court: number;
  datetime_iso: string;
  players: number;
}

export type StoreEvent =
  | { type: "snapshot"; bookings: Booking[] }
  | { type: "booking"; booking: Booking };

type Listener = (event: StoreEvent) => void;

export const COURTS = [1, 2, 3, 4, 5];
export const OPEN_HOUR = 6;
export const LAST_START_HOUR = 23;

const listeners = new Set<Listener>();
const bookings: Booking[] = [];
let nextId = 1;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event: StoreEvent) {
  for (const fn of listeners) fn(event);
}

export function listBookings(): Booking[] {
  return [...bookings].sort((a, b) =>
    a.datetimeISO.localeCompare(b.datetimeISO),
  );
}

export function todayLocalISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function availabilityFor(date: string) {
  const taken = new Set(
    bookings
      .filter((b) => b.datetimeISO.startsWith(date))
      .map((b) => `${b.court}@${b.datetimeISO.slice(11, 13)}`),
  );
  const courts = COURTS.map((court) => {
    const open: string[] = [];
    for (let h = OPEN_HOUR; h <= LAST_START_HOUR; h++) {
      const hh = String(h).padStart(2, "0");
      if (!taken.has(`${court}@${hh}`)) open.push(`${hh}:00`);
    }
    return { court, open_slots: open };
  });
  return { date, slot_minutes: 60, courts };
}

export function createBooking(
  input: BookingInput,
): { ok: true; booking: Booking } | { ok: false; error: string } {
  const { name, phone, players } = input;
  const court = Number(input.court);
  if (!name) return { ok: false, error: "name is required" };
  if (!phone) return { ok: false, error: "phone is required" };
  if (!COURTS.includes(court))
    return { ok: false, error: `court must be 1-${COURTS.length}` };
  if (!Number.isInteger(players) || players < 1 || players > 4)
    return { ok: false, error: "players must be 1-4" };

  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(
    String(input.datetime_iso ?? ""),
  );
  if (!m)
    return { ok: false, error: "datetime_iso must look like YYYY-MM-DDTHH:MM" };
  const [, date, hh, mm] = m;
  const hour = Number(hh);
  if (mm !== "00")
    return {
      ok: false,
      error: "slots start on the hour (minutes must be :00)",
    };
  if (hour < OPEN_HOUR || hour > LAST_START_HOUR)
    return {
      ok: false,
      error: `club is open ${OPEN_HOUR}:00-24:00; last slot starts ${LAST_START_HOUR}:00`,
    };

  const datetimeISO = `${date}T${hh}:00`;
  const clash = bookings.find(
    (b) => b.court === court && b.datetimeISO === datetimeISO,
  );
  if (clash)
    return {
      ok: false,
      error: `Court ${court} is already booked at ${hh}:00 on ${date}`,
    };

  const booking: Booking = {
    id: `bk_${nextId++}`,
    name: name.trim(),
    phone: phone.trim(),
    court,
    datetimeISO,
    players,
    createdAt: new Date().toISOString(),
  };
  bookings.push(booking);
  emit({ type: "booking", booking });
  return { ok: true, booking };
}

export function seed() {
  const today = todayLocalISO();
  const rows: BookingInput[] = [
    {
      name: "Ali",
      phone: "+49000000000",
      court: 1,
      datetime_iso: `${today}T07:00`,
      players: 4,
    },
    {
      name: "Alison",
      phone: "+49000000000",
      court: 3,
      datetime_iso: `${today}T09:00`,
      players: 2,
    },
    {
      name: "Jack",
      phone: "+49000000000",
      court: 2,
      datetime_iso: `${today}T18:00`,
      players: 4,
    },
    {
      name: "Nicole",
      phone: "+49000000000",
      court: 5,
      datetime_iso: `${today}T20:00`,
      players: 3,
    },
  ];
  for (const row of rows) createBooking(row);
}
