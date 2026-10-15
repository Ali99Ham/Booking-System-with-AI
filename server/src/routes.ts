import { Router } from "express";
import { mintClientSecret } from "./gemini.js";
import { availabilityFor, createBooking, listBookings, subscribe, todayLocalISO } from "./store.js";

export const apiRouter = Router();

apiRouter.post("/token", async (_req, res) => {
  const { status, body } = await mintClientSecret();
  res.status(status).json(body);
});

apiRouter.get("/availability", (req, res) => {
  const raw = req.query.date;
  const date = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayLocalISO();
  res.json({ ok: true, ...availabilityFor(date) });
});

apiRouter.post("/book", (req, res) => {
  const body = req.body ?? {};
  const result = createBooking({
    name: String(body.name ?? body.full_name ?? ""),
    phone: String(body.phone ?? ""),
    court: Number(body.court),
    datetime_iso: String(body.datetime_iso ?? ""),
    players: Number(body.players),
  });
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  const b = result.booking;
  res.json({
    ok: true,
    bookingId: b.id,
    court: b.court,
    datetime_iso: b.datetimeISO,
    name: b.name,
    players: b.players,
  });
});

apiRouter.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  send("snapshot", { bookings: listBookings() });
  const unsubscribe = subscribe((e) => {
    if (e.type === "booking") send("booking", { booking: e.booking });
  });
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
