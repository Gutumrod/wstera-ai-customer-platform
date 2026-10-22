import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

// This repository stores the ignored .env.local at the project root, above the app directory.
loadEnvConfig(process.cwd());

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pdfjs-dist"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
    ] }];
  },
  outputFileTracingIncludes: {
    "/*": ["../../../dist/adapters/knowledge/pdf-text-worker.js"],
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".js", ".ts", ".tsx"],
      ".mjs": [".mjs", ".mts"],
    };
    return config;
  },
};

export default nextConfig;
