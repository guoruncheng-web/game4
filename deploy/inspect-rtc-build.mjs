import {readFile,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='/srv/gameai/.backend/rollback/dd9cb9e1461df062fe95c84cb6ce094afab1cff0';
const installed=root+'/failed-node_modules/agora-rtc-sdk-ng/AgoraRTC_N-production.js';
function inspect(source){const start=source.indexOf('async _publishHighStream(');const end=source.indexOf('async _publishLowStream(',start);const method=source.slice(start,end);return {bytes:source.length,sha256:createHash('sha256').update(source).digest('hex'),method:method,awaitedCleanups:(method.match(/throw await /g)||[]).length};}
console.log({currentFrontend:(await readFile('/srv/gameai/.backend/frontend.current','utf8')).trim()});
console.log({installedPath:await realpath(installed),...inspect(await readFile(installed,'utf8'))});
const chunks=root+'/failed-next/static/chunks';
for(const file of await readdir(chunks)){if(!file.endsWith('.js'))continue;const source=await readFile(chunks+'/'+file,'utf8');if(source.includes('async _publishHighStream('))console.log({chunk:file,...inspect(source)});}
