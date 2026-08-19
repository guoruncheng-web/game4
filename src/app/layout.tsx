import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AuthProvider from "@/components/AuthProvider";
import CoopProvider from "@/components/CoopProvider";
import PwaProvider from "@/components/PwaProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GAME BOX · 游戏盒子",
  description: "即开即玩的移动端小游戏合集",
  // manifest 由 src/app/manifest.ts 生成
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // iOS 只认这套私有 meta:没有它,从主屏启动仍然会带 Safari 的地址栏
    capable: true,
    title: "GAME BOX",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#32b85d",
  // 装到桌面后是全屏窗口,刘海区域要自己接管
  viewportFit: "cover",
  // 游戏靠触屏操作,双指缩放只会误触
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 登录状态全站一份:头部按钮和首页卡片都要看它,各自 fetch 会互相打架 */}
        <AuthProvider>
          {/* 联机连接挂在全站:邀请必须在任何页面都能收到,包括首页 */}
          <CoopProvider>
            {children}
            <PwaProvider />
          </CoopProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
