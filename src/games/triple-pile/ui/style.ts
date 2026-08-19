/**
 * 覆盖层样式。
 *
 * 和 neon-strike 一样写成一段自带前缀的 CSS 注入,不走 Tailwind ——
 * 这些类名活在 .ts 字符串里,一旦 Tailwind 的内容扫描规则变了就会被当成没用到而摇掉。
 *
 * 另一条硬要求:覆盖层整体 pointer-events: none,只有按钮自己打开。
 * 拾取靠的是画布上的 pointer 事件,DOM 层挡住它就等于游戏不能玩了。
 */

const STYLE_ID = 'tp-style';

const CSS = `
.tp {
  position: absolute; inset: 0; z-index: 10;
  font-family: system-ui, -apple-system, "PingFang SC", sans-serif;
  color: #ffeacf; pointer-events: none; overflow: hidden;
  --gold: #e8b45c; --dim: #c7a582; --warn: #ff8a5c;
  /* 素材统一放这里,换皮只改这一处 */
  --ui: url("/triple-pile/ui");
}
.tp * { box-sizing: border-box; }
.tp button { pointer-events: auto; font: inherit; color: inherit; cursor: pointer; border: none; background: none; padding: 0; }
.tp-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

/* ---------------------------------------------------------------- HUD */
.tp-hud { position: absolute; inset: 0; }
.tp-top {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; gap: 10px;
}
.tp-spacer { width: 46px; flex: none; }
.tp-right { display: flex; align-items: center; gap: 10px; }

/* 木框按钮:整块都是素材,不再用 CSS 画边框和渐变 */
.tp-pause {
  width: 46px; height: 46px; flex: none;
  background: url("/triple-pile/ui/button-pause.png") center/contain no-repeat;
  transition: transform 0.1s ease;
}
.tp-pause:active { transform: scale(0.92); }

/*
 * 计时器用 border-image 九宫格:两端的金色端帽不能被拉伸,中间那段才随文字变宽。
 * 切片 70 是从素材量的(端帽半径),border 26px = 70 × (渲染高 52 / 素材高 141),
 * 横竖缩放比一致,端帽才不会变形。改素材必须重量这两个数。
 */
.tp-timer {
  height: 52px; min-width: 132px;
  display: flex; align-items: center; justify-content: center;
  border: 0 solid transparent; border-left-width: 26px; border-right-width: 26px;
  border-image: url("/triple-pile/ui/timer-panel.png") 0 70 fill / 0 26px stretch;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 25px; font-weight: 700; letter-spacing: 1px;
  color: #ffe6b8; text-shadow: 0 2px 3px rgba(0,0,0,0.55);
}
.tp-timer.tp-urgent { color: #ff9b74; }

.tp-left {
  min-width: 44px; text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; color: var(--dim); line-height: 1.3;
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
}
.tp-left b { display: block; font-size: 19px; color: #ffeacf; }

/* 开局提示 / 分数飘字:同一张胶囊素材,切片 80、border 28px = 80 × (56/159) */
.tp-toast {
  border: 0 solid transparent; border-left-width: 28px; border-right-width: 28px;
  border-image: url("/triple-pile/ui/toast-panel.png") 0 80 fill / 0 28px stretch;
  min-height: 56px; display: flex; align-items: center; justify-content: center;
}
.tp-tip {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: 25%;
  font-size: 14px; white-space: nowrap; color: #ffe6b8;
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
  transition: opacity 0.4s ease;
}
.tp-float {
  position: absolute; left: 50%; bottom: 21%; transform: translateX(-50%);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 24px; font-weight: 700; color: #ffdf9c; padding: 0 6px;
  text-shadow: 0 2px 3px rgba(0,0,0,0.6);
  animation: tp-rise 0.6s ease-out forwards; pointer-events: none;
}
@keyframes tp-rise {
  from { opacity: 1; transform: translate(-50%, 0); }
  to { opacity: 0; transform: translate(-50%, -52px); }
}

/* ---------------------------------------------------------------- 道具 */
.tp-powers {
  position: absolute; left: 0; right: 0; bottom: 96px;
  display: flex; justify-content: center; gap: 18px;
}
.tp-power {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  transition: transform 0.1s ease, filter 0.15s ease;
}
.tp-power i {
  display: block; width: 58px; height: 58px;
  /*
   * 底下垫一层木纹金边的 CSS 兜底:「打乱」的图标素材还没有,
   * 图片 404 时这层会露出来,按钮仍然能看能用,不会变成一个空洞。
   */
  background:
    var(--icon, none) center/contain no-repeat,
    linear-gradient(#7a4a24, #4a2a12);
  border-radius: 14px;
  box-shadow: inset 0 0 0 3px rgba(232,180,92,0.85), 0 3px 6px rgba(0,0,0,0.4);
}
.tp-power span {
  font-size: 12px; font-weight: 700; color: #ffe6b8;
  text-shadow: 0 1px 2px rgba(0,0,0,0.7);
}
.tp-power:active { transform: translateY(2px); }
/* 用完就变灰。不出现 + 号,这一款没有任何付费入口 */
.tp-power:disabled { filter: grayscale(0.85) brightness(0.55); cursor: default; }

/* ---------------------------------------------------------------- 弹层 */
.tp-screen {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: rgba(14, 9, 6, 0.66); backdrop-filter: blur(2px); pointer-events: auto;
  padding: 20px;
}
/* 面板:切片 60 是四角的装饰角,border 44px = 60 × (渲染宽 400 / 素材宽 540) */
.tp-panel {
  width: min(400px, 94%); max-height: 100%; overflow-y: auto;
  border: 44px solid transparent;
  border-image: url("/triple-pile/ui/modal-panel.png") 60 fill / 44px stretch;
  text-align: center; color: #ffe6b8;
}
.tp-title { font-size: 23px; font-weight: 700; letter-spacing: 2px; text-shadow: 0 2px 3px rgba(0,0,0,0.6); }
.tp-sub { margin-top: 6px; font-size: 13px; color: var(--dim); line-height: 1.7; white-space: pre-line; }
.tp-stats { margin: 14px 0 4px; display: grid; gap: 6px; font-size: 14px; }
.tp-stats span { display: flex; justify-content: space-between; }
.tp-stats span i { font-style: normal; color: var(--dim); }
.tp-actions { margin-top: 16px; display: flex; flex-direction: column; gap: 9px; }
.tp-btn {
  padding: 11px 18px; border-radius: 12px; font-size: 16px; font-weight: 700;
  color: #3d2409; background: linear-gradient(#f0c268, #cf9436);
  box-shadow: inset 0 0 0 2px rgba(255,236,190,0.5), 0 3px 0 rgba(96,52,12,0.9);
}
.tp-btn.tp-ghost {
  background: rgba(255,230,184,0.08); color: #ffd89a;
  box-shadow: inset 0 0 0 2px rgba(232,180,92,0.55);
}
.tp-btn:active { transform: translateY(2px); }

/* ---------------------------------------------------------------- 关卡选择 */
.tp-levels { margin-top: 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
.tp-level {
  aspect-ratio: 1; border-radius: 12px; font-size: 17px; font-weight: 700; color: #ffd89a;
  background: rgba(255,230,184,0.08); box-shadow: inset 0 0 0 2px rgba(232,180,92,0.45);
  display: grid; place-items: center; line-height: 1.15;
}
.tp-level.tp-done { background: linear-gradient(#f0c268, #cf9436); color: #3d2409; box-shadow: inset 0 0 0 2px rgba(255,236,190,0.5); }
.tp-level:disabled { opacity: 0.3; cursor: default; }
.tp-level small { display: block; font-size: 9px; font-weight: 500; opacity: 0.8; }

.tp-loading { display: grid; place-items: center; height: 100%; font-size: 15px; color: var(--dim); }
`;

export function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.append(el);
}

export function removeStyles() {
  document.getElementById(STYLE_ID)?.remove();
}
