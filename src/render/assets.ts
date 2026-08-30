import type { Content } from "../content/types";

export class ImageStore {
  readonly images = new Map<string, HTMLImageElement>();

  async load(content: Content): Promise<void> {
    const sources = new Set<string>();
    for (const asset of content.assets.values()) if (asset.image) sources.add(asset.image);
    for (const source of Object.values(content.screens)) sources.add(source);
    await Promise.all([...sources].map((source) => this.loadOne(source)));
  }

  get(source: string | null | undefined): HTMLImageElement | null {
    return source ? this.images.get(source) ?? null : null;
  }

  private loadOne(source: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { this.images.set(source, image); resolve(); };
      image.onerror = () => reject(new Error(`No se pudo cargar ${source}.`));
      image.src = source;
    });
  }
}
