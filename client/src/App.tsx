import { Header } from "./components/Header";
import { CallPanel } from "./components/CallPanel";
import { BookingsBoard } from "./components/BookingsBoard";

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="workspace">
        <section className="page-intro">
          <div>
            <p className="eyebrow">VOICE OPERATIONS / OVERVIEW</p>
            <h1>
              Your front desk, <span>reimagined.</span>
            </h1>
            <p className="intro-copy">
              Test a real-time voice assistant and watch demo court bookings
              arrive in one place.
            </p>
          </div>
          <div className="environment-pill">
            <span className="environment-dot" /> LOCAL DEMO
          </div>
        </section>

        <section className="overview-cards" aria-label="Demo capabilities">
          <article className="overview-card">
            <span className="overview-icon voice-icon">◖</span>
            <div>
              <p>VOICE ASSISTANT</p>
              <strong>Real-time conversation</strong>
              <small>Speak naturally, interrupt, and respond</small>
            </div>
          </article>
          <article className="overview-card">
            <span className="overview-icon booking-icon">▦</span>
            <div>
              <p>BOOKING WORKFLOW</p>
              <strong>Availability to confirmation</strong>
              <small>Demo slots update as bookings are made</small>
            </div>
          </article>
          <article className="overview-card">
            <span className="overview-icon api-icon">⌘</span>
            <div>
              <p>DEMO ENVIRONMENT</p>
              <strong>Local-first setup</strong>
            </div>
          </article>
        </section>

        <section className="split" aria-label="Reception workspace">
          <CallPanel />
          <BookingsBoard />
        </section>
        <footer className="app-footer">
          <span>Solar Club · AI receptionist prototype</span>
          <span>Demo data only · Not for real customer bookings</span>
        </footer>
      </main>
    </div>
  );
}
