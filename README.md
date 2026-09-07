# 工作室 PWA 前端

本项目已迁入 `/Users/mac/projects/cocos-game-studio/frontend`。独立 NestJS 后端位于 `../backend`；先在后端运行 `npm run build && npm run start:all`，再在此运行 `pnpm dev`。

所有 `/api/*` 与 `/ws` 请求统一代理到 `BACKEND_GATEWAY_URL`（默认 `http://127.0.0.1:7100`）。数据库、登录签发、权威游戏服务和数据库测试工具已迁至后端。完整说明见 [后端 README](../backend/README.md)。

旧生产 workflow 尚未切换到新的四服务拓扑；本地候选不得直接按旧 workflow 发布。

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
