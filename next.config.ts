import * as dotenv from 'dotenv';
import type { NextConfig } from 'next';

dotenv.config({ path: '.env.frontend' });
dotenv.config({ path: '.env.local' });

const nextConfig = {
  turbopack: {
    root: __dirname,
  },
} satisfies NextConfig;

export default nextConfig;
