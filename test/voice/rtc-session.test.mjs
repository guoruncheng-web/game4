import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceRtcSession } from '../../src/lib/voice/rtc-session.ts';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise,resolve}; };
function fixture({ getGrant, getTrack } = {}) {
  const events = new Map(); const calls = []; const states = [];
  const track = { stop:()=>calls.push('stop'), close:()=>calls.push('close'), removeAllListeners(){}, on(){} };
  const remote = {uid: 200002, audioTrack: { play:()=>calls.push('play'), stop:()=>calls.push('remote-stop') }};
  const client = {
    remoteUsers:[remote], on:(name, callback)=>events.set(name, callback), removeAllListeners:()=>events.clear(),
    setClientRole:async role=>calls.push(role), join:async()=>calls.push('join'), leave:async()=>calls.push('leave'),
    renewToken:async()=>calls.push('renew'), publish:async()=>calls.push('publish'), unpublish:async()=>calls.push('unpublish'),
    subscribe:async()=>calls.push('subscribe'), enableAudioVolumeIndicator(){},
  };
  const grant = {uid:200001,appId:'a'.repeat(32),channel:'vr_test',token:'private-token',role:'publisher',publishAudio:true,expiresAt:Math.floor(Date.now()/1000)+900};
  const sdk = {on(){},off(){},createClient:()=>client,createMicrophoneAudioTrack:async()=>{calls.push('capture');return getTrack ? getTrack() : track;}};
  const session = new VoiceRtcSession(200001,getGrant ?? (async()=>grant),async()=>sdk,s=>states.push(s));
  session.setAuthority(true,true,[200001,200002]);
  return {session,events,calls,states,track,remote,grant,client};
}
test('joining listens without capturing; microphone needs explicit action',async()=>{
 const f=fixture(); try { await f.session.connect(); assert.ok(f.calls.includes('audience'));assert.ok(!f.calls.includes('capture'));
 await f.session.enableMicrophone();assert.ok(f.calls.includes('publish'));assert.equal(f.states.at(-1).microphone,'on');
 f.session.mute();assert.ok(f.calls.includes('close'));assert.equal(f.states.at(-1).microphone,'off');
 } finally { f.session.dispose(); }
});
test('late microphone permission after departure closes track and never publishes',async()=>{
 const pending=deferred();const f=fixture({getTrack:()=>pending.promise});
 await f.session.connect();const enabling=f.session.enableMicrophone();await tick();assert.ok(f.calls.includes('capture'));
 f.session.disconnect();pending.resolve(f.track);await enabling;
 assert.ok(f.calls.includes('close'));assert.ok(!f.calls.includes('publish'));assert.equal(f.states.at(-1).connection,'idle');f.session.dispose();
});
test('staff revocation stops capture synchronously and does not automatically unmute on reapproval',async()=>{
 const f=fixture();try { await f.session.connect();await f.session.enableMicrophone();
 f.session.setAuthority(true,false,[]);assert.ok(f.calls.includes('close'));assert.equal(f.states.at(-1).microphone,'off');
 f.session.setAuthority(true,true,[200001]);await tick();assert.equal(f.calls.filter(x=>x==='publish').length,1);
 } finally {f.session.dispose();}
});
test('late join token after unmount cannot create a connection',async()=>{
 const p=deferred();const f=fixture({getGrant:()=>p.promise});const joining=f.session.connect();f.session.dispose();p.resolve(f.grant);await joining;assert.ok(!f.calls.includes('join'));
});
test('token renewal denial releases microphone and channel',async()=>{
 const f=fixture();try { await f.session.connect();await f.session.enableMicrophone();
 // The next authoritative request rejects; listeners never receive or expose the token.
 f.session.grant=async()=>{throw Error('401');}; f.events.get('token-privilege-will-expire')();await tick();await tick();
 assert.ok(f.calls.includes('close'));assert.ok(f.calls.includes('leave'));assert.equal(f.states.at(-1).connection,'error');
 } finally {f.session.dispose();}
});
test('revoked membership disconnects listening and discards a pending remote subscription',async()=>{
 const f=fixture();await f.session.connect();f.events.get('user-published')(f.remote,'audio');
 f.session.setAuthority(false,false,[]);await tick();assert.ok(f.calls.includes('remote-stop'));assert.ok(!f.calls.includes('play'));f.session.dispose();
});
test('subscriber token cannot enable microphone despite stale UI permission',async()=>{
 const f=fixture();try {await f.session.connect();f.session.grant=async()=>({...f.grant,publishAudio:false,role:'subscriber'});await f.session.enableMicrophone();assert.ok(!f.calls.includes('capture'));} finally {f.session.dispose();}
});
test('microphone denial leaves listening available and an explicit retry can succeed',async()=>{
 let attempt=0;const f=fixture({getTrack:()=>{if(attempt++===0)throw Object.assign(Error('denied'),{code:'PERMISSION_DENIED'});return f.track;}});
 try{await f.session.connect();await f.session.enableMicrophone();assert.equal(f.states.at(-1).connection,'connected');assert.equal(f.states.at(-1).microphone,'off');assert.match(f.states.at(-1).error,/权限/);await f.session.enableMicrophone();assert.equal(f.states.at(-1).microphone,'on');}finally{f.session.dispose();}
});
test('speaking badge follows sampled remote level only for authorized speakers',async()=>{
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));const f=fixture();let remoteLevel=0.3;f.remote.audioTrack.getVolumeLevel=()=>remoteLevel;
 f.client.remoteUsers.push({uid:300003,audioTrack:{getVolumeLevel:()=>0.9,play(){},stop(){}}});
 try{await f.session.connect();await sleep(450);assert.deepEqual(f.states.at(-1).speakers,[200002]);
 remoteLevel=0;await sleep(1100);assert.deepEqual(f.states.at(-1).speakers,[]);
 remoteLevel=0.3;await sleep(450);f.session.setAuthority(true,true,[200001]);assert.deepEqual(f.states.at(-1).speakers,[]);}finally{f.session.dispose();}
});
test('own speaking badge requires a published microphone and clears on mute',async()=>{
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));const f=fixture();f.track.getVolumeLevel=()=>0.5;
 try{await f.session.connect();await sleep(450);assert.ok(!f.states.at(-1).speakers.includes(200001));
 await f.session.enableMicrophone();await sleep(450);assert.ok(f.states.at(-1).speakers.includes(200001));
 f.session.mute();assert.ok(!f.states.at(-1).speakers.includes(200001));}finally{f.session.dispose();}
});
test('SDK reconnect stops recording and requires a fresh user action after recovery',async()=>{
 const f=fixture();try{await f.session.connect();await f.session.enableMicrophone();f.events.get('connection-state-change')('RECONNECTING');assert.ok(f.calls.includes('close'));assert.ok(f.calls.includes('leave'));await f.session.connect();await tick();assert.equal(f.states.at(-1).connection,'connected');assert.equal(f.states.at(-1).microphone,'off');}finally{f.session.dispose();}
});
