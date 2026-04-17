import type { NextConfig } from "next";

const nextConfig = {
  turbopack: {
    root: __dirname,
  },
} satisfies NextConfig;

export default nextConfig;
