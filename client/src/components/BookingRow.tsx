import { useEffect, useRef } from "react";
import type { Booking } from "../types";
import { timeRange } from "../lib/format";

interface Props {
  booking: Booking;
  isNew: boolean;
}

export function BookingRow({ booking, isNew }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNew) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isNew]);

  return (
    <div className={isNew ? "row is-new" : "row"} ref={ref}>
      <div className="time">{timeRange(booking.datetimeISO)}</div>
      <div className="court">COURT {booking.court}</div>
      <div className="name">
        {booking.name}
        <small>{booking.phone}</small>
      </div>
      <div className="players">
        {booking.players} player{booking.players === 1 ? "" : "s"}
      </div>
    </div>
  );
}
