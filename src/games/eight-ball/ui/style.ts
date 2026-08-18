const STYLE_ID = 'eb3-style';

const CSS = `
.eb3 { position:absolute; inset:0; z-index:10; overflow:hidden; pointer-events:none; color:#f7f0dc; font-family:system-ui,-apple-system,sans-serif; --gold:#e5b85c; --green:#1f7a52; --red:#cf5849; }
.eb3 * { box-sizing:border-box; }
.eb3-canvas { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }
.eb3 button,.eb3 input { pointer-events:auto; font:inherit; }
.eb3 button { cursor:pointer; color:inherit; }
.eb3-screen { position:absolute; inset:0; display:grid; place-items:center; padding:24px; pointer-events:auto; background:radial-gradient(circle at 50% 35%,rgba(16,50,35,.55),rgba(5,9,7,.92)); backdrop-filter:blur(4px); }
.eb3-panel { width:min(92vw,430px); max-height:88dvh; overflow:auto; padding:28px 24px; display:flex; flex-direction:column; align-items:center; gap:14px; border:1px solid rgba(229,184,92,.55); border-radius:24px; background:linear-gradient(145deg,rgba(25,20,15,.95),rgba(8,18,13,.96)); box-shadow:0 24px 80px #000a,inset 0 1px rgba(255,255,255,.08); }
.eb3-title { font:900 clamp(38px,10vw,58px)/1 Georgia,serif; letter-spacing:3px; color:var(--gold); text-shadow:0 3px 18px #000; }
.eb3-sub { color:#9eb8aa; font-size:13px; letter-spacing:2px; text-align:center; }
.eb3-label { width:100%; color:#b9a77d; font-size:11px; letter-spacing:3px; }
.eb3-seg { display:flex; width:100%; }
.eb3-seg button { flex:1; padding:12px 5px; border:1px solid #685634; background:#141a16; font-weight:800; }
.eb3-seg button:first-child { border-radius:12px 0 0 12px; }
.eb3-seg button:last-child { border-radius:0 12px 12px 0; }
.eb3-seg button+button { border-left:0; }
.eb3-seg button[aria-pressed=true] { color:#18261d; background:var(--gold); }
.eb3-btn { width:100%; padding:15px; border:1px solid #f0ce7a; border-radius:14px; background:linear-gradient(#efc86f,#bd8736); color:#17231b!important; font-weight:900!important; letter-spacing:2px; box-shadow:0 8px 24px #0007; }
.eb3-btn:active { transform:scale(.97); }
.eb3-btn.ghost { color:#eee5cf!important; background:#19231d; border-color:#5d624d; }
.eb3-record { color:#d8c99f; font-size:13px; }
.eb3-hud { position:absolute; inset:0; padding:max(14px,env(safe-area-inset-top)) 14px max(12px,env(safe-area-inset-bottom)); display:flex; flex-direction:column; justify-content:space-between; }
.eb3-top { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:start; gap:8px; padding-left:62px; }
.eb3-player { min-width:0; padding:10px 12px; border:1px solid rgba(229,184,92,.42); border-radius:16px; background:rgba(10,18,13,.78); box-shadow:0 8px 24px #0007; backdrop-filter:blur(5px); }
.eb3-player.cpu { text-align:right; }
.eb3-name { font-weight:900; font-size:15px; letter-spacing:1px; }
.eb3-group { color:#aabdaf; font-size:11px; white-space:nowrap; }
.eb3-turn { max-width:34vw; padding:8px 12px; border-radius:12px; background:rgba(45,32,17,.88); border:1px solid rgba(229,184,92,.45); color:var(--gold); font-weight:900; font-size:11px; letter-spacing:1px; text-align:center; }
.eb3-menu { position:absolute; right:14px; top:calc(max(14px, env(safe-area-inset-top)) + 72px); padding:9px 12px; border:1px solid #75633c; border-radius:11px; background:rgba(18,24,20,.82); font-size:11px; font-weight:800; }
.eb3-bottom { width:min(94vw,520px); margin:0 auto; padding:12px 14px 10px; border:1px solid rgba(229,184,92,.45); border-radius:18px; background:rgba(13,18,15,.86); backdrop-filter:blur(7px); box-shadow:0 10px 35px #0009; }
.eb3-message { min-height:19px; margin-bottom:7px; text-align:center; color:var(--gold); font-size:13px; font-weight:800; }
.eb3-message.bad { color:#ff7969; }
.eb3-power-row { display:flex; align-items:center; gap:10px; }
.eb3-power-row span { font-size:11px; font-weight:900; letter-spacing:1px; }
.eb3-power { flex:1; height:28px; accent-color:#d4a64b; touch-action:none; }
.eb3-hint { margin-top:2px; color:#7f998b; text-align:center; font-size:10px; letter-spacing:.5px; }
.eb3-toast { position:absolute; left:50%; top:22%; transform:translateX(-50%); padding:10px 18px; border:1px solid rgba(229,184,92,.55); border-radius:999px; background:rgba(10,18,13,.88); color:#f4d783; font-weight:900; animation:eb3-toast 1.35s ease-out forwards; }
@keyframes eb3-toast { 0%{opacity:0;transform:translate(-50%,12px)} 15%,70%{opacity:1;transform:translate(-50%,0)} 100%{opacity:0;transform:translate(-50%,-10px)} }
@media (max-width:390px) { .eb3-top{padding-left:56px;gap:5px}.eb3-player{padding:8px}.eb3-turn{padding:8px 6px;font-size:10px}.eb3-group{font-size:10px} }
@media (max-height:700px) { .eb3-player{padding:7px 9px}.eb3-bottom{padding:8px 12px}.eb3-hint{display:none} }
`;

export function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

export function removeStyles() { document.getElementById(STYLE_ID)?.remove(); }

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
