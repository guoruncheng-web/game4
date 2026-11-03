import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 局域网真机试玩时允许加载 Next.js 开发资源。
  // Next 16 的 dev server 会对带 Origin 头的请求校验来源,
  // 本机(127.0.0.1 / localhost)必须也在列表里,否则动态 chunk 全 403,
  // 表现是页面停在 loading、游戏模块加载不出来
  allowedDevOrigins: [
    "192.168.10.202",
    "192.168.11.142",
    "127.0.0.1",
    "localhost",
  ],

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
