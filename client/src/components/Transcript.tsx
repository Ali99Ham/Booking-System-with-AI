import { useEffect, useRef } from "react";
import type { Line, Role } from "../types";

const WHO: Record<Role, string> = {
  agent: "Reception",
  user: "You",
  tool: "tool",
  sys: "system",
};

export function Transcript({ lines }: { lines: Line[] }) {
  const ref = useRef<HTMLDivElement>(null);

  //auto scrolling
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="transcript" ref={ref}>
      {lines.map((line) => (
        <div key={line.id} className={`line ${line.role}`}>
          {line.role !== "tool" && <div className="who">{WHO[line.role]}</div>}
          <div className="bubble">{line.text}</div>
        </div>
      ))}
    </div>
  );
}
