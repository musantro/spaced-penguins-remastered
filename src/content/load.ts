import assetsData from "./generated/assets.json";
import scoreData from "./generated/score.json";
import screensData from "./generated/screens.json";
import type { AssetMember, Content, ScoreFrame } from "./types";

export function loadContent(): Content {
  const assets = new Map((assetsData.assets as AssetMember[]).map((asset) => [asset.id, asset]));
  const frames = new Map((scoreData.frames as ScoreFrame[]).map((frame) => [frame.movieFrame, frame]));
  return { assets, frames, screens: screensData.screens };
}

export function assetId(castLibNum: number, memberNum: number): string {
  return `${({ 1: "Internal", 2: "scripts", 3: "Text" } as Record<number, string>)[castLibNum] ?? castLibNum}:${memberNum}`;
}

export function parseBehaviors(scriptList: string): Map<number, Record<string, number | string>> {
  const behaviors = new Map<number, Record<string, number | string>>();
  const expression = /\[\(member (\d+) of castLib 2\),\s*(?:"([^"]*)"|0)\]/g;
  for (const match of scriptList.matchAll(expression)) {
    const properties: Record<string, number | string> = {};
    for (const property of (match[2] ?? "").matchAll(/#([A-Za-z][A-Za-z0-9_]*):\s*([^,\]]+)/g)) {
      const raw = property[2].trim();
      const number = Number(raw);
      properties[property[1]] = Number.isFinite(number) ? number : raw.replace(/^#/, "");
    }
    behaviors.set(Number(match[1]), properties);
  }
  return behaviors;
}
