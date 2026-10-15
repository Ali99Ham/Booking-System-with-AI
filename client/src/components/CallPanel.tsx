import { useVoiceCall } from "../hooks/useVoiceCall";
import { Transcript } from "./Transcript";

export function CallPanel() {
  const { live, busy, status, lines, toggle } = useVoiceCall();

  return (
    <section className="card">
      <div className="card-head">Reception line</div>
      <div className="call-zone">
        <button className={live ? "call-btn live" : "call-btn"} onClick={toggle} disabled={busy}>
          {live ? "Hang up" : "Call reception"}
        </button>
        <div className="call-status">
          <span className={live ? "dot live" : "dot"} />
          <span>{status}</span>
        </div>
      </div>
      <Transcript lines={lines} />
    </section>
  );
}
