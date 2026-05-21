import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Next 16 dev 默认把非 localhost 当跨域，会阻止 client bundle 加载导致 React 无法 hydrate
  // 本地从 127.0.0.1 或局域网访问时必须显式放行
  allowedDevOrigins: ["127.0.0.1", "172.18.0.1", "172.18.0.0/16", "192.168.0.0/16"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
