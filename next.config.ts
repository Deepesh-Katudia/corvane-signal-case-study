import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Data files and config are read at runtime by server components and route handlers.
  outputFileTracingIncludes: { "/**": ["./data/**", "./config/**", "./out/**"] },
};

export default nextConfig;
