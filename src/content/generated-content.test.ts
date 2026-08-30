import fs from "node:fs";
import path from "node:path";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import assetsData from "./generated/assets.json";
import type { AssetMember } from "./types";

const assets = assetsData.assets as AssetMember[];

describe("Director bitmap-ink conversions", () => {
  it("gives every runtime Kevin frame and the open ship a transparent matte", () => {
    const ids = [2, ...Array.from({ length: 36 }, (_, index) => index + 75)];
    for (const number of ids) {
      const member = assets.find((candidate) => candidate.id === `Internal:${number}`);
      expect(member?.image, `Internal:${number}`).toMatch(/\/assets\/generated\/sprites\/.*-matte\.png\?v=[a-f0-9]{12}$/);
      const assetPath = member!.image!.split("?")[0];
      const source = path.resolve("public", decodeURIComponent(assetPath.replace(/^\//, "")));
      const png = PNG.sync.read(fs.readFileSync(source));
      let transparentPixels = 0;
      let opaqueWhitePixels = 0;
      for (let offset = 0; offset < png.data.length; offset += 4) {
        if (png.data[offset + 3] === 0) transparentPixels += 1;
        if (png.data[offset + 3] > 240 && png.data[offset] > 245 && png.data[offset + 1] > 245 && png.data[offset + 2] > 245) {
          opaqueWhitePixels += 1;
        }
      }
      expect(transparentPixels, `Internal:${number} transparent pixels`).toBeGreaterThan(0);
      if (number >= 75) expect(opaqueWhitePixels, `Internal:${number} opaque white pixels`).toBeLessThan(25);
    }
  });
});
