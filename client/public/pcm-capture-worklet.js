class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSize = 4096;
    this.chunk = new Float32Array(this.chunkSize);
    this.offset = 0;
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples?.length) return true;

    let sourceOffset = 0;
    while (sourceOffset < samples.length) {
      const count = Math.min(this.chunkSize - this.offset, samples.length - sourceOffset);
      this.chunk.set(samples.subarray(sourceOffset, sourceOffset + count), this.offset);
      this.offset += count;
      sourceOffset += count;

      if (this.offset === this.chunkSize) {
        const completedChunk = this.chunk;
        this.port.postMessage(completedChunk, [completedChunk.buffer]);
        this.chunk = new Float32Array(this.chunkSize);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
