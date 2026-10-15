import { useBookings } from "../hooks/useBookings";
import { dayLabel, groupByDay } from "../lib/format";
import { BookingRow } from "./BookingRow";

export function BookingsBoard() {
  const { bookings, newId, connected } = useBookings();
  const days = groupByDay(bookings);

  return (
    <section className="card board-card">
      <div className="card-head">
        Bookings board
        <span className="live-badge">
          <span className="live-dot" />
          Live
        </span>
      </div>
      <div className="board">
        {!bookings.length && (
          <div className="empty">
            {connected ? "No bookings yet — the board updates live." : "Connecting to board…"}
          </div>
        )}
        {days.map(({ day, rows }) => (
          <div key={day}>
            <div className="day-head">{dayLabel(day)}</div>
            {rows.map((b) => (
              <BookingRow key={b.id} booking={b} isNew={b.id === newId} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
