import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Dependencies are hoisted to the monorepo root by npm workspaces, so
  // file tracing needs to look one level up from this project's root.
  outputFileTracingRoot: path.join(__dirname, '..'),
};

export default nextConfig;
