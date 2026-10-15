import { useEffect, useState } from "react";
import type { Booking } from "../types";

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [newId, setNewId] = useState<string | undefined>();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const events = new EventSource("/api/events");
    events.addEventListener("snapshot", (e) => {
      setBookings((JSON.parse((e as MessageEvent).data).bookings ?? []) as Booking[]);
      setConnected(true);
    });
    events.addEventListener("booking", (e) => {
      const booking = JSON.parse((e as MessageEvent).data).booking as Booking;
      setBookings((bs) => [...bs, booking]);
      setNewId(booking.id);
    });
    return () => events.close();
  }, []);

  return { bookings, newId, connected };
}
