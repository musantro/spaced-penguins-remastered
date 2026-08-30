import type { Content } from "../content/types";
import type { AudioEvent } from "../core/types";

export class AudioEngine {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loops = new Map<string, AudioBufferSourceNode>();

  async load(content: Content): Promise<void> {
    this.context = new AudioContext();
    const sounds = [...content.assets.values()].filter((asset) => asset.audio);
    await Promise.all(sounds.map(async (asset) => {
      const response = await fetch(asset.audio!);
      const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(asset.name.toLowerCase(), buffer);
    }));
  }

  async unlock(): Promise<void> {
    if (this.context?.state === "suspended") await this.context.resume();
  }

  play(events: AudioEvent[]): void {
    if (!this.context) return;
    for (const event of events) {
      if (event.stop) {
        this.stopAllLoops();
        continue;
      }
      const key = event.name.toLowerCase();
      const buffer = this.buffers.get(key);
      if (!buffer) continue;
      this.stopLoop(key);
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = Boolean(event.loop);
      source.connect(this.context.destination);
      source.addEventListener("ended", () => {
        if (this.loops.get(key) === source) this.loops.delete(key);
        source.disconnect();
      }, { once: true });
      if (source.loop) this.loops.set(key, source);
      source.start();
    }
  }

  private stopAllLoops(): void {
    for (const key of [...this.loops.keys()]) this.stopLoop(key);
  }

  private stopLoop(key: string): void {
    const source = this.loops.get(key);
    if (!source) return;
    this.loops.delete(key);
    try {
      source.stop();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "InvalidStateError")) throw error;
    }
  }
}
