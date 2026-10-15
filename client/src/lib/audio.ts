const CHUNK = 0x8000;

export function encodePcm16(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export class AudioQueue {
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor(
    private ctx: AudioContext,
    private rate: number
  ) {}

  enqueue(b64: string) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer);
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) floats[i] = pcm[i] / 0x8000;

    const buffer = this.ctx.createBuffer(1, floats.length, this.rate);
    buffer.getChannelData(0).set(floats);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    const startAt = Math.max(this.ctx.currentTime + 0.06, this.nextTime);
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.nextTime = 0;
  }
}

export function openMicPump(
  ctx: AudioContext,
  stream: MediaStream,
  onChunk: (b64: string) => void
): Promise<() => void> {
  return openAudioWorkletMicPump(ctx, stream, onChunk);
}

async function openAudioWorkletMicPump(
  ctx: AudioContext,
  stream: MediaStream,
  onChunk: (b64: string) => void
): Promise<() => void> {
  await ctx.audioWorklet.addModule("/pcm-capture-worklet.js");
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-capture-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  node.port.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data instanceof Float32Array) onChunk(encodePcm16(event.data));
  };
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  return () => {
    source.disconnect();
    node.disconnect();
    mute.disconnect();
    node.port.close();
  };
}
