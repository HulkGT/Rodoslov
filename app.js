'use strict';
/* Rodoslov – obiteljsko stablo. Podaci su na poslužitelju; svaki član obitelji ima svoj račun. */
const SRV=(window.ROD_SERVER||'').replace(/\/+$/,'');
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let A=null;try{A=JSON.parse(localStorage.getItem('rod-auth')||'null')}catch(e){}
const saveA=()=>{try{A?localStorage.setItem('rod-auth',JSON.stringify(A)):localStorage.removeItem('rod-auth')}catch(e){}};
let D={since:0,persons:{},rels:{}};try{const x=JSON.parse(localStorage.getItem('rod-data')||'null');if(x&&x.persons)D=x}catch(e){}
const saveD=()=>{try{localStorage.setItem('rod-data',JSON.stringify(D))}catch(e){}};
let ME=null;try{ME=localStorage.getItem('rod-me')}catch(e){}
const isAdmin=()=>!!(A&&A.user&&A.user.admin);
let syncing=false,lastSync=0;

/* ---------- pomoćno ---------- */
function toast(t){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,3800)}
function modal(h){const m=$('#modal');m.innerHTML='<div class="mbox" role="dialog" aria-modal="true">'+h+'</div>';m.hidden=false;if(!modal.open){modal.open=true;try{history.pushState({rodModal:1},'',location.href)}catch(e){}}}
function closeModal(){const m=$('#modal');m.hidden=true;m.innerHTML='';if(modal.open){modal.open=false;if(history.state&&history.state.rodModal)history.back()}}
window.addEventListener('popstate',()=>{if(modal.open){modal.open=false;const m=$('#modal');m.hidden=true;m.innerHTML=''}});
const TE=new TextEncoder();
const b2a=u=>{u=new Uint8Array(u);let s='';u.forEach(x=>s+=String.fromCharCode(x));return btoa(s)};
async function deriveAuth(pw,email){const k=await crypto.subtle.importKey('raw',TE.encode(pw),'PBKDF2',false,['deriveBits']);
  return b2a(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:TE.encode('rodoslov|'+email),iterations:150000},k,256))}
async function api(path,opt){opt=opt||{};let r;
  try{r=await fetch(SRV+path,{method:opt.method||'GET',headers:Object.assign({'Content-Type':'application/json'},A&&A.token?{Authorization:'Bearer '+A.token}:{}),body:opt.body?JSON.stringify(opt.body):undefined})}catch(e){throw {code:'NETWORK'}}
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok){if(j.error==='NO_SESSION'&&A&&A.token){A=null;saveA();authView='login';render();toast('Prijavi se ponovno.')}throw Object.assign({code:j.error||('HTTP_'+r.status),status:r.status},j)}return j}
const ERR={NETWORK:'Nema veze s poslužiteljem. Provjeri internet.',WRONG_LOGIN:'E-pošta ili lozinka nije točna.',WRONG_CODE:'E-pošta ili kod nije točan.',TOO_MANY:'Previše pokušaja. Pokušaj za 15 minuta.',BAD_INVITE:'Pozivnica nije valjana ili je istekla. Zatraži novu.',EXISTS:'Za ovu e-poštu već postoji račun. Prijavi se.',BLOCKED:'Tvoj pristup je blokiran.',LOCKED:'Ova osoba je zaključana. Promjene može napraviti samo administrator.',CONFLICT:'Netko je u međuvremenu promijenio ovu osobu. Učitano je novo stanje, pokušaj ponovno.',ADMIN_ONLY:'To može samo administrator.',NO_DATABASE:'Poslužitelju nedostaje baza podataka.',FORBIDDEN_ORIGIN:'Poslužitelj ne dopušta ovu adresu.',NOT_EMPTY:'Stablo već sadrži osobe.',TOO_LARGE:'Fotografija je prevelika.'};
const err=e=>ERR[e&&e.code]||('Greška'+(e&&e.code?' ('+e.code+')':'')+'.');
const P=id=>D.persons[id]&&!D.persons[id].deleted?D.persons[id]:null;
const alive=p=>!p.died;
const nameOf=p=>p?((p.first||'')+' '+(p.last||'')).trim()||'?':'?';
const yr=s=>s?String(s).slice(0,4):'';
const years=p=>{const b=yr(p.born),d=yr(p.died);return b||d?(b||'?')+' – '+(d||''):''};
const ini=p=>nameOf(p).split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
const photoUrl=id=>SRV+'/tree/photo/'+encodeURIComponent(id)+'?t='+encodeURIComponent(A.token);
function ph(p,cls){return '<span class="ph '+(cls||'')+(p&&p.died?' dead':'')+'">'+(p&&p.photo?'<img src="'+photoUrl(p.photo)+'" alt="" loading="lazy" crossorigin="anonymous">':esc(ini(p)))+'</span>'}
function fmtDate(s){if(!s)return '';const m=String(s).match(/^(\d{4})(?:-(\d{2})-(\d{2}))?$/);if(!m)return esc(s);return m[2]?(+m[3])+'. '+(+m[2])+'. '+m[1]+'.':m[1]+'.'}
function parseDate(s){s=String(s||'').trim();if(!s)return '';let m=s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\.?$/);if(m)return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return s;m=s.match(/^(\d{4})\.?$/);if(m)return m[1];return null}
const nrm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
/* ---------- odnosi ---------- */
const rels=()=>Object.values(D.rels).filter(r=>!r.deleted&&P(r.a)&&P(r.b));
const partnersOf=id=>rels().filter(r=>r.a===id||r.b===id).map(r=>({p:P(r.a===id?r.b:r.a),rel:r}));
const childrenOf=id=>Object.values(D.persons).filter(x=>!x.deleted&&(x.father===id||x.mother===id)).sort((a,b)=>String(a.born||'9').localeCompare(String(b.born||'9')));
const siblingsOf=p=>p.father||p.mother?Object.values(D.persons).filter(x=>!x.deleted&&x.id!==p.id&&((p.father&&x.father===p.father)||(p.mother&&x.mother===p.mother))).sort((a,b)=>String(a.born||'9').localeCompare(String(b.born||'9'))):[];
const canEdit=p=>!p.locked||isAdmin();
/* ---------- sinkronizacija ---------- */
async function sync(force){if(!A||syncing)return;syncing=true;
  try{const j=await api('/tree/data?since='+(force?0:D.since||0));if(force){D.persons={};D.rels={}}
    (j.persons||[]).forEach(p=>D.persons[p.id]=p);(j.rels||[]).forEach(r=>D.rels[r.id]=r);D.since=j.now;saveD();lastSync=Date.now();
    if((j.persons||[]).length||(j.rels||[]).length||force)render(true)}
  catch(e){if(e.code==='NETWORK')setSyncLabel('izvan mreže')}finally{syncing=false}}
function setSyncLabel(t){const el=$('#sync');if(el)el.textContent=t}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
setInterval(()=>{if(!document.hidden)sync()},45000);
/* ---------- usmjeravanje ---------- */
const route=()=>{const h=(location.hash||'#/').slice(1);const m=h.match(/^\/o\/([\w-]+)/);return m?{v:'osoba',id:m[1]}:h.startsWith('/osobe')?{v:'osobe'}:h.startsWith('/admin')?{v:'admin'}:h.startsWith('/vise')?{v:'vise'}:h.startsWith('/stablo')?{v:'stablo'}:{v:'pocetna'}};
window.addEventListener('hashchange',()=>{closeModalSilently();render();window.scrollTo(0,0)});
function closeModalSilently(){if(modal.open){modal.open=false}const m=$('#modal');m.hidden=true;m.innerHTML=''}
const ICON={home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',tree:'<circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M12 7.5V12M6 16.5V12h12v4.5"/>',list:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'};
let scrollKeep=0;
function render(keep){if(!A){renderAuth();return}if(keep)scrollKeep=window.scrollY;const r=route();
  const tabs=[['#/','home','Početna','pocetna'],['#/stablo','tree','Stablo','stablo'],['#/osobe','list','Osobe','osobe']].concat(isAdmin()?[['#/admin','key','Admin','admin']]:[]).concat([['#/vise','more','Više','vise']]);
  const cur=r.v==='osoba'?'stablo':r.v;
  let body='';try{body=r.v==='osoba'?vPerson(r.id):r.v==='osobe'?vList():r.v==='admin'?vAdmin():r.v==='vise'?vMore():r.v==='stablo'?vTreeStart():vHome()}catch(e){body='<p class="neg">'+esc(e.message)+'</p>'}
  $('#root').innerHTML='<header class="top"><span class="mark" aria-hidden="true">R</span><span class="brand"><b>'+esc(window.ROD_NASLOV||'Rodoslov')+'</b><small>'+esc(window.ROD_PODNASLOV||'')+'</small></span><span class="sync" id="sync"></span></header><main class="wrap">'+body+'</main>'
    +'<nav class="bar">'+tabs.map(t=>'<a href="'+t[0]+'"'+(cur===t[3]?' class="on"':'')+'><svg viewBox="0 0 24 24">'+ICON[t[1]]+'</svg>'+t[2]+'</a>').join('')+'</nav>';
  if(keep)window.scrollTo(0,scrollKeep);
  if(r.v==='admin'){if(keep&&AD.log)fillAdmin();else loadAdmin()}}
/* ---------- prijava ---------- */
let authView=null;const INVITE=(()=>{try{return new URLSearchParams(location.search).get('poziv')||''}catch(e){return ''}})();
function renderAuth(){const v=authView||(INVITE?'reg':'login');authView=v;
  const head='<div class="auth"><span class="mark" aria-hidden="true">R</span><div class="eyebrow">Obiteljski arhiv</div><h1>'+esc(window.ROD_NASLOV||'Rodoslov')+'</h1>';
  let f='';
  if(v==='login')f='<p class="hint">Prijavi se svojim računom.</p><form data-f="login"><label>E-pošta<input id="f-email" type="email" autocomplete="username" required></label><label>Lozinka<input id="f-pw" type="password" autocomplete="current-password" required></label><button class="btn primary" style="width:100%;margin-top:10px">Prijava</button></form><p><button class="link" data-a="av" data-v="reset">Zaboravljena lozinka?</button>'+' · <button class="link" data-a="av" data-v="reg">Novi račun</button></p>';
  else if(v==='reg')f='<p class="hint">'+(INVITE?'Pozvan si u obiteljski rodoslov. Napravi svoj račun.':'Novi račun može se napraviti samo putem pozivnice.')+'</p><form data-f="reg"><label>Ime i prezime<input id="f-name" autocomplete="name" required></label><label>E-pošta<input id="f-email" type="email" autocomplete="username" required></label><label>Lozinka (najmanje 8 znakova)<input id="f-pw" type="password" autocomplete="new-password" minlength="8" required></label><label>Ponovi lozinku<input id="f-pw2" type="password" autocomplete="new-password" minlength="8" required></label><button class="btn primary" style="width:100%;margin-top:10px">Napravi račun</button></form><p><button class="link" data-a="av" data-v="login">Već imam račun</button></p>';
  else f='<p class="hint">Zatraži od administratora kod za novu lozinku, pa ga upiši ovdje.</p><form data-f="reset"><label>E-pošta<input id="f-email" type="email" autocomplete="username" required></label><label>Kod od administratora<input id="f-code" autocomplete="off" placeholder="XXXX-XXXX" required></label><label>Nova lozinka (najmanje 8 znakova)<input id="f-pw" type="password" autocomplete="new-password" minlength="8" required></label><label>Ponovi lozinku<input id="f-pw2" type="password" autocomplete="new-password" minlength="8" required></label><button class="btn primary" style="width:100%;margin-top:10px">Spremi novu lozinku</button></form><p><button class="link" data-a="av" data-v="login">Natrag na prijavu</button></p>';
  $('#root').innerHTML=head+f+'</div>'}
document.addEventListener('submit',async e=>{const f=e.target.closest('form[data-f]');if(!f)return;e.preventDefault();const b=f.querySelector('button');
  const email=($('#f-email').value||'').trim().toLowerCase(),pw=$('#f-pw').value,pw2=($('#f-pw2')||{}).value;
  if(f.dataset.f!=='login'&&pw.length<8)return toast('Lozinka treba najmanje 8 znakova.');if(pw2!=null&&pw!==pw2)return toast('Lozinke se ne podudaraju.');
  b.disabled=true;const old=b.textContent;b.textContent='Pričekaj …';
  try{const auth=await deriveAuth(pw,email);let j;
    if(f.dataset.f==='login')j=await api('/tree/login',{method:'POST',body:{email,auth}});
    else if(f.dataset.f==='reg')j=await api('/tree/register',{method:'POST',body:{email,auth,name:$('#f-name').value.trim(),invite:INVITE}});
    else j=await api('/tree/reset',{method:'POST',body:{email,auth,code:$('#f-code').value}});
    A={token:j.token,user:j.user};saveA();if(INVITE){try{history.replaceState(null,'',location.pathname+'#/')}catch(_){}}
    D={since:0,persons:{},rels:{}};render();await sync(true);toast('Dobro došao, '+j.user.name.split(' ')[0]+'!')}
  catch(x){toast(err(x));b.disabled=false;b.textContent=old}});
/* ---------- početna ---------- */
function upcoming(){const T=new Date();T.setHours(0,0,0,0);const out=[];
  Object.values(D.persons).forEach(p=>{if(p.deleted||p.died)return;const m=String(p.born||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return;
    let d=new Date(T.getFullYear(),+m[2]-1,+m[3]);if(d<T)d=new Date(T.getFullYear()+1,+m[2]-1,+m[3]);const days=Math.round((d-T)/864e5);
    if(days<=60)out.push({p,days,age:d.getFullYear()-(+m[1])})});return out.sort((a,b)=>a.days-b.days)}
function vHome(){const all=Object.values(D.persons).filter(p=>!p.deleted);const bd=upcoming();
  const recent=all.filter(p=>p.updated).sort((a,b)=>b.updated-a.updated).slice(0,6);
  if(!all.length)return '<h2>Dobro došao</h2><div class="card"><p>Stablo je još prazno.</p>'+(isAdmin()?'<p class="hint">Kao administrator možeš uvesti postojeći rodoslov u odjeljku Admin.</p><div class="btns"><a class="btn primary" href="#/admin">Admin</a></div>':'<p class="hint">Dodaj prvu osobu.</p>')+'<div class="btns"><button class="btn" data-a="add">+ Dodaj osobu</button></div></div>';
  return '<h2>Dobro došao, '+esc(A.user.name.split(' ')[0])+'</h2>'
    +'<input class="search" id="q" type="search" placeholder="Traži osobu …" data-a="none"><div id="qres"></div>'
    +'<div class="card"><div class="eyebrow">Rodoslov</div><p style="margin:6px 0 0"><b>'+all.length+'</b> osoba · <b>'+all.filter(p=>p.photo).length+'</b> fotografija · <b>'+rels().length+'</b> brakova i veza</p><div class="btns"><a class="btn primary" href="#/stablo">Otvori stablo</a><button class="btn" data-a="add">+ Dodaj osobu</button></div></div>'
    +'<h3>Rođendani</h3>'+(bd.length?'<div class="card">'+bd.map(x=>'<div class="bday" data-go="'+x.p.id+'">'+ph(x.p,'sm')+'<span><b>'+esc(nameOf(x.p))+'</b><br><span class="hint">'+fmtDate(x.p.born.slice(5)?x.p.born:'')+(x.age>0?' · navršava '+x.age+'.':'')+'</span></span><span class="when">'+(x.days===0?'danas 🎉':x.days===1?'sutra':'za '+x.days+' dana')+'</span></div>').join('')+'</div>':'<p class="hint">U sljedećih 60 dana nema rođendana. Rođendani se prikazuju kad je upisan puni datum rođenja (dan, mjesec, godina).</p>')
    +'<h3>Nedavne promjene</h3><div class="card">'+recent.map(p=>'<div class="bday" data-go="'+p.id+'">'+ph(p,'sm')+'<span><b>'+esc(nameOf(p))+'</b><br><span class="hint">'+esc(p.by||'')+'</span></span><span class="when">'+new Date(p.updated).toLocaleDateString('hr-HR')+'</span></div>').join('')+'</div>'}
document.addEventListener('input',e=>{if(e.target.id==='q'){const q=nrm(e.target.value).trim();const el=$('#qres');if(!el)return;
  if(!q){el.innerHTML='';return}const L=Object.values(D.persons).filter(p=>!p.deleted&&nrm(nameOf(p)+' '+(p.birthName||'')+' '+(p.place||'')+' '+(p.bornPlace||'')).includes(q)).slice(0,20);
  el.innerHTML='<div class="card">'+(L.length?L.map(row).join(''):'<p class="hint">Nitko nije pronađen.</p>')+'</div>'}
  if(e.target.id==='q2'){const q=nrm(e.target.value).trim();document.querySelectorAll('[data-pick]').forEach(b=>{b.hidden=q&&!nrm(b.dataset.n).includes(q)})}});
const row=p=>'<button class="prow" data-go="'+p.id+'">'+ph(p,'sm')+'<span><span class="nm">'+esc(nameOf(p))+'</span>'+(p.locked?' <span class="lock" title="Zaključano">🔒</span>':'')+'<br><span class="yr">'+esc(years(p))+(p.birthName?' · rođ. '+esc(p.birthName):'')+'</span></span></button>';
/* ---------- popis ---------- */
let listQ='';
function vList(){const L=Object.values(D.persons).filter(p=>!p.deleted).sort((a,b)=>(nrm(a.last)+nrm(a.first)).localeCompare(nrm(b.last)+nrm(b.first)));
  let h='<h2>Osobe</h2><input class="search" id="q" type="search" placeholder="Traži …"><div id="qres"></div><div class="btns"><button class="btn" data-a="add">+ Dodaj osobu</button></div>';let last='';
  L.forEach(p=>{const l=(p.last||'?')[0].toUpperCase();if(l!==last){h+='<div class="letter">'+esc(l)+'</div>';last=l}h+=row(p)});
  return h+(L.length?'':'<p class="empty">Još nema osoba.</p>')}
/* ---------- stablo ---------- */
function vTreeStart(){const all=Object.values(D.persons).filter(p=>!p.deleted);if(!all.length)return vHome();
  const id=(ME&&P(ME))?ME:all.map(p=>[p,childrenOf(p.id).length+partnersOf(p.id).length+(p.father?1:0)+(p.mother?1:0)]).sort((a,b)=>b[1]-a[1])[0][0].id;
  location.replace('#/o/'+id);return ''}
const node=(p,cls)=>'<button class="node" data-go="'+p.id+'">'+ph(p,cls)+'<span class="nm">'+esc(nameOf(p))+(p.locked?' 🔒':'')+'</span><span class="yr">'+esc(years(p))+'</span></button>';
const addNode=(a,label,id)=>'<button class="node add" data-a="'+a+'" data-id="'+id+'"><span class="ph">+</span><span class="nm">'+label+'</span></button>';
function vPerson(id){const p=P(id);if(!p)return '<p class="empty">Osoba nije pronađena.</p><div class="btns"><a class="btn" href="#/osobe">Sve osobe</a></div>';
  const fa=P(p.father),mo=P(p.mother),pa=partnersOf(id),ch=childrenOf(id),sib=siblingsOf(p),ed=canEdit(p);
  let h='<div class="focus"><div class="lvl-t">Roditelji</div><div class="lvl">'+(fa?node(fa):ed?addNode('addParent','Otac',id+':m'):'')+(mo?node(mo):ed?addNode('addParent','Majka',id+':z'):'')+(!fa&&!mo&&!ed?'<span class="hint">nepoznati</span>':'')+'</div><div class="vline"></div>'
    +'<div class="center"><div class="me">'+ph(p,'big')+'<div><div class="nm">'+esc(nameOf(p))+'</div>'+(p.birthName?'<div class="hint">rođ. '+esc(p.birthName)+'</div>':'')+'<div class="yr">'+esc(years(p))+'</div>'+(p.locked?'<div class="lock">🔒 zaključano</div>':'')+'</div></div>'
    +pa.map(x=>'<span class="knot" title="'+(x.rel.kind==='partner'?'partner':'brak')+'">✦</span>'+node(x.p)).join('')+(ed?addNode('addPartner','Partner',id):'')+'</div>'
    +'<div class="vline"></div><div class="lvl-t">Djeca</div><div class="lvl">'+ch.map(c=>node(c)).join('')+addNode('addChild','Dijete',id)+'</div>'
    +(sib.length?'<div class="lvl-t">Braća i sestre</div><div class="sib">'+sib.map(s=>'<button class="chip" data-go="'+s.id+'">'+ph(s,'sm')+esc(nameOf(s))+'</button>').join('')+'</div>':'')+'</div>';
  const F=[['Rođen'+(p.sex==='z'?'a':''),[fmtDate(p.born),esc(p.bornPlace||'')].filter(Boolean).join(', ')],['Umro'+(p.sex==='z'?'la':''),[fmtDate(p.died),esc(p.diedPlace||'')].filter(Boolean).join(', ')],['Živi u',esc(p.place||'')],['Zanimanje',esc(p.job||'')],
    ['Telefon',p.phone?'<a href="tel:'+esc(p.phone.replace(/[^\d+]/g,''))+'">'+esc(p.phone)+'</a> · <a href="https://wa.me/'+esc(p.phone.replace(/\D/g,'').replace(/^00/,''))+'" target="_blank" rel="noopener">WhatsApp</a>':''],['E-pošta',p.email?'<a href="mailto:'+esc(p.email)+'">'+esc(p.email)+'</a>':''],['Adresa',esc(p.address||'')]].filter(x=>x[1]);
  h+='<div class="card">'+(F.length?'<dl class="facts">'+F.map(x=>'<dt>'+x[0]+'</dt><dd>'+x[1]+'</dd>').join('')+'</dl>':'<p class="hint">Još nema podataka.</p>')
    +(p.story?'<h3>Priča</h3><div class="story">'+esc(p.story)+'</div>':'')
    +'<div class="meta">'+(p.by?'Zadnja promjena: '+esc(p.by)+', '+new Date(p.updated).toLocaleDateString('hr-HR'):'')+'</div></div>'
    +'<div class="btns">'+(ed?'<button class="btn primary" data-a="edit" data-id="'+id+'">Uredi</button><button class="btn" data-a="photo" data-id="'+id+'">Fotografija</button>':'<span class="hint">🔒 Ovu osobu može mijenjati samo administrator.</span>')
    +(isAdmin()?'<button class="btn" data-a="lock" data-id="'+id+'">'+(p.locked?'Otključaj':'Zaključaj')+'</button><button class="btn danger" data-a="del" data-id="'+id+'">Obriši</button>':'')
    +(ME===id?'':'<button class="btn small" data-a="me" data-id="'+id+'">Ovo sam ja</button>')+'</div>'
    +(pa.length&&ed?'<p class="hint">'+pa.map(x=>'<button class="link" data-a="unrel" data-id="'+x.rel.id+'">Ukloni vezu s '+esc(nameOf(x.p))+'</button>').join(' · ')+'</p>':'');
  return h}
/* ---------- uređivanje ---------- */
function personForm(p,title,extra){p=p||{};const opt=(sel,list,blank)=>'<option value="">'+blank+'</option>'+list.map(x=>'<option value="'+x.id+'"'+(x.id===sel?' selected':'')+'>'+esc(nameOf(x)+(years(x)?' ('+years(x)+')':''))+'</option>').join('');
  const all=Object.values(D.persons).filter(x=>!x.deleted&&x.id!==p.id).sort((a,b)=>nrm(nameOf(a)).localeCompare(nrm(nameOf(b))));
  modal('<div class="mhead"><h3>'+title+'</h3><button class="x" data-a="close" aria-label="Zatvori">×</button></div><form data-pf="1"'+(extra?' data-extra="'+esc(extra)+'"':'')+' data-id="'+esc(p.id||'')+'" data-ver="'+(p.ver||0)+'">'
    +'<div class="grid2"><label>Ime<input id="p-first" value="'+esc(p.first||'')+'"></label><label>Prezime<input id="p-last" value="'+esc(p.last||'')+'"></label></div>'
    +'<div class="grid2"><label>Rođeno prezime<input id="p-birthName" value="'+esc(p.birthName||'')+'"></label><label>Spol<select id="p-sex"><option value="">—</option><option value="m"'+(p.sex==='m'?' selected':'')+'>muški</option><option value="z"'+(p.sex==='z'?' selected':'')+'>ženski</option></select></label></div>'
    +'<div class="grid2"><label>Datum rođenja<input id="p-born" value="'+esc(p.born?fmtDate(p.born).replace(/\.$/,'').replace(/ /g,''):'')+'" placeholder="12.5.1934 ili 1934"></label><label>Mjesto rođenja<input id="p-bornPlace" value="'+esc(p.bornPlace||'')+'"></label></div>'
    +'<div class="grid2"><label>Datum smrti<input id="p-died" value="'+esc(p.died?fmtDate(p.died).replace(/\.$/,'').replace(/ /g,''):'')+'" placeholder="prazno = živi"></label><label>Mjesto smrti<input id="p-diedPlace" value="'+esc(p.diedPlace||'')+'"></label></div>'
    +'<div class="grid2"><label>Živi u<input id="p-place" value="'+esc(p.place||'')+'"></label><label>Zanimanje<input id="p-job" value="'+esc(p.job||'')+'"></label></div>'
    +'<div class="grid2"><label>Otac<select id="p-father">'+opt(p.father,all.filter(x=>x.sex!=='z'),'— nepoznat —')+'</select></label><label>Majka<select id="p-mother">'+opt(p.mother,all.filter(x=>x.sex!=='m'),'— nepoznata —')+'</select></label></div>'
    +'<div class="grid2"><label>Telefon<input id="p-phone" type="tel" value="'+esc(p.phone||'')+'"></label><label>E-pošta<input id="p-email" type="email" value="'+esc(p.email||'')+'"></label></div>'
    +'<label>Adresa<input id="p-address" value="'+esc(p.address||'')+'"></label><label>Priča, sjećanja<textarea id="p-story">'+esc(p.story||'')+'</textarea></label>'
    +'<div class="btns"><button type="button" class="btn" data-a="close">Odustani</button><button class="btn primary">Spremi</button></div></form>')}
const FIELDS=['first','last','birthName','sex','born','bornPlace','died','diedPlace','place','job','father','mother','phone','email','address','story'];
document.addEventListener('submit',async e=>{const f=e.target.closest('form[data-pf]');if(!f)return;e.preventDefault();const o={};
  for(const k of FIELDS){const el=$('#p-'+k);if(!el)continue;let v=el.value.trim();if(k==='born'||k==='died'){const d=parseDate(v);if(d===null){toast('Datum upiši kao 12.5.1934 ili samo godinu 1934.');return}v=d}if(v)o[k]=v}
  if(!o.first&&!o.last){toast('Upiši barem ime ili prezime.');return}
  const id=f.dataset.id,old=id?P(id):null;if(old&&old.photo)o.photo=old.photo;
  const btn=f.querySelector('button.primary');btn.disabled=true;
  try{if(id){await api('/tree/person/'+id,{method:'PUT',body:{ver:+f.dataset.ver,person:o}})}
    else{const j=await api('/tree/person',{method:'POST',body:{person:o}});const x=f.dataset.extra||'';
      if(x.startsWith('partner:'))await api('/tree/rel',{method:'POST',body:{a:x.slice(8),b:j.id,kind:'brak'}});
      if(x.startsWith('parent:')){const [,cid]=x.split(':');const c=P(cid);const body=Object.assign({},c);const key=o.sex==='z'?'mother':'father';body[key]=j.id;
        await api('/tree/person/'+cid,{method:'PUT',body:{ver:c.ver,person:pick(body)}})}
      closeModal();await sync();location.hash='#/o/'+(x.startsWith('parent:')?x.split(':')[1]:j.id);toast('Spremljeno.');return}
    closeModal();await sync();toast('Spremljeno.')}
  catch(x){toast(err(x));btn.disabled=false;if(x.code==='CONFLICT'){closeModal();sync()}}});
const pick=p=>{const o={};FIELDS.concat(['photo']).forEach(k=>{if(p[k])o[k]=p[k]});return o};
function addDialog(kind,id){const p=P(id);const sx=kind==='parent'?id.split(':')[1]:'';const pid=kind==='parent'?id.split(':')[0]:id;const base=P(pid);
  const title=kind==='parent'?(sx==='m'?'Dodaj oca':'Dodaj majku'):kind==='partner'?'Dodaj partnera':'Dodaj dijete';
  const cands=Object.values(D.persons).filter(x=>!x.deleted&&x.id!==pid&&(kind!=='parent'||!x.sex||x.sex===sx)).sort((a,b)=>nrm(nameOf(a)).localeCompare(nrm(nameOf(b))));
  modal('<div class="mhead"><h3>'+title+'</h3><button class="x" data-a="close">×</button></div><p class="hint">'+esc(nameOf(base))+'</p><div class="btns"><button class="btn primary" data-a="addNew" data-k="'+kind+'" data-id="'+esc(id)+'">Nova osoba</button></div><h3>ili postojeća osoba</h3><input class="search" id="q2" type="search" placeholder="Traži …"><div>'
    +cands.map(c=>'<button class="prow" data-pick="'+c.id+'" data-n="'+esc(nameOf(c))+'" data-k="'+kind+'" data-id="'+esc(id)+'">'+ph(c,'sm')+'<span><span class="nm">'+esc(nameOf(c))+'</span><br><span class="yr">'+esc(years(c))+'</span></span></button>').join('')+'</div>')}
async function linkExisting(kind,id,other){try{
  if(kind==='partner')await api('/tree/rel',{method:'POST',body:{a:id,b:other,kind:'brak'}});
  else if(kind==='child'){const c=P(other),base=P(id);const b=Object.assign({},c);if(base.sex==='z')b.mother=id;else b.father=id;await api('/tree/person/'+other,{method:'PUT',body:{ver:c.ver,person:pick(b)}})}
  else{const [cid,sx]=id.split(':');const c=P(cid);const b=Object.assign({},c);b[sx==='z'?'mother':'father']=other;await api('/tree/person/'+cid,{method:'PUT',body:{ver:c.ver,person:pick(b)}})}
  closeModal();await sync();toast('Povezano.')}catch(x){toast(err(x))}}
function newFor(kind,id){if(kind==='child'){const base=P(id);const pr=partnersOf(id).map(x=>x.p);const o={last:base.last};if(base.sex==='z'){o.mother=id;if(pr.length===1&&pr[0].sex!=='z')o.father=pr[0].id;o.last=pr.length===1?pr[0].last:base.last}else{o.father=id;if(pr.length===1&&pr[0].sex!=='m')o.mother=pr[0].id}personForm(o,'Novo dijete')}
  else if(kind==='partner'){const base=P(id);personForm({sex:base.sex==='m'?'z':base.sex==='z'?'m':''},'Novi partner','partner:'+id)}
  else{const [cid,sx]=id.split(':');const c=P(cid);personForm({sex:sx,last:sx==='m'?c.last:''},sx==='m'?'Novi otac':'Nova majka','parent:'+cid)}}
/* ---------- fotografije ---------- */
function pickPhoto(id){const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=async()=>{const f=i.files[0];if(!f)return;toast('Fotografija se šalje …');
  try{const data=await shrink(f,900);await api('/tree/photo',{method:'POST',body:{personId:id,data}});await sync();toast('Fotografija spremljena.')}catch(x){toast(err(x))}};i.click()}
function shrink(file,max){return new Promise((res,rej)=>{const img=new Image();img.onload=()=>{const s=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);res(c.toDataURL('image/jpeg',.82))};img.onerror=rej;img.src=URL.createObjectURL(file)})}
/* ---------- admin ---------- */
let AD={};
function vAdmin(){if(!isAdmin())return '<p class="empty">Samo za administratora.</p>';const empty=!Object.values(D.persons).some(p=>!p.deleted);
  return '<h2>Admin</h2>'
    +'<div class="card"><div class="eyebrow">Pozivnice</div><p class="hint">Pošalji poveznicu članu obitelji, npr. preko WhatsAppa. Pozivnica vrijedi 30 dana i može je koristiti više osoba.</p><div class="btns"><button class="btn primary" data-a="invite">Nova pozivnica</button></div><div id="ad-inv"><p class="hint">Učitavanje …</p></div></div>'
    +'<div class="card"><div class="eyebrow">Članovi</div><div id="ad-users"><p class="hint">Učitavanje …</p></div></div>'
    +'<div class="card"><div class="eyebrow">Zaključavanje</div><p class="hint">Zaključane osobe mogu mijenjati samo administratori. Članovi im i dalje mogu dodati djecu.</p><div class="btns"><button class="btn" data-a="lockAll" data-v="1">Zaključaj sve</button><button class="btn" data-a="lockAll" data-v="0">Otključaj sve</button></div></div>'
    +'<div class="card"><div class="eyebrow">Povijest promjena</div><p class="hint">Svaka promjena se bilježi. Možeš je vratiti.</p><div id="ad-log"><p class="hint">Učitavanje …</p></div></div>'
    +'<div class="card"><div class="eyebrow">Uvoz</div><p class="hint">Uvoz postojećeg rodoslova iz datoteke (rodoslov-uvoz.json).'+(empty?'':' Osobe se uvoze samo u prazno stablo; fotografije se mogu uvesti uvijek.')+'</p><div class="btns"><button class="btn" data-a="import">Uvezi datoteku</button></div></div>'}
async function loadAdmin(){try{const [inv,us,lg]=await Promise.all([api('/tree/admin/invites'),api('/tree/admin/users'),api('/tree/admin/log')]);AD={inv:inv.invites,users:us.users,log:lg.log};fillAdmin()}catch(e){toast(err(e))}}
const inviteUrl=c=>location.origin+location.pathname+'?poziv='+c;
function fillAdmin(){const T=Date.now();const iv=$('#ad-inv'),us=$('#ad-users'),lg=$('#ad-log');if(!iv)return;
  const act=(AD.inv||[]).filter(i=>!i.revoked&&i.expires>T);
  iv.innerHTML=act.length?act.map(i=>'<div class="log"><span><b>'+esc(i.note||'Pozivnica')+'</b><br><span class="t">do '+new Date(i.expires).toLocaleDateString('hr-HR')+' · iskorištena '+i.uses+'×</span></span><span class="x"><button class="btn small" data-a="share" data-v="'+i.code+'">Podijeli</button> <button class="btn small danger" data-a="revoke" data-v="'+i.code+'">Opozovi</button></span></div>').join(''):'<p class="hint">Nema aktivnih pozivnica.</p>';
  us.innerHTML=(AD.users||[]).map(u=>'<div class="log"><span><b>'+esc(u.name)+'</b>'+(u.admin?' · admin':'')+(u.blocked?' · <span class="neg">blokiran</span>':'')+'<br><span class="t">'+esc(u.email)+'</span></span><span class="x"><button class="btn small" data-a="ureset" data-v="'+u.id+'">Nova lozinka</button>'+(u.admin?'':' <button class="btn small'+(u.blocked?'':' danger')+'" data-a="'+(u.blocked?'unblock':'block')+'" data-v="'+u.id+'">'+(u.blocked?'Odblokiraj':'Blokiraj')+'</button>')+'</span></div>').join('')||'<p class="hint">Nema članova.</p>';
  const W={dodao:'dodao/la osobu',uredio:'uredio/la',obrisao:'obrisao/la',fotografija:'nova fotografija',povezao:'povezao/la',razdvojio:'uklonio/la vezu',zakljucao:'zaključao/la',otkljucao:'otključao/la',vratio:'vratio/la',ponistio:'poništio/la',uvezao:'uvezao/la',pridruzio:'pridružio/la se'};
  lg.innerHTML=(AD.log||[]).slice(0,80).map(l=>'<div class="log"><span class="t">'+new Date(l.ts).toLocaleString('hr-HR',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'})+'</span><span><b>'+esc(l.user_name)+'</b> '+(W[l.action]||esc(l.action))+' '+esc(l.label||'')+'</span><span class="x">'+(l.hasBefore&&['uredio','obrisao','fotografija','razdvojio'].includes(l.action)?'<button class="btn small" data-a="restore" data-v="'+l.id+'">Vrati</button>':['dodao','povezao'].includes(l.action)?'<button class="btn small" data-a="undo" data-v="'+l.id+'">Poništi</button>':'')+'</span></div>').join('')||'<p class="hint">Još nema promjena.</p>'}
async function shareInvite(code){const url=inviteUrl(code),text='Pozivam te u naš obiteljski rodoslov: '+url;
  if(navigator.share){try{await navigator.share({title:'Rodoslov',text,url});return}catch(e){if(e&&e.name==='AbortError')return}}
  modal('<div class="mhead"><h3>Pozivnica</h3><button class="x" data-a="close">×</button></div><p class="hint">Kopiraj poveznicu i pošalji je:</p><div class="code">'+esc(url)+'</div><div class="btns"><a class="btn" href="https://wa.me/?text='+encodeURIComponent(text)+'" target="_blank" rel="noopener">WhatsApp</a><button class="btn" data-a="copy" data-v="'+esc(url)+'">Kopiraj</button></div>')}
async function doImport(){const i=document.createElement('input');i.type='file';i.accept='.json,application/json';i.onchange=async()=>{const f=i.files[0];if(!f)return;
  let j;try{j=JSON.parse(await f.text())}catch(e){toast('Datoteka nije valjana.');return}
  try{const empty=!Object.values(D.persons).some(p=>!p.deleted);
    if(empty&&Array.isArray(j.persons)){toast('Uvoz osoba …');for(let k=0;k<j.persons.length;k+=20)await api('/tree/admin/seed',{method:'POST',body:{first:k===0,persons:j.persons.slice(k,k+20)}});
      for(let k=0;k<(j.rels||[]).length;k+=20)await api('/tree/admin/seed',{method:'POST',body:{rels:j.rels.slice(k,k+20)}});await sync()}
    const phs=j.photos||[];let n=0;for(const x of phs){if(!P(x.personId)||P(x.personId).photo)continue;toast('Fotografije '+(++n)+' / '+phs.length+' …');await api('/tree/photo',{method:'POST',body:{personId:x.personId,data:x.data}})}
    await sync(true);toast('Uvoz gotov.');loadAdmin()}catch(e){toast(err(e))}};i.click()}
/* ---------- više ---------- */
function vMore(){return '<h2>Više</h2><div class="card"><div class="eyebrow">Moj račun</div><p><b>'+esc(A.user.name)+'</b><br><span class="hint">'+esc(A.user.email)+(isAdmin()?' · administrator':'')+'</span></p>'+(ME&&P(ME)?'<p class="hint">Ti si: '+esc(nameOf(P(ME)))+'</p>':'<p class="hint">Na svojoj kartici u stablu pritisni „Ovo sam ja“, tada se stablo otvara kod tebe.</p>')+'<div class="btns"><button class="btn" data-a="refresh">Osvježi podatke</button><button class="btn danger" data-a="logout">Odjava</button></div></div>'
  +'<div class="card"><div class="eyebrow">Pomoć</div><p class="hint">Zaboravljena lozinka? Administrator ti može dati kod za novu lozinku. Zaključane osobe (🔒) može mijenjati samo administrator.</p></div>'}
/* ---------- klikovi ---------- */
document.addEventListener('click',async e=>{const g=e.target.closest('[data-go]');if(g&&!e.target.closest('[data-a]')){location.hash='#/o/'+g.dataset.go;return}
  const pk=e.target.closest('[data-pick]');if(pk){linkExisting(pk.dataset.k,pk.dataset.id,pk.dataset.pick);return}
  const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,id=b.dataset.id,v=b.dataset.v;
  if(a==='close')closeModal();
  else if(a==='av'){authView=v;renderAuth()}
  else if(a==='add')personForm({},'Nova osoba');
  else if(a==='edit'){personForm(P(id),'Uredi osobu')}
  else if(a==='addParent')addDialog('parent',id);
  else if(a==='addPartner')addDialog('partner',id);
  else if(a==='addChild')addDialog('child',id);
  else if(a==='addNew'){newFor(b.dataset.k,id)}
  else if(a==='photo')pickPhoto(id);
  else if(a==='me'){ME=id;try{localStorage.setItem('rod-me',id)}catch(_){}toast('Zapamćeno.');render(true)}
  else if(a==='lock'){const p=P(id);try{await api('/tree/person/'+id+'/lock',{method:'POST',body:{locked:!p.locked}});await sync();toast(p.locked?'Otključano.':'Zaključano.')}catch(x){toast(err(x))}}
  else if(a==='del'){const p=P(id);if(!confirm('Obrisati osobu '+nameOf(p)+'? U povijesti promjena možeš je vratiti.'))return;try{await api('/tree/person/'+id,{method:'DELETE'});await sync();location.hash='#/osobe';toast('Obrisano.')}catch(x){toast(err(x))}}
  else if(a==='unrel'){if(!confirm('Ukloniti ovu vezu?'))return;try{await api('/tree/rel/'+id,{method:'DELETE'});await sync();toast('Veza uklonjena.')}catch(x){toast(err(x))}}
  else if(a==='invite'){try{const j=await api('/tree/admin/invites',{method:'POST',body:{days:30,note:'Pozivnica '+new Date().toLocaleDateString('hr-HR')}});await loadAdmin();shareInvite(j.code)}catch(x){toast(err(x))}}
  else if(a==='share')shareInvite(v);
  else if(a==='copy'){(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(()=>toast('Kopirano.'),()=>toast(v))}
  else if(a==='revoke'){if(!confirm('Opozvati pozivnicu? Postojeći računi ostaju.'))return;try{await api('/tree/admin/invite/'+v,{method:'DELETE'});loadAdmin();toast('Pozivnica opozvana.')}catch(x){toast(err(x))}}
  else if(a==='block'||a==='unblock'){try{await api('/tree/admin/user/'+v+'/'+a,{method:'POST'});loadAdmin();toast(a==='block'?'Blokirano.':'Odblokirano.')}catch(x){toast(err(x))}}
  else if(a==='ureset'){try{const j=await api('/tree/admin/user/'+v+'/reset',{method:'POST'});modal('<div class="mhead"><h3>Kod za novu lozinku</h3><button class="x" data-a="close">×</button></div><p class="hint">Pošalji ovaj kod članu. Vrijedi 7 dana. U aplikaciji odabere „Zaboravljena lozinka?“.</p><div class="code">'+esc(j.code)+'</div><div class="btns"><button class="btn" data-a="copy" data-v="'+esc(j.code)+'">Kopiraj</button></div>')}catch(x){toast(err(x))}}
  else if(a==='lockAll'){const L=Object.values(D.persons).filter(p=>!p.deleted&&!!p.locked!==(v==='1'));if(!L.length){toast('Nema promjena.');return}toast('Molim pričekaj …');
    try{for(let k=0;k<L.length;k+=6)await Promise.all(L.slice(k,k+6).map(p=>api('/tree/person/'+p.id+'/lock',{method:'POST',body:{locked:v==='1'}})));await sync();toast(v==='1'?'Sve osobe zaključane.':'Sve osobe otključane.');loadAdmin()}catch(x){toast(err(x))}}
  else if(a==='restore'||a==='undo'){try{await api(a==='restore'?'/tree/admin/restore':'/tree/admin/undo-add',{method:'POST',body:{id:+v}});await sync();loadAdmin();toast('Vraćeno.')}catch(x){toast(err(x))}}
  else if(a==='import')doImport();
  else if(a==='refresh'){await sync(true);toast('Osvježeno.')}
  else if(a==='logout'){try{await api('/tree/logout',{method:'POST'})}catch(_){}A=null;saveA();D={since:0,persons:{},rels:{}};saveD();authView='login';render()}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.open)closeModal()});
/* ---------- start ---------- */
render();if(A)sync();
