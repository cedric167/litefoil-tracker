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
 "clairance radio obligatoire avant d'entrer":["radio clearance required before entering","autorización por radio obligatoria antes de entrar"],"Classe":["Class","Clase"],
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
function loadAsp(){ if(aspP) return aspP; aspP=fetch("data/asp-fr.json?v=1").then(function(r){ return r.json(); }).then(function(l){ ASP=l.map(function(a,i){ return { i:i, n:a[0], c:a[1], t:a[2], lo:a[3], lr:a[4], up:a[5], ur:a[6], f:a[7], nt:a[8], bb:a[9], p:a[10] }; }); return ASP; }); aspP.catch(function(){ aspP=null; }); return aspP; }
function inPoly(lat,lon,p){ var c=false; for(var i=0,j=p.length-2;i<p.length;j=i,i+=2){ var yi=p[i], xi=p[i+1], yj=p[j], xj=p[j+1]; if(((yi>lat)!==(yj>lat)) && (lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)) c=!c; } return c; }
function rule(a){ if(a.t==="P") return [3,T("Zone interdite")]; if(a.c==="A") return [3,T("Classe A : vol à vue interdit")];
  if(a.t==="R") return [2,T("Zone réglementée : entrée soumise à conditions (activité, contact radio). Vérifie l'AIP et les NOTAM")]; if(a.t==="Q") return [2,T("Zone dangereuse : vérifie l'activité avant de traverser")];
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

// ---------- météo le long de la route ----------
function samplesOf(pts, legT, dep){ var S=[{ lat:pts[0].lat, lon:pts[0].lon, leg:0, t:+dep }], cum=0; for(var i=0;i<pts.length-1;i++){ var d=distM(pts[i],pts[i+1])/NM, k=Math.max(1,Math.round(d/14)); for(var q=1;q<=k;q++){ var p=mid(pts[i],pts[i+1],q/k); S.push({ lat:p.lat, lon:p.lon, leg:i, t:+dep+(cum+legT[i]*q/k)*60000 }); } cum+=legT[i]; }
  if(S.length>44){ var st=Math.ceil(S.length/44), o=[]; for(var j=0;j<S.length;j++) if(j%st===0 || j===S.length-1) o.push(S[j]); S=o; } return S; }
function fetchRaw(S){ return fetch("https://api.open-meteo.com/v1/forecast?latitude="+S.map(function(s){ return s.lat.toFixed(3); }).join(",")+"&longitude="+S.map(function(s){ return s.lon.toFixed(3); }).join(",")+"&hourly=visibility,cloud_cover_low,temperature_2m,dew_point_2m,precipitation,weather_code,wind_gusts_10m&wind_speed_unit=kn&timeformat=unixtime&forecast_days=2")
  .then(function(r){ return r.json(); }).then(function(j){ var arr=Array.isArray(j)?j:[j]; if(!arr.length || !arr[0].hourly) throw new Error("meteo"); return arr.map(function(x){ return x.hourly; }); }); }
function judge(H, tMs){ var t=tMs/1000, bi=0, bd=1e12; for(var k=0;k<H.time.length;k++){ var dd=Math.abs(H.time[k]-t); if(dd<bd){ bd=dd; bi=k; } }
  var vis=H.visibility[bi], low=H.cloud_cover_low[bi]||0, T2=H.temperature_2m[bi], Td=H.dew_point_2m[bi], pr=H.precipitation[bi]||0, code=H.weather_code[bi]||0, gust=H.wind_gusts_10m[bi]||0, base=(T2!=null&&Td!=null)?Math.max(0,(T2-Td)*400):null, lvl=0, why=[];
  function add(l,w){ if(l>lvl) lvl=l; why.push([l,w]); }
  if(code>=95) add(2,T("orage")); if(code===45||code===48) add(2,T("brouillard")); if(code===66||code===67||code===56||code===57) add(2,T("pluie verglaçante"));
  if(vis!=null && vis<3000) add(2,T("visibilité")+" "+(vis/1000).toFixed(1)+" km"); else if(vis!=null && vis<8000) add(1,T("visibilité")+" "+(vis/1000).toFixed(0)+" km");
  if(base!=null && low>=60 && base<1000) add(2,T("plafond bas estimé à")+" "+Math.round(base/100)*100+" ft"); else if(base!=null && low>=50 && base<2000) add(1,T("plafond bas estimé à")+" "+Math.round(base/100)*100+" ft");
  if(gust>=35) add(2,T("rafales")+" "+Math.round(gust)+" kt"); else if(gust>=25) add(1,T("rafales")+" "+Math.round(gust)+" kt");
  if(pr>=4) add(2,T("pluie forte")); else if(pr>=1 || (code>=61&&code<=65)) add(1,T("pluie")); else if(code>=80&&code<=82) add(1,T("averses")); if(code>=71&&code<=77) add(code>=75?2:1,T("neige"));
  why.sort(function(a,b){ return b[0]-a[0]; }); return { lvl:lvl, why:why.map(function(w){ return w[1]; }), vis:vis, base:base, gust:gust }; }
function evalRoute(S, raw, shiftMs, nLegs){ var legs=[], worst=0; for(var i=0;i<nLegs;i++) legs.push({ lvl:0, why:[] });
  S.forEach(function(s,i){ var j=judge(raw[i], s.t+(shiftMs||0)); s.lvl=j.lvl; s.why=j.why; var l=legs[s.leg]; if(j.lvl>l.lvl){ l.lvl=j.lvl; l.why=j.why.slice(0,2); } else if(j.lvl===l.lvl && j.lvl>0 && !l.why.length) l.why=j.why.slice(0,2); if(j.lvl>worst) worst=j.lvl; }); return { legs:legs, worst:worst, S:S }; }
function legTimes(pts, tasKt, legT){ if(legT && legT.length===pts.length-1) return legT; var o=[]; for(var i=0;i<pts.length-1;i++) o.push(distM(pts[i],pts[i+1])/NM/Math.max(20,tasKt)*60); return o; }
// météo d'une route : { legs:[{lvl,why}], worst, S, raw }
function routeWx(pts, tasKt, dep, legT){ var lt=legTimes(pts,tasKt,legT), S=samplesOf(pts, lt, dep); return fetchRaw(S).then(function(raw){ var r=evalRoute(S, raw, 0, pts.length-1); r.raw=raw; r.dep=+dep; return r; }); }
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
  return Promise.all(cands.map(function(c){ return routeWx(c.pts, tasKt, dep).then(function(r){ c.wx=r; return c; }).catch(function(){ c.wx=null; return c; }); })).then(function(L){ L=L.filter(function(c){ return c.wx && c.wx.worst<cur.worst; }); L.sort(function(x,y){ return x.wx.worst-y.wx.worst || x.extra-y.extra; });
    var out={ route:L[0]||null, delay:null }; if(cur.raw){ for(var h=1;h<=8;h++){ var e=evalRoute(cur.S.map(function(s){ return { lat:s.lat, lon:s.lon, leg:s.leg, t:s.t }; }), cur.raw, h*3600000, pts.length-1); if(e.worst<2){ out.delay={ h:h, worst:e.worst }; break; } } }
    if(out.route) out.route.extraMin=out.route.extra/Math.max(20,tasKt)*60; return (out.route||out.delay)?out:null; }); }
// METAR des stations proches de la route (observations réelles)
function metars(pts, api){ if(!api.metarBox) return Promise.resolve([]); var a=90,b=180,c=-90,d=-180; pts.forEach(function(p){ a=Math.min(a,p.lat); c=Math.max(c,p.lat); b=Math.min(b,p.lon); d=Math.max(d,p.lon); }); a-=0.35; c+=0.35; b-=0.5; d+=0.5; if(c-a>8 || d-b>12) return Promise.resolve([]);
  return api.metarBox([a,b,c,d]).then(function(l){ var out=[]; (l||[]).forEach(function(s){ if(!s.raw || !isFinite(s.lat)) return; var best=1e9, along=0, acc=0; for(var i=0;i<pts.length-1;i++){ var L=distM(pts[i],pts[i+1]), d1=distM(pts[i],s), th=rad(brg(pts[i],s)-brg(pts[i],pts[i+1])), al=Math.max(0,Math.min(L,d1*Math.cos(th))), p=mid(pts[i],pts[i+1],L?al/L:0), dd=distM(p,s); if(dd<best){ best=dd; along=acc+al; } acc+=L; }
      if(best>22*NM) return; var o=api.parseMetar(s.raw), cat=api.fltCat(o); out.push({ id:s.id, name:String(s.name||"").split(",")[0], cat:cat, km:best/1000, along:along, o:o }); }); out.sort(function(x,y){ return x.along-y.along; }); return out; }).catch(function(){ return []; }); }

window.LFSafe={ init:function(api){ A=api; }, loadAsp:loadAsp, checkRoute:checkRoute, at:at, limTxt:limTxt, routeWx:routeWx, suggest:suggest, metars:metars, ready:function(){ return !!ASP; } };
})();
