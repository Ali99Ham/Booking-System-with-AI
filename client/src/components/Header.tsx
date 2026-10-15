export function Header() {
  return (
    <header className="header">
      <a className="brand" href="#top" aria-label="Solar Club home">
        <span className="mark" aria-hidden="true"><span /></span>
        <span className="wordmark">solar<span>club</span><small>AI RECEPTION · GERMANY</small></span>
      </a>
      <div className="header-right">
        <div className="club-meta">
          <b>5 indoor courts</b><span>Daily · 06:00–24:00</span>
        </div>
        <div className="price-meta"><span>OFF-PEAK <b>€30/h</b></span><span>PEAK <b>€45/h</b></span></div>
      </div>
    </header>
  );
}
