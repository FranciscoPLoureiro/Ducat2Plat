import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Guards the generated copy: web/src/lib/metrics.ts must be byte-identical
// to shared/metrics.ts (minus the generated header). If this fails, someone
// edited one file without the other — run `npm run sync-shared` in web/.
describe("metrics sync", () => {
  const sharedPath = join(__dirname, "..", "..", "..", "shared", "metrics.ts");
  const localPath = join(__dirname, "metrics.ts");

  it.skipIf(!existsSync(sharedPath))(
    "web copy matches shared/metrics.ts",
    () => {
      const shared = readFileSync(sharedPath, "utf8");
      const local = readFileSync(localPath, "utf8");
      const headerEnd = local.indexOf("\n// The metrics-sync test");
      const localBody = local.slice(local.indexOf("\n", headerEnd + 1) + 1);
      expect(localBody).toBe(shared);
    },
  );
});
