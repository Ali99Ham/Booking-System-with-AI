import { useRef, useState } from "react";
import { GoogleGenAI, Modality, type FunctionResponse, type LiveServerMessage, type Session } from "@google/genai";
import { AudioQueue, openMicPump } from "../lib/audio";
import { fetchAgentConfig, mintEphemeralToken, runTool } from "../lib/agent";
import { useTranscript } from "./useTranscript";

/** Gemini prebuilt voice (any TTS voice name works, e.g. Kore, Puck, Aoede, Charon). */
const VOICE = "Kore";
/** Gemini Live always returns 16-bit PCM at 24 kHz. */
const OUTPUT_SAMPLE_RATE = 24_000;
const IDLE = "Idle — tap to call";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Gemini expects {output} / {error} in a function response. */
function toFunctionResponseBody(result: unknown): Record<string, unknown> {
  if (isObject(result) && result.ok === false) {
    return { error: typeof result.error === "string" ? result.error : result };
  }
  return { output: result };
}

export function useVoiceCall() {
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(IDLE);
  const transcript = useTranscript();

  const sessionRef = useRef<Session | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const queueRef = useRef<AudioQueue | null>(null);
  const closeMicRef = useRef<(() => void) | null>(null);
  const liveRef = useRef(false);
  /** Identifies the current call so late callbacks from an old session are ignored. */
  const callIdRef = useRef(0);
  const cancelledCallsRef = useRef(new Set<string>());
  const userTurnRef = useRef<{ key: string; text: string } | null>(null);
  const userTurnSeqRef = useRef(0);

  const sendToolResponse = (functionResponses: FunctionResponse[]) => {
    try {
      sessionRef.current?.sendToolResponse({ functionResponses });
    } catch (err) {
      transcript.push("sys", `⚠ Could not send tool result: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleToolCalls = async (calls: { id?: string; name?: string; args?: Record<string, unknown> }[], callId: number) => {
    const responses = await Promise.all(
      calls.map(async (fc): Promise<FunctionResponse> => {
        const name = fc.name ?? "";
        const args = isObject(fc.args) ? fc.args : {};
        transcript.push("tool", `⚙ ${name} ${JSON.stringify(args)}`);
        const result = await runTool(name, args);
        return { id: fc.id, name, response: toFunctionResponseBody(result) };
      })
    );
    if (callId !== callIdRef.current) return; // call ended while tools were running
    // Drop results for calls the server cancelled (e.g. the caller interrupted the agent).
    const answerable = responses.filter((r) => !(r.id && cancelledCallsRef.current.has(r.id)));
    if (answerable.length) sendToolResponse(answerable);
  };

  const endUserTurn = () => {
    userTurnRef.current = null;
  };

  const handleMessage = (msg: LiveServerMessage, callId: number) => {
    const content = msg.serverContent;
    if (content) {
      if (content.interrupted) {
        // The caller barged in: drop whatever audio is still queued.
        queueRef.current?.stop();
        transcript.agentDone();
      }

      for (const part of content.modelTurn?.parts ?? []) {
        const inline = part.inlineData;
        if (!part.thought && inline?.data && (inline.mimeType ?? "audio/pcm").startsWith("audio/")) {
          queueRef.current?.enqueue(inline.data);
          endUserTurn();
        }
      }

      const heard = content.inputTranscription?.text;
      if (heard) {
        // Gemini streams input transcription in fragments; accumulate them into one user line.
        let turn = userTurnRef.current;
        if (!turn) {
          turn = { key: `u${++userTurnSeqRef.current}`, text: "" };
          userTurnRef.current = turn;
        }
        turn.text += heard;
        transcript.userUpdate(turn.key, turn.text.trim());
      }

      const said = content.outputTranscription?.text;
      if (said) {
        endUserTurn();
        transcript.agentDelta(said);
      }

      if (content.turnComplete) {
        transcript.agentDone();
        endUserTurn();
      }
    }

    const calls = msg.toolCall?.functionCalls;
    if (calls?.length) void handleToolCalls(calls, callId);

    for (const id of msg.toolCallCancellation?.ids ?? []) cancelledCallsRef.current.add(id);

    if (msg.goAway) {
      transcript.push("sys", `⚠ Gemini will end this session soon${msg.goAway.timeLeft ? ` (${msg.goAway.timeLeft} left)` : ""}.`);
    }
  };

  const endCall = (finalStatus = IDLE) => {
    callIdRef.current += 1;
    liveRef.current = false;
    queueRef.current?.stop();
    queueRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    try {
      session?.close();
    } catch {}
    closeMicRef.current?.();
    closeMicRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    cancelledCallsRef.current.clear();
    userTurnRef.current = null;
    transcript.reset();
    setLive(false);
    setBusy(false);
    setStatus(finalStatus);
  };

  const startCall = async () => {
    const callId = ++callIdRef.current;
    const stale = () => callId !== callIdRef.current;
    setBusy(true);
    setStatus("Getting line…");
    try {
      // Mic permission can take a while on first use, so do it BEFORE minting the
      // single-use token (which must be used shortly after it is created).
      const [config, mic] = await Promise.all([
        fetchAgentConfig(),
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        }),
      ]);
      micRef.current = mic;
      if (stale()) return endCall();

      const ctx = new AudioContext({ latencyHint: "interactive" });
      ctxRef.current = ctx;
      await ctx.resume();
      const inputMime = `audio/pcm;rate=${ctx.sampleRate}`; // Live API resamples any input rate
      queueRef.current = new AudioQueue(ctx, OUTPUT_SAMPLE_RATE);

      setStatus("Ringing…");
      const { token, model, apiVersion } = await mintEphemeralToken();
      if (stale()) return endCall();

      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion } });
      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: config.instructions,
          tools: config.tools,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (msg) => {
            if (callId === callIdRef.current) handleMessage(msg, callId);
          },
          onerror: (e) => {
            if (callId !== callIdRef.current) return;
            transcript.push("sys", `⚠ Connection error: ${e.message || "see the browser console"}`);
          },
          onclose: (e) => {
            if (callId !== callIdRef.current) return;
            const reason = e.reason ? ` (${e.reason})` : e.code && e.code !== 1000 ? ` (code ${e.code})` : "";
            if (!liveRef.current) transcript.push("sys", `⚠ Gemini closed the connection${reason}. Check GEMINI_API_KEY and GEMINI_LIVE_MODEL.`);
            endCall(liveRef.current ? `Call ended${reason}` : "Connection failed");
          },
        },
      });
      if (stale()) {
        session.close();
        return endCall();
      }
      sessionRef.current = session;

      // Gemini Live has no "response.create": nudge the model to pick up the phone first.
      const localTime = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [{ text: `[The phone call has just connected. Local time is ${localTime}. Answer the phone now with your opening greeting.]` }],
          },
        ],
        turnComplete: true,
      });

      closeMicRef.current = await openMicPump(ctx, mic, (b64) => {
        try {
          sessionRef.current?.sendRealtimeInput({ audio: { data: b64, mimeType: inputMime } });
        } catch {
          /* socket closing — onclose handles the cleanup */
        }
      });
      if (stale()) return endCall();
      liveRef.current = true;
      setLive(true);
      setBusy(false);
      setStatus("Connected — speak normally");
    } catch (err) {
      if (stale()) return;
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
