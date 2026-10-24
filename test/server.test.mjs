import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,validateRequest,normalizeResponse} from '../server.mjs';
const body={url:'https://www.youtube.com/watch?v=example',downloadMode:'auto',videoQuality:'1080',audioFormat:'mp3'};
test('validates options and rejects dangerous/local URLs',()=>{
  assert.equal(validateRequest(body).localProcessing,'disabled');
  for (const url of ['file:///etc/passwd','http://localhost:9000','http://127.0.0.1','http://[::1]','https://user:pass@example.com','http://test.local']) assert.throws(()=>validateRequest({...body,url}));
  assert.throws(()=>validateRequest({...body,downloadMode:'bad'}));
  assert.throws(()=>validateRequest({...body,videoQuality:'999'}));
});
test('sanitizes single-file and multi-file upstream responses',()=>{
  assert.equal(normalizeResponse({status:'redirect',url:'https://cdn.example.com/video.mp4'}).status,'redirect');
  assert.throws(()=>normalizeResponse({status:'redirect',url:'javascript:alert(1)'}));
  const result=normalizeResponse({status:'picker',picker:[{type:'photo',url:'https://cdn.example.com/a.jpg'},{url:'javascript:alert(1)'}],audio:'https://cdn.example.com/a.mp3'});
  assert.equal(result.picker.length,2);
  assert.equal(result.picker[1].type,'audio');
  assert.throws(()=>normalizeResponse({status:'local-processing'}));
});
async function withServer(fetchImpl,run) {
  const server=createServer({apiKey:'test-secret',fetchImpl});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {await run(base);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('proxy forwards audio settings and secret only upstream, serves health and static UI',async()=>{
  let sent;
  await withServer(async(url,options)=>{
    if(options.method==='POST') {sent=options;return Response.json({status:'tunnel',url:'https://cdn.example.com/a.mp3',filename:'song.mp3'});}
    return Response.json({cobalt:{services:['youtube','soundcloud']}});
  },async base=>{
    const page=await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/POTATO/);assert.ok(page.headers.get('content-security-policy'));
    const health=await (await fetch(`${base}/api/health`)).json();assert.equal(health.online,true);
    const response=await fetch(`${base}/api/download`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,downloadMode:'audio',audioFormat:'opus'})});
    const result=await response.json();assert.equal(result.filename,'song.mp3');assert.equal(sent.headers.Authorization,'Api-Key test-secret');assert.equal(JSON.parse(sent.body).audioFormat,'opus');assert.ok(!JSON.stringify(result).includes('test-secret'));
  });
});
test('handles offline backend, invalid JSON, origin violations, methods and rate limits',async()=>{
  await withServer(async()=>{throw new Error('offline');},async base=>{
    assert.equal((await (await fetch(`${base}/api/health`)).json()).online,false);
    const post=(payload,headers={})=>fetch(`${base}/api/download`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:payload});
    assert.equal((await post(JSON.stringify(body))).status,502);
    assert.equal((await post('{')).status,400);
    assert.equal((await post(JSON.stringify(body),{Origin:'https://evil.example'})).status,403);
    assert.equal((await fetch(`${base}/api/download`)).status,405);
    assert.equal((await post('x'.repeat(17000))).status,413);
    let limited;for(let i=0;i<21;i++) limited=await post('{}');assert.equal(limited.status,429);
  });
});
test('preserves upstream rate-limit errors and rejects malformed upstream URLs',async()=>{
  await withServer(async()=>Response.json({},{status:429}),async base=>{
    assert.equal((await fetch(`${base}/api/download`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,429);
  });
});
