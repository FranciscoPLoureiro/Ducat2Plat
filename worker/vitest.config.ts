import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default include only covers worker/ — without the explicit ../shared
    // entry the metrics tests silently never run anywhere.
    include: ["**/*.test.ts", "../shared/**/*.test.ts"],
  },
});
