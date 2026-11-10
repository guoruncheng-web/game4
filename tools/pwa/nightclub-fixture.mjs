/** 仅在 loopback 启动的 UI 夹具，不签发会话或 RTC 票据，不连接真实后端。 */
import http from 'node:http';
const port=Number(process.env.NIGHTCLUB_FIXTURE_PORT??3202);
const me={uid:123456,username:'夜行玩家',avatar:'夜',avatarUrl:null,isAdmin:false};
const friend={id:2,uid:234567,username:'小林',avatar:'林',avatarUrl:null,lastMessage:'今晚来一局吗？',lastMessageAt:'2026-11-09T18:30:00Z',unreadCount:2};
const members=[{...me,role:'owner',status:'active',micSeat:1,micRequestedAt:null,mutedByStaff:false,joinedAt:'2026-11-09T18:00:00Z'},{...friend,role:'member',status:'active',micSeat:2,micRequestedAt:null,mutedByStaff:false,joinedAt:'2026-11-09T18:00:00Z'},{uid:345678,username:'阿乔',avatar:'乔',avatarUrl:null,role:'member',status:'active',micSeat:3,micRequestedAt:null,mutedByStaff:true,joinedAt:'2026-11-09T18:00:00Z'}];
const room={id:'nightclub-preview',title:'今晚，随便聊聊',gameSlug:'thirteen',visibility:'friends',state:'open',roomCode:'246810',maxMembers:12,maxSpeakers:8,requiresMicApproval:true,members,me:members[0]};
const roomMessages=[{id:1,content:'收工啦，找个地方坐一会。',createdAt:'2026-11-09T18:30:00Z',sender:friend},{id:2,content:'来一局，也聊聊今天。',createdAt:'2026-11-09T18:31:00Z',sender:me}];
const messages=[{id:1,senderId:2,recipientId:1,content:'今晚来一局吗？',createdAt:'2026-11-09T18:30:00Z',mine:false},{id:2,senderId:1,recipientId:2,content:'好呀，先去语音房坐一会。',createdAt:'2026-11-09T18:31:00Z',mine:true}];
const defaults={roomsEmpty:false,friendsEmpty:false,voiceError:false,longName:false,searchEmpty:false,searchError:false,pendingRequest:false,roomSendError:false,privateSendError:false,viewer:false};
const state={...defaults};
const searchedUser={...friend,id:4,uid:456789,username:'小夏',avatar:'夏',lastMessage:null,unreadCount:0,isFriend:false,requestSent:false,requestReceived:false};
const roomView=()=>state.viewer?{...room,me:{...room.me,role:'member'},members:room.members.map(m=>({...m,role:m.uid===friend.uid?'owner':'member'}))}:room;
const requests=[];
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');let raw='';for await(const chunk of req)raw+=chunk;let body={};try{body=raw?JSON.parse(raw):{};}catch{}
 const send=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-qubaowan-fixture':'nightclub-ui-only'});res.end(JSON.stringify(data));};
 if(url.pathname==='/__fixture'){if(req.method==='POST'){if(body.reset){requests.length=0;messages.splice(2);roomMessages.splice(2);Object.assign(state,defaults);}Object.assign(state,body);}return send({state,requests});}
 requests.push({method:req.method,path:url.pathname});
 if(url.pathname==='/api/auth/me')return send({user:req.headers.cookie?.includes('gb_session=nightclub-ui-fixture')?{...me,username:state.longName?'这是一个用于验证中文长用户名换行的夜游玩家名字':me.username}:null,token:null});
 if(url.pathname==='/api/auth/captcha'){res.writeHead(200,{'content-type':'image/svg+xml','cache-control':'no-store','x-qubaowan-fixture':'display-only-captcha'});return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="168" height="56" viewBox="0 0 168 56"><rect width="168" height="56" rx="8" fill="#f7f8fa"/><path d="M4 38L160 15M9 12L159 43" stroke="#cce9e0" stroke-width="2"/><text x="23" y="39" fill="#258e70" font-family="monospace" font-size="32" font-weight="bold" letter-spacing="7">W7K2</text></svg>');}
 if(url.pathname==='/api/auth/login')return send({error:'账号或密码不对',requireCaptcha:true},401);
 if(url.pathname==='/api/auth/register')return send({code:'registration_closed',error:'暂未开放注册'},403);
 if(url.pathname==='/api/auth/logout'){res.setHeader('set-cookie','gb_session=; Path=/; Max-Age=0');return send({ok:true});}
 if(url.pathname==='/api/wallet')return send({diamonds:1200});
 if(url.pathname==='/api/games')return send({games:['thirteen','umo','ludo','eight-ball','fruit-slasher','triple-pile','fish-hunter','star-runner','neon-strike-2d','neon-strike','thirteen-social'].map(slug=>({slug,enabled:slug!=='neon-strike-2d'}))});
 if(url.pathname==='/api/friends'&&req.method==='POST')return send({ok:true});
 if(url.pathname==='/api/friends')return send({friends:state.friendsEmpty?[]:[friend,{...friend,id:3,uid:345678,username:'阿乔',avatar:'乔',lastMessage:'下次一起玩！',unreadCount:0}]});
 if(url.pathname==='/api/friend-requests'){if(req.method==='PATCH'){state.pendingRequest=false;return send({friend:searchedUser});}return send({requests:state.pendingRequest?[{id:41,createdAt:'2026-11-09T18:30:00Z',sender:searchedUser}]:[]});}
 if(url.pathname==='/api/friends/search')return state.searchError?send({error:'搜索暂时不可用'},503):send({users:state.searchEmpty?[]:[searchedUser]});
 if(url.pathname==='/api/messages'){if(req.method==='POST'){if(state.privateSendError)return send({error:'消息发送失败，请重试'},503);const message={id:messages.length+1,senderId:1,recipientId:body.friendId,content:body.content,createdAt:new Date().toISOString(),mine:true};messages.push(message);return send({message});}return send({messages});}
 if(url.pathname.startsWith('/api/voice')){
  if(state.voiceError)return send({error:'upstream_unavailable'},503);
  if(url.pathname==='/api/voice/invites')return send({invites:[{id:'fixture-invite',roomId:room.id,roomTitle:room.title,gameSlug:'thirteen',inviter:{uid:friend.uid,username:friend.username},expiresAt:'2099-01-01T00:00:00Z'}]});
  if(url.pathname==='/api/voice/rooms'){if(req.method==='POST')return send({...room,title:body.title,visibility:body.visibility,requiresMicApproval:body.requiresMicApproval});return send({rooms:state.roomsEmpty?[]:[room,{...room,id:'second-preview',title:'桌游玩家小聚',gameSlug:'umo',members:members.slice(0,2)}]});}
  if(url.pathname.endsWith('/rtc-token'))return send({error:'rtc_not_configured'},503);
  if(url.pathname.endsWith('/messages')){if(req.method==='POST'){if(state.roomSendError)return send({error:'消息发送失败，请稍后重试'},503);roomMessages.push({id:roomMessages.length+1,content:body.content,createdAt:new Date().toISOString(),sender:me});return send({ok:true});}return send({messages:roomMessages});}
  if(url.pathname.endsWith('/mic-request')){room.me.micRequestedAt=body.action==='request'?new Date().toISOString():null;if(body.action==='release')room.me.micSeat=null;return send({state:'pending',room});}
  return send(roomView());
 }
 return send({error:'fixture_route_missing',path:url.pathname},404);
}).listen(port,'127.0.0.1',()=>console.log('UI-only fixture on loopback port '+port));
