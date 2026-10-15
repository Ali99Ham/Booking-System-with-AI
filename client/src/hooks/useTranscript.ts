import { useCallback, useRef, useState } from "react";
import type { Line, Role } from "../types";

export function useTranscript() {
  const [lines, setLines] = useState<Line[]>([]);
  const seq = useRef(0);
  const agentLine = useRef<string | null>(null);
  const userLines = useRef(new Map<string, string>());

  const push = useCallback((role: Role, text: string): string => {
    const id = `l${++seq.current}`;
    setLines((ls) => [...ls, { id, role, text }]);
    return id;
  }, []);

  const agentDelta = useCallback(
    (delta: string) => {
      if (!agentLine.current) agentLine.current = push("agent", "");
      const id = agentLine.current;
      setLines((ls) => ls.map((l) => (l.id === id ? { ...l, text: l.text + delta } : l)));
    },
    [push]
  );

  const agentDone = useCallback(() => {
    const id = agentLine.current;
    agentLine.current = null;
    if (id) setLines((ls) => ls.filter((l) => !(l.id === id && !l.text)));
  }, []);

  const userUpdate = useCallback(
    (itemId: string, text: string) => {
      if (!text) return;
      const existing = userLines.current.get(itemId);
      if (!existing) {
        userLines.current.set(itemId, push("user", text));
        return;
      }
      setLines((ls) => ls.map((l) => (l.id === existing ? { ...l, text } : l)));
    },
    [push]
  );

  const reset = useCallback(() => {
    agentLine.current = null;
    userLines.current.clear();
  }, []);

  return { lines, push, agentDelta, agentDone, userUpdate, reset };
}
