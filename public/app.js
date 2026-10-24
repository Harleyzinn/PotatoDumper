const $ = selector => document.querySelector(selector);
const defaults = {audioFormat:'mp3',videoQuality:'1080',disableMetadata:false,reduceMotion:false};
let preferences = {...defaults};
try {
  const saved=JSON.parse(localStorage.getItem('potato.preferences') || '{}');
  if (saved && typeof saved==='object') {
    if (['best','mp3','ogg','wav','opus'].includes(saved.audioFormat)) preferences.audioFormat=saved.audioFormat;
    if (['max','2160','1440','1080','720','480','360'].includes(saved.videoQuality)) preferences.videoQuality=saved.videoQuality;
    preferences.disableMetadata=saved.disableMetadata===true;
    preferences.reduceMotion=saved.reduceMotion===true;
  }
} catch { /* Browser storage is optional. */ }
let controller;
const labels={save:'baixar',settings:'ajustes',about:'sobre'};
function navigate() {
  const page=Object.hasOwn(labels,location.hash.slice(1)) ? location.hash.slice(1) : 'save';
  document.querySelectorAll('.page').forEach(section => {section.hidden=section.id!==page;});
  document.querySelectorAll('[data-page]').forEach(link => {if (link.dataset.page===page) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');});
  $('#breadcrumb').textContent=`potato / ${labels[page]}`;
  document.title=`Potato Downloader / ${labels[page]}`;
}
window.addEventListener('hashchange',navigate); navigate();
function applyPreferences() {
  $('#audio-format').value=preferences.audioFormat;
  $('#quick-quality').value=preferences.videoQuality;
  $('#metadata').checked=preferences.disableMetadata;
  $('#reduce-motion').checked=preferences.reduceMotion;
  document.body.classList.toggle('no-motion',preferences.reduceMotion);
}
function savePreferences() {
  try {localStorage.setItem('potato.preferences',JSON.stringify(preferences));return true;} catch {return false;}
}
applyPreferences();
$('#settings-form').addEventListener('submit',event => {
  event.preventDefault();
  preferences.audioFormat=$('#audio-format').value;
  preferences.disableMetadata=$('#metadata').checked;
  preferences.reduceMotion=$('#reduce-motion').checked;
  applyPreferences();
  $('#settings-message').textContent=savePreferences() ? '[ok] Preferencias salvas neste navegador.' : '[!] Aplicadas nesta sessao. O navegador bloqueou o armazenamento.';
});
$('#quick-quality').addEventListener('change',event=>{preferences.videoQuality=event.target.value;savePreferences();});
document.querySelectorAll('[name=mode]').forEach(input=>input.addEventListener('change',()=>{$('#quick-quality').disabled=$('[name=mode]:checked').value==='audio';}));
function status(message,{error=false,busy=false,state='IDLE'}={}) {
  const area=$('#status'); area.replaceChildren(); area.classList.toggle('error',error); area.classList.toggle('busy',busy);
  const line=document.createElement('p'), time=document.createElement('span');time.className='log-time';time.textContent=`[${new Date().toLocaleTimeString('pt-BR')}]`;
  line.append(time,document.createTextNode(message));area.append(line);$('#terminal-state').textContent=state;
}
$('#paste').addEventListener('click',async()=>{
  try {$('#media-url').value=(await navigator.clipboard.readText()).trim();$('#media-url').focus();}
  catch {status('Nao foi possivel ler a area de transferencia. Cole o link com Ctrl+V.',{error:true,state:'CLIPBOARD'});$('#media-url').focus();}
});
async function health() {
  $('#connection-label').textContent='verificando API';
  try {
    const response=await fetch('/api/health',{signal:AbortSignal.timeout(6000)});
    if (!response.ok) throw new Error('offline');
    const data=await response.json();
    if (!data.online) throw new Error('offline');
    $('#connection').classList.remove('offline');$('#connection-dot').textContent='[*]';$('#connection-label').textContent='API conectada';
    $('#services-list').replaceChildren();
    const services=Array.isArray(data.services) ? data.services : [];
    for (const name of services) {const tag=document.createElement('span');tag.textContent=name;$('#services-list').append(tag);}
    if (!services.length) $('#services-list').textContent='A instancia nao informou a lista de plataformas.';
    $('#services-count').textContent=services.length ? `/ ${services.length}` : '';
  } catch {
    $('#connection').classList.add('offline');$('#connection-dot').textContent='[!]';$('#connection-label').textContent='API desconectada';
    $('#services-list').textContent='Inicie o Docker ou configure a instancia Cobalt em ajustes.';$('#services-count').textContent='';
  }
}
$('#connection').addEventListener('click',health);health();
const friendlyErrors={
  'error.api.link.unsupported':'Este link nao e suportado pela instancia.',
  'error.api.link.invalid':'O link informado e invalido.',
  'error.api.fetch.fail':'A plataforma nao entregou a midia. Tente outro link ou mais tarde.',
  'error.api.content.unavailable':'A midia esta indisponivel ou foi removida.',
  'error.api.content.private':'Esta midia e privada.',
  'error.api.rate_exceeded':'Limite da instancia atingido. Aguarde e tente novamente.'
};
function safeURL(value) {try {const url=new URL(value);return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;}catch{return null;}}
function addResult(url,filename,label) {
  const href=safeURL(url);if (!href) throw new Error('A instancia retornou um link invalido.');
  const anchor=document.createElement('a');anchor.className='result-link';anchor.href=href;anchor.download=filename || 'potato-download';anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.textContent=label;$('#results').append(anchor);
}
$('#cancel').addEventListener('click',()=>controller?.abort());
$('#download-form').addEventListener('submit',async event=>{
  event.preventDefault();if(controller) return;
  const url=$('#media-url').value.trim();
  if (!safeURL(url)) {status('Cole um link HTTP ou HTTPS valido.',{error:true,state:'ERROR'});return;}
  $('#results').replaceChildren();$('#results').hidden=true;
  $('#download-button').disabled=true;$('#download-button').textContent='[ PROCESSANDO... ]';$('#cancel').hidden=false;
  status('Consultando a instancia. Preparando sua midia...',{busy:true,state:'PROCESSING'});
  controller=new AbortController();const active=controller;
  const timer=setTimeout(()=>active.abort('timeout'),65000);
  try {
    const response=await fetch('/api/download',{method:'POST',headers:{'Content-Type':'application/json'},signal:active.signal,body:JSON.stringify({url,downloadMode:$('[name=mode]:checked').value,videoQuality:preferences.videoQuality,audioFormat:preferences.audioFormat,disableMetadata:preferences.disableMetadata})});
    let data;try {data=await response.json();}catch{throw new Error('O servidor Potato nao esta disponivel. Inicie com npm start ou Docker.');}
    if (!response.ok) throw new Error(data.message || `O servidor retornou HTTP ${response.status}.`);
    if (data.status==='error') {const code=String(data.error?.code || 'api.error');throw new Error(`${friendlyErrors[code] || friendlyErrors[`error.${code}`] || 'Nao foi possivel processar esta midia.'} [${code}]`);}
    if (data.status==='redirect' || data.status==='tunnel') {
      addResult(data.url,data.filename,`[ salvar arquivo -> ] ${data.filename || 'potato-download'}`);
      status('Arquivo pronto! Clique abaixo para salvar.',{state:'READY'});
    } else if (data.status==='picker' && Array.isArray(data.picker) && data.picker.length) {
      data.picker.forEach((item,index)=>addResult(item.url,item.filename,`[ salvar ${String(index+1).padStart(2,'0')} -> ] ${item.type || 'midia'}`));
      status(`${data.picker.length} arquivos encontrados. Escolha o que deseja salvar.`,{state:'PICKER'});
    } else throw new Error('A instancia retornou um tipo de resposta nao suportado.');
    $('#results').hidden=false;
  } catch(error) {
    $('#results').replaceChildren();$('#results').hidden=true;
    status(active.signal.aborted ? (active.signal.reason==='timeout' ? 'O pedido demorou demais. Tente novamente.' : 'Pedido cancelado.') : error.message,{error:!active.signal.aborted,state:active.signal.aborted ? 'CANCELLED' : 'ERROR'});
  } finally {
    clearTimeout(timer);controller=undefined;$('#download-button').disabled=false;$('#download-button').replaceChildren(document.createTextNode('[ BAIXAR ARQUIVO ] '));
    const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent='->';$('#download-button').append(arrow);$('#cancel').hidden=true;
  }
});
function clock() {$('#clock').textContent=new Date().toLocaleTimeString('pt-BR');}clock();setInterval(clock,1000);
