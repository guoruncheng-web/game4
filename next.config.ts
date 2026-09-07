import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    // **必须显式指定,不能让 Turbopack 自己往上找。**
    // 它靠向上搜索 lockfile 来推断项目根,而开发机的家目录里可能躺着无关的
    // package-lock.json(Mac 上就有一个 /Users/mac/package-lock.json)。
    // 推断到错误的根,`next/font/google` 生成的虚拟模块
    // `@vercel/turbopack-next/internal/font/google/font` 就会解析不到,
    // 表现是启动直接 Build Error 说这个模块找不到 —— 而代码一个字没改。
    // 用配置文件自身所在目录,两台开发机和线上服务器各自算各自的绝对路径。
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  // 局域网真机试玩时允许加载 Next.js 开发资源。
  // Next 16 的 dev server 会对带 Origin 头的请求校验来源,
  // 本机(127.0.0.1 / localhost)必须也在列表里,否则动态 chunk 全 403,
  // 表现是页面停在 loading、游戏模块加载不出来
  allowedDevOrigins: [
    "192.168.10.202",
    "192.168.11.142",
    "127.0.0.1",
    "localhost",
    "192.168.8.251",
    "192.168.11.48",
  ],

  async rewrites() {
    const gateway = process.env.BACKEND_GATEWAY_URL ?? 'http://127.0.0.1:7100';
    return {
      beforeFiles: [
        { source: '/api/:path*', destination: `${gateway}/api/:path*` },
      ],
    };
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 游戏 URL 按产品要求携带短期 token；禁止浏览器把完整地址带给第三方资源。
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
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
