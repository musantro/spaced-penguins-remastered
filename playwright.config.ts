import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 500, height: 400 } },
  webServer: { command: "pnpm build && pnpm preview --host 127.0.0.1", port: 4173, reuseExistingServer: true },
});
