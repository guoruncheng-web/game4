/**
 * 覆盖层样式。
 *
 * 全部写成一段自带前缀的 CSS 注入 —— 不走 Tailwind,是因为这些类名活在 .ts 字符串里,
 * 一旦哪天 Tailwind 的内容扫描规则变了就会被当成没用到而摇掉,线上直接裸奔。
 * 这里的样式和游戏一起加载、一起卸载,自成一套。
 */

const STYLE_ID = 'ns3-style';

const CSS = `
.ns3 {
  position: absolute; inset: 0; z-index: 10;
  font-family: system-ui, -apple-system, "PingFang SC", sans-serif;
  color: #eafbff; pointer-events: none; overflow: hidden;
  --cyan: #54ecff; --dim: #7fabc4; --warn: #ff6b63; --amber: #ffb04a; --green: #60f5a8;
}
.ns3 * { box-sizing: border-box; }
.ns3 button { pointer-events: auto; font: inherit; color: inherit; cursor: pointer; }
.ns3-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

/* ---------------------------------------------------------------- HUD */
.ns3-hud { position: absolute; inset: 0; padding: 14px 16px; }
.ns3-hud-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ns3-score-wrap { padding-left: 56px; }
.ns3-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; letter-spacing: 3px; color: #55eaff; opacity: 0.85;
}
.ns3-score {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 30px; font-weight: 700; line-height: 1.05;
  text-shadow: 0 0 12px rgba(84, 236, 255, 0.55);
}
.ns3-status {
  text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 15px; font-weight: 700; line-height: 1.7; color: #bffaff;
  text-shadow: 0 0 10px rgba(84, 236, 255, 0.4);
}
.ns3-lives { color: var(--green); letter-spacing: 2px; }
.ns3-pwr { color: var(--amber); letter-spacing: 2px; }

.ns3-pause {
  position: absolute; top: 62px; left: 16px;
  width: 42px; height: 42px; border-radius: 999px;
  background: rgba(9, 40, 58, 0.72); border: 1px solid rgba(84, 236, 255, 0.6);
  display: grid; place-items: center; backdrop-filter: blur(3px);
  transition: transform 0.12s ease, border-color 0.12s ease;
}
.ns3-pause:hover { border-color: var(--cyan); }
.ns3-pause:active { transform: scale(0.9); }
.ns3-pause i { width: 4px; height: 15px; background: #bdf6ff; display: block; }
.ns3-pause span { display: flex; gap: 4px; }

/* Boss 血条 */
.ns3-boss { position: absolute; top: 116px; left: 50%; transform: translateX(-50%); width: min(78vw, 420px); }
.ns3-boss[hidden] { display: none; }
.ns3-boss-row {
  display: flex; justify-content: space-between; align-items: baseline;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  color: var(--warn); letter-spacing: 1px; margin-bottom: 5px;
}
.ns3-boss-track { height: 10px; background: rgba(23, 9, 13, 0.8); border: 1px solid rgba(255, 75, 82, 0.45); }
.ns3-boss-fill {
  height: 100%; width: 100%; background: #ff4b52; transform-origin: left center;
  box-shadow: 0 0 14px rgba(255, 75, 82, 0.7); transition: background-color 0.2s ease;
}

/* 连击 */
.ns3-combo {
  position: absolute; right: 18px; top: 50%; transform: translateY(-50%);
  text-align: center; font-weight: 800; font-size: 26px; color: #ffc34d; line-height: 1.1;
  text-shadow: 0 0 16px rgba(255, 195, 77, 0.65);
}
.ns3-combo[hidden] { display: none; }
.ns3-combo small { display: block; font-size: 11px; letter-spacing: 3px; opacity: 0.8; }

/* 护盾 */
.ns3-shield {
  position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  color: #7ff7ff; letter-spacing: 1px; text-shadow: 0 0 10px rgba(84, 236, 255, 0.6);
}
.ns3-shield[hidden] { display: none; }

/* 波次横幅 / 浮字 / 屏闪 */
.ns3-banner {
  position: absolute; left: 0; right: 0; top: 34%; text-align: center;
  font-weight: 900; font-size: clamp(28px, 7vw, 44px); letter-spacing: 2px;
  opacity: 0; color: #b9faff; text-shadow: 0 0 24px rgba(84, 236, 255, 0.7);
}
.ns3-banner.boss { color: #ff779f; text-shadow: 0 0 26px rgba(255, 119, 159, 0.75); }
.ns3-banner.show { animation: ns3-banner 1.5s ease-out; }
@keyframes ns3-banner {
  0% { opacity: 0; transform: translateY(18px) scale(0.94); }
  18% { opacity: 1; transform: translateY(0) scale(1); }
  72% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-14px); }
}
.ns3-floats {
  position: absolute; left: 0; right: 0; bottom: 22%;
  display: flex; flex-direction: column-reverse; align-items: center; gap: 4px;
}
.ns3-float {
  font-weight: 800; font-size: 19px; color: #fff3a8;
  text-shadow: 0 0 14px rgba(255, 220, 120, 0.7); animation: ns3-float 0.9s ease-out forwards;
}
.ns3-float.bad { color: #ff8f88; text-shadow: 0 0 14px rgba(255, 100, 90, 0.7); }
@keyframes ns3-float {
  0% { opacity: 0; transform: translateY(10px); }
  20% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-26px); }
}
.ns3-flash {
  position: absolute; inset: 0; background: #ffffff; opacity: 0;
  mix-blend-mode: screen; transition: opacity 0.24s ease-out;
}

/* ---------------------------------------------------------------- 弹层 */
.ns3-screen {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px; padding: 24px;
  background: radial-gradient(120% 90% at 50% 40%, rgba(5, 13, 25, 0.72), rgba(3, 6, 18, 0.95));
  pointer-events: auto; backdrop-filter: blur(2px);
  animation: ns3-fade 0.24s ease-out;
}
@keyframes ns3-fade { from { opacity: 0; } to { opacity: 1; } }
.ns3-panel {
  width: min(92vw, 430px); padding: 26px 24px;
  background: rgba(5, 13, 25, 0.88); border: 1px solid rgba(84, 236, 255, 0.45);
  box-shadow: 0 0 42px rgba(20, 120, 170, 0.25), inset 0 0 42px rgba(20, 120, 170, 0.1);
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  clip-path: polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px);
}
.ns3-title {
  font-weight: 900; font-size: clamp(32px, 9vw, 46px); letter-spacing: 3px; line-height: 1;
  text-shadow: 0 0 26px rgba(84, 236, 255, 0.6);
}
.ns3-sub {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; letter-spacing: 2px; color: var(--warn);
}
.ns3-note { font-size: 13px; color: var(--dim); text-align: center; line-height: 1.6; }
.ns3-big {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 52px; font-weight: 700; letter-spacing: 2px;
  text-shadow: 0 0 22px rgba(84, 236, 255, 0.5);
}

.ns3-btn {
  width: 100%; padding: 15px 18px; background: rgba(9, 40, 58, 0.9);
  border: 2px solid var(--cyan); font-size: 19px; font-weight: 700; letter-spacing: 2px;
  transition: transform 0.1s ease, background-color 0.15s ease, box-shadow 0.15s ease;
  clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
}
.ns3-btn:hover { background: rgba(19, 70, 96, 0.95); box-shadow: 0 0 22px rgba(84, 236, 255, 0.35); }
.ns3-btn:active { transform: scale(0.97); }
.ns3-btn.ghost { border-color: rgba(255, 176, 74, 0.8); font-size: 16px; padding: 12px 16px; }
.ns3-btn.ghost:hover { box-shadow: 0 0 22px rgba(255, 176, 74, 0.3); }
.ns3-btn:disabled { border-color: #37485a; color: #5f7386; cursor: not-allowed; opacity: 0.75; }

.ns3-seg { display: flex; width: 100%; gap: 0; }
.ns3-seg button {
  flex: 1; padding: 11px 4px; background: rgba(9, 40, 58, 0.7);
  border: 1px solid rgba(84, 236, 255, 0.35); font-size: 15px; font-weight: 700;
  color: var(--dim); transition: all 0.15s ease;
}
.ns3-seg button + button { border-left: none; }
.ns3-seg button[aria-pressed="true"] {
  background: rgba(84, 236, 255, 0.16); color: #eafbff; border-color: var(--cyan);
  box-shadow: inset 0 0 18px rgba(84, 236, 255, 0.22);
}
.ns3-row { display: flex; width: 100%; align-items: center; gap: 10px; }
.ns3-row .ns3-label { flex: none; }
.ns3-vol { flex: 1; accent-color: #54ecff; pointer-events: auto; }
.ns3-records {
  width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; color: var(--dim); line-height: 1.9;
}
.ns3-records div { display: flex; justify-content: space-between; gap: 10px; }

/* 加载页 */
.ns3-load-track { width: min(70vw, 300px); height: 6px; background: rgba(84, 236, 255, 0.15); }
.ns3-load-fill { height: 100%; width: 0%; background: var(--cyan); box-shadow: 0 0 16px var(--cyan); transition: width 0.2s ease; }
`;

export function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

export function removeStyles() {
  document.getElementById(STYLE_ID)?.remove();
}

/** 小工具:建一个带类名和文本的元素 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className = '', text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
