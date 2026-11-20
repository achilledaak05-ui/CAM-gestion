(function(){
'use strict';
/* The payment provider must be configured by the server; never put API secrets here. */
var CFG=Object.assign({apiBase:/^https?:$/.test(location.protocol)?location.origin:'',devise:'FCFA',anonyme:true,eglise:'CAM'},window.CAM_CONFIG||{});
var G=window.gsap,M=window.Motion,RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
function $(i){return document.getElementById(i)}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fm(n){return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,'\u202f')+' '+CFG.devise}
function arr(x){return Array.prototype.slice.call(x)}
var API=CFG.apiBase.replace(/\/$/,'');
var TY=[['Offrande','Votre don de cœur','<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.500-7 10-7 10z"/>'],
['Dîme','Fidélité à Dieu','<circle cx="7" cy="7" r="2.500"/><circle cx="17" cy="17" r="2.500"/><path d="M19 5L5 19"/>'],
['Don','Soutenir l’œuvre','<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 13h18M12 8c-3 0-5-1-5-3s3-2 5 3c2-5 5-5 5-3s-2 3-5 3"/>'],
['Projet spécial','Un projet précis','<path d="M12 3l2.700 5.800 6.300.8-4.600 4.400 1.200 6.300L12 17.200l-5.600 3.100 1.200-6.300L3 9.600l6.300-.8z"/>']];
var MO=[['Wave','#1dc8f2','W'],['Orange Money','#ff7900','OM'],['MTN MoMo','#e6b800','MTN'],['Moov Money','#0b6ed1','MV'],['Carte bancaire','#6b625b','CB']];
var LB=['Scanner','Choisir','Saisir','Payer','Confirmer','Reçu'],ST=['en attente','confirmé','échoué','expiré'];
var S={type:'',moyen:'',montant:0,nom:'',projet:'',ref:''},cur='sA';

/* ---------- Motion : apparitions et retours tactiles ---------- */
function fade(el){if(M)M.animate(el,{opacity:[0,1],transform:['translateY(16px)','translateY(0px)']},{duration:.4,ease:'easeOut'})}
function stag(root){var e=arr(root.querySelectorAll('.rv'));if(M&&e.length)M.animate(e,{opacity:[0,1],transform:['translateY(22px) scale(.97)','translateY(0px) scale(1)']},{delay:M.stagger(.07),duration:.5,ease:'easeOut'})}
function pop(el){if(M)M.animate(el,{scale:[1,1.08,1]},{duration:.35})}
var pr=null;
document.addEventListener('pointerdown',function(e){pr=e.target.closest('.btn,.tp,.m,.chip');if(pr&&M)M.animate(pr,{scale:.96},{duration:.12})});
function rel(){if(pr&&M)M.animate(pr,{scale:1},{type:'spring',stiffness:420,damping:16});pr=null}
document.addEventListener('pointerup',rel);document.addEventListener('pointercancel',rel);
function toast(m){var t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);fade(t);setTimeout(function(){t.remove()},2600)}

/* ---------- GSAP : arrière-plan vivant ---------- */
function bg(){
  if(!G||RM)return;
  G.to('.o1',{x:'35vw',y:'18vh',scale:1.25,duration:13,repeat:-1,yoyo:true,ease:'sine.inOut'});
  G.to('.o2',{x:'-30vw',y:'-20vh',scale:1.3,duration:16,repeat:-1,yoyo:true,ease:'sine.inOut'});
  G.to('.o3',{x:'30vw',y:'-12vh',scale:1.2,duration:11,repeat:-1,yoyo:true,ease:'sine.inOut'});
  G.to('.grid',{backgroundPosition:'44px 44px',duration:6,repeat:-1,ease:'none'});
  for(var i=0;i<22;i++){var p=document.createElement('i');p.className='pt';p.style.left=Math.random()*100+'%';var s=1+Math.random()*1.8;p.style.transform='scale('+s+')';$('bg').appendChild(p);
    G.fromTo(p,{y:innerHeight+20,opacity:0},{y:-40,opacity:.9,duration:8+Math.random()*10,delay:Math.random()*8,repeat:-1,ease:'none',keyframes:{opacity:[0,.9,.9,0]}})}
}

/* ---------- Étapes ---------- */
function setStep(n){
  arr($('dots').children).forEach(function(d,i){var on=i<n;if(on&&!d.classList.contains('on')&&G)G.fromTo(d,{scale:1.7},{scale:1,duration:.7,ease:'elastic.out(1,.5)'});d.classList.toggle('on',on)});
  $('sl').textContent='Étape '+n+' sur 6 · '+LB[n-1];
  var w=((n-1)/5*100)+'%';if(G)G.to('#bar',{width:w,duration:.8,ease:'power3.out'});else $('bar').style.width=w;
}
function go(id,n){$(cur).hidden=true;cur=id;var el=$(id);el.hidden=false;fade(el);stag(el);setStep(n);scrollTo({top:0,behavior:RM?'auto':'smooth'})}

/* ---------- Écran 1 : nature ---------- */
$('types').innerHTML=TY.map(function(t,i){return '<button class="tp rv" type="button" data-i="'+i+'"><svg viewBox="0 0 24 24">'+t[2]+'</svg><span>'+t[0]+'<small>'+t[1]+'</small></span></button>'}).join('');
$('types').onclick=function(e){var b=e.target.closest('.tp');if(!b)return;S.type=TY[b.dataset.i][0];
  arr($('types').children).forEach(function(x){x.classList.toggle('on',x===b)});pop(b);
  setTimeout(function(){$('pj').hidden=S.type!=='Projet spécial';$('tB').textContent=S.type==='Dîme'?'Quelle dîme souhaitez-vous verser ?':'Combien souhaitez-vous donner ?';go('sB',3)},380)};

/* ---------- Écran 2 : montant, nom, moyen ---------- */
$('chips').innerHTML=[1000,2000,5000,10000,20000].map(function(v){return '<button class="chip" type="button" data-v="'+v+'">'+fm(v).replace(' '+CFG.devise,'')+'</button>'}).join('');
$('chips').onclick=function(e){var b=e.target.closest('.chip');if(!b)return;$('mt').value=b.dataset.v;pop($('mt').parentNode)};
$('mts').innerHTML=MO.map(function(m,i){return '<button class="m rv" type="button" data-i="'+i+'"><b style="background:'+m[1]+'">'+m[2]+'</b>'+m[0]+'</button>'}).join('');
$('mts').onclick=function(e){var b=e.target.closest('.m');if(!b)return;S.moyen=MO[b.dataset.i][0];arr($('mts').children).forEach(function(x){x.classList.toggle('on',x===b)})};
$('b1').onclick=function(){go('sA',2)};

function setStatus(s){$('st').textContent='Statut : '+s;$('st').className='stt'+(s==='confirmé'?' ok':'');
  $('sts').innerHTML=ST.map(function(x){return '<i class="'+(x===s?'on':'')+'">'+x+'</i>'}).join('')}
function rings(){if(G&&!RM)G.fromTo('.ring',{scale:.55,opacity:.9},{scale:1.7,opacity:0,duration:1.8,repeat:-1,stagger:.9,ease:'power2.out'})}

$('go').onclick=function(){
  var m=Math.round(+$('mt').value),nom=$('nm').value.trim();
  if(!S.type)return toast('Choisissez la nature de la contribution');
  if(!(m>=100))return toast('Indiquez le montant (100 FCFA minimum)');
  if(!S.moyen)return toast('Choisissez le moyen de paiement');
  if(!nom&&!CFG.anonyme)return toast('Le nom est obligatoire');
  if(!API){$('payment-config').hidden=false;return toast('Le paiement n’est pas encore configuré. Aucune contribution n’a été débitée.')}
  S.montant=m;S.nom=nom;S.projet=$('pn').value.trim();
  S.ref='OFF-'+Date.now().toString(36).toUpperCase().slice(-6)+Math.floor(Math.random()*90+10);
  $('wr').textContent=S.ref;$('wt').textContent=S.type+(S.projet?' — '+S.projet:'');$('wm').textContent=fm(m);$('wy').textContent=S.moyen;$('wn').textContent=nom||'Anonyme';
  $('payment-config').hidden=true;
  $('go').disabled=true;
  fetch(API+'/api/contributions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:S.ref,type:S.type,projet:S.projet,montant:m,devise:CFG.devise,moyen:S.moyen,nom:nom||null})})
    .then(function(r){return r.json().then(function(d){return {ok:r.ok,data:d}})})
    .then(function(result){
      if(!result.ok){
        $('payment-config').hidden=false;
        $('payment-config').textContent=result.data.message||'Le paiement est indisponible. Aucune contribution n’a été débitée.';
        toast(result.data.message||'Paiement non configuré');
        return;
      }
      if(result.data&&result.data.redirectUrl){location.href=result.data.redirectUrl;return}
      throw new Error('Le serveur n’a pas fourni de lien de paiement.');
    }).catch(function(err){
      $('payment-config').hidden=false;
      $('payment-config').textContent='Impossible de joindre le service de paiement. Aucune contribution n’a été débitée.';
      toast(err.message||'Serveur injoignable');
    }).finally(function(){$('go').disabled=false});
};

/* ---------- Écran 3 : vérification (seul le serveur fait foi) ---------- */
$('ver').onclick=function(){
  if(!API)return toast('Aucun serveur connecté : seul un webhook signé peut confirmer');
  fetch(API+'/api/contributions/'+encodeURIComponent(S.ref)).then(function(r){return r.json()}).then(function(d){
    if(!d||!d.statut)return;if(d.statut==='confirmé')return confirmer(d);setStatus(d.statut);toast('Statut : '+d.statut)
  }).catch(function(){toast('Serveur injoignable')});
};
function confirmer(d){
  if(G)G.killTweensOf('.ring');
  var n=new Date(),p=function(x){return String(x).padStart(2,'0')};
  $('re').textContent=CFG.eglise;$('rr').textContent=S.ref;$('rt').textContent=S.type+(S.projet?' — '+S.projet:'');
  $('rm').textContent=fm(S.montant);$('rf').textContent=fm(d.frais||0);$('rn').textContent=fm(d.montantNet||S.montant);$('ry').textContent=S.moyen;
  $('rd').textContent=p(n.getDate())+'/'+p(n.getMonth()+1)+'/'+n.getFullYear()+' '+p(n.getHours())+'h'+p(n.getMinutes());$('rp').textContent=d.refPrestataire||'—';
  $('rb').textContent=fm(0);go('sD',6);setTimeout(fete,450);
}
function fete(){
  if(!G||RM){$('rb').textContent=fm(S.montant);return}
  var o={v:0};G.to(o,{v:S.montant,duration:1.4,ease:'power2.out',onUpdate:function(){$('rb').textContent=fm(o.v)}});
  G.fromTo('.ck circle',{strokeDashoffset:1},{strokeDashoffset:0,duration:.7,ease:'power2.out'});
  G.fromTo('.ck path',{strokeDashoffset:1},{strokeDashoffset:0,duration:.5,delay:.6,ease:'power2.out'});
  var c=['#ff7a1a','#ffa24d','#ff5200','#fff6ee','#ffd36b'];
  for(var i=0;i<46;i++){var e=document.createElement('i');e.className='cf';e.style.background=c[i%5];document.body.appendChild(e);
    G.to(e,{x:(Math.random()-.5)*420,y:(Math.random()-.3)*520,rotation:Math.random()*720,opacity:0,duration:1.6+Math.random(),ease:'power3.out',onComplete:function(){this.targets()[0].remove()}})}
}

function nouveau(){
  if(G)G.killTweensOf('.ring');
  S={type:'',moyen:'',montant:0,nom:'',projet:'',ref:''};$('mt').value='';$('nm').value='';$('pn').value='';
  arr(document.querySelectorAll('.tp,.m')).forEach(function(x){x.classList.remove('on')});go('sA',2)}
$('nw1').onclick=nouveau;$('nw2').onclick=nouveau;

/* ---------- Démarrage ---------- */
$('ch').textContent=CFG.eglise;
$('dots').innerHTML=LB.map(function(l,i){return '<i title="'+l+'">'+(i+1)+'</i>'}).join('');
setStep(1);bg();
if(G&&!RM){
  G.from('.logo',{scale:0,rotation:-120,duration:1,ease:'back.out(1.7)'});
  G.from('.hd h1,.hd small,.sc',{y:-14,opacity:0,stagger:.1,delay:.25,duration:.6});
  G.from('.dots i',{scale:0,stagger:.06,delay:.3,ease:'back.out(2)'});
  G.fromTo('.scan',{y:0},{y:62,duration:1.4,repeat:-1,yoyo:true,ease:'sine.inOut'});
}
stag($('sA'));setTimeout(function(){setStep(2)},700);
})();
