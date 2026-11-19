import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local dev on an iCloud-synced folder sets NEXT_DIST_DIR=.next.nosync so macOS doesn't sync (and duplicate) build files.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1"], // dev only: lets the app also be opened at http://127.0.0.1:3000
  output: "standalone", // small self-contained build for Docker / Hostinger
  serverExternalPackages: ["@prisma/client", "node-cron", "nodemailer", "@react-pdf/renderer"],
  experimental: { serverActions: { bodySizeLimit: "60mb" }, proxyClientMaxBodySize: "60mb" }, // document uploads up to 50 MB
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
