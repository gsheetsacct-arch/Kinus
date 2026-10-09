import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Roster exports are uploaded through a server action; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "16mb" },
  },
};

export default nextConfig;
