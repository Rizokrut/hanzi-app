
let ST={},HSK=[];
const norm=s=>s.replace(/[üǖǘǚǜ]/gi,"v").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\s\d]/g,"").toLowerCase();
let W=[];
const G=[["是 — глагол-связка","Между подлежащим и именной частью. Отрицание — 不是.",["我是学生。","Wǒ shì xuésheng.","Я студент."]],
["吗 — вопрос «да/нет»","Добавьте 吗 в конец утверждения.",["你好吗？","Nǐ hǎo ma?","Как дела?"]],
["不 и 没 — отрицание","不 — обычное отрицание и будущее; 没 — для 有 и прошедшего действия.",["我没有钱。","Wǒ méiyǒu qián.","У меня нет денег."]],
["了 — завершённость","После глагола, когда действие совершено.",["我吃了。","Wǒ chī le.","Я поел."]],
["的 — определение","Связывает определение и слово.",["我的朋友","wǒ de péngyou","мой друг"]]];
let S={};try{S=JSON.parse(localStorage.getItem("hz3")||"{}")}catch(e){}
S.cards=S.cards||{};S.st=S.st||{d:"",n:0,streak:0,last:""};
const save=()=>{try{localStorage.setItem("hz3",JSON.stringify(S))}catch(e){}};
const $=s=>document.querySelector(s),M=$("#m"),today=()=>new Date().toISOString().slice(0,10);
let tab="h",q="",queue=[],mode=0,wi=0,hint=true;
const say=t=>{try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang="zh-CN";u.rate=.8;speechSynthesis.speak(u)}catch(e){}};
const due=()=>Object.keys(S.cards).filter(i=>S.cards[i].due<=Date.now()).map(Number);
const toggle=i=>{if(S.cards[i])delete S.cards[i];else S.cards[i]={due:0,int:0,ease:2.3};save()};
const shuf=a=>a.map(x=>[Math.random(),x]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
function render(){document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on",b.dataset.t==tab));({h:home,d:dict,l:learn,w:write,g:gram})[tab]()}
function home(){const n=due().length,t=Object.keys(S.cards).length,d=today(),done=S.st.d==d?S.st.n:0,wd=W[Math.floor(Date.now()/864e5)%300];
M.innerHTML=`<div class="hero"><span class="bg zh">学</span><b class="zh">${n?"今天":"好！"}</b><p>${!t?"Добавьте первые слова — и начнём":n?`К повторению: ${n} · сегодня выучено ${done}`:"На сегодня всё повторено"} · серия ${S.st.streak} дн.</p><button class="btn w" data-go="l">${t?"Начать повторение":"Выбрать слова"}</button></div>
<h2>Слово дня</h2><div class="wod" data-o="${wd.id}"><div class="h zh">${wd.h}</div><div><div class="p">${wd.p}</div><div>${wd.r}</div></div></div>
<h2>Разделы</h2><div class="tiles"><button class="tile" data-go="d"><i class="zh">字</i>Словарь<small>${W.length} слов</small></button><button class="tile" data-go="w"><i class="zh">写</i>Прописи<small>рисуйте и проверяйте</small></button><button class="tile" data-go="g"><i class="zh">文</i>Грамматика<small>${G.length} разборов</small></button><button class="tile" data-go="l"><i class="zh">学</i>Мои слова<small>${t} в списке</small></button></div>`}
function dict(){M.innerHTML=`<h1>Словарь</h1><input id="q" placeholder="Иероглиф, пиньинь или перевод" value="${q}" autocomplete="off"><div id="ls"></div>`;
const L=$("#ls"),draw=()=>{const s=q.trim().toLowerCase(),n=norm(s),r=!s?W:W.filter(w=>w.h.includes(s)||w.r.toLowerCase().includes(s)||(n&&w.n.includes(n))).sort((a,b)=>((b.h==s||(n&&b.n==n))-(a.h==s||(n&&a.n==n)))||a.l-b.l);
L.innerHTML=r.length?r.slice(0,80).map(w=>`<div class="row" data-o="${w.id}"><div class="h zh">${w.h}</div><div class="t"><div class="p">${w.p} · HSK ${w.l}</div><div>${w.r}</div></div><button class="star ${S.cards[w.id]?"on":""}" data-s="${w.id}">★</button></div>`).join("")+(r.length>80?`<div class="empty">Показано 80 из ${r.length} — уточните запрос</div>`:""):`<div class="empty">Ничего не найдено</div>`};
draw();$("#q").oninput=e=>{q=e.target.value;draw()}}
let stopA=()=>{};
function anim(w,box){const cs=[...w.h].filter(c=>ST[c]),n=cs.length;if(!n){box.innerHTML=`<div class="big zh">${w.h}</div>`;return{stop(){},toggle(){return 0},speed(){return 1},loop(){return 1}}}
let h=`<svg viewBox="0 0 ${1024*n} 1024" preserveAspectRatio="xMidYMid meet">`;
cs.forEach((c,k)=>{const x=k*1024;h+=`<rect x="${x+8}" y="8" width="1008" height="1008" rx="60" fill="none" stroke="var(--ln)" stroke-width="6"/><path d="M${x+512} 30V994M${x+30} 512H${x+994}" stroke="var(--ln)" stroke-width="5" stroke-dasharray="14 18"/><g transform="translate(${x} 900) scale(1 -1)">`;
ST[c].s.forEach((d,i)=>{const id=`k${k}_${i}`;h+=`<path d="${d}" fill="var(--tx)" opacity=".1"/><clipPath id="${id}"><path d="${d}"/></clipPath><path class="m" data-k="${k}" d="M${ST[c].m[i].map(p=>p.join(" ")).join("L")}" fill="none" stroke="var(--ac)" stroke-width="170" stroke-linecap="round" clip-path="url(#${id})" style="opacity:0"/>`});h+=`</g>`});
h+=`<circle r="34" fill="var(--ac)" opacity="0" id="pen"/></svg>`;box.innerHTML=h;
const svg=box.firstChild,pen=svg.querySelector("#pen"),it=[...svg.querySelectorAll(".m")].map(el=>({el,len:el.getTotalLength(),k:+el.dataset.k}));
let acc=0;it.forEach(o=>{o.dur=380+o.len*1.1;o.s=acc;acc+=o.dur+170});const T=acc+1100;
let sp=1,lp=true,pl=true,t=0,last=0,raf;const ez=p=>p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
const fr=ts=>{if(!last)last=ts;if(pl)t+=(ts-last)*sp;last=ts;if(t>T){if(lp)t=0;else{t=T;pl=false}}
let on=null;it.forEach(o=>{const p=Math.min(1,Math.max(0,(t-o.s)/o.dur)),e=o.el.style;e.opacity=p>0?1:0;e.strokeDasharray=`${o.len} ${o.len+400}`;e.strokeDashoffset=o.len*(1-ez(p));e.stroke=p>=1?"var(--tx)":"var(--ac)";if(p>0&&p<1)on=[o,ez(p)]});
if(on){const[o,p]=on,q=o.el.getPointAtLength(o.len*p);pen.setAttribute("cx",o.k*1024+q.x);pen.setAttribute("cy",900-q.y);pen.style.opacity=.9}else pen.style.opacity=0;
raf=requestAnimationFrame(fr)};raf=requestAnimationFrame(fr);
svg.onclick=()=>{if(!pl&&t>=T)t=0;pl=!pl};
return{stop(){cancelAnimationFrame(raf)},toggle(){if(!pl&&t>=T)t=0;pl=!pl;return pl},speed(){sp=sp==1?.5:sp==.5?2:1;return sp},loop(){lp=!lp;return lp}}}
function open(i){const w=W[i],sh=$("#sh");stopA();
$("#shc").innerHTML=`<div id="an" class="an"></div><div class="ctls"><button class="ct" id="pl">❚❚</button><button class="ct" id="sp">×1</button><button class="ct on" id="lp">🔁</button></div><div class="py">${w.p}</div><div class="ru">${w.r}</div><div class="bt"><button class="btn g" id="a">🔊 Слушать</button><button class="btn g" id="c">✎ Писать</button><button class="btn" id="b">${S.cards[i]?"★ В списке":"☆ Учить"}</button></div>`;sh.classList.add("on");
const A=anim(w,$("#an"));stopA=A.stop;say(w.h);
$("#pl").onclick=()=>{$("#pl").textContent=A.toggle()?"❚❚":"▶"};$("#sp").onclick=()=>{$("#sp").textContent="×"+A.speed()};$("#lp").onclick=()=>{$("#lp").classList.toggle("on",A.loop())};
$("#a").onclick=()=>say(w.h);$("#c").onclick=()=>{stopA();sh.classList.remove("on");wi=i;tab="w";render()};
$("#b").onclick=()=>{toggle(i);$("#b").textContent=S.cards[i]?"★ В списке":"☆ Учить";render()};
sh.onclick=e=>{if(e.target==sh){stopA();sh.classList.remove("on")}}}
function grade(i,g){const c=S.cards[i],D=864e5;queue.shift();
if(g==0){c.int=0;c.ease=Math.max(1.3,c.ease-.2);c.due=Date.now()+6e4;queue.push(i)}
else{c.int=g==1?(c.int?Math.round(c.int*c.ease):1):(c.int?Math.round(c.int*c.ease*1.5):3);if(g==2)c.ease+=.1;c.due=Date.now()+c.int*D;
const s=S.st,d=today();if(s.d!=d){s.d=d;s.n=0}s.n++;if(s.last!=d){s.streak=s.last==new Date(Date.now()-D).toISOString().slice(0,10)?s.streak+1:1;s.last=d}}
save();learn()}
function conv(s){const mk={a:"āáǎà",e:"ēéěè",i:"īíǐì",o:"ōóǒò",u:"ūúǔù",v:"ǖǘǚǜ",ü:"ǖǘǚǜ"};
return s.toLowerCase().replace(/([a-züv]+)([1-5])/g,(m,b,t)=>{if(t==5)return b;let k=b.search(/[ae]/);if(k<0)k=b.includes("ou")?b.indexOf("o"):[...b].map((c,j)=>"aeiouvü".includes(c)?j:-1).filter(j=>j>=0).pop();return k<0?b:b.slice(0,k)+mk[b[k]][t-1]+b.slice(k+1)})}
function learn(){const t=Object.keys(S.cards).length;
M.innerHTML=`<h1>Учить</h1>`;
if(!t){M.innerHTML+=`<div class="empty">Список пуст. Добавляйте слова звёздочкой ★ в словаре<br><button class="btn" id="st">Взять первые 10 слов</button></div>`;$("#st").onclick=()=>{W.slice(0,10).forEach(w=>{if(!S.cards[w.id])S.cards[w.id]={due:0,int:0,ease:2.3}});save();learn()};return}
if(!queue.length)queue=due();
M.innerHTML+=`<div class="seg">${["Карточки","Тест","Пиньинь"].map((n,i)=>`<button data-m="${i}" class="${mode==i?"on":""}">${n}</button>`).join("")}</div><div class="stats"><span>К повторению: ${queue.length}</span><span>Всего слов: ${t}</span></div><div id="box"></div>`;
if(!queue.length){$("#box").innerHTML=`<div class="empty">На сегодня всё 🎉<br>Возвращайтесь позже</div>`;return}
const w=W[queue[0]],B=$("#box");
if(mode==1){const o=shuf([w,...shuf(W.filter(x=>x!=w)).slice(0,3)]);B.innerHTML=`<div class="card"><div class="big zh">${w.h}</div></div>`+o.map(x=>`<button class="opt" data-a="${x.id}">${x.r}</button>`).join("");
B.onclick=e=>{const b=e.target.closest(".opt");if(!b||B.dataset.l)return;B.dataset.l=1;const ok=+b.dataset.a==w.id;b.classList.add(ok?"ok":"no");if(!ok)B.querySelector(`[data-a="${w.id}"]`).classList.add("ok");say(w.h);setTimeout(()=>grade(w.id,ok?1:0),900)}}
else if(mode==2){B.innerHTML=`<div class="card"><div class="big zh">${w.h}</div><div class="ru">${w.r}</div></div><input id="pi" placeholder="Пиньинь, например ni3 hao3" autocomplete="off" autocapitalize="none" style="margin-top:12px"><div class="msg" id="ms"></div>`;
const pi=$("#pi");pi.focus();pi.onkeydown=e=>{if(e.key!="Enter")return;if(pi.dataset.l)return;const v=conv(pi.value).replace(/\s/g,""),p=w.p.toLowerCase().replace(/\s/g,""),ok=v==p||norm(v)==w.n&&!/\d|[āáǎà]/.test(pi.value);pi.dataset.l=1;$("#ms").style.color=ok?"var(--ok)":"var(--ac)";$("#ms").textContent=(ok?"Верно: ":"Правильно: ")+w.p;say(w.h);setTimeout(()=>grade(w.id,ok?1:0),1200)}}
else{B.innerHTML=`<div class="card" id="c"><span class="badge" id="bd"></span><div id="f"></div></div><div class="hint">Нажмите, чтобы перевернуть · ← снова · → хорошо · ↑ легко</div>`;
const c=$("#c"),f=$("#f"),bd=$("#bd");let flip=false,x0,y0,dx=0,dy=0,dn=false;
const face=()=>{f.innerHTML=flip?`<div class="big zh">${w.h}</div>`:`<div class="py">${w.p}</div><div class="ru">${w.r}</div>`;if(flip)say(w.h)};face();
const dir=()=>(-dy>Math.abs(dx)?2:dx<0?0:1);
c.onpointerdown=e=>{dn=true;x0=e.clientX;y0=e.clientY;c.setPointerCapture(e.pointerId)};
c.onpointermove=e=>{if(!dn)return;dx=e.clientX-x0;dy=e.clientY-y0;c.style.transform=`translate(${dx}px,${dy}px) rotate(${dx/25}deg)`;const g=dir();bd.style.opacity=Math.min(1,Math.hypot(dx,dy)/90);bd.textContent=["Снова","Хорошо","Легко"][g];bd.style.color=["var(--ac)","var(--ok)","#e0a82e"][g];bd.style.left=g==0?"20px":"auto";bd.style.right=g==0?"auto":"20px"};
c.onpointerup=()=>{dn=false;const d=Math.hypot(dx,dy);if(d<10){flip=!flip;face()}else if(d>90)grade(w.id,dir());c.style.transform="";bd.style.opacity=0;dx=dy=0}}}
function write(){const w=W[wi],N=360;
M.innerHTML=`<h1>Прописи</h1><div class="stats"><span class="zh" style="font-size:18px">${w.h}</span><span>${w.p}</span><span>${w.r}</span></div><div class="cv"><canvas class="t" width="${N}" height="${N}"></canvas><canvas class="i" width="${N}" height="${N}"></canvas></div><div class="msg" id="ms"></div>
<div class="bt"><button class="btn g" id="pv">‹</button><button class="btn g" id="hn">Подсказка</button><button class="btn g" id="cl">Стереть</button><button class="btn" id="ck">Проверить</button><button class="btn g" id="nx">›</button></div><div class="hint">Пишите пальцем поверх контура · 🔊 нажмите на иероглиф в заголовке</div>`;
const T=$(".t"),I=$(".i"),tc=T.getContext("2d"),ic=I.getContext("2d"),F=`${Math.min(300,Math.floor(300/w.h.length))}px "Kaiti SC",KaiTi,STKaiti,"Noto Serif SC",serif`;let st=[],cur=null;
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v);
const tpl=()=>{tc.clearRect(0,0,N,N);tc.strokeStyle=css("--ln");tc.setLineDash([6,6]);tc.lineWidth=1;tc.beginPath();tc.moveTo(0,0);tc.lineTo(N,N);tc.moveTo(N,0);tc.lineTo(0,N);tc.moveTo(N/2,0);tc.lineTo(N/2,N);tc.moveTo(0,N/2);tc.lineTo(N,N/2);tc.stroke();
if(hint){tc.globalAlpha=.22;tc.fillStyle=css("--tx");tc.font=F;tc.textAlign="center";tc.textBaseline="middle";tc.fillText(w.h,N/2,N/2+8);tc.globalAlpha=1}};
const ink=(c,wd)=>{c.clearRect(0,0,N,N);c.lineCap=c.lineJoin="round";c.lineWidth=wd;c.strokeStyle=css("--ac");st.forEach(s=>{c.beginPath();s.forEach((p,j)=>j?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));if(s.length==1)c.lineTo(s[0][0]+.1,s[0][1]);c.stroke()})};
const pt=e=>{const r=I.getBoundingClientRect();return[(e.clientX-r.left)*N/r.width,(e.clientY-r.top)*N/r.height]};
tpl();
I.onpointerdown=e=>{I.setPointerCapture(e.pointerId);cur=[pt(e)];st.push(cur);ink(ic,11)};
I.onpointermove=e=>{if(!cur)return;cur.push(pt(e));ink(ic,11)};I.onpointerup=()=>cur=null;
$("#cl").onclick=()=>{st=[];ink(ic,11);$("#ms").textContent=""};
$("#hn").onclick=()=>{hint=!hint;tpl()};
$("#pv").onclick=()=>{wi=(wi+W.length-1)%W.length;write()};$("#nx").onclick=()=>{wi=(wi+1)%W.length;write()};
M.querySelector(".stats").onclick=()=>say(w.h);
$("#ck").onclick=()=>{if(!st.length){$("#ms").textContent="Сначала напишите иероглиф";return}
const mk=(fn)=>{const c=document.createElement("canvas");c.width=c.height=N;const x=c.getContext("2d");fn(x);return x.getImageData(0,0,N,N).data};
const gl=x=>{x.font=F;x.textAlign="center";x.textBaseline="middle";return x},gx=(x)=>x.fillText(w.h,N/2,N/2+8);
const G0=mk(x=>{gl(x);x.fillStyle="#000";gx(x)}),G1=mk(x=>{gl(x);x.fillStyle=x.strokeStyle="#000";x.lineWidth=44;x.lineJoin="round";x.strokeText(w.h,N/2,N/2+8);gx(x)});
const tmp=document.createElement("canvas");tmp.width=tmp.height=N;const tx=tmp.getContext("2d");ink(tx,46);const I1=tx.getImageData(0,0,N,N).data;ink(tx,11);const I0=tx.getImageData(0,0,N,N).data;
let g=0,gh=0,k=0,kh=0;for(let y=0;y<N;y+=4)for(let x=0;x<N;x+=4){const a=(y*N+x)*4+3;if(G0[a]>128){g++;if(I1[a]>0)gh++}if(I0[a]>0){k++;if(G1[a]>0)kh++}}
const sc=(gh/Math.max(g,1)+kh/Math.max(k,1))/2,m=$("#ms");m.style.color=sc>.8?"var(--ok)":sc>.6?"#e0a82e":"var(--ac)";m.textContent=(sc>.8?"Отлично! ":sc>.6?"Хорошо. ":"Попробуйте ещё. ")+Math.round(sc*100)+"%"}}
function gram(){M.innerHTML=`<h1>Грамматика</h1>`+G.map(g=>`<details><summary>${g[0]}</summary><p>${g[1]}</p><div class="ex"><div class="zh">${g[2][0]}</div><small>${g[2][1]}</small><small>${g[2][2]}</small></div></details>`).join("")}
document.body.addEventListener("click",e=>{const t=e.target,go=t.closest("[data-go]"),n=t.closest("nav button"),s=t.closest("[data-s]"),o=t.closest("[data-o]"),m=t.closest("[data-m]");
if(go||n){tab=(go||n).dataset.go||(n&&n.dataset.t);queue=[];render()}else if(m){mode=+m.dataset.m;learn()}else if(s){toggle(+s.dataset.s);s.classList.toggle("on")}else if(o)open(+o.dataset.o)});
async function boot(){M.innerHTML='<div class="empty">Загрузка…</div>';
try{HSK=await(await fetch("hsk.json")).json()}catch(e){M.innerHTML='<div class="empty">Не удалось загрузить словарь</div>';return}
W=HSK.map((a,i)=>({id:i,h:a[0],p:a[1],r:a[2],l:a[3],n:norm(a[1])}));render();
try{ST=await(await fetch("strokes.json")).json()}catch(e){}}
boot();
if("serviceWorker"in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
