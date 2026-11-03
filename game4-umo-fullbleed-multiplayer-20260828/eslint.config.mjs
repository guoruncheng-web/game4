import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 官方 EffekseerForWebGL 压缩运行时,不是项目源码。
    "public/ludo/effekseer/runtime/**",
    // UMO 同样提交已在源项目验收过的 Creator release，不重复扫描生成代码。
    "public/umo/game/**",
  ]),
]);

export default eslintConfig;
