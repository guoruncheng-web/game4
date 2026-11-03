import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const helperPath = process.env.COCOS_RUNTIME_HELPER
  || '/Users/mac/projects/cocos-mcp/src/runtime.mjs';
const url = process.argv[2] || 'http://127.0.0.1:3220/thirteen';
const screenshot = process.argv[3];
const resultPath = process.argv[4];

if (screenshot) await mkdir(dirname(screenshot), { recursive: true });
const { runPreview } = await import(pathToFileURL(helperPath).href);
const result = await runPreview({
  url,
  seconds: 12,
  screenshot,
  expression: `(async () => {
    const frame = document.querySelector('iframe[title="Chặt Heo! 西贡牌局"]');
    const doc = frame?.contentDocument;
    const canvas = doc?.querySelector('canvas');
    const gameWindow = frame?.contentWindow;
    return {
      pagePath: location.pathname,
      iframePath: frame ? new URL(frame.src).pathname : null,
      iframeSameOrigin: Boolean(doc),
      loadingOverlayVisible: [...document.querySelectorAll('div')]
        .some((node) => node.textContent === '正在摆好牌桌…' && getComputedStyle(node).display !== 'none'),
      canvas: Boolean(canvas),
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      cocos: typeof gameWindow?.cc !== 'undefined',
      scene: gameWindow?.cc?.director?.getScene?.()?.name || null,
    };
  })()`,
});

if (resultPath) {
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify(result, null, 2));
if (
  result.events.length > 0
  || !result.checked?.iframeSameOrigin
  || !result.checked?.canvas
  || result.checked?.loadingOverlayVisible
) process.exitCode = 1;
