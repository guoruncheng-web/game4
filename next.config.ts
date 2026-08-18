import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 局域网真机试玩时允许加载 Next.js 开发资源。
  allowedDevOrigins: ["192.168.8.251"],

  async headers() {
    return [
      {
        // Service Worker 必须每次都回源校验:它被缓存住的话,
        // 改了缓存策略也推不下去,用户会一直跑着旧的那份。
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
