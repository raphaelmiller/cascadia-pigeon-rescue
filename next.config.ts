import type { NextConfig } from "next";

// Origin allowlist for server actions — set ALLOWED_ORIGINS in prod (comma-
// separated). Without this, Next blocks server-action POSTs from any host
// that isn't the request's own origin, which is the safe default.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : undefined;

const nextConfig: NextConfig = {
  // Allow larger uploads via server actions (photos, vet PDFs, etc.)
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
      ...(allowedOrigins ? { allowedOrigins } : {}),
    },
  },
};

export default nextConfig;
