import { defineConfig } from "vitest/config";

// React Native modüllerine dokunmayan saf mantık testleri
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
