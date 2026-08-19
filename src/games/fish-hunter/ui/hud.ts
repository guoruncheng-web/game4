/**
 * HUD。**走 DOM 而不是画进 3D 场景。**
 *
 * 和霓虹突击 3D 版同一个理由:文字画进 3D 场景既要为每种分辨率单独缩放、
 * 又会被加色特效糊掉,而 DOM 天生清晰、可点、能自适应。
 *
 * 另一个只有这一款才有的好处:相机在上排座位是整体转 180° 的(见 stage.setFlipped),
 * HUD 挂在 DOM 上就天然不受影响,永远在屏幕下方 —— 换成场景内的文字就得跟着反转补正。
 */

const CLASS = 'fh-hud';

export type HudHandle = {
  setBalance(value: number): void;
  setLevel(value: number): void;
  setSeatColor(color: number): void;
  hint(text: string, ms?: number): void;
  onLevel(handler: (delta: number) => void): void;
  destroy(): void;
};

export function createHud(parent: HTMLElement): HudHandle {
  ensureStyles();

  const root = document.createElement('div');
  root.className = CLASS;
  root.innerHTML = `
    <div class="${CLASS}-hint"></div>
    <div class="${CLASS}-bar">
      <div class="${CLASS}-wallet">
        <span class="${CLASS}-label">金币</span>
        <span class="${CLASS}-balance">0</span>
      </div>
      <div class="${CLASS}-cannon">
        <button type="button" class="${CLASS}-btn" data-delta="-1" aria-label="降低炮等级">−</button>
        <span class="${CLASS}-level">Lv.1</span>
        <button type="button" class="${CLASS}-btn" data-delta="1" aria-label="提高炮等级">+</button>
      </div>
    </div>`;
  parent.append(root);

  const balanceEl = root.querySelector(`.${CLASS}-balance`) as HTMLElement;
  const levelEl = root.querySelector(`.${CLASS}-level`) as HTMLElement;
  const hintEl = root.querySelector(`.${CLASS}-hint`) as HTMLElement;
  let hintTimer = 0;
  let levelHandler: ((delta: number) => void) | null = null;

  const onClick = (event: Event) => {
    const target = (event.target as HTMLElement).closest(`.${CLASS}-btn`) as HTMLElement | null;
    if (!target) return;
    // 换炮按钮必须吃掉事件:不然这一下点击会穿透到画布,变成"顺手开了一炮"
    event.stopPropagation();
    event.preventDefault();
    levelHandler?.(Number(target.dataset.delta));
  };
  root.addEventListener('pointerdown', onClick);

  return {
    setBalance: (value) => { balanceEl.textContent = String(value); },
    setLevel: (value) => { levelEl.textContent = `Lv.${value}`; },
    setSeatColor: (color) => {
      root.style.setProperty('--fh-seat', `#${color.toString(16).padStart(6, '0')}`);
    },
    hint: (text, ms = 2600) => {
      hintEl.textContent = text;
      hintEl.classList.add('is-on');
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => hintEl.classList.remove('is-on'), ms);
    },
    onLevel: (handler) => { levelHandler = handler; },
    destroy: () => {
      window.clearTimeout(hintTimer);
      root.removeEventListener('pointerdown', onClick);
      root.remove();
    },
  };
}

function ensureStyles(): void {
  if (document.getElementById(`${CLASS}-style`)) return;
  const style = document.createElement('style');
  style.id = `${CLASS}-style`;
  style.textContent = `
.${CLASS} { position:absolute; inset:auto 0 0 0; z-index:5; pointer-events:none;
  font-family:system-ui,sans-serif; --fh-seat:#2ee6c8; }
.${CLASS}-bar { display:flex; align-items:center; justify-content:space-between;
  gap:12px; padding:10px 18px calc(10px + env(safe-area-inset-bottom)); }
.${CLASS}-wallet { display:flex; flex-direction:column; line-height:1.05; }
.${CLASS}-label { font-size:12px; color:#7fa6bd; font-weight:700; }
.${CLASS}-balance { font-size:30px; font-weight:900; color:#f6d365; font-variant-numeric:tabular-nums; }
.${CLASS}-cannon { display:flex; align-items:center; gap:10px; pointer-events:auto; }
.${CLASS}-level { min-width:64px; text-align:center; font-size:24px; font-weight:900; color:var(--fh-seat); }
.${CLASS}-btn { width:46px; height:46px; border-radius:14px; border:1px solid rgba(255,255,255,.18);
  background:rgba(6,36,53,.78); color:#cfe9f7; font-size:24px; font-weight:700;
  backdrop-filter:blur(6px); cursor:pointer; touch-action:manipulation; }
.${CLASS}-btn:active { transform:scale(.94); }
.${CLASS}-hint { position:absolute; left:0; right:0; bottom:86px; text-align:center;
  font-size:17px; font-weight:700; color:#ffd6d6; opacity:0; transition:opacity .18s; }
.${CLASS}-hint.is-on { opacity:1; }
`;
  document.head.append(style);
}
