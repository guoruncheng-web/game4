import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 局域网真机试玩时允许加载 Next.js 开发资源。
  allowedDevOrigins: ["192.168.8.251"],
};

export default nextConfig;
