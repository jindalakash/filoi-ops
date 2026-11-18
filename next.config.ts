import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"], // dev only: lets the app also be opened at http://127.0.0.1:3000
  output: "standalone", // small self-contained build for Docker / Hostinger
  serverExternalPackages: ["@prisma/client", "node-cron", "nodemailer"],
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
