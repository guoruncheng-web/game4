import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Exercise the exact cleanup expression shipped in the pinned SDK patch.
test('SDK publish cleanup awaits the rejected async generator and preserves the original error', async () => {
 const patch=readFileSync(new URL('../../patches/agora-rtc-sdk-ng@4.24.8.patch',import.meta.url),'utf8');
 const source=patch.split('\n').find(line=>line.startsWith('+')&&line.includes('async _publishHighStream('));
 const method=source.slice(source.indexOf('async _publishHighStream('),source.indexOf('async _publishLowStream('));
 const statements=method.match(/throw await n\.throw\(e\)\.catch\(\(\)=>\{\}\),e/g);
 assert.equal(statements?.length,2);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const execute=new AsyncFunction('n','e',statements[0]);
 const original=Object.assign(new Error('publish interrupted'),{code:'WS_ABORT'});
 let cleaned=false;
 async function* operation(){try{yield 'offer';}finally{await Promise.resolve();cleaned=true;}}
 const iterator=operation();await iterator.next();
 await assert.rejects(execute(iterator,original),error=>error===original);
 assert.equal(cleaned,true);
 await new Promise(resolve=>setImmediate(resolve));
});

test('SDK nested media publishers await cleanup before rethrowing the publish error', async () => {
 const patch=readFileSync(new URL('../../patches/agora-rtc-sdk-ng@4.24.8.patch',import.meta.url),'utf8');
 const source=patch.split('\n').find(line=>line.startsWith('+')&&line.includes('async _publishHighStream('));
 const statements=source.match(/throw\(yield Gw\([rs]\.throw\(e\)\.catch\(\(\)=>\{\}\)\)\),/g);
 assert.equal(statements?.length,2);
 const GeneratorFunction=Object.getPrototypeOf(function*(){}).constructor;
 for(const statement of statements){
  let cleaned=false;const original=Object.assign(Error('publish interrupted'),{code:'WS_ABORT'});
  async function* nested(){try{yield 'offer';}finally{await Promise.resolve();cleaned=true;}}
  const iterator=nested();await iterator.next();
  const execute=new GeneratorFunction('r','s','e','Gw',statement+'e');
  const running=execute(iterator,iterator,original,p=>p);
  await running.next().value;
  assert.equal(cleaned,true);
  assert.throws(()=>running.next(),error=>error===original);
 }
 await new Promise(resolve=>setImmediate(resolve));
});
