// E03-S040 voice capture worklet. Runs on the audio rendering thread;
// posts each 128-frame mono render quantum to the main thread as-is —
// buffering, resampling, VAD and WAV encoding all happen in
// apps/web/src/lib/voice/recorder.ts.
class PcmRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channelData = inputs[0]?.[0];
    if (channelData && channelData.length > 0) {
      this.port.postMessage({ samples: channelData.slice() });
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
