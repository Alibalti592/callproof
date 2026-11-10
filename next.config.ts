import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite (the embedded dev database) ships WASM and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    serverActions: {
      // Whop serves apps inside an iframe through its own proxy domain, so
      // form posts arrive with a Whop origin rather than this app's host.
      allowedOrigins: ["*.apps.whop.com", "*.whop.com", "whop.com"],
    },
  },
};

export default config;
