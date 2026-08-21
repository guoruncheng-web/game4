/**
 * 对局 HUD。**走 DOM 而不是画进 3D 场景。**
 *
 * 理由和捕鱼那边一样:文字画进场景既要为每种分辨率单独缩放,又会被光照和特效糊掉,
 * 而 DOM 天生清晰、可点、能自适应。这一款还多一条 —— 参考图里顶栏和聊天流
 * 在对局中一直在,那些本来就是 DOM。
 */

import { MAX_ROUNDS, SEATS } from '../config';
import type { GameState } from '../sim/game';
import { MAX_SCORE, ranking } from '../sim/game';
import { SEAT_HEX } from '../three/board';

const CLASS = 'ludo-hud';

export type HudHandle = {
  update(state: GameState, scores: number[]): void;
  tick(snapshot: { left: number; dice: number[]; state: GameState }): void;
  showResult(state: GameState): void;
  destroy(): void;
};

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function createHud(parent: HTMLElement): HudHandle {
  ensureStyles();
  const root = document.createElement('div');
  root.className = CLASS;
  root.innerHTML = `
    <div class="${CLASS}-brand">
      <div class="${CLASS}-room"><strong>Ludo Room 16</strong><small>Room 972341</small></div>
      <div class="${CLASS}-room-actions"><button type="button">Choose Game⌄</button><span aria-hidden="true">•••</span></div>
    </div>
    <div class="${CLASS}-players">Players: 4/4</div>
    <div class="${CLASS}-status">
      <span class="${CLASS}-clock"><span class="${CLASS}-stopwatch" aria-hidden="true"><i></i></span><b>05:00</b></span>
      <span class="${CLASS}-round"><small>ROUND</small><b>1/${MAX_ROUNDS}</b></span>
    </div>
    <div class="${CLASS}-seats"></div>
    <div class="${CLASS}-bottom">
      <div class="${CLASS}-dice"><span></span><span></span></div>
      <div class="${CLASS}-hint">CHOOSE ONE</div>
    </div>
    <div class="${CLASS}-chat">
      <img class="${CLASS}-chat-icon" src="/ludo/ui/icons/mute-gameplay-v1.png" alt=""><input aria-label="聊天消息" placeholder="Chat..." maxlength="80">
      <button type="button" aria-label="发送"><img src="/ludo/ui/icons/send.png" alt=""></button>
    </div>
    <div class="${CLASS}-feed"><p>Player joined the room</p><p>Game started</p><button type="button">ADD BOT</button></div>
    <div class="${CLASS}-result" hidden></div>`;
  parent.append(root);

  const clock = root.querySelector(`.${CLASS}-clock b`) as HTMLElement;
  const round = root.querySelector(`.${CLASS}-round b`) as HTMLElement;
  const seatsBox = root.querySelector(`.${CLASS}-seats`) as HTMLElement;
  const diceBox = root.querySelector(`.${CLASS}-dice`) as HTMLElement;
  const result = root.querySelector(`.${CLASS}-result`) as HTMLElement;

  const seatEls: HTMLElement[] = [];
  const people = [
    { name: 'You', avatar: '/ludo/avatars/player-03-square-v2.png' },
    { name: 'Arjun', avatar: '/ludo/avatars/player-01-square-v2.png' },
    { name: 'Neha', avatar: '/ludo/avatars/player-02-square-v2.png' },
    { name: 'Rohan', avatar: '/ludo/avatars/player-04-square-v2.png' },
  ];
  for (let seat = 0; seat < SEATS; seat += 1) {
    const el = document.createElement('div');
    el.className = `${CLASS}-seat ${CLASS}-seat-${seat}${seat === 0 ? ` ${CLASS}-you` : ''}`;
    el.style.setProperty('--c', hex(SEAT_HEX[seat]));
    el.innerHTML = `${seat === 0 ? `<span class="${CLASS}-you-tag">YOU</span><span class="${CLASS}-turn-badge">YOUR<br>TURN</span>` : ''}<img class="${CLASS}-avatar" src="${people[seat].avatar}" alt="">
      <span class="${CLASS}-identity"><strong>${people[seat].name}</strong><b><em>0</em></b></span>
      <span class="${CLASS}-pawn" aria-hidden="true"><i></i></span>`;
    seatsBox.append(el);
    seatEls.push(el);
  }
  seatEls[0].append(diceBox.parentElement!);

  return {
    update(state, scores) {
      round.textContent = `${Math.min(state.round, MAX_ROUNDS)}/${MAX_ROUNDS}`;
      seatEls.forEach((el, seat) => {
        el.classList.toggle('is-turn', state.turn === seat && !state.over);
        (el.querySelector('em') as HTMLElement).textContent = String(scores[seat]);
        el.style.setProperty('--p', `${(scores[seat] / MAX_SCORE) * 100}%`);
      });
    },
    tick({ left, dice }) {
      clock.textContent = mmss(left);
      const spans = diceBox.querySelectorAll('span');
      dice.forEach((face, i) => {
        const span = spans[i];
        if (span) {
          span.textContent = '';
          span.setAttribute('data-face', face ? String(face) : '0');
          span.classList.toggle('is-empty', !face);
        }
      });
      // 被撞过的回合会多一个骰子,DOM 要跟着补
      while (diceBox.children.length < dice.length) diceBox.append(document.createElement('span'));
      while (diceBox.children.length > dice.length) diceBox.lastElementChild?.remove();
    },
    showResult(state) {
      const rank = ranking(state);
      const reason = state.over === 'timeup' ? '时间到' : state.over === 'rounds' ? '回合用尽' : '有人跑完了';
      result.hidden = false;
      result.innerHTML = `<h2>${reason}</h2>` + rank
        .map((seat, i) => `<p><i style="background:${hex(SEAT_HEX[seat])}"></i>第 ${i + 1} 名</p>`)
        .join('');
    },
    destroy() {
      root.remove();
    },
  };
}

function ensureStyles(): void {
  if (document.getElementById(`${CLASS}-style`)) return;
  const style = document.createElement('style');
  style.id = `${CLASS}-style`;
  style.textContent = `
.${CLASS} { --board-top:23.1%; --board-size:min(calc(100vw - 10px),54vh,470px); position:absolute; inset:0; z-index:2; pointer-events:none; overflow:hidden; font-family:Arial,system-ui,sans-serif; color:#fff; }
.${CLASS}-brand { pointer-events:auto; position:absolute; top:max(34px,env(safe-area-inset-top)); left:20px; right:18px; height:50px; display:flex; align-items:flex-start; justify-content:space-between; }
.${CLASS}-room { line-height:1.1; }
.${CLASS}-room strong { display:block; color:#fff; font-size:17px; font-weight:800; }
.${CLASS}-room small { display:block; margin-top:5px; color:#c8d5e9; font-size:12px; }
.${CLASS}-room-actions { display:flex; align-items:center; gap:9px; }
.${CLASS}-room-actions button { height:36px; padding:0 12px; border:1px solid #607292; border-radius:7px; background:rgba(24,48,90,.78); color:#fff; font-size:14px; }
.${CLASS}-room-actions span { width:36px; height:36px; display:grid; place-items:center; border-radius:50%; background:#405578; font-size:16px; letter-spacing:1px; }
.${CLASS}-players { position:absolute; left:18px; top:108px; color:#fff; font-size:14px; font-weight:700; }
.${CLASS}-status { position:absolute; top:128px; left:0; right:0; height:48px; font-weight:900; }
.${CLASS}-clock,.${CLASS}-round { min-height:43px; border:2px solid #405777; border-radius:16px; background:linear-gradient(#172d50,#0a1832); box-shadow:0 4px 7px #02091b; display:flex; align-items:center; justify-content:center; }
.${CLASS}-clock { position:absolute; left:14px; min-width:126px; gap:9px; font-size:23px; font-variant-numeric:tabular-nums; }
.${CLASS}-stopwatch { position:relative; width:25px; height:25px; border:3px solid #31d8ff; border-radius:50%; }.${CLASS}-stopwatch::before { content:''; position:absolute; left:7px; top:-8px; width:6px; height:5px; border-radius:2px; background:#31d8ff; }.${CLASS}-stopwatch::after { content:''; position:absolute; left:9px; top:4px; width:3px; height:8px; border-radius:2px; background:#31d8ff; transform-origin:bottom; transform:rotate(-12deg); }.${CLASS}-stopwatch i { position:absolute; right:-5px; top:0; width:6px; height:3px; border-radius:2px; background:#31d8ff; transform:rotate(45deg); }
.${CLASS}-round { position:absolute; left:50%; min-width:132px; transform:translateX(-50%); flex-direction:row; gap:5px; line-height:1; }
.${CLASS}-round small { font-size:14px; color:#dce7f6; }.${CLASS}-round b { margin-top:0; font-size:16px; }
.${CLASS}-seats { position:absolute; left:50%; top:var(--board-top); width:var(--board-size); height:var(--board-size); transform:translateX(-50%); }
.${CLASS}-seat { position:absolute; box-sizing:border-box; width:39.45%; height:39.45%; border-radius:12px; color:#fff; text-shadow:0 2px 2px rgba(0,0,0,.72); }
.${CLASS}-seat-1 { left:.66%; top:.66%; }.${CLASS}-seat-2 { right:.66%; top:.66%; }
.${CLASS}-seat-0 { left:.66%; bottom:.66%; }.${CLASS}-seat-3 { right:.66%; bottom:.66%; }
.${CLASS}-seat.is-turn { box-shadow:inset 0 0 0 3px rgba(255,255,255,.92),inset 0 0 18px var(--c),0 0 9px var(--c); }
.${CLASS}-avatar { position:absolute; left:50%; top:4%; width:31%; aspect-ratio:1; transform:translateX(-50%); border:3px solid #fff; border-radius:50%; background:#17345e; object-fit:cover; box-shadow:0 3px 8px rgba(0,0,0,.55),0 0 0 2px var(--c); }
.${CLASS}-you .${CLASS}-avatar { border-color:#95f2ff; box-shadow:0 0 0 2px #20c8ff,0 0 10px #20c8ff; }
.${CLASS}-seat-0 .${CLASS}-avatar { top:3%; width:27%; }
.${CLASS}-you-tag { position:absolute; z-index:2; left:5%; top:3%; height:17px; padding:1px 7px; border-radius:9px; background:#20bdf5; color:#fff; font-size:9px; font-weight:900; line-height:15px; box-shadow:0 0 5px #20bdf5; }
.${CLASS}-turn-badge { display:none; position:absolute; z-index:3; left:6%; bottom:4%; width:42px; height:42px; place-items:center; border:2px solid #ffe83f; border-radius:50%; background:rgba(91,18,25,.82); color:#fff46c; font-size:8px; font-weight:900; line-height:9px; text-align:center; box-shadow:0 0 9px #ffcb24; }
.${CLASS}-seat.is-turn .${CLASS}-turn-badge { display:grid; }
.${CLASS}-identity { position:absolute; inset:0; display:block; }
.${CLASS}-identity strong { position:absolute; left:7%; right:7%; top:34%; overflow:hidden; font-size:14px; line-height:17px; text-align:center; text-overflow:ellipsis; white-space:nowrap; }
.${CLASS}-identity b { position:absolute; left:8%; right:8%; top:44%; height:15%; display:flex; align-items:center; justify-content:center; gap:6px; border:1px solid rgba(255,255,255,.2); border-radius:999px; background:rgba(4,19,41,.42); box-shadow:inset 0 3px 8px rgba(0,0,0,.26); color:#fff; font-size:23px; line-height:1; }
.${CLASS}-seat-0 .${CLASS}-identity strong { top:31%; }
.${CLASS}-seat-0 .${CLASS}-identity b { top:40%; height:13%; }
.${CLASS}-identity em { font-style:normal; }
.${CLASS}-pawn { display:none; }
.${CLASS}-bottom { position:absolute; left:36%; right:auto; bottom:2%; display:block; }
.${CLASS}-dice { display:flex; gap:6px; }
.${CLASS}-dice span { width:44px; height:44px; border-radius:10px; border:1px solid #f8fbff; background-color:#f8fafc; background-image:radial-gradient(circle,#111 0 11%,transparent 12%); background-repeat:no-repeat; color:#111; display:grid; place-items:center; box-shadow:inset 4px 4px 6px #fff,inset -4px -5px 7px #c7ccd5,0 4px 0 #929dad,0 5px 8px #02091b; }
.${CLASS}-dice span[data-face="1"] { background-position:50% 50%; }
.${CLASS}-dice span[data-face="2"] { background-image:radial-gradient(circle at 28% 28%,#111 0 10%,transparent 11%),radial-gradient(circle at 72% 72%,#111 0 10%,transparent 11%); }
.${CLASS}-dice span[data-face="3"] { background-image:radial-gradient(circle at 27% 27%,#111 0 9%,transparent 10%),radial-gradient(circle at 50% 50%,#111 0 9%,transparent 10%),radial-gradient(circle at 73% 73%,#111 0 9%,transparent 10%); }
.${CLASS}-dice span[data-face="4"] { background-image:radial-gradient(circle at 27% 27%,#111 0 9%,transparent 10%),radial-gradient(circle at 73% 27%,#111 0 9%,transparent 10%),radial-gradient(circle at 27% 73%,#111 0 9%,transparent 10%),radial-gradient(circle at 73% 73%,#111 0 9%,transparent 10%); }
.${CLASS}-dice span[data-face="5"] { background-image:radial-gradient(circle at 27% 27%,#111 0 8%,transparent 9%),radial-gradient(circle at 73% 27%,#111 0 8%,transparent 9%),radial-gradient(circle at 50% 50%,#111 0 8%,transparent 9%),radial-gradient(circle at 27% 73%,#111 0 8%,transparent 9%),radial-gradient(circle at 73% 73%,#111 0 8%,transparent 9%); }
.${CLASS}-dice span[data-face="6"] { background-image:radial-gradient(circle at 28% 24%,#111 0 8%,transparent 9%),radial-gradient(circle at 72% 24%,#111 0 8%,transparent 9%),radial-gradient(circle at 28% 50%,#111 0 8%,transparent 9%),radial-gradient(circle at 72% 50%,#111 0 8%,transparent 9%),radial-gradient(circle at 28% 76%,#111 0 8%,transparent 9%),radial-gradient(circle at 72% 76%,#111 0 8%,transparent 9%); }
.${CLASS}-dice span:first-child { box-shadow:0 0 0 2px #ffe344,0 0 10px #ffb400,0 4px 0 #728cb0; }
.${CLASS}-dice span.is-empty { color:#29466e; font-family:Arial,sans-serif; font-size:26px; }
.${CLASS}-hint { display:none; }
.${CLASS}-feed { pointer-events:auto; position:absolute; left:20px; right:20px; top:calc(var(--board-top) + var(--board-size) + 12px); height:76px; }
.${CLASS}-feed p { width:max-content; max-width:62%; margin:0 0 5px; padding:6px 10px; border-radius:4px; background:rgba(7,24,52,.76); color:#dce8fa; font-size:12px; }
.${CLASS}-feed button { position:absolute; right:0; bottom:5px; width:92px; height:42px; border:0; border-radius:9px; background:url('/ludo/ui/button-green.png') center/100% 100% no-repeat; color:#fff; font-size:14px; font-weight:900; }
.${CLASS}-chat { pointer-events:auto; position:absolute; left:10px; right:10px; bottom:max(8px,env(safe-area-inset-bottom)); height:50px; display:flex; align-items:center; gap:7px; padding:5px; border:2px solid #425b7c; border-radius:16px; background:linear-gradient(#172c4b,#08162f); }
.${CLASS}-chat-icon { width:36px; height:36px; flex:none; object-fit:contain; }
.${CLASS}-chat input { min-width:0; height:36px; flex:1; border:0; outline:0; background:transparent; color:#fff; font-size:16px; }.${CLASS}-chat input::placeholder { color:#99aac3; }
.${CLASS}-chat button { width:70px; height:38px; border:0; border-radius:12px; background:url('/ludo/ui/button-cyan.png') center/100% 100% no-repeat; display:grid; place-items:center; }.${CLASS}-chat button img { width:29px; height:29px; object-fit:contain; }
.${CLASS}-result { position:absolute; inset:0; display:grid; place-content:center; gap:6px;
  z-index:10; background:rgba(4,16,40,.88); text-align:center; }
.${CLASS}-result h2 { font-size:26px; font-weight:900; margin-bottom:8px; }
.${CLASS}-result i { display:inline-block; width:12px; height:12px; border-radius:3px; margin-right:8px; }
@media (max-height:720px) {
  .${CLASS}-brand { transform:scale(.88); transform-origin:top center; }.${CLASS}-status { top:65px; transform:scale(.88); }
  .${CLASS}-bottom { bottom:60px; transform:scale(.86); }.${CLASS}-chat { height:44px; }
}
`;
  document.head.append(style);
}
