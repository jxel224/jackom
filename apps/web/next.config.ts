import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apps/web imports shared types from packages/shared-types/src (outside this project's own
  // directory, mirroring apps/server/src/shared.ts's identical relative-import pattern) —
  // Next.js restricts module resolution to the project root by default, so this opts back in.
  //
  // NOTE: explicitly setting `turbopack.root` (to silence the harmless "inferred workspace root"
  // warning caused by the two lockfiles — root's and apps/web's own) was tried and reverted: it
  // broke resolution of the externalDir import entirely. Not worth the risk for a cosmetic warning.
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
