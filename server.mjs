import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'public');
const assets = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/style.css', ['style.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]]);
const qualities = ['max','4320','2160','1440','1080','720','480','360','240','144'];
const formats = ['best','mp3','ogg','wav','opus'];
export function validateRequest(body) {
  if (!body || typeof body !== 'object') throw new Error('Pedido invalido.');
  let url;
  try { url = new URL(body.url); } catch { throw new Error('Cole um link valido com https://.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.length > 4096) throw new Error('Use um link HTTP ou HTTPS sem credenciais.');
  const hostname = url.hostname.toLowerCase();
  // Media service names only: do not pass IP literals or local network names upstream.
  if (!hostname.includes('.') || hostname.endsWith('.local') || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.includes(':') || /^\d[\d.]*$/.test(hostname) || hostname.startsWith('[')) throw new Error('Use o link publico de uma plataforma de midia.');
  if (!['auto','audio','mute'].includes(body.downloadMode)) throw new Error('Modo invalido.');
  if (!qualities.includes(body.videoQuality) || !formats.includes(body.audioFormat)) throw new Error('Qualidade ou formato invalido.');
  return {url:url.href, downloadMode:body.downloadMode, videoQuality:body.videoQuality, audioFormat:body.audioFormat, audioBitrate:'320', filenameStyle:'pretty', localProcessing:'disabled', disableMetadata: Boolean(body.disableMetadata)};
}
const safeURL = value => { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } };
export function normalizeResponse(data) {
  if (['redirect','tunnel'].includes(data?.status) && safeURL(data.url)) return {status:data.status, url:safeURL(data.url), filename:typeof data.filename === 'string' ? data.filename : 'potato-download'};
  if (data?.status === 'picker' && Array.isArray(data.picker)) {
    const picker = data.picker.slice(0,100).filter(item => safeURL(item?.url)).map((item,i) => ({type:['photo','video','gif'].includes(item.type) ? item.type : 'media', url:safeURL(item.url), filename:`potato-${i+1}`}));
    if (safeURL(data.audio)) picker.push({type:'audio',url:safeURL(data.audio),filename:typeof data.audioFilename === 'string' ? data.audioFilename : 'potato-audio'});
    if (picker.length) return {status:'picker', picker};
  }
  if (data?.status === 'error') return {status:'error',error:{code:String(data.error?.code || 'api.error').slice(0,120)}};
  throw new Error('Resposta inesperada da instancia Cobalt.');
}
export function createServer({apiURL=process.env.COBALT_API_URL || 'http://127.0.0.1:9000/', apiKey=process.env.COBALT_API_KEY, fetchImpl=fetch}={}) {
  const attempts = new Map();
  const headers = {'Accept':'application/json','Content-Type':'application/json',...(apiKey ? {'Authorization':`Api-Key ${apiKey}`} : {})};
  return http.createServer(async (req,res) => {
    const send = (status,data) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const path = req.url?.split('?')[0];
    if (path === '/api/health' && req.method === 'GET') {
      try {
        const upstream = await fetchImpl(apiURL,{headers,signal:AbortSignal.timeout(4000)});
        const info = await upstream.json();
        if (!upstream.ok || !info.cobalt) throw new Error('Unavailable');
        return send(200,{online:true,services:Array.isArray(info.cobalt.services) ? info.cobalt.services : []});
      } catch { return send(200,{online:false,services:[]}); }
    }
    if (path === '/api/download') {
      if (req.method !== 'POST') { res.setHeader('Allow','POST'); return send(405,{message:'Use POST.'}); }
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) return send(403,{message:'Origem nao permitida.'});
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415,{message:'Use application/json.'});
      const now=Date.now(), ip=req.socket.remoteAddress;
      for (const [key,value] of attempts) if (value.until < now) attempts.delete(key);
      const entry=attempts.get(ip) || {count:0,until:now+60000};
      attempts.set(ip,entry);
      if (++entry.count > 20) return send(429,{message:'Muitos pedidos. Tente novamente em um minuto.'});
      let raw='';
      try {
        for await (const chunk of req) { raw+=chunk; if (Buffer.byteLength(raw)>16384) return send(413,{message:'Pedido muito grande.'}); }
        let body;
        try { body=validateRequest(JSON.parse(raw)); } catch(error) { return send(400,{message:error instanceof SyntaxError ? 'JSON invalido.' : error.message}); }
        const upstream=await fetchImpl(apiURL,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
        if (!upstream.ok) return send(upstream.status === 429 ? 429 : 502,{message:upstream.status===429 ? 'A instancia esta ocupada. Tente em instantes.' : 'A instancia Cobalt recusou o pedido. Verifique sua configuracao.'});
        return send(200,normalizeResponse(await upstream.json()));
      } catch { return send(502,{message:'Nao foi possivel acessar o Cobalt. Inicie o Docker ou configure COBALT_API_URL.'}); }
    }
    const asset=assets.get(path);
    if (!asset || !['GET','HEAD'].includes(req.method)) return send(404,{message:'Nao encontrado.'});
    try { const content=await readFile(resolve(root,asset[0])); res.writeHead(200,{'Content-Type':`${asset[1]}; charset=utf-8`}); res.end(req.method==='HEAD' ? undefined : content); }
    catch { send(500,{message:'Arquivo indisponivel.'}); }
  });
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT || 3000), host=process.env.HOST || '127.0.0.1';
  createServer().listen(port,host,()=>console.log(`Potato Downloader: http://${host==='0.0.0.0' ? 'localhost' : host}:${port}`));
}
