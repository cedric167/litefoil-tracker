// Lite Foil : espace ULM / Avion, contrôles de sécurité du plan de vol (14/11/2026)
// 1) Espaces aériens traversés par la route (France : fichier FFVP compilé depuis l'AIP du SIA), avec la règle d'entrée.
// 2) Météo prévue le long de la route à l'heure de passage (Open-Meteo) et METAR des stations proches.
// 3) Route de contournement ou décalage du départ quand la météo est mauvaise sur une branche.
(function(){
"use strict";
var ASP=null, aspP=null, NM=1852, FT=3.28084, A=null;
var TR={
 "Zone interdite":["Prohibited area","Zona prohibida"],"Classe A : vol à vue interdit":["Class A: VFR not allowed","Clase A: VFR prohibido"],
 "Zone réglementée : entrée soumise à conditions (activité, contact radio). Vérifie l'AIP et les NOTAM":["Restricted area: entry subject to conditions (activity, radio contact). Check AIP and NOTAM","Zona restringida: entrada sujeta a condiciones (actividad, contacto radio). Comprueba AIP y NOTAM"],
 "Zone dangereuse : vérifie l'activité avant de traverser":["Danger area: check activity before crossing","Zona peligrosa: comprueba la actividad antes de cruzar"],
 "clairance radio obligatoire avant d'entrer":["radio clearance required before entering","autorización por radio obligatoria antes de entrar"], "contact radio obligatoire avant d'entrer":["two-way radio contact required before entering","contacto por radio obligatorio antes de entrar"],"Classe":["Class","Clase"],
 "Radio obligatoire (RMZ)":["Radio mandatory (RMZ)","Radio obligatoria (RMZ)"],"Transpondeur obligatoire (TMZ)":["Transponder mandatory (TMZ)","Transpondedor obligatorio (TMZ)"],
 "Classe E : vol à vue sans clairance":["Class E: VFR without clearance","Clase E: VFR sin autorización"],"Secteur planeurs":["Glider sector","Sector de planeadores"],"Activité aérienne sportive ou de loisir":["Aerial sporting or recreational activity","Actividad aérea deportiva o recreativa"],"Pour information":["For information","Para información"],
 "visibilité":["visibility","visibilidad"],"brouillard":["fog","niebla"],"orage":["thunderstorm","tormenta"],"plafond bas estimé à":["low ceiling estimated at","techo bajo estimado a"],"rafales":["gusts","rachas"],"pluie forte":["heavy rain","lluvia fuerte"],"pluie":["rain","lluvia"],"neige":["snow","nieve"],"pluie verglaçante":["freezing rain","lluvia engelante"],"averses":["showers","chubascos"],
 "Contournement":["Detour","Desvío"]
};
function T(s){ var i=A?A.lang():0; if(!i) return s; var t=TR[s]; return t && t[i-1]!=null ? t[i-1] : s; }
function rad(x){ return x*Math.PI/180; } function deg(x){ return x*180/Math.PI; }
function distM(a,b){ var x=Math.sin(rad(b.lat-a.lat)/2), y=Math.sin(rad(b.lon-a.lon)/2), q=x*x+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*y*y; return 12742000*Math.asin(Math.min(1,Math.sqrt(q))); }
function brg(a,b){ var y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat)), x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon)); return (deg(Math.atan2(y,x))+360)%360; }
function dest(a,b,dm){ var d=dm/6371000, la=rad(a.lat), lo=rad(a.lon), t=rad(b), la2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(t)); return { lat:deg(la2), lon:deg(lo+Math.atan2(Math.sin(t)*Math.sin(d)*Math.cos(la), Math.cos(d)-Math.sin(la)*Math.sin(la2))) }; }
function mid(a,b,f){ return { lat:a.lat+(b.lat-a.lat)*f, lon:a.lon+(b.lon-a.lon)*f }; }

// ---------- espaces aériens ----------
// 16/11 : un fichier par pays couvert, chargé seulement si un point de la route (ou le pilote) est dans son emprise
// bb : rectangles qui déclenchent le chargement du fichier ; cov : contours approchés du pays (lat, lon à plat), qui disent si un point est « couvert »
var REG=[
 { k:"fr", f:"data/asp-fr.json?v=2", bb:[[41,-5.6,51.6,10]], cov:[[51.1,2.5,50,4.2,49.5,5.9,49,8.3,47.6,7.6,47.3,7,46.4,6.1,46.5,6.8,45.9,7.1,45.1,6.6,44.1,7.7,43.75,7.55,43,6.2,43.3,5,43.4,3.9,42.4,3.2,42.4,1.7,42.7,0.7,43.3,-1.8,44.6,-1.3,46.2,-1.6,47.3,-2.6,47.8,-4.5,48.5,-4.9,48.9,-3.1,48.6,-1.6,49.7,-2,49.3,-0.2,50.1,1.4,51,1.6],[43.05,9.4,42.5,8.5,41.3,8.7,41.35,9.3,42,9.6]] },
 { k:"es", f:"data/asp-es.json?v=1", bb:[[35.1,-9.6,44,4.6],[27.3,-18.5,29.6,-13.2]],
   cov:[[43.8,-8,43.6,-5.8,43.5,-3.8,43.4,-1.8,43,-1.4,42.8,-0.4,42.7,0.7,42.4,1.7,42.45,3.2,41.8,3.2,41.2,2,40.5,0.6,39.5,-0.2,38.7,0.3,37.6,-0.7,36.7,-2.1,36.7,-4.4,36,-5.6,36.5,-6.4,37.2,-7.4,38.2,-7,39,-7,39.7,-7.5,40.2,-6.9,41,-6.9,41.6,-6.2,41.9,-6.6,41.9,-8.2,42.1,-8.9,43.1,-9.3],[38.6,1.1,40.1,1.1,40.1,4.4,38.6,4.4],[27.6,-18.2,29.5,-18.2,29.5,-13.3,27.6,-13.3]] },
 { k:"de", f:"data/asp-de.json?v=1", bb:[[47.2,5.8,55.1,15.1]], cov:[[54.9,8.3,54.8,9.9,54.4,11.1,54.7,13.4,53.9,14.3,52.8,14.2,51,15,50.3,12.2,49,12.5,48.6,13.8,47.5,13,47.3,10.2,47.6,7.6,49,8.2,49.2,6.4,50.3,6,51.8,6,53.2,7.2,53.7,7,53.9,8.6]] },
 { k:"us", f:"data/asp-us.json?v=1", bb:[[24,-125.5,49.6,-66],[51,-180,72,-129],[18,-161,23,-154],[17,-68,19,-64],[13,144,21,146.5]],
   cov:[[49,-124.8,49,-95.2,48.2,-89.5,46.5,-84.5,45.3,-82.5,43,-82.4,41.7,-83.1,42.9,-78.9,43.6,-76.8,45,-74.9,45,-71.5,47.4,-69.2,47.3,-67.8,44.8,-66.9,41,-69.8,35,-75.4,30.5,-81.2,25,-80,24.5,-82,29.5,-84,29,-89,28.9,-95,25.9,-97.1,29.5,-101.5,28.9,-103.2,31.7,-106.5,31.3,-111,32.5,-114.8,32.5,-117.2,34.4,-120.6,40.4,-124.5,46.3,-124.2],
        [51,-180,72,-180,72,-141,60,-141,54.5,-130,51,-131],[18,-161,23,-161,23,-154,18,-154],[17,-68,19,-68,19,-64,17,-64],[13,144,21,144,21,146.5,13,146.5]] } ], regP={};
function inBB(lat,lon,b){ return lat>=b[0] && lat<=b[2] && lon>=b[1] && lon<=b[3]; }
function regsOf(lat,lon){ return REG.filter(function(r){ return r.bb.some(function(b){ return inBB(lat,lon,b); }); }); }
function regOf(lat,lon){ return regsOf(lat,lon)[0]||null; }
function covered(lat,lon){ for(var i=0;i<REG.length;i++){ var c=REG[i].cov; for(var j=0;j<c.length;j++) if(inPoly(lat,lon,c[j])) return true; } return false; }
function regLoad(r){ if(regP[r.k]) return regP[r.k];
  regP[r.k]=fetch(r.f).then(function(x){ return x.json(); }).then(function(l){ if(!ASP) ASP=[]; var n0=ASP.length; for(var i=0;i<l.length;i++){ var a=l[i]; ASP.push({ i:n0+i, n:a[0], c:a[1], t:a[2], lo:a[3], lr:a[4], up:a[5], ur:a[6], f:a[7], nt:a[8], bb:a[9], p:a[10], cc:a[11]||"FR" }); } });
  regP[r.k].catch(function(){ delete regP[r.k]; }); return regP[r.k]; }
// loadAsp(points) : charge les pays touchés par ces points ; sans point, celui où se trouve le pilote (France par défaut)
function loadAsp(pts){ var want={}, list=[]; (pts||[]).forEach(function(p){ if(!p) return; regsOf(p.lat,p.lon).forEach(function(r){ if(!want[r.k]){ want[r.k]=1; list.push(r); } }); });
  if(!list.length){ var rp=(A && A.refPos) ? A.refPos() : null, r0=rp ? regsOf(rp.lat,rp.lon) : []; if(r0.length) list=r0; else list.push(REG[0]); }
  return Promise.all(list.map(regLoad)).then(function(){ if(!ASP) ASP=[]; return ASP; }); }
function inPoly(lat,lon,p){ var c=false; for(var i=0,j=p.length-2;i<p.length;j=i,i+=2){ var yi=p[i], xi=p[i+1], yj=p[j], xj=p[j+1]; if(((yi>lat)!==(yj>lat)) && (lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)) c=!c; } return c; }
function rule(a){ if(a.t==="P") return [3,T("Zone interdite")]; if(a.c==="A") return [3,T("Classe A : vol à vue interdit")];
  if(a.t==="R") return [2,T("Zone réglementée : entrée soumise à conditions (activité, contact radio). Vérifie l'AIP et les NOTAM")]; if(a.t==="Q") return [2,T("Zone dangereuse : vérifie l'activité avant de traverser")];
  if(a.cc==="US" && (a.c==="C"||a.c==="D")) return [2,T("Classe")+" "+a.c+" : "+T("contact radio obligatoire avant d'entrer")];
  if(a.c==="B"||a.c==="C"||a.c==="D") return [2,T("Classe")+" "+a.c+" : "+T("clairance radio obligatoire avant d'entrer")];
  if(a.t==="RMZ") return [1,T("Radio obligatoire (RMZ)")]; if(a.t==="TMZ") return [1,T("Transpondeur obligatoire (TMZ)")];
  if(a.c==="E") return [0,T("Classe E : vol à vue sans clairance")]; if(a.t==="GSEC") return [0,T("Secteur planeurs")]; if(a.t==="ASRA") return [0,T("Activité aérienne sportive ou de loisir")]; return [0,T("Pour information")]; }
function limTxt(v,r){ return r===2 ? "FL"+("00"+Math.round(v/100)).slice(-3) : r===0 ? (v===0?"SFC":v+" ft AGL") : v+" ft"; }
function vert(a, ter){ return [a.lr===0?a.lo+ter:a.lo, a.ur===0?a.up+ter:a.up]; }
function around(lat,lon){ var out=[]; if(!ASP) return out; for(var i=0;i<ASP.length;i++){ var a=ASP[i], b=a.bb; if(lat<b[0]||lat>b[2]||lon<b[1]||lon>b[3]) continue; if(inPoly(lat,lon,a.p)) out.push(a); } return out; }
// espaces contenant un point à une altitude donnée (pour l'alerte en vol)
function at(lat,lon,altFt,terFt){ return around(lat,lon).filter(function(a){ var v=vert(a,terFt||0); return altFt>=v[0] && altFt<v[1]; }).map(function(a){ var r=rule(a); return { a:a, sev:r[0], msg:r[1] }; }).sort(function(x,y){ return y.sev-x.sev; }); }
// contrôle d'une route : pts [{lat,lon}], altitude de croisière, profil du relief (facultatif)
function checkRoute(pts, altFt, elev){ var res={ hits:[], near:[], worst:0, ok:!!ASP }; if(!ASP || pts.length<2) return res; var L=[], tot=0; for(var i=0;i<pts.length-1;i++){ L.push(distM(pts[i],pts[i+1])); tot+=L[i]; }
  var step=Math.max(0.4*NM, tot/700), seen={}, acc=0, ei=0;
  function terAt(d){ if(!elev || !elev.S) return 0; var S=elev.S; while(ei<S.length-1 && S[ei+1].d<d) ei++; return (S[ei].e||0)*FT; }
  // on ne garde que les espaces dont l'emprise touche celle de la route
  var a0=90,b0=180,c0=-90,d0=-180; pts.forEach(function(p){ a0=Math.min(a0,p.lat); c0=Math.max(c0,p.lat); b0=Math.min(b0,p.lon); d0=Math.max(d0,p.lon); }); var cand=ASP.filter(function(a){ var b=a.bb; return !(b[2]<a0||b[0]>c0||b[3]<b0||b[1]>d0); });
  for(var j=0;j<L.length;j++){ var n=Math.max(1,Math.ceil(L[j]/step)); for(var k=0;k<=n;k++){ var f=k/n, p=mid(pts[j],pts[j+1],f), d=acc+L[j]*f, ter=terAt(d), edge=(d<5*NM||tot-d<5*NM), lowAlt=edge?Math.min(altFt,ter):altFt;
      for(var q=0;q<cand.length;q++){ var a=cand[q], b=a.bb; if(p.lat<b[0]||p.lat>b[2]||p.lon<b[1]||p.lon>b[3]) continue; if(!inPoly(p.lat,p.lon,a.p)) continue; var v=vert(a,ter), inside=(altFt>=v[0]&&altFt<v[1]) || (edge && lowAlt<v[1] && altFt>=v[0]);
        var s=seen[a.i]; if(!s){ var r=rule(a); s=seen[a.i]={ a:a, sev:r[0], msg:r[1], leg:j, d:d, inside:false, margin:1e9, side:"" }; }
        if(inside){ if(!s.inside){ s.inside=true; s.d=d; s.leg=j; } } else { var m=altFt<v[0]?v[0]-altFt:altFt-v[1]; if(m<s.margin){ s.margin=m; s.side=altFt<v[0]?"under":"over"; } } } }
    acc+=L[j]; }
  Object.keys(seen).forEach(function(k2){ var s=seen[k2]; if(s.inside){ res.hits.push(s); res.worst=Math.max(res.worst,s.sev); } else if(s.sev>=2 && s.margin<1000) res.near.push(s); });
  res.hits.sort(function(x,y){ return y.sev-x.sev || x.d-y.d; }); res.near.sort(function(x,y){ return x.margin-y.margin; }); return res; }

// ---------- contournement automatique des zones non autorisées ----------
// niveau 1 : zones interdites (P) et classe A ; niveau 2 : + zones réglementées (R) ; niveau 3 : + zones dangereuses et espaces à clairance (classes B, C, D)
// choix libres : p = zones interdites (P) et classe A ; r = zones réglementées (R) ; c = zones dangereuses et espaces à clairance (classes B, C, D)
function flags(f){ if(typeof f==="number") return { p:f>=1, r:f>=2, c:f>=3 }; return f||{}; }
function isObs(a, f){ f=flags(f); return !!((f.p && (a.t==="P" || a.c==="A")) || (f.r && a.t==="R") || (f.c && (a.t==="Q" || a.c==="B" || a.c==="C" || a.c==="D"))); }
function hull(p){ p=p.slice().sort(function(a,b){ return a[0]-b[0] || a[1]-b[1]; }); var cr=function(o,a,b){ return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); }, lo=[], up=[], i;
  for(i=0;i<p.length;i++){ while(lo.length>=2 && cr(lo[lo.length-2],lo[lo.length-1],p[i])<=0) lo.pop(); lo.push(p[i]); } for(i=p.length-1;i>=0;i--){ while(up.length>=2 && cr(up[up.length-2],up[up.length-1],p[i])<=0) up.pop(); up.push(p[i]); } lo.pop(); up.pop(); return lo.concat(up); }
function grow(h, c, d){ return h.map(function(v){ var dx=v[0]-c[0], dy=v[1]-c[1], l=Math.hypot(dx,dy)||1; return [v[0]+dx/l*d, v[1]+dy/l*d]; }); }
function inConvex(p, h){ var s=0; for(var i=0;i<h.length;i++){ var a=h[i], b=h[(i+1)%h.length], c=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]); if(c===0) continue; if(s===0) s=c>0?1:-1; else if((c>0?1:-1)!==s) return false; } return true; }
function segCross(p,q,a,b){ var d1=(q[0]-p[0])*(a[1]-p[1])-(q[1]-p[1])*(a[0]-p[0]), d2=(q[0]-p[0])*(b[1]-p[1])-(q[1]-p[1])*(b[0]-p[0]), d3=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]), d4=(b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]); return ((d1>0)!==(d2>0)) && ((d3>0)!==(d4>0)); }
function segHits(p,q,o){ if(Math.max(p[0],q[0])<o.bx[0] || Math.min(p[0],q[0])>o.bx[2] || Math.max(p[1],q[1])<o.bx[1] || Math.min(p[1],q[1])>o.bx[3]) return false; var h=o.test; if(inConvex(p,h) || inConvex(q,h)) return true; for(var i=0;i<h.length;i++) if(segCross(p,q,h[i],h[(i+1)%h.length])) return true; return false; }
function avoidLeg(a, b, altFt, level, terFt){ var lat0=(a.lat+b.lat)/2, kx=60*Math.cos(rad(lat0)), X=function(p){ return [p.lon*kx, p.lat*60]; }, A2=X(a), B2=X(b), len=Math.hypot(B2[0]-A2[0],B2[1]-A2[1]), pad=Math.max(30, len*0.5)/60, out={ pts:[], zones:[], blocked:[] };
  var a0=Math.min(a.lat,b.lat)-pad, c0=Math.max(a.lat,b.lat)+pad, b0=Math.min(a.lon,b.lon)-pad*1.5, d0=Math.max(a.lon,b.lon)+pad*1.5, O=[];
  ASP.forEach(function(s){ if(!isObs(s,level)) return; var bb=s.bb; if(bb[2]<a0||bb[0]>c0||bb[3]<b0||bb[1]>d0) return; var lo=s.lo, up=s.ur===0?s.up+(terFt||0):s.up; if(altFt<=lo-300 || altFt>=up+300) return;
    var xy=[]; for(var i=0;i<s.p.length;i+=2) xy.push([s.p[i+1]*kx, s.p[i]*60]); var h=hull(xy); if(h.length<3) return;
    if(h.length>18){ var keep=[], seen={}; for(var k=0;k<18;k++){ var t=k*Math.PI/9, ux=Math.cos(t), uy=Math.sin(t), bi=0, bv=-1e18; for(var j=0;j<h.length;j++){ var v=h[j][0]*ux+h[j][1]*uy; if(v>bv){ bv=v; bi=j; } } if(!seen[bi]){ seen[bi]=1; keep.push(bi); } } keep.sort(function(x,y){ return x-y; }); h=keep.map(function(j2){ return h[j2]; }); }
    var cx=0, cy=0; h.forEach(function(v){ cx+=v[0]; cy+=v[1]; }); var c=[cx/h.length, cy/h.length], test=grow(h,c,0.8), nodes=grow(h,c,2), bx=[1e9,1e9,-1e9,-1e9]; test.forEach(function(v){ bx[0]=Math.min(bx[0],v[0]); bx[1]=Math.min(bx[1],v[1]); bx[2]=Math.max(bx[2],v[0]); bx[3]=Math.max(bx[3],v[1]); });
    var o={ a:s, test:test, nodes:nodes, bx:bx }; if(inConvex(A2,test) || inConvex(B2,test)){ out.blocked.push(s); return; } O.push(o); });
  if(!O.length) return out; var S=[], inS={};
  out.fail=true;
  for(var it=0; it<20; it++){ var N=[{ p:A2, o:null },{ p:B2, o:null }]; S.forEach(function(o){ o.nodes.forEach(function(p){ for(var q=0;q<S.length;q++) if(S[q]!==o && inConvex(p,S[q].test)) return; N.push({ p:p, o:o }); }); });
    var n=N.length, dist=new Array(n).fill(1e18), prev=new Array(n).fill(-1), done=new Array(n).fill(false); dist[0]=0;
    for(;;){ var u=-1, bd=1e18; for(var i2=0;i2<n;i2++) if(!done[i2] && dist[i2]<bd){ bd=dist[i2]; u=i2; } if(u<0 || u===1) break; done[u]=true;
      for(var w=0;w<n;w++){ if(done[w]) continue; var dd=Math.hypot(N[u].p[0]-N[w].p[0], N[u].p[1]-N[w].p[1]); if(dist[u]+dd>=dist[w]) continue; var hit=false; for(var q2=0;q2<S.length;q2++) if(segHits(N[u].p,N[w].p,S[q2])){ hit=true; break; } if(!hit){ dist[w]=dist[u]+dd; prev[w]=u; } } }
    if(dist[1]>=1e17) return out; var path=[], x=1; while(x>=0){ path.unshift(N[x]); x=prev[x]; }
    var added=false; for(var s2=0;s2<path.length-1;s2++) for(var q3=0;q3<O.length;q3++){ var ob=O[q3]; if(!inS[ob.a.i] && segHits(path[s2].p,path[s2+1].p,ob)){ inS[ob.a.i]=1; S.push(ob); added=true; } }
    if(!added){ if(dist[1]>len*3+60) return out; out.fail=false; out.pts=path.slice(1,-1).map(function(nd){ return { name:T("Contournement")+" · "+String(nd.o.a.n).slice(0,26), code:"", lat:nd.p[1]/60, lon:nd.p[0]/kx, auto:true }; }); out.zones=S.map(function(o){ return o.a; }); out.extra=dist[1]-len; return out; } }
  return out; }
// route complète : insère des points de contournement (marqués auto) entre les points choisis par le pilote
function avoid(pts, altFt, level, terFt){ var res={ pts:[], zones:[], blocked:[], extra:0, n:0 }; level=flags(level); if(!ASP || pts.length<2 || !(level.p||level.r||level.c)){ res.pts=pts.slice(); return res; } var zs={}, bs={};
  for(var i=0;i<pts.length-1;i++){ res.pts.push(pts[i]); var r=avoidLeg(pts[i], pts[i+1], altFt, level, terFt); if(r.fail && level.p && (level.r||level.c)){ var r1=avoidLeg(pts[i], pts[i+1], altFt, { p:true }, terFt); r1.blocked=r.blocked; r=r1; res.partial=true; } r.pts.forEach(function(p){ res.pts.push(p); res.n++; }); r.zones.forEach(function(z){ zs[z.i]=z; }); r.blocked.forEach(function(z){ bs[z.i]=z; }); res.extra+=r.extra||0; }
  res.pts.push(pts[pts.length-1]); res.zones=Object.keys(zs).map(function(k){ return zs[k]; }); res.blocked=Object.keys(bs).map(function(k){ return bs[k]; }); return res; }

// ---------- météo le long de la route ----------
function samplesOf(pts, legT, dep){ var S=[{ lat:pts[0].lat, lon:pts[0].lon, leg:0, t:+dep }], cum=0; for(var i=0;i<pts.length-1;i++){ var d=distM(pts[i],pts[i+1])/NM, k=Math.max(1,Math.round(d/28)); for(var q=1;q<=k;q++){ var p=mid(pts[i],pts[i+1],q/k); S.push({ lat:p.lat, lon:p.lon, leg:i, t:+dep+(cum+legT[i]*q/k)*60000 }); } cum+=legT[i]; }
  if(S.length>14){ var st=Math.ceil(S.length/14), o=[]; for(var j=0;j<S.length;j++) if(j%st===0 || j===S.length-1) o.push(S[j]); S=o; } return S; }
function fdaysOf(S){ var mx=0; S.forEach(function(s){ if(s.t>mx) mx=s.t; }); return Math.min(16, Math.max(8, Math.ceil((mx-Date.now())/864e5)+2)); }
// la même route, jour après jour à la même heure : sert à choisir le meilleur jour (une seule demande de prévisions pour les 7 jours)
function outlook(r, nLegs, times){ return times.map(function(t){ var e=evalRoute(r.S.map(function(s){ return { lat:s.lat, lon:s.lon, leg:s.leg, t:s.t }; }), r.raw, t-r.dep, nLegs), why=[]; e.legs.forEach(function(l){ if(l.lvl===e.worst && l.lvl>0) l.why.forEach(function(w){ if(why.indexOf(w)<0) why.push(w); }); }); return { t:t, worst:e.worst, why:why.slice(0,2), na:e.na }; }); }
function fetchRaw(S){ return fetch("https://api.open-meteo.com/v1/forecast?latitude="+S.map(function(s){ return s.lat.toFixed(3); }).join(",")+"&longitude="+S.map(function(s){ return s.lon.toFixed(3); }).join(",")+"&hourly=visibility,cloud_cover_low,temperature_2m,dew_point_2m,precipitation,weather_code,wind_gusts_10m&wind_speed_unit=kn&timeformat=unixtime&forecast_days="+fdaysOf(S))
  .then(function(r){ return r.json(); }).then(function(j){ var arr=Array.isArray(j)?j:[j]; if(!arr.length || !arr[0].hourly) throw new Error("meteo"); return arr.map(function(x){ return x.hourly; }); }); }
function judge(H, tMs){ var t=tMs/1000, bi=0, bd=1e12; for(var k=0;k<H.time.length;k++){ var dd=Math.abs(H.time[k]-t); if(dd<bd){ bd=dd; bi=k; } }
  if(bd>3*3600) return { lvl:0, why:[], na:true };
  var vis=H.visibility[bi], low=H.cloud_cover_low[bi]||0, T2=H.temperature_2m[bi], Td=H.dew_point_2m[bi], pr=H.precipitation[bi]||0, code=H.weather_code[bi]||0, gust=H.wind_gusts_10m[bi]||0, base=(T2!=null&&Td!=null)?Math.max(0,(T2-Td)*400):null, lvl=0, why=[];
  function add(l,w){ if(l>lvl) lvl=l; why.push([l,w]); }
  if(code>=95) add(2,T("orage")); if(code===45||code===48) add(2,T("brouillard")); if(code===66||code===67||code===56||code===57) add(2,T("pluie verglaçante"));
  if(vis!=null && vis<3000) add(2,T("visibilité")+" "+(vis/1000).toFixed(1)+" km"); else if(vis!=null && vis<8000) add(1,T("visibilité")+" "+(vis/1000).toFixed(0)+" km");
  if(base!=null && low>=60 && base<1000) add(2,T("plafond bas estimé à")+" "+Math.round(base/100)*100+" ft"); else if(base!=null && low>=50 && base<2000) add(1,T("plafond bas estimé à")+" "+Math.round(base/100)*100+" ft");
  if(gust>=35) add(2,T("rafales")+" "+Math.round(gust)+" kt"); else if(gust>=25) add(1,T("rafales")+" "+Math.round(gust)+" kt");
  if(pr>=4) add(2,T("pluie forte")); else if(pr>=1 || (code>=61&&code<=65)) add(1,T("pluie")); else if(code>=80&&code<=82) add(1,T("averses")); if(code>=71&&code<=77) add(code>=75?2:1,T("neige"));
  why.sort(function(a,b){ return b[0]-a[0]; }); return { lvl:lvl, why:why.map(function(w){ return w[1]; }), vis:vis, base:base, gust:gust }; }
function evalRoute(S, raw, shiftMs, nLegs){ var legs=[], worst=0; for(var i=0;i<nLegs;i++) legs.push({ lvl:0, why:[] });
  var na=0; S.forEach(function(s,i){ var j=judge(raw[i], s.t+(shiftMs||0)); if(j.na) na++; s.lvl=j.lvl; s.why=j.why; var l=legs[s.leg]; if(j.lvl>l.lvl){ l.lvl=j.lvl; l.why=j.why.slice(0,2); } else if(j.lvl===l.lvl && j.lvl>0 && !l.why.length) l.why=j.why.slice(0,2); if(j.lvl>worst) worst=j.lvl; }); return { legs:legs, worst:worst, S:S, na:na>S.length/2 }; }
function legTimes(pts, tasKt, legT){ if(legT && legT.length===pts.length-1) return legT; var o=[]; for(var i=0;i<pts.length-1;i++) o.push(distM(pts[i],pts[i+1])/NM/Math.max(20,tasKt)*60); return o; }
// météo d'une route : { legs:[{lvl,why}], worst, S, raw }
var wxMem={};
function routeWx(pts, tasKt, dep, legT){ var lt=legTimes(pts,tasKt,legT), S=samplesOf(pts, lt, dep), key=fdaysOf(S)+"|"+S.map(function(s){ return s.lat.toFixed(2)+","+s.lon.toFixed(2); }).join(";"), m=wxMem[key];
  var done=function(raw){ var r=evalRoute(S, raw, 0, pts.length-1); r.raw=raw; r.dep=+dep; return r; }; if(m && Date.now()-m.t<15*60000) return Promise.resolve(done(m.raw));
  return fetchRaw(S).then(function(raw){ wxMem[key]={ t:Date.now(), raw:raw }; var ks=Object.keys(wxMem); if(ks.length>30) delete wxMem[ks[0]]; return done(raw); }); }
function totalNM(pts){ var d=0; for(var i=0;i<pts.length-1;i++) d+=distM(pts[i],pts[i+1]); return d/NM; }
// propose une route qui évite la branche touchée (via un terrain proche de préférence), sinon un départ décalé
function suggest(pts, tasKt, dep, cur, api){ var bad=-1; for(var i=0;i<cur.legs.length;i++) if(cur.legs[i].lvl>=2){ bad=i; break; } if(bad<0) return Promise.resolve(null);
  var a=pts[bad], b=pts[bad+1], tr=brg(a,b), m=mid(a,b,0.5), base=totalNM(pts), cands=[], seen={};
  [[90,15],[-90,15],[90,30],[-90,30],[90,48],[-90,48]].forEach(function(o){ var p=dest(m,(tr+o[0]+360)%360,o[1]*NM), f=null; try{ var n=api.nearest(p.lat,p.lon,1,function(x){ return x.code!==a.code && x.code!==b.code; })[0]; if(n && n[0]<16) f=n[1]; }catch(e){}
    var wp=f ? { name:f.name, code:f.code, lat:f.lat, lon:f.lon, elev:f.elev } : { name:T("Contournement"), code:"", lat:p.lat, lon:p.lon }, key=wp.code||wp.lat.toFixed(2)+wp.lon.toFixed(2); if(seen[key]) return; seen[key]=1;
    var np=pts.slice(0,bad+1).concat([wp], pts.slice(bad+1)), ex=totalNM(np)-base; if(ex<base*0.6+25) cands.push({ pts:np, via:wp, extra:ex }); });
  // le point de passage lui-même est touché : on essaie sans lui, ou avec un terrain voisin à sa place
  var bi=-1; if(bad+1<pts.length-1) bi=bad+1; else if(bad>0) bi=bad;
  if(bi>0 && bi<pts.length-1){ var w0=pts[bi], t2=brg(pts[bi-1],pts[bi+1]), skip=pts.slice(0,bi).concat(pts.slice(bi+1)); cands.push({ pts:skip, via:pts[bi+1], extra:totalNM(skip)-base, skip:w0 });
    [[90,14],[-90,14],[90,28],[-90,28],[90,45],[-90,45]].forEach(function(o){ var p=dest(w0,(t2+o[0]+360)%360,o[1]*NM), f=null; try{ var n=api.nearest(p.lat,p.lon,1,function(x){ return x.code!==w0.code; })[0]; if(n && n[0]<16) f=n[1]; }catch(e){}
      var wp=f ? { name:f.name, code:f.code, lat:f.lat, lon:f.lon, elev:f.elev } : { name:T("Contournement"), code:"", lat:p.lat, lon:p.lon }, key="r"+(wp.code||wp.lat.toFixed(2)+wp.lon.toFixed(2)); if(seen[key]) return; seen[key]=1;
      var np=pts.slice(0,bi).concat([wp], pts.slice(bi+1)), ex=totalNM(np)-base; if(ex<base*0.6+25) cands.push({ pts:np, via:wp, extra:ex, repl:w0 }); }); }
  cands.sort(function(x,y){ return x.extra-y.extra; }); cands=cands.slice(0,4); var tried=[];
  var chain=cands.reduce(function(pr,c){ return pr.then(function(stop){ if(stop) return true; return routeWx(c.pts, tasKt, dep).then(function(r){ c.wx=r; tried.push(c); return r.worst===0; }).catch(function(){ return false; }); }); }, Promise.resolve(false));
  return chain.then(function(){ var L=tried.filter(function(c){ return c.wx && c.wx.worst<cur.worst; }); L.sort(function(x,y){ return x.wx.worst-y.wx.worst || x.extra-y.extra; });
    var out={ route:L[0]||null, delay:null }; if(cur.raw){ for(var h=1;h<=8;h++){ var e=evalRoute(cur.S.map(function(s){ return { lat:s.lat, lon:s.lon, leg:s.leg, t:s.t }; }), cur.raw, h*3600000, pts.length-1); if(e.worst<2){ out.delay={ h:h, worst:e.worst }; break; } } }
    if(out.route) out.route.extraMin=out.route.extra/Math.max(20,tasKt)*60; return (out.route||out.delay)?out:null; }); }
// METAR des stations proches de la route (observations réelles)
function metars(pts, api){ if(!api.metarBox) return Promise.resolve([]); var a=90,b=180,c=-90,d=-180; pts.forEach(function(p){ a=Math.min(a,p.lat); c=Math.max(c,p.lat); b=Math.min(b,p.lon); d=Math.max(d,p.lon); }); a-=0.35; c+=0.35; b-=0.5; d+=0.5; if(c-a>8 || d-b>12) return Promise.resolve([]);
  return api.metarBox([a,b,c,d]).then(function(l){ var out=[]; (l||[]).forEach(function(s){ if(!s.raw || !isFinite(s.lat)) return; var best=1e9, along=0, acc=0; for(var i=0;i<pts.length-1;i++){ var L=distM(pts[i],pts[i+1]), d1=distM(pts[i],s), th=rad(brg(pts[i],s)-brg(pts[i],pts[i+1])), al=Math.max(0,Math.min(L,d1*Math.cos(th))), p=mid(pts[i],pts[i+1],L?al/L:0), dd=distM(p,s); if(dd<best){ best=dd; along=acc+al; } acc+=L; }
      if(best>22*NM) return; var o=api.parseMetar(s.raw), cat=api.fltCat(o); out.push({ id:s.id, name:String(s.name||"").split(",")[0], cat:cat, km:best/1000, along:along, o:o }); }); out.sort(function(x,y){ return x.along-y.along; }); return out; }).catch(function(){ return []; }); }

window.LFSafe={ init:function(api){ A=api; }, loadAsp:loadAsp, covered:covered, avoid:avoid, checkRoute:checkRoute, at:at, limTxt:limTxt, routeWx:routeWx, outlook:outlook, suggest:suggest, metars:metars, ready:function(){ return !!ASP; } };
})();
