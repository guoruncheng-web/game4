/**
 * HUD。**走 DOM 而不是画进 3D 场景。**
 *
 * 和霓虹突击 3D 版同一个理由:文字画进 3D 场景既要为每种分辨率单独缩放、
 * 又会被加色特效糊掉,而 DOM 天生清晰、可点、能自适应。
 *
 * 另一个只有这一款才有的好处:相机在上排座位是整体转 180° 的(见 stage.setFlipped),
 * HUD 挂在 DOM 上就天然不受影响,永远在屏幕下方 —— 换成场景内的文字就得跟着反转补正。
 */

import { GAME_HEIGHT, GAME_WIDTH, SEATS } from '../config';

const CLASS = 'fh-hud';

export type HudHandle = {
  setBalance(value: number): void;
  setLevel(value: number): void;
  setSeatColor(color: number): void;
  setSeat(seat: number): void;
  setAim(angle: number, flipped: boolean): void;
  kick(): void;
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
    <div class="${CLASS}-cannon-visual" aria-hidden="true">
      <div class="${CLASS}-cannon-barrel"><div class="${CLASS}-cannon-barrel-sprite"></div></div>
      <div class="${CLASS}-cannon-base"></div>
    </div>
    <div class="${CLASS}-bar">
      <div class="${CLASS}-wallet">
        <span class="${CLASS}-coin">◎</span>
        <span class="${CLASS}-balance">0</span>
        <span class="${CLASS}-level">Lv.1</span>
      </div>
      <div class="${CLASS}-cannon">
        <button type="button" class="${CLASS}-btn" data-delta="-1" aria-label="降低炮等级">−</button>
        <button type="button" class="${CLASS}-btn" data-delta="1" aria-label="提高炮等级">+</button>
      </div>
    </div>`;
  parent.append(root);

  const balanceEl = root.querySelector(`.${CLASS}-balance`) as HTMLElement;
  const levelEl = root.querySelector(`.${CLASS}-level`) as HTMLElement;
  const hintEl = root.querySelector(`.${CLASS}-hint`) as HTMLElement;
  const cannonEl = root.querySelector(`.${CLASS}-cannon-visual`) as HTMLElement;
  const cannonBarrelEl = root.querySelector(`.${CLASS}-cannon-barrel`) as HTMLElement;
  const cannonBarrelSpriteEl = root.querySelector(`.${CLASS}-cannon-barrel-sprite`) as HTMLElement;
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
    setSeat: (seat) => {
      // 相机翻转后，座位 2/3 的左右也会互换。
      const flipped = !SEATS[seat].up;
      const screenX = flipped ? GAME_WIDTH - SEATS[seat].x : SEATS[seat].x;
      // Three 舞台在超宽屏上按高度保持 1280×800 逻辑坐标并居中扩展左右视野。
      // 用同一套换算放 DOM 炮台，炮口才会和 3D 炮弹的发射原点完全同列。
      const offsetDvh = ((screenX - GAME_WIDTH / 2) / GAME_HEIGHT) * 100;
      cannonEl.style.left = `calc(50% + ${offsetDvh}dvh)`;
      root.style.setProperty('--fh-anchor', `calc(50% + ${offsetDvh}dvh)`);
      const screenLeft = screenX < GAME_WIDTH / 2;
      root.classList.toggle('is-left', screenLeft);
      root.classList.toggle('is-right', !screenLeft);
      cannonEl.classList.toggle('is-left', screenLeft);
      cannonEl.classList.toggle('is-right', !screenLeft);
    },
    setAim: (angle, flipped) => {
      const screenAngle = angle + (flipped ? Math.PI : 0);
      cannonBarrelEl.style.transform = `translateX(-50%) rotate(${screenAngle + Math.PI / 2}rad)`;
    },
    kick: () => {
      cannonBarrelSpriteEl.getAnimations().forEach((animation) => animation.cancel());
      cannonBarrelSpriteEl.animate(
        [
          { transform: 'translateY(0) scaleY(1)' },
          { transform: 'translateY(12px) scaleY(.93)', offset: 0.35 },
          { transform: 'translateY(0) scaleY(1)' },
        ],
        { duration: 130, easing: 'ease-out' },
      );
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
.${CLASS} { position:absolute; inset:0; z-index:5; width:100%; max-width:100%;
  box-sizing:border-box; overflow:hidden; pointer-events:none;
  font-family:system-ui,sans-serif; --fh-seat:#2ee6c8; }
.${CLASS}-bar { position:absolute; left:var(--fh-anchor,20%); bottom:max(5px,env(safe-area-inset-bottom));
  z-index:5; width:258px; height:70px; }
.${CLASS}.is-left .${CLASS}-bar { transform:translateX(-25%); }
.${CLASS}.is-right .${CLASS}-bar { transform:translateX(-75%); }
.${CLASS}-wallet { position:absolute; inset:0; display:grid; grid-template-columns:52px 1fr 52px;
  align-items:center; padding:4px 8px; box-sizing:border-box;
  background:url('/fish-hunter/ui/hud-player.png') center/100% 100% no-repeat;
  filter:drop-shadow(0 5px 10px rgba(0,0,0,.68)); }
.${CLASS}-coin { display:grid; place-items:center; width:35px; height:35px; justify-self:center;
  border:3px solid #ffe58a; border-radius:50%; color:#fff5aa; background:radial-gradient(circle at 35% 30%,#fff09a 0 8%,#ffc928 25%,#c87800 72%);
  box-shadow:0 0 8px #ffc928; font-size:24px; font-weight:1000; line-height:1; }
.${CLASS}-balance { overflow:hidden; padding-left:5px; font-size:27px; font-weight:1000;
  color:#fff; text-shadow:0 2px 3px #00111c,0 0 8px var(--fh-seat); font-variant-numeric:tabular-nums; }
.${CLASS}-level { display:grid; place-items:center; width:43px; height:43px; justify-self:center;
  text-align:center; font-size:15px; font-weight:1000; color:#fff; text-shadow:0 2px 3px #00111c; }
.${CLASS}-cannon { position:absolute; display:flex; align-items:center; gap:74px; left:50%; bottom:62px;
  z-index:7; transform:translateX(-50%); pointer-events:auto; }
.${CLASS}-btn { width:42px; height:42px; border:0; color:transparent; font-size:0;
  background-color:transparent; background-position:center; background-size:contain; background-repeat:no-repeat;
  filter:drop-shadow(0 4px 7px rgba(0,0,0,.45)); cursor:pointer; touch-action:manipulation; }
.${CLASS}-btn[data-delta="-1"] { background-image:url('/fish-hunter/ui/button-minus.png'); }
.${CLASS}-btn[data-delta="1"] { background-image:url('/fish-hunter/ui/button-plus.png'); }
.${CLASS}-btn:active { transform:scale(.94); }
.${CLASS}-hint { position:absolute; left:0; right:0; bottom:92px; z-index:8; text-align:center;
  font-size:17px; font-weight:700; color:#ffd6d6; opacity:0; transition:opacity .18s; }
.${CLASS}-hint.is-on { opacity:1; }
.${CLASS}-cannon-visual { position:absolute; bottom:-24px;
  width:164px; height:202px; z-index:4; pointer-events:none; filter:drop-shadow(0 7px 12px rgba(0,0,0,.72)); }
.${CLASS}-cannon-visual.is-left, .${CLASS}-cannon-visual.is-right { transform:translateX(-50%); }
.${CLASS}-cannon-base { position:absolute; left:50%; bottom:10px; z-index:1; width:158px; height:128px;
  transform:translateX(-50%); background:url('/fish-hunter/ui/cannon-base.png') center/contain no-repeat; }
.${CLASS}-cannon-barrel { position:absolute; left:50%; bottom:64px; z-index:2; width:64px; height:171px;
  transform:translateX(-50%); transform-origin:50% 88%;
  filter:drop-shadow(0 0 7px var(--fh-seat)); }
.${CLASS}-cannon-barrel-sprite { position:absolute; inset:0;
  background:url('/fish-hunter/ui/cannon-barrel.png') center/contain no-repeat; transform-origin:50% 88%; }
@media (max-height:500px), (max-width:680px) {
  .${CLASS}-bar { width:206px; height:56px; bottom:max(3px,env(safe-area-inset-bottom)); }
  .${CLASS}-wallet { grid-template-columns:42px 1fr 42px; padding:3px 6px; }
  .${CLASS}-coin { width:29px; height:29px; border-width:2px; font-size:19px; }
  .${CLASS}-balance { padding-left:3px; font-size:22px; }
  .${CLASS}-level { width:35px; height:35px; font-size:13px; }
  .${CLASS}-cannon { bottom:50px; gap:66px; }
  .${CLASS}-btn { width:42px; height:42px; }
  .${CLASS}-hint { bottom:72px; padding:0 12px; font-size:14px; }
  .${CLASS}-cannon-visual { width:136px; height:168px; bottom:-22px; }
  .${CLASS}-cannon-base { bottom:7px; width:130px; height:105px; }
  .${CLASS}-cannon-barrel { bottom:52px; width:52px; height:139px; }
}
`;
  document.head.append(style);
}
