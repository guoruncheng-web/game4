// 本地复现公网 RTC 验收脚本（backend tools/sim/voice/rtc-browser-test.mjs）对房间 DOM 的全部依赖。
//
// 存在的理由：2026-09-14 一次改版删掉了游戏弹窗关闭按钮，而验收脚本当时依赖它，
// 结果直到公网部署才暴露、触发回滚，并且因为 commit 已经进了 main，连带阻塞了他人的发布。
// 改动语聊房 UI 后，推送前先跑这个脚本，可以在本地就发现同类破坏。
//
// 前置：fixture 网关(17220) + 本地生产服务(3342) + Mac 调试 Chrome(9222)。
// 注意 fixture 是内存状态，跑过完整截图脚本后麦位会被占用，需重启 fixture 再验证。
//
// 用法: node tools/sim/voice/verify-room-selectors.mjs
const APP='http://localhost:3342', ROOM=APP+'/voice/visual-fixture';
const t=await(await fetch('http://127.0.0.1:9222/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id){const p=pend.get(m.id); pend.delete(m.id); m.error?p.reject(m.error):p.resolve(m.result);}};
const cdp=(m,p={})=>new Promise((res,rej)=>{pend.set(++id,{resolve:res,reject:rej}); ws.send(JSON.stringify({id,method:m,params:p}));});
const ev=async x=>{const r=await cdp('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails) throw Error('Browser evaluation failed: '+(r.exceptionDetails.exception?.description||'').split('\n')[0]);
  return r.result?.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fail=0;
const ok=(n,v)=>{console.log((v?'PASS ':'FAIL ')+n); if(!v)fail++;};
try{
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Network.setCookie',{name:'gb_session',value:'visual-fixture',url:APP});
  await cdp('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:2,mobile:true});
  await cdp('Page.navigate',{url:ROOM}); await sleep(2800);

  // 验收脚本用到的静态选择器
  for(const sel of ['.voice-microphone-toggle','.voice-message-list','.voice-game-list-entry','.voice-audio-panel','.voice-room-title'])
    ok('存在 '+sel, await ev(`!!document.querySelector('${sel}')`));
  ok('空麦位 aria-label 保持原拼写', await ev(`!!document.querySelector('button[aria-label="3号空麦位，申请上麦"]')`));

  // 游戏弹窗链路，与脚本第 60 步一致
  await ev(`document.querySelector('.voice-game-list-entry').click()`); await sleep(800);
  ok('存在 .voice-game-picker-card', await ev(`!!document.querySelector('.voice-game-picker-card')`));
  await ev(`document.querySelector('.voice-game-picker-card').click()`); await sleep(1500);
  ok('存在 .voice-game-frame', await ev(`!!document.querySelector('.voice-game-frame')`));
  // 与 backend 0773aee 的验收脚本同法：取对话框上方可见蒙层的中点并派发真实鼠标点击
  const scrim = await ev(`(()=>{const s=document.querySelector('.voice-game-window-backdrop');
    const d=s?.querySelector('[role="dialog"]'); if(!s||!d) return null;
    const r=s.getBoundingClientRect(), b=d.getBoundingClientRect();
    const p={x:r.x+r.width/2, y:r.y+(b.top-r.top)/2};
    return b.top>r.top && document.elementFromPoint(p.x,p.y)===s ? p : null;})()`);
  ok('对话框上方存在可点击的蒙层区域', !!scrim);
  if (scrim) {
    await cdp('Input.dispatchMouseEvent', {type:'mousePressed', button:'left', clickCount:1, ...scrim});
    await cdp('Input.dispatchMouseEvent', {type:'mouseReleased', button:'left', clickCount:1, ...scrim});
    await sleep(900);
    ok('点击蒙层后游戏弹窗已关闭', await ev(`!document.querySelector('.voice-game-frame')`));
  }
  ok('点击后回到房间', await ev(`!!document.querySelector('.voice-seat-grid')`));
} catch(e){ console.log('FAIL 异常: '+e.message); fail++; }
finally { try{await cdp('Target.closeTarget',{targetId:t.id});}catch{} ws.close(); }
console.log(fail?`\n${fail} 项失败`:'\n全部通过');
process.exit(fail?1:0);
