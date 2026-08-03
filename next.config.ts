import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is the Next 16 caching model: `use cache` with
  // cacheLife/cacheTag, and Partial Prerendering by default. The forecast is
  // cached and revalidated on a clock while freshness stays reportable, which is
  // what this enables. See DECISIONS.md #4.
  cacheComponents: true,
};

export default nextConfig;
