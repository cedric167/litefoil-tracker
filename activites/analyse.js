/* Lite Foil, page Activités : analyse détaillée d'une sortie (23/11/2026).
   Tout est calculé sur le téléphone à partir du tracé GPS déjà enregistré : temps et distance en vol sur le foil, découpage en runs,
   virages (sens, angle, 360°, force latérale), meilleur 5 s, temps au kilomètre. S'y ajoutent la météo de la sortie (Open-Meteo),
   le nom du lieu, et le matériel utilisé (« Mon matériel », gardé sur le téléphone).
   La page appelle LFAna.panel(a) quand elle ouvre une sortie, puis LFAna.map(carte, a) quand la carte du détail est dessinée. */
(function(){
"use strict";
var R=6371000, rad=Math.PI/180;
function hav(la1,lo1,la2,lo2){ var dy=(la2-la1)*rad, dx=(lo2-lo1)*rad*Math.cos((la1+la2)/2*rad); return Math.sqrt(dx*dx+dy*dy)*R; }
function brg(la1,lo1,la2,lo2){ var y=Math.sin((lo2-lo1)*rad)*Math.cos(la2*rad), x=Math.cos(la1*rad)*Math.sin(la2*rad)-Math.sin(la1*rad)*Math.cos(la2*rad)*Math.cos((lo2-lo1)*rad); return Math.atan2(y,x)/rad; }
function dAng(a,b){ return ((b-a+540)%360)-180; }
function nf(x,d){ return (+x).toFixed(d==null?1:d).replace(".",","); }
function dur(s){ s=Math.max(0,Math.round(s)); var h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60; return h ? h+" h "+(m<10?"0":"")+m : m+":"+(x<10?"0":"")+x; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, function(c){ return "&#"+c.charCodeAt(0)+";"; }); }
function lget(k){ try{ return JSON.parse(localStorage.getItem(k)||"null"); }catch(e){ return null; } }
function lset(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

// ---------- famille de sport : règle les seuils, les mesures affichées et le matériel proposé ----------
function fam(a){ var t=((a.categoryName||"")+" "+(a.activityType||"")+" "+(a.name||"")).toLowerCase(); if(a.milieu==="air") return "air"; if(/foil/.test(t)) return "foil"; if(a.milieu==="mer") return "eau";
  if(/v[ée]lo|bike|cycl|vtt/.test(t)) return "velo"; if(/course|running|jogging|trail|marche|walk|rando|hike|tapis|\brun\b/.test(t)) return "pied"; return "terre"; }
// ---------- le tracé ramené à un point par seconde ----------
function series(a){
  var P=(a.points||[]).filter(function(p){ return p && isFinite(+p.lat) && isFinite(+p.lon) && isFinite(+p.t); });
  if(P.length<8) return null;
  var span=(+P[P.length-1].t)-(+P[0].t); if(!(span>0)) return null;
  var k=span>1e7 ? 1000 : 1, T=[], D=[], LA=[], LO=[], AL=[], d=0, i;
  var useD=P.every(function(p){ return isFinite(+p.dist); }) && (+P[P.length-1].dist)>(+P[0].dist);
  for(i=0;i<P.length;i++){ var t=((+P[i].t)-(+P[0].t))/k; if(T.length && t<=T[T.length-1]) continue;
    if(T.length) d = useD ? (+P[i].dist)-(+P[0].dist) : d+hav(LA[LA.length-1],LO[LO.length-1],+P[i].lat,+P[i].lon);
    T.push(t); D.push(Math.max(d, D.length?D[D.length-1]:0)); LA.push(+P[i].lat); LO.push(+P[i].lon); AL.push(+P[i].alt||0); }
  var n=Math.floor(T[T.length-1]); if(n<20 || n>86400 || T.length<8) return null;
  var lat=new Float64Array(n+1), lon=new Float64Array(n+1), dist=new Float32Array(n+1), alt=new Float32Array(n+1), j=0, s;
  for(s=0;s<=n;s++){ while(j<T.length-2 && T[j+1]<s) j++; var f=(s-T[j])/Math.max(1e-6,T[j+1]-T[j]); f=Math.max(0,Math.min(1,f));
    lat[s]=LA[j]+(LA[j+1]-LA[j])*f; lon[s]=LO[j]+(LO[j+1]-LO[j])*f; dist[s]=D[j]+(D[j+1]-D[j])*f; alt[s]=AL[j]+(AL[j+1]-AL[j])*f; }
  var v=new Float32Array(n+1), om=new Float32Array(n+1), hd=new Float32Array(n+1), last=NaN;
  var fm=fam(a), cap=fm==="air" ? 450 : fm==="pied" ? 32 : fm==="velo" ? 110 : fm==="terre" ? 140 : 90, bad=0;
  for(s=0;s<=n;s++){ var a0=Math.max(0,s-2), b0=Math.min(n,s+2); v[s]=(dist[b0]-dist[a0])/Math.max(1,b0-a0)*3.6; if(v[s]>cap){ v[s]=s?v[s-1]:0; bad++; }
    if(hav(lat[a0],lon[a0],lat[b0],lon[b0])>4) last=brg(lat[a0],lon[a0],lat[b0],lon[b0]); hd[s]=last; }
  for(s=1;s<n;s++){ om[s]=(isNaN(hd[s-1])||isNaN(hd[s+1])) ? 0 : dAng(hd[s-1],hd[s+1])/2; }
  var o2=new Float32Array(n+1); for(s=1;s<n;s++) o2[s]=(om[s-1]+om[s]+om[s+1])/3;
  var hr=null; if(P.some(function(p){ return +p.hr>0; })){ hr=new Float32Array(n+1); var TH=[], VH=[]; P.forEach(function(p){ if(+p.hr>0){ TH.push(((+p.t)-(+P[0].t))/k); VH.push(+p.hr); } }); var q=0; for(s=0;s<=n;s++){ while(q<TH.length-1 && TH[q+1]<=s) q++; hr[s]=VH[q]; } }
  return { n:n, lat:lat, lon:lon, dist:dist, alt:alt, v:v, om:o2, hr:hr, total:dist[n], cap:cap, bad:bad };
}

// ---------- l'analyse ----------
function analyse(a){
  var S=series(a); if(!S) return null;
  var txt=((a.categoryName||"")+" "+(a.activityType||"")+" "+(a.name||"")).toLowerCase(), n=S.n, s, i;
  var o={ S:S, foil:/foil/.test(txt), milieu:a.milieu||"mer" };
  // meilleur 5 secondes
  o.max5=0; for(s=0;s+5<=n;s++){ var x=(S.v[s]+S.v[s+1]+S.v[s+2]+S.v[s+3]+S.v[s+4])/5; if(x>o.max5) o.max5=x; }
  // temps au kilomètre
  o.splits=[]; { var km=1, prev=0; for(s=1;s<=n;s++){ while(S.dist[s]>=km*1000){ var f=(km*1000-S.dist[s-1])/Math.max(1e-6,S.dist[s]-S.dist[s-1]), tc=s-1+f; o.splits.push({ km:km, t:tc-prev, at:Math.round(tc) }); prev=tc; km++; } } }
  o.bestSplit=null; o.splits.forEach(function(p){ if(!o.bestSplit || p.t<o.bestSplit.t) o.bestSplit=p; });
  // en vol sur le foil : au-dessus d'un seuil de vitesse réglé sur la sortie elle-même
  var on=new Uint8Array(n+1); o.runs=[];
  if(o.foil){ var mv=[]; for(s=0;s<=n;s++) if(S.v[s]>3) mv.push(S.v[s]); mv.sort(function(p,q){ return p-q; });
    var p90=mv.length ? mv[Math.floor(mv.length*0.9)] : 0; o.thr=Math.max(8, Math.min(16, 0.55*p90));
    for(s=0;s<=n;s++) on[s]=S.v[s]>=o.thr ? 1 : 0;
    var g=0; for(s=1;s<=n;s++){ if(!on[s]) g++; else { if(g>0 && g<=3 && s-g-1>=0 && on[s-g-1]) for(i=s-g;i<s;i++) on[i]=1; g=0; } } // trous de 3 s au plus
    var st=-1; for(s=0;s<=n+1;s++){ var f1=s<=n && on[s]; if(f1 && st<0) st=s; if(!f1 && st>=0){ var e=s-1, dd=S.dist[e]-S.dist[st];
        if(e-st>=8 && dd>=30 && dd/(e-st)*3.6<=S.cap){ var mx=0; for(i=st;i<=e;i++) if(S.v[i]>mx) mx=S.v[i]; o.runs.push({ a:st, b:e, dist:dd, dur:e-st, avg:dd/(e-st)*3.6, max:mx }); } else for(i=st;i<=e;i++) on[i]=0; st=-1; } }
    o.foilDist=0; o.foilTime=0; o.longest=null; o.fastest=null;
    o.runs.forEach(function(r,k){ r.n=k+1; o.foilDist+=r.dist; o.foilTime+=r.dur; if(!o.longest || r.dist>o.longest.dist) o.longest=r; if(!o.fastest || r.avg>o.fastest.avg) o.fastest=r; }); }
  o.on=on; o.fam=fam(a);
  if(o.fam==="pied" || o.fam==="velo" || o.fam==="terre"){ var lim=o.fam==="velo" ? 4 : 1.5, mv2=0, dmv=0, runS=0, walkS=0;
    for(s=1;s<=n;s++){ if(S.v[s]>=lim){ mv2++; dmv+=S.dist[s]-S.dist[s-1]; if(o.fam==="pied"){ if(S.v[s]>=6.5) runS++; else walkS++; } } }
    o.mov=mv2; o.pace=dmv>50 ? mv2/(dmv/1000) : 0; o.runS=runS; o.walkS=walkS;
    o.best60=0; for(s=0;s+60<=n;s++){ var b6=(S.dist[s+60]-S.dist[s])/60*3.6; if(b6>o.best60 && b6<=S.cap) o.best60=b6; }
    // dénivelé : altitude lissée sur 15 s, on ne compte une montée ou une descente qu'au-delà de 2 m
    var lo=1e9, hi=-1e9, sm=new Float32Array(n+1), acc=0, w=0; for(s=0;s<=n;s++){ acc+=S.alt[s]; w++; if(w>15){ acc-=S.alt[s-15]; w--; } sm[s]=acc/w; if(sm[s]<lo) lo=sm[s]; if(sm[s]>hi) hi=sm[s]; }
    if(hi-lo>=3){ var ref=sm[0], up=0, dn=0; for(s=1;s<=n;s++){ var dz=sm[s]-ref; if(dz>=2){ up+=dz; ref=sm[s]; } else if(dz<=-2){ dn-=dz; ref=sm[s]; } } o.up=up; o.dn=dn; o.amin=lo; o.amax=hi; o.hasAlt=true; }
    var st2=+a.steps||0; if(o.fam==="pied" && st2>50 && mv2>60){ o.cad=st2/(mv2/60); o.stride=S.total/st2; } }
  // zones de fréquence cardiaque (si le cardio est enregistré point par point)
  if(S.hr){ var mxh=0; for(s=0;s<=n;s++) if(S.hr[s]>mxh) mxh=S.hr[s]; var fc=+lget("lf_fcmax")||0; if(!(fc>=120 && fc<=230)) fc=Math.max(185, Math.round(mxh)); o.fcmax=fc; o.zones=[0,0,0,0,0];
    for(s=0;s<=n;s++){ var pr=S.hr[s]/fc; if(pr>=0.5) o.zones[pr>=0.9?4:pr>=0.8?3:pr>=0.7?2:pr>=0.6?1:0]++; } }
  // virages (sports d'eau) : changement de cap soutenu d'au moins 70 degrés
  o.turns=[];
  if(o.milieu==="mer"){ var t0=-1, sum=0, low=0, sg=0;
    var close=function(e){ if(t0<0) return; var b=e, ang=sum, sp=(S.dist[b]-S.dist[t0])/Math.max(1,b-t0)*3.6, gm=0, q;
      for(q=t0;q<=b;q++){ var gg=S.v[q]/3.6*Math.abs(S.om[q])*rad/9.81; if(gg>gm) gm=gg; }
      if(Math.abs(ang)>=70 && sp>=6 && sp<=S.cap && gm<=1.5 && (!o.foil || on[t0])) o.turns.push({ a:Math.max(0,t0-1), b:Math.min(n,b+1), angle:Math.abs(ang), dir:ang>0?"D":"G", spd:sp, g:gm, made:!o.foil || !!on[Math.min(n,b+3)] });
      t0=-1; sum=0; low=0; };
    for(s=1;s<n;s++){ var w=S.om[s], aw=Math.abs(w), sn=w>0?1:-1;
      if(t0<0){ if(aw>=7 && S.v[s]>5){ t0=s; sum=w; sg=sn; low=0; } }
      else if(aw>=3 && sn===sg){ sum+=w; low=0; } else { low++; if(low>=2 || (aw>=7 && sn!==sg)) { close(s-low); if(aw>=7 && S.v[s]>5){ t0=s; sum=w; sg=sn; low=0; } } }
    } close(n-1);
    o.turns.forEach(function(t,k){ t.n=k+1; });
    o.n360=o.turns.filter(function(t){ return t.angle>=300; }).length; o.made=o.turns.filter(function(t){ return t.made; }).length;
    o.gmax=0; o.turns.forEach(function(t){ if(t.g>o.gmax) o.gmax=t.g; }); }
  return o;
}

// ---------- affichage ----------
var cur=null, A=null, MAP=null, marks=[], cursor=null, selTurn=0, mode="v";
function css(){ if(document.getElementById("lfAnaCss")) return; var st=document.createElement("style"); st.id="lfAnaCss";
  st.textContent=".an-h{margin:22px 2px 0;font-size:11.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted,#6a7a80)}"
  +".an-card{background:var(--card,#fff);border-radius:18px;box-shadow:0 4px 14px rgba(13,40,45,.07);padding:12px;margin-top:10px}"
  +".an-read{display:flex;justify-content:space-between;gap:8px;font-size:13px;font-weight:700;color:var(--fg,#0e1417);font-variant-numeric:tabular-nums;margin-bottom:6px}.an-read span{color:var(--muted,#6a7a80);font-weight:600}"
  +"#anChart{display:block;width:100%;height:120px;touch-action:none;border-radius:10px}"
  +".an-leg{display:flex;gap:14px;margin-top:8px;font-size:11.5px;color:var(--muted,#6a7a80)}.an-leg i{display:inline-block;width:12px;height:4px;border-radius:2px;margin-right:5px;vertical-align:middle}"
  +".an-runs{display:flex;gap:9px;overflow-x:auto;padding:2px 2px 6px;margin-top:10px;-webkit-overflow-scrolling:touch}.an-run{flex:none;min-width:150px;text-align:left;border:2px solid transparent;border-radius:16px;background:var(--card,#fff);box-shadow:0 4px 14px rgba(13,40,45,.07);padding:10px 12px;font:inherit;color:inherit;cursor:pointer}"
  +".an-run.on{border-color:#148a90}.an-run b{display:block;font-size:14px}.an-run em{font-style:normal;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:2px 7px;margin-left:5px;color:#0d6a3f;background:#dff5e8}.an-run em.f{color:#a2470b;background:#ffe9d9}"
  +".an-run div{display:flex;gap:10px;margin-top:6px;font-size:12px;color:var(--muted,#6a7a80)}.an-run div strong{display:block;font-size:15px;color:var(--fg,#0e1417);font-variant-numeric:tabular-nums}"
  +".an-nav{display:flex;align-items:center;gap:10px}.an-nav button{flex:none;width:40px;height:40px;border:0;border-radius:50%;background:#e6f6f6;color:#148a90;font-size:20px;font-weight:800;cursor:pointer}.an-nav button:disabled{opacity:.35}"
  +".an-nav div{flex:1;min-width:0}.an-nav small{display:block;font-size:11.5px;color:var(--muted,#6a7a80)}.an-nav b{display:block;font-size:15.5px}.an-nav span{display:block;font-size:13px;color:var(--muted,#6a7a80);font-variant-numeric:tabular-nums}"
  +".an-km{display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;align-items:center;font-size:13px;font-variant-numeric:tabular-nums}.an-km i{display:block;height:8px;border-radius:4px;background:#bfe6e6}.an-km i.b{background:#148a90}.an-km u{text-decoration:none;color:var(--muted,#6a7a80)}"
  +".an-wx{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:14px}.an-wx b{font-size:17px}.an-wx small{display:block;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#6a7a80)}"
  +".an-gear{display:flex;flex-wrap:wrap;gap:8px}.an-chip{border:1.5px solid var(--line,#e6ecee);border-radius:999px;background:#fff;padding:7px 12px;font:inherit;font-size:13px;font-weight:700;color:var(--fg,#0e1417);cursor:pointer}.an-chip.on{border-color:#148a90;background:#e6f6f6;color:#0c5f63}.an-chip.add{border-style:dashed;color:#148a90}"
  +".an-form{display:grid;gap:8px;margin-top:10px}.an-form select,.an-form input{font:inherit;font-size:15px;padding:10px 12px;border:1.5px solid var(--line,#e6ecee);border-radius:12px;background:#fff;color:inherit;width:100%;box-sizing:border-box}.an-form div{display:flex;gap:8px}.an-form button{flex:1;border:0;border-radius:12px;padding:11px;font:inherit;font-weight:800;cursor:pointer;background:#148a90;color:#fff}.an-form button.x{background:#eef2f3;color:#40525a}"
  +".an-med{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.an-md{position:relative;aspect-ratio:1;border:0;border-radius:12px;overflow:hidden;background:#dfe7ea;padding:0;cursor:pointer;min-height:0}.an-md img{width:100%;height:100%;object-fit:cover;display:block}.an-md i{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:rgba(10,14,18,.6);color:#fff;font-style:normal;font-size:13px;line-height:30px;text-align:center}"
  +".an-md.add{background:#fff;border:2px dashed #b9c9ce;color:#148a90;display:flex;flex-direction:column;align-items:center;justify-content:center;font:inherit}.an-md.add b{font-size:24px;line-height:1}.an-md.add small{font-size:11px;font-weight:700}"
  +".an-vw{position:fixed;inset:0;z-index:90;background:#05080a;display:flex;flex-direction:column}.an-vw-h{flex:none;display:flex;justify-content:space-between;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 10px}.an-vw-h button{border:0;border-radius:999px;padding:10px 16px;font:inherit;font-weight:800;font-size:14px;color:#fff;background:rgba(255,255,255,.16);min-height:0}.an-vw-h button[data-a=del]{color:#ffb4a8}.an-vw-b{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}.an-vw-b img,.an-vw-b video{max-width:100%;max-height:100%}"
  +".an-note{margin:8px 2px 0;font-size:11.5px;line-height:1.4;color:var(--muted,#6a7a80)}"
  +".an-mk{font:700 10px/1 system-ui,sans-serif;color:#0e1417;background:#fff;border-radius:999px;padding:3px 6px;box-shadow:0 1px 4px rgba(0,0,0,.45);white-space:nowrap}.an-mr{width:22px;height:22px;border-radius:50%;background:#fff;color:#0e1417;font:800 12px/22px system-ui,sans-serif;text-align:center;box-shadow:0 1px 5px rgba(0,0,0,.5)}.an-mf{width:10px;height:10px;border-radius:50%;background:#2aa7ff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)}.an-mc{width:16px;height:16px;border-radius:50%;background:#fff;border:4px solid #ff2d8f;box-shadow:0 0 0 2px rgba(255,255,255,.6),0 2px 6px rgba(0,0,0,.5)}"
  +".an-base{position:absolute;right:10px;top:10px;z-index:3;border:0;border-radius:999px;background:rgba(10,14,18,.72);color:#fff;font:700 12px system-ui,sans-serif;padding:8px 12px;cursor:pointer}";
  document.head.appendChild(st); }
function tile(cls,lab,val,unit){ var ic=(typeof ICO!=="undefined" && ICO) ? (cls==="hot"?ICO.bolt:(cls==="blue"?ICO.speed:ICO.route))||"" : ""; return '<div class="s '+cls+'"><i>'+ic+'</i><div class="u">'+lab+'</div><div class="v tnum">'+val+(unit?'<small> '+unit+'</small>':'')+'</div></div>'; }

function panel(a){ css(); cur=a; A=null; selTurn=0; mode="v"; var old=document.getElementById("lfAna"); if(old) old.remove();
  var host=document.getElementById("detStats"); if(!host || a.indoor) return; try{ A=analyse(a); }catch(e){ A=null; }
  var box=document.createElement("div"); box.id="lfAna"; var h="";
  if(A){ var S=A.S, t="";
    if(A.foil && A.runs.length){ var pct=Math.round(A.foilDist/Math.max(1,S.total)*100);
      t+=tile("blue","Sur le foil",nf(A.foilDist/1000,2),"km")+tile("","En vol",pct,"%")+tile("","Temps en vol",dur(A.foilTime),"")
        +tile("","Runs",A.runs.length,"")+tile("hot","Plus long vol",nf(A.longest.dist/1000,2),"km")+tile("","Durée du plus long",dur(A.longest.dur),""); }
    var pied=A.fam==="pied", land=pied || A.fam==="velo" || A.fam==="terre";
    if(pied){ if(A.pace>0) t+=tile("blue","Allure moyenne",dur(A.pace),"/km"); if(A.best60>2) t+=tile("hot","Meilleure allure",dur(3600/A.best60),"/km sur 1 min"); }
    else if(A.max5>1) t+=tile("hot","Meilleur 5 s",nf(A.max5,1),"km/h");
    if(A.bestSplit) t+=tile("blue","Meilleur km",dur(A.bestSplit.t),"/km");
    if(land){ if(A.mov>0) t+=tile("","En mouvement",dur(A.mov),""); if(A.hasAlt){ t+=tile("hot","Dénivelé +",Math.round(A.up),"m")+tile("","Dénivelé −",Math.round(A.dn),"m")+tile("","Altitude",Math.round(A.amin)+" à "+Math.round(A.amax),"m"); }
      if(A.cad){ t+=tile("blue","Cadence",Math.round(A.cad),"pas/min")+tile("","Foulée",nf(A.stride,2),"m"); }
      if(pied && A.runS+A.walkS>60) t+=tile("","Course / marche",Math.round(A.runS/(A.runS+A.walkS)*100),"% course"); }
    if(A.turns.length){ t+=tile("","Virages",A.turns.length,A.foil?("dont "+A.made+" réussis"):"")+tile("","Tours complets 360°",A.n360,"")+tile("hot","Force max en virage",nf(A.gmax,2),"g"); }
    if(t) h+='<div class="an-h">'+(A.foil?"Analyse du vol":"Analyse de la sortie")+'</div><div class="statgrid" style="margin-top:10px">'+t+'</div>';
    var tabs=(S.hr || A.hasAlt);
    h+='<div class="an-h">Courbes</div><div class="an-card">'+(tabs?'<div class="an-gear" style="margin-bottom:10px"><button type="button" class="an-chip on" data-md="v">'+(pied?"Allure":"Vitesse")+'</button>'+(S.hr?'<button type="button" class="an-chip" data-md="h">Cardio</button>':'')+(A.hasAlt?'<button type="button" class="an-chip" data-md="a">Altitude</button>':'')+'</div>':'')+'<div class="an-read"><b id="anRd">Glisse le doigt sur la courbe</b><span id="anRd2"></span></div><canvas id="anChart"></canvas>'
      +(A.foil && A.runs.length ? '<div class="an-leg"><span><i style="background:#f5b800"></i>en vol</span><span><i style="background:#2aa7ff"></i>hors vol</span></div>' : '')+'</div>';
    if(A.foil && A.runs.length){ h+='<div class="an-h">Runs</div><div class="an-runs">'+A.runs.map(function(r){ return '<button type="button" class="an-run" data-run="'+r.n+'"><b>Run '+r.n+(r===A.longest?'<em>Plus long</em>':'')+(r===A.fastest?'<em class="f">Plus rapide</em>':'')+'</b><div><span><strong>'+dur(r.dur)+'</strong>durée</span><span><strong>'+nf(r.dist/1000,2)+'</strong>km</span><span><strong>'+nf(r.avg,1)+'</strong>km/h</span></div></button>'; }).join("")+'</div>'; }
    if(A.turns.length) h+='<div class="an-h">Virages</div><div class="an-card"><div class="an-nav"><button type="button" id="anTp" aria-label="Virage précédent">‹</button><div id="anTx"></div><button type="button" id="anTn" aria-label="Virage suivant">›</button></div></div>';
    if(A.splits.length>1){ var mxT=0; A.splits.forEach(function(p){ if(p.t>mxT) mxT=p.t; });
      h+='<div class="an-h">Kilomètre par kilomètre</div><div class="an-card"><div class="an-km">'+A.splits.slice(0,60).map(function(p){ return '<u>km '+p.km+'</u><i'+(p===A.bestSplit?' class="b"':'')+' style="width:'+Math.max(6,Math.round(p.t/mxT*100))+'%"></i><b>'+dur(p.t)+'</b>'; }).join("")+'</div></div>'; }
  }
  if(A && A.zones){ var ZN=["Zone 1 · échauffement","Zone 2 · facile","Zone 3 · aérobie","Zone 4 · seuil","Zone 5 · maximum"], ZC=["#9aa7ad","#2aa7ff","#2bb673","#f5a300","#e0344f"], zt=A.zones.reduce(function(x,y){ return x+y; },0)||1;
    h+='<div class="an-h">Zones de fréquence cardiaque</div><div class="an-card"><div class="an-km" style="grid-template-columns:auto 1fr auto auto">'+[4,3,2,1,0].map(function(z){ return '<u>'+ZN[z]+'</u><i style="background:'+ZC[z]+';width:'+Math.max(2,Math.round(A.zones[z]/zt*100))+'%"></i><b>'+dur(A.zones[z])+'</b><u>'+Math.round(A.zones[z]/zt*100)+' %</u>'; }).join("")+'</div><p class="an-note" style="margin:10px 0 0">Zones calculées sur une fréquence maximale de '+A.fcmax+' bpm. <a href="#" id="anFc" style="color:#148a90;font-weight:700">Changer</a></p></div>'; }
  h+='<div class="an-h">Photos et vidéos</div><div class="an-card"><div class="an-med" id="anMed"></div><input type="file" id="anMedIn" accept="image/*,video/*" multiple hidden><p class="an-note" id="anMedN" style="margin:10px 0 0"></p></div>';
  h+='<div class="an-h">Météo et lieu</div><div class="an-card"><div class="an-wx" id="anWx"><span style="color:var(--muted,#6a7a80);font-size:13px">Recherche de la météo de cette sortie…</span></div></div>';
  h+='<div class="an-h">Mon matériel</div><div class="an-card"><div class="an-gear" id="anGear"></div><div id="anGearForm"></div></div>';
  if(A && (A.foil || A.turns.length)) h+='<p class="an-note">Vol, runs et virages sont estimés à partir du GPS du téléphone ou de la montre : ce sont des repères, pas des mesures de capteur.</p>';
  box.innerHTML=h; host.insertAdjacentElement("afterend", box);
  if(A){ try{ var AN=lget("lf_sess_an")||{}; AN[String(a.id)]={ fd:Math.round(A.foilDist||0), ft:Math.round(A.foilTime||0), runs:A.runs.length, turns:A.turns.length, n360:A.n360||0, max5:+A.max5.toFixed(1) }; var ak=Object.keys(AN); if(ak.length>300) delete AN[ak[0]]; lset("lf_sess_an",AN); }catch(e){}
    box.querySelectorAll("[data-md]").forEach(function(b){ b.onclick=function(){ mode=b.getAttribute("data-md"); box.querySelectorAll("[data-md]").forEach(function(x){ x.classList.toggle("on", x===b); }); chartDraw(); if(cs>=0) setCursor(cs); }; });
    chartInit(); box.querySelectorAll("[data-run]").forEach(function(b){ b.onclick=function(){ var r=A.runs[+b.getAttribute("data-run")-1], onb=b.classList.contains("on"); box.querySelectorAll(".an-run.on").forEach(function(x){ x.classList.remove("on"); }); if(onb){ hl(null); fitAll(); } else { b.classList.add("on"); hl(r); setCursor(r.a); } }; });
    if(A.turns.length){ document.getElementById("anTp").onclick=function(){ turnShow(selTurn-1, true); }; document.getElementById("anTn").onclick=function(){ turnShow(selTurn+1, true); }; turnShow(0, false); } }
  { var fcb=document.getElementById("anFc"); if(fcb) fcb.onclick=function(e){ e.preventDefault(); var v=prompt("Ta fréquence cardiaque maximale (bpm) :", String(A.fcmax)); if(v==null) return; v=Math.round(+v); if(v>=120 && v<=230){ lset("lf_fcmax", v); panel(a); if(MAP) mapApply(MAP, a); } }; }
  gearPaint(); weather(a); try{ medInit(a); }catch(e){}
}
function turnShow(k, move){ if(!A || !A.turns.length) return; k=Math.max(0,Math.min(A.turns.length-1,k)); selTurn=k; var t=A.turns[k], full=t.angle>=300;
  document.getElementById("anTx").innerHTML='<small>'+(k+1)+' sur '+A.turns.length+'</small><b>'+(full?"Tour complet ":"Virage ")+(t.dir==="G"?"à gauche":"à droite")+(A.foil && !t.made?' · chute':'')+'</b><span>'+Math.round(t.angle)+'° · '+nf(t.spd,1)+' km/h · '+nf(t.g,2)+' g · '+dur(t.b-t.a)+'</span>';
  document.getElementById("anTp").disabled=k===0; document.getElementById("anTn").disabled=k===A.turns.length-1; if(move){ hl(t); setCursor(t.a); } }

// ---------- courbe de vitesse, curseur lié à la carte ----------
var cv=null, cx=null, CW=0, CH=0, cs=-1;
function chartInit(){ cv=document.getElementById("anChart"); if(!cv) return; var dpr=Math.min(2,window.devicePixelRatio||1); CW=cv.clientWidth||320; CH=120; cv.width=Math.round(CW*dpr); cv.height=Math.round(CH*dpr); cx=cv.getContext("2d"); cx.setTransform(dpr,0,0,dpr,0,0); cs=-1; chartDraw();
  var mv=function(e){ var r=cv.getBoundingClientRect(), x=((e.touches?e.touches[0].clientX:e.clientX)-r.left)/Math.max(1,r.width); setCursor(Math.round(Math.max(0,Math.min(1,x))*A.S.n)); if(e.cancelable) e.preventDefault(); };
  cv.onpointerdown=function(e){ try{ cv.setPointerCapture(e.pointerId); }catch(x){} mv(e); }; cv.onpointermove=function(e){ if(e.buttons || e.pointerType==="touch") mv(e); }; }
function chartDraw(){ if(!cx || !A) return; var S=A.S, n=S.n, mx=1, mn=0, x, s, Y=(mode==="h" && S.hr) ? S.hr : (mode==="a" ? S.alt : S.v); for(s=0;s<=n;s++) if(Y[s]>mx) mx=Y[s]; mx*=1.08; if(Y!==S.v){ mn=1e9; for(s=0;s<=n;s++) if(Y[s]>0 && Y[s]<mn) mn=Y[s]; mn=Math.max(0,mn-8); } cx.clearRect(0,0,CW,CH);
  var seg=function(col, test){ cx.strokeStyle=col; cx.lineWidth=1.8; cx.lineJoin="round"; cx.beginPath(); var pen=false; for(x=0;x<CW;x++){ var s0=Math.round(x/(CW-1)*n), y=CH-4-((Y[s0]-mn)/Math.max(1,mx-mn))*(CH-10); if(test(s0)){ if(pen) cx.lineTo(x,y); else { cx.moveTo(x,y); pen=true; } } else pen=false; } cx.stroke(); };
  cx.strokeStyle="rgba(0,0,0,.08)"; cx.lineWidth=1; cx.beginPath(); cx.moveTo(0,CH-4); cx.lineTo(CW,CH-4); cx.stroke();
  if(Y!==S.v) seg(mode==="a" ? "#7a5cd6" : "#e0344f", function(){ return true; }); else if(A.foil && A.runs.length){ seg("#2aa7ff", function(i){ return !A.on[i]; }); seg("#f5b800", function(i){ return !!A.on[i]; }); } else seg("#148a90", function(){ return true; });
  if(cs>=0){ var px=cs/n*(CW-1); cx.strokeStyle="#ff2d8f"; cx.lineWidth=1.5; cx.beginPath(); cx.moveTo(px,0); cx.lineTo(px,CH); cx.stroke(); } }
function setCursor(s){ if(!A) return; var S=A.S; cs=Math.max(0,Math.min(S.n,s)); chartDraw();
  var r1=document.getElementById("anRd"), r2=document.getElementById("anRd2"); if(r1) r1.textContent=((A.fam==="pied" && S.v[cs]>=2) ? dur(3600/S.v[cs])+" /km" : nf(S.v[cs],1)+" km/h")+(S.hr && S.hr[cs]>0 ? " · "+Math.round(S.hr[cs])+" bpm" : "")+(A.hasAlt ? " · "+Math.round(S.alt[cs])+" m" : ""); if(r2) r2.textContent=dur(cs)+" · "+nf(S.dist[cs]/1000,2)+" km"+(A.foil && A.runs.length ? (A.on[cs]?" · en vol":" · hors vol") : "");
  if(MAP && window.maplibregl){ if(!cursor){ var el=document.createElement("div"); el.className="an-mc"; cursor=new maplibregl.Marker({element:el}); } cursor.setLngLat([S.lon[cs],S.lat[cs]]).addTo(MAP); } }

// ---------- carte ----------
function line(a,b){ var S=A.S, c=[], st=Math.max(1,Math.floor((b-a)/800)), i; for(i=a;i<=b;i+=st) c.push([S.lon[i],S.lat[i]]); c.push([S.lon[b],S.lat[b]]); return c; }
function rm(id){ try{ if(MAP.getLayer(id)) MAP.removeLayer(id); if(MAP.getSource(id)) MAP.removeSource(id); }catch(e){} }
function hl(o){ if(!MAP || !A) return; rm("an-hl"); if(!o) return; try{ MAP.addSource("an-hl",{type:"geojson",data:{type:"Feature",geometry:{type:"LineString",coordinates:line(o.a,o.b)}}});
    MAP.addLayer({id:"an-hl",type:"line",source:"an-hl",paint:{"line-color":"#ffffff","line-width":7,"line-opacity":.95},layout:{"line-join":"round","line-cap":"round"}});
    var S=A.S, w=1e9,e=-1e9,so=1e9,no=-1e9,i; for(i=o.a;i<=o.b;i++){ if(S.lon[i]<w) w=S.lon[i]; if(S.lon[i]>e) e=S.lon[i]; if(S.lat[i]<so) so=S.lat[i]; if(S.lat[i]>no) no=S.lat[i]; }
    MAP.fitBounds([[w,so],[e,no]],{padding:70,duration:500,maxZoom:17}); }catch(x){} }
function fitAll(){ if(!MAP || !A) return; var S=A.S, w=1e9,e=-1e9,so=1e9,no=-1e9,i; for(i=0;i<=S.n;i+=Math.max(1,Math.floor(S.n/500))){ if(S.lon[i]<w) w=S.lon[i]; if(S.lon[i]>e) e=S.lon[i]; if(S.lat[i]<so) so=S.lat[i]; if(S.lat[i]>no) no=S.lat[i]; } try{ MAP.fitBounds([[w,so],[e,no]],{padding:40,duration:500,maxZoom:17}); }catch(x){} }
function mk(cls, txt, lon, lat){ var el=document.createElement("div"); el.className=cls; if(txt!=null) el.textContent=txt; var m=new maplibregl.Marker({element:el}).setLngLat([lon,lat]).addTo(MAP); marks.push(m); }
function mapApply(map, a){ MAP=map; if(!map || !window.maplibregl) return; marks.forEach(function(m){ try{ m.remove(); }catch(e){} }); marks=[]; if(cursor){ try{ cursor.remove(); }catch(e){} } rm("an-hl"); rm("an-foil");
  // fond de carte : satellite ou plan
  try{ if(!map.getSource("an-osm")){ map.addSource("an-osm",{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,maxzoom:19,attribution:"© OpenStreetMap"}); map.addLayer({id:"an-osm",type:"raster",source:"an-osm",layout:{visibility:"none"}}, map.getLayer("trk") ? "trk" : undefined); }
    var c=map.getContainer(), bt=c.querySelector(".an-base"); if(!bt){ bt=document.createElement("button"); bt.type="button"; bt.className="an-base"; c.appendChild(bt); }
    var plan=map.getLayoutProperty("an-osm","visibility")==="visible"; bt.textContent=plan?"Satellite":"Plan"; bt.onclick=function(){ var p=map.getLayoutProperty("an-osm","visibility")==="visible"; map.setLayoutProperty("an-osm","visibility",p?"none":"visible"); bt.textContent=p?"Plan":"Satellite"; }; }catch(e){}
  if(!A || cur!==a) return; var S=A.S, i;
  try{ if(A.foil && A.runs.length){ if(map.getLayer("trk")) map.setPaintProperty("trk","line-color","#2aa7ff");
      map.addSource("an-foil",{type:"geojson",data:{type:"Feature",geometry:{type:"MultiLineString",coordinates:A.runs.map(function(r){ return line(r.a,r.b); })}}});
      map.addLayer({id:"an-foil",type:"line",source:"an-foil",paint:{"line-color":"#f5b800","line-width":4,"line-opacity":.98},layout:{"line-join":"round","line-cap":"round"}});
      A.runs.forEach(function(r){ mk("an-mr", r.n, S.lon[r.a], S.lat[r.a]); if(r.b<S.n-3) mk("an-mf", null, S.lon[r.b], S.lat[r.b]); }); } }catch(e){}
  var stp=S.total>40000 ? 5 : 1; A.splits.forEach(function(p){ if(p.km%stp===0 && p.km<=200) mk("an-mk", p.km+" km", S.lon[p.at], S.lat[p.at]); });
}

// ---------- météo et lieu de la sortie ----------
var DIRS=["N","NE","E","SE","S","SO","O","NO"];
function weather(a){ var box=document.getElementById("anWx"); if(!box) return; var P=(a.points||[]).filter(function(p){ return p && isFinite(+p.lat) && isFinite(+p.lon); });
  var t0=new Date(a.startedAt).getTime(); if(!P.length || !isFinite(t0)){ box.innerHTML='<span style="color:var(--muted,#6a7a80);font-size:13px">Pas de position ou de date pour cette sortie.</span>'; return; }
  var la=+P[0].lat, lo=+P[0].lon, key=String(a.id), W=lget("lf_sess_wx")||{}, G=lget("lf_sess_spot")||{}, wx=W[key], sp=G[key];
  var paint=function(){ if(cur!==a) return; var h=""; if(sp) h+='<div><small>Lieu</small><b>'+esc(sp)+'</b></div>';
    if(wx && wx.ok){ h+='<div><small>Vent</small><b>'+Math.round(wx.w)+' nds '+DIRS[Math.round(wx.d/45)%8]+'</b></div><div><small>Rafales</small><b>'+Math.round(wx.g)+' nds</b></div><div><small>Air</small><b>'+nf(wx.t,1)+' °C</b></div>'; }
    else if(wx) h+='<div><small>Météo</small><span style="font-size:13px;color:var(--muted,#6a7a80)">non disponible pour cette date</span></div>';
    box.innerHTML=h || '<span style="color:var(--muted,#6a7a80);font-size:13px">Recherche de la météo de cette sortie…</span>';
    if(wx && wx.ok) box.insertAdjacentHTML("beforeend",'<div style="flex-basis:100%;font-size:11px;color:var(--muted,#6a7a80)">Vent du modèle météo Open-Meteo à l\'heure de la sortie, pas une mesure sur le spot.</div>'); };
  paint();
  if(!wx){ var mid=new Date(t0+(+a.durationSec||0)*500), day=mid.toISOString().slice(0,10), old=(Date.now()-mid.getTime())>85*86400000;
    fetch((old?"https://archive-api.open-meteo.com/v1/archive":"https://api.open-meteo.com/v1/forecast")+"?latitude="+la.toFixed(3)+"&longitude="+lo.toFixed(3)+"&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kn&timezone=UTC&start_date="+day+"&end_date="+day)
      .then(function(r){ return r.json(); }).then(function(j){ var hh=mid.getUTCHours(), H=j && j.hourly; if(H && H.wind_speed_10m && H.wind_speed_10m[hh]!=null) wx={ ok:1, w:H.wind_speed_10m[hh], g:H.wind_gusts_10m[hh]||H.wind_speed_10m[hh], d:H.wind_direction_10m[hh]||0, t:H.temperature_2m[hh] }; else wx={ ok:0 };
        var W2=lget("lf_sess_wx")||{}; W2[key]=wx; var ks=Object.keys(W2); if(ks.length>300) delete W2[ks[0]]; lset("lf_sess_wx",W2); paint(); })
      .catch(function(){ wx={ ok:0 }; paint(); wx=null; }); }
  if(!sp){ fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude="+la.toFixed(4)+"&longitude="+lo.toFixed(4)+"&localityLanguage=fr").then(function(r){ return r.json(); })
      .then(function(j){ var nm=j && (j.locality || j.city || j.principalSubdivision); if(!nm) return; sp=String(nm).slice(0,60); var G2=lget("lf_sess_spot")||{}; G2[key]=sp; var ks=Object.keys(G2); if(ks.length>300) delete G2[ks[0]]; lset("lf_sess_spot",G2); paint(); }).catch(function(){}); }
}

// ---------- mon matériel ----------
var CAT=null, GT={ eau:["Planche","Aile avant","Mât","Stabilisateur","Aile (wing, kite, voile)","Batterie","Autre"], pied:["Chaussures","Montre","Ceinture cardio","Sac, gilet","Autre"], velo:["Vélo","Roues","Pneus","Chaussures","Compteur, capteur","Autre"], air:["Aéronef","Casque radio","Autre"], terre:["Chaussures","Matériel","Autre"] };
function gfam(){ var f=cur ? fam(cur) : "eau"; return (f==="foil" || f==="eau") ? "eau" : f; }
var GHELP={ eau:"Enregistre ta planche, ton aile ou ton mât une fois : tu les rattaches ensuite à chaque sortie d'un seul geste.", pied:"Enregistre tes chaussures une fois : tu les rattaches à chaque sortie, et l'appli compte leurs kilomètres.", velo:"Enregistre ton vélo une fois : tu le rattaches à chaque sortie, et l'appli compte ses kilomètres.", air:"Enregistre ton appareil une fois : tu le rattaches ensuite à chaque vol.", terre:"Enregistre ton matériel une fois : tu le rattaches ensuite à chaque sortie." };
function gearPaint(){ var box=document.getElementById("anGear"); if(!box || !cur) return; var gf=gfam(), M=lget("lf_sess_gear")||{}, mine=M[String(cur.id)]||[], KM=lget("lf_sess_km")||{};
  // on ne montre que le matériel de ce sport (l'ancien matériel, sans famille, est celui du foil), plus celui déjà rattaché à cette sortie
  var G=(lget("lf_garage")||[]).filter(function(g){ return (g.fam||"eau")===gf || mine.indexOf(g.id)>=0; });
  var use=function(id){ var km=0, n=0; for(var k in M){ if((M[k]||[]).indexOf(id)>=0){ n++; km+=(+KM[k]||0)/1000; } } return n ? ' · '+(km>=1?Math.round(km)+' km, ':'')+n+(n>1?' sorties':' sortie') : ''; };
  box.innerHTML=G.map(function(g){ return '<button type="button" class="an-chip'+(mine.indexOf(g.id)>=0?" on":"")+'" data-g="'+esc(g.id)+'">'+esc(g.name)+'<span style="font-weight:600;color:var(--muted,#6a7a80)"> · '+esc(g.type)+use(g.id)+'</span></button>'; }).join("")+'<button type="button" class="an-chip add" id="anGAdd">+ Ajouter du matériel</button>'
    +(G.length?'':'<div style="flex-basis:100%;font-size:12.5px;color:var(--muted,#6a7a80)">'+esc(GHELP[gf]||GHELP.terre)+'</div>');
  box.querySelectorAll("[data-g]").forEach(function(b){ b.onclick=function(){ var id=b.getAttribute("data-g"), M2=lget("lf_sess_gear")||{}, k=String(cur.id), l=M2[k]||[], i=l.indexOf(id); if(i>=0) l.splice(i,1); else l.push(id); M2[k]=l; lset("lf_sess_gear",M2); kmNote(); gearPaint(); };
    var tm=null; b.oncontextmenu=function(e){ e.preventDefault(); gearDel(b.getAttribute("data-g")); }; b.ontouchstart=function(){ tm=setTimeout(function(){ gearDel(b.getAttribute("data-g")); },700); }; b.ontouchend=b.ontouchmove=function(){ clearTimeout(tm); }; });
  document.getElementById("anGAdd").onclick=gearForm; }
function kmNote(){ if(!cur) return; var K=lget("lf_sess_km")||{}; K[String(cur.id)]=Math.round(+cur.distanceM||0); lset("lf_sess_km",K); }
function gearDel(id){ var G=lget("lf_garage")||[], g=G.filter(function(x){ return x.id===id; })[0]; if(!g || !confirm("Retirer « "+g.name+" » de ton matériel ?")) return; lset("lf_garage", G.filter(function(x){ return x.id!==id; })); gearPaint(); }
function gearForm(){ var f=document.getElementById("anGearForm"); if(!f) return; f.innerHTML='<div class="an-form"><select id="anGT">'+(GT[gfam()]||GT.terre).map(function(t){ return '<option>'+t+'</option>'; }).join("")+'</select><input id="anGN" maxlength="40" list="anGL" placeholder="Nom ou modèle"><datalist id="anGL"></datalist><input id="anGD" maxlength="60" placeholder="Détail facultatif (surface, taille, année…)"><div><button type="button" class="x" id="anGX">Annuler</button><button type="button" id="anGS">Enregistrer</button></div></div>';
  var fill=function(){ var dl=document.getElementById("anGL"), tp=document.getElementById("anGT"); if(!dl || !CAT) return; dl.innerHTML=(gfam()!=="eau" ? [] : CAT).filter(function(c){ return c[0]===tp.value; }).map(function(c){ return '<option value="'+esc(c[1])+'">'; }).join(""); };
  if(CAT) fill(); else fetch("../data/materiel.json?v=1").then(function(r){ return r.json(); }).then(function(j){ CAT=(j && j.l)||[]; fill(); }).catch(function(){ CAT=[]; });
  document.getElementById("anGT").onchange=fill;
  document.getElementById("anGX").onclick=function(){ f.innerHTML=""; };
  document.getElementById("anGS").onclick=function(){ var nm=document.getElementById("anGN").value.trim(); if(!nm){ document.getElementById("anGN").focus(); return; } var G=lget("lf_garage")||[], id="g"+Date.now().toString(36);
    G.push({ id:id, fam:gfam(), type:document.getElementById("anGT").value, name:nm.slice(0,40), detail:document.getElementById("anGD").value.trim().slice(0,60) }); lset("lf_garage",G);
    var M=lget("lf_sess_gear")||{}, k=String(cur.id); (M[k]=M[k]||[]).push(id); lset("lf_sess_gear",M); kmNote(); f.innerHTML=""; gearPaint(); }; }

// ---------- photos et vidéos de la sortie (gardées sur le téléphone) ----------
var MAXM=8;
function mdb(){ return new Promise(function(res,rej){ var r=indexedDB.open("lf_media",1); r.onupgradeneeded=function(){ var s=r.result.createObjectStore("m",{keyPath:"id"}); s.createIndex("sid","sid"); }; r.onsuccess=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); }; }); }
function mAll(sid){ return mdb().then(function(db){ return new Promise(function(res,rej){ var q=db.transaction("m").objectStore("m").index("sid").getAll(String(sid)); q.onsuccess=function(){ res((q.result||[]).sort(function(x,y){ return x.t-y.t; })); }; q.onerror=function(){ rej(q.error); }; }); }); }
function mPut(it){ return mdb().then(function(db){ return new Promise(function(res,rej){ var tx=db.transaction("m","readwrite"); tx.objectStore("m").put(it); tx.oncomplete=function(){ res(it); }; tx.onerror=function(){ rej(tx.error); }; }); }); }
function mDel(id){ return mdb().then(function(db){ return new Promise(function(res){ var tx=db.transaction("m","readwrite"); tx.objectStore("m").delete(id); tx.oncomplete=function(){ res(); }; tx.onerror=function(){ res(); }; }); }); }
function shrink(src, maxPx, maxLen){ return new Promise(function(res,rej){ var im=new Image(); im.onload=function(){ var px=maxPx, q=0.82, out="", k;
    for(k=0;k<7;k++){ var sc=Math.min(1, px/Math.max(im.width,im.height)), c=document.createElement("canvas"); c.width=Math.max(1,Math.round(im.width*sc)); c.height=Math.max(1,Math.round(im.height*sc)); c.getContext("2d").drawImage(im,0,0,c.width,c.height); out=c.toDataURL("image/jpeg",q); if(out.length<=maxLen) break; px=Math.round(px*0.82); q=Math.max(0.6,q-0.05); }
    out.length<=maxLen ? res(out) : rej(new Error("photo trop lourde")); }; im.onerror=function(){ rej(new Error("photo illisible")); }; im.src=src; }); }
function vidInfo(file){ return new Promise(function(res,rej){ var v=document.createElement("video"), u=URL.createObjectURL(file), done=false, fin=function(o,e){ if(done) return; done=true; try{ URL.revokeObjectURL(u); }catch(x){} e ? rej(e) : res(o); };
    v.muted=true; v.playsInline=true; v.preload="auto"; v.onerror=function(){ fin(null,new Error("vidéo illisible")); };
    v.onloadeddata=function(){ try{ v.currentTime=Math.min(0.6,(v.duration||1)/2); }catch(e){ fin({dur:v.duration||0,th:""}); } };
    v.onseeked=function(){ try{ var r=Math.min(1,320/Math.max(v.videoWidth||320,v.videoHeight||320)), c=document.createElement("canvas"); c.width=Math.round((v.videoWidth||320)*r); c.height=Math.round((v.videoHeight||320)*r); c.getContext("2d").drawImage(v,0,0,c.width,c.height); fin({dur:v.duration||0,th:c.toDataURL("image/jpeg",0.7)}); }catch(e){ fin({dur:v.duration||0,th:""}); } };
    setTimeout(function(){ fin({dur:v.duration||0,th:""}); },6000); v.src=u; }); }
function medInit(a){ var box=document.getElementById("anMed"), inp=document.getElementById("anMedIn"), note=document.getElementById("anMedN"); if(!box || !inp || !window.indexedDB) { if(box) box.parentNode.previousElementSibling.remove(), box.parentNode.remove(); return; }
  var sid=String(a.id), say=function(t){ if(note) note.textContent=t; };
  var paint=function(){ return mAll(sid).then(function(L){ if(cur!==a) return; box.innerHTML=L.map(function(it){ return '<button type="button" class="an-md" data-m="'+esc(it.id)+'" aria-label="'+(it.k==="v"?"Vidéo":"Photo")+'">'+((it.img||it.th)?'<img alt="" src="'+(it.img||it.th)+'">':'')+(it.k==="v"?'<i>▶</i>':'')+'</button>'; }).join("")+(L.length<MAXM?'<button type="button" class="an-md add" id="anMedAdd"><b>+</b><small>Ajouter</small></button>':'');
      var ad=document.getElementById("anMedAdd"); if(ad) ad.onclick=function(){ inp.click(); };
      box.querySelectorAll("[data-m]").forEach(function(b){ b.onclick=function(){ var it=L.filter(function(x){ return x.id===b.getAttribute("data-m"); })[0]; if(it) medView(it, paint); }; });
      var canShare=(a.source==="phone" || String(a.id).indexOf("phone-")===0) && (+a.distanceM||0)>=100, todo=L.filter(function(x){ return !(x.pid || x.url); }).length;
      if(!L.length) say("Ajoute jusqu'à "+MAXM+" photos ou petites vidéos à cette sortie. Elles restent sur ton téléphone tant que tu ne montres pas la sortie sur ton profil.");
      else if(canShare && todo){ note.innerHTML='Tes amis les voient quand la sortie est sur ton profil. <a href="../index.html?sessShare='+encodeURIComponent(sid)+'&sessOp=1" style="color:#148a90;font-weight:800">Envoyer sur mon profil</a>'; }
      else say(canShare ? "Visibles par tes amis avec cette sortie, sur ton profil." : "Photos et vidéos gardées sur ton téléphone."); }).catch(function(){ say("Photos indisponibles sur cet appareil."); }); };
  inp.onchange=function(){ var files=Array.prototype.slice.call(inp.files||[]); inp.value=""; if(!files.length) return;
    mAll(sid).then(function(L){ var room=MAXM-L.length, i=0, bad=[]; files=files.slice(0,Math.max(0,room)); if(!files.length){ say("Huit photos ou vidéos au plus par sortie."); return; }
      var next=function(){ if(i>=files.length){ return paint().then(function(){ if(bad.length) say(bad[0]); }); } var f=files[i++], id="m"+Date.now().toString(36)+i; say("Préparation "+i+" sur "+files.length+"…");
        if(/^video\//.test(f.type)){ if(f.size>80e6){ bad.push("Vidéo trop lourde (80 Mo au plus)."); return next(); }
          return vidInfo(f).then(function(o){ if(o.dur>95){ bad.push("Vidéo trop longue (90 secondes au plus)."); return; } return mPut({ id:id, sid:sid, k:"v", blob:f, th:o.th, dur:Math.round(o.dur||0), t:Date.now() }); }).catch(function(){ bad.push("Cette vidéo n'a pas pu être lue."); }).then(next); }
        return new Promise(function(res,rej){ var fr2=new FileReader(); fr2.onload=function(){ res(fr2.result); }; fr2.onerror=rej; fr2.readAsDataURL(f); }).then(function(d){ return shrink(d,1280,380000); }).then(function(img){ return mPut({ id:id, sid:sid, k:"p", img:img, t:Date.now() }); }).catch(function(){ bad.push("Cette photo n'a pas pu être ajoutée."); }).then(next); };
      return next(); }).catch(function(){ say("Ajout impossible sur cet appareil."); }); };
  paint(); }
function medView(it, after){ var el=document.createElement("div"); el.className="an-vw"; var url=it.k==="v" && it.blob ? URL.createObjectURL(it.blob) : "";
  el.innerHTML='<div class="an-vw-h"><button type="button" data-a="del">Supprimer</button><button type="button" data-a="x">Fermer</button></div><div class="an-vw-b">'+(it.k==="v" ? '<video controls playsinline autoplay src="'+url+'"></video>' : '<img alt="" src="'+it.img+'">')+'</div>';
  var close=function(){ try{ if(url) URL.revokeObjectURL(url); }catch(e){} el.remove(); };
  el.onclick=function(e){ var b=e.target.closest("button"); if(!b) return; if(b.dataset.a==="del"){ if(!confirm("Supprimer ce"+(it.k==="v"?"tte vidéo":"tte photo")+" de la sortie ?")) return; mDel(it.id).then(function(){ close(); after(); }); } else close(); };
  document.body.appendChild(el); }
window.LFAna={ panel:panel, map:mapApply, analyse:analyse };
})();
