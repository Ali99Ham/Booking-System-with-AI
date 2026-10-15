import { useRef, useState } from "react";
import { AudioQueue, openMicPump } from "../lib/audio";
import { fetchAgentConfig, mintEphemeralToken, runTool } from "../lib/agent";
import { useTranscript } from "./useTranscript";

const REALTIME_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-latest";
const VOICE = "eve";
const IDLE = "Idle — tap to call";

type RealtimeEvent = Record<string, unknown> & { type: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function parseRealtimeEvent(raw: string): RealtimeEvent | null {
  const value: unknown = JSON.parse(raw);
  if (!isObject(value) || typeof value.type !== "string") return null;
  return { ...value, type: value.type };
}

export function useVoiceCall() {
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(IDLE);
  const transcript = useTranscript();

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const queueRef = useRef<AudioQueue | null>(null);
  const closeMicRef = useRef<(() => void) | null>(null);
  const liveRef = useRef(false);
  const pendingToolCallsRef = useRef(0);
  const toolTurnActiveRef = useRef(false);
  const toolTurnDoneRef = useRef(false);

  const send = (payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  const continueAfterTools = () => {
    if (!toolTurnActiveRef.current || !toolTurnDoneRef.current || pendingToolCallsRef.current > 0) return;
    toolTurnActiveRef.current = false;
    toolTurnDoneRef.current = false;
    send({ type: "response.create" });
  };

  const handleToolCall = async (name: string, callId: string, rawArguments: string) => {
    let args: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(rawArguments || "{}");
      if (isObject(parsed)) args = parsed;
    } catch {}
    transcript.push("tool", `⚙ ${name} ${rawArguments || "{}"}`);
    try {
      const output = await runTool(name, args);
      send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
      });
    } finally {
      pendingToolCallsRef.current -= 1;
      continueAfterTools();
    }
  };

  const handleEvent = (msg: RealtimeEvent) => {
    switch (msg.type) {
      case "response.output_audio.delta":
      case "response.audio.delta": {
        const delta = stringField(msg, "delta");
        if (delta) queueRef.current?.enqueue(delta);
        break;
      }
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        transcript.agentDelta(stringField(msg, "delta") ?? "");
        break;
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        transcript.agentDone();
        break;
      case "conversation.item.input_audio_transcription.updated":
      case "conversation.item.input_audio_transcription.completed": {
        transcript.userUpdate(
          stringField(msg, "item_id") ?? "current",
          stringField(msg, "transcript") ?? ""
        );
        break;
      }
      case "input_audio_buffer.speech_started":
        queueRef.current?.stop();
        break;
      case "response.function_call_arguments.done": {
        const name = stringField(msg, "name");
        const callId = stringField(msg, "call_id");
        const rawArguments = stringField(msg, "arguments") ?? "{}";
        if (!name || !callId) {
          transcript.push("sys", "⚠ Received an invalid tool call from xAI.");
          break;
        }
        toolTurnActiveRef.current = true;
        pendingToolCallsRef.current += 1;
        void handleToolCall(name, callId, rawArguments);
        break;
      }
      case "response.done":
        transcript.agentDone();
        if (toolTurnActiveRef.current) {
          toolTurnDoneRef.current = true;
          continueAfterTools();
        }
        break;
      case "error": {
        const error = isObject(msg.error) ? msg.error : undefined;
        const message = error ? stringField(error, "message") : undefined;
        transcript.push("sys", `⚠ ${message ?? JSON.stringify(msg.error ?? msg)}`);
        break;
      }
    }
  };

  const endCall = (finalStatus = IDLE) => {
    liveRef.current = false;
    queueRef.current?.stop();
    queueRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    closeMicRef.current?.();
    closeMicRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    pendingToolCallsRef.current = 0;
    toolTurnActiveRef.current = false;
    toolTurnDoneRef.current = false;
    transcript.reset();
    setLive(false);
    setBusy(false);
    setStatus(finalStatus);
  };

  const startCall = async () => {
    setBusy(true);
    setStatus("Getting line…");
    try {
      const [token, config] = await Promise.all([mintEphemeralToken(), fetchAgentConfig()]);

      micRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const ctx = new AudioContext({ latencyHint: "interactive" });
      ctxRef.current = ctx;
      await ctx.resume();
      const sampleRate = ctx.sampleRate;
      queueRef.current = new AudioQueue(ctx, sampleRate);

      setStatus("Ringing…");
      const ws = new WebSocket(REALTIME_URL, [`xai-client-secret.${token}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        void (async () => {
          try {
            send({
              type: "session.update",
              session: {
                voice: VOICE,
                instructions: config.instructions,
                turn_detection: { type: "server_vad" },
                audio: {
                  input: {
                    format: { type: "audio/pcm", rate: sampleRate },
                    transcription: { model: "grok-transcribe" },
                  },
                  output: { format: { type: "audio/pcm", rate: sampleRate } },
                },
                tools: config.tools,
              },
            });
            send({ type: "response.create" });
            const mic = micRef.current;
            if (!mic) throw new Error("Microphone stream closed before the call connected");
            closeMicRef.current = await openMicPump(ctx, mic, (b64) =>
              send({ type: "input_audio_buffer.append", audio: b64 })
            );
            liveRef.current = true;
            setLive(true);
            setBusy(false);
            setStatus("Connected — speak normally");
          } catch (err) {
            transcript.push("sys", `⚠ ${err instanceof Error ? err.message : String(err)}`);
            endCall("Failed — see transcript");
          }
        })();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        try {
          const event = parseRealtimeEvent(ev.data);
          if (event) handleEvent(event);
        } catch {}
      };

      ws.onerror = () =>
        transcript.push("sys", "⚠ WebSocket error — check the console and your XAI_API_KEY.");
      ws.onclose = () => {
        if (wsRef.current === ws) endCall(liveRef.current ? "Call ended" : "Connection failed");
      };
    } catch (err) {
      transcript.push("sys", `⚠ ${err instanceof Error ? err.message : String(err)}`);
      endCall("Failed — see transcript");
    }
  };

  const toggle = () => {
    if (liveRef.current) endCall();
    else void startCall();
  };

  return { live, busy, status, lines: transcript.lines, toggle };
}
