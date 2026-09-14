import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const workflow=readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
const step=name=>{const part=workflow.split('      - name: '+name+'\n')[1];assert.ok(part,'missing workflow step '+name);return part.split('\n      - ')[0];};
test('Social scope runs its own browser acceptance and uploads evidence',()=>{
 const s=step('Public Thirteen Social gameplay, audio and offline acceptance');
 assert.match(s,/if: steps\.plan\.outputs\.social_pwa == 'true'/);
 assert.match(s,/node tools\/pwa\/social-acceptance\.mjs https:\/\/www\.gameai\.xingzdh\.com\/thirteen-social evidence\/public-social-pwa/);
 assert.ok(workflow.includes('frontend-source/evidence/public-social-pwa/'));
});
test('unchanged backend keeps acceptance dependencies but avoids build and upload',()=>{
 assert.match(step('Install backend acceptance dependencies'),/if: steps\.plan\.outputs\.deploy == 'true'/);
 assert.match(step('Validate and build independent Nest services'),/backend_build == 'true'/);
 const staging=step('Stage immutable release directories');assert.match(staging,/outputs\.backend_changed/);assert.match(staging,/else\n\s+ssh .*test -f .*dist\/apps\/gateway\/main\.js/);
});
test('basic smoke, actual production baselines, cleanup and rollback remain mandatory',()=>{
 assert.match(step('Public login, authorization and multiplayer acceptance'),/if: steps\.plan\.outputs\.deploy == 'true'/);
 const baseline=step('Read current production revisions');assert.match(baseline,/frontend\.current/);assert.match(baseline,/readlink -f/);
 const cutover=step('Build candidate and switch services with rollback');assert.match(cutover,/steps\.baseline\.outputs\.frontend/);assert.match(cutover,/steps\.baseline\.outputs\.backend/);
 assert.match(step('Clean temporary accounts'),/always\(\) && steps\.switch\.outcome == 'success'/);
 assert.match(step('Restore previous release if public acceptance fails'),/failure\(\) && steps\.switch\.outcome == 'success'/);
});

test('Social browser preflight precedes cutover and uploads diagnostics',()=>{
 assert.ok(workflow.indexOf('name: Verify Social browser before production cutover')<workflow.indexOf('name: Build candidate and switch services with rollback'));
 assert.match(step('Verify Social browser before production cutover'),/outputs.social_pwa == 'true'/);
 assert.ok(workflow.includes('frontend-source/evidence/browser-preflight/'));
});
