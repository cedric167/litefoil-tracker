// Lite Foil : espace ULM / Avion, plan de vol et navigation guidée par GPS (14/11/2026)
// Préparation : route (terrains ou points sur la carte), log de navigation avec vent en altitude (cap, vitesse sol, temps, carburant),
// profil du relief, coucher du soleil, météo départ / arrivée, routes enregistrées, export GPX.
// En vol : carte qui suit l'appareil, prochain point (distance, cap, temps), écart de route, vitesse sol, altitude,
// passage automatique au point suivant, annonces vocales, « terrain le plus proche » et Direct-to.
(function(){
"use strict";
var box=null, A=null, map=null, lay=null, P=null, R=null, addOnMap=false, aero=false, seq=0, FLY=null, elev=null, wxEnds={}, wTimer=null;
var NM=1852, FT=3.28084;

var TR={
 "Mon appareil":["My aircraft","Mi aeronave"],"Vitesse de croisière":["Cruise speed","Velocidad de crucero"],"Consommation":["Fuel burn","Consumo"],"Carburant à bord":["Fuel on board","Combustible a bordo"],"Altitude de croisière":["Cruise altitude","Altitud de crucero"],
 "Ma route":["My route","Mi ruta"],"Départ":["Departure","Salida"],"Arrivée":["Arrival","Llegada"],"Ajouter un terrain (nom, ville ou code)":["Add an airfield (name, town or code)","Añadir un campo (nombre, ciudad o código)"],
 "Ajouter un point sur la carte":["Add a point on the map","Añadir un punto en el mapa"],"Touche la carte pour poser le point":["Tap the map to drop the point","Toca el mapa para poner el punto"],"Aller-retour":["Round trip","Ida y vuelta"],"Inverser":["Reverse","Invertir"],"Effacer":["Clear","Borrar"],
 "Carte aéronautique":["Aeronautical chart","Carta aeronáutica"],"Ajoute au moins un départ et une arrivée pour calculer ton vol.":["Add at least a departure and an arrival to compute your flight.","Añade al menos una salida y una llegada para calcular tu vuelo."],
 "Log de navigation":["Navigation log","Plan de navegación"],"Branche":["Leg","Tramo"],"Route":["Track","Ruta"],"Cap":["Heading","Rumbo"],"Dist.":["Dist.","Dist."],"Vent":["Wind","Viento"],"Vit. sol":["GS","Vel. suelo"],"Temps":["Time","Tiempo"],"Carb.":["Fuel","Comb."],
 "Total":["Total","Total"],"Distance":["Distance","Distancia"],"Durée de vol":["Flight time","Tiempo de vuelo"],"Carburant nécessaire":["Fuel required","Combustible necesario"],"dont 30 min de réserve":["incl. 30 min reserve","incl. 30 min de reserva"],
 "Carburant suffisant":["Enough fuel","Combustible suficiente"],"Carburant insuffisant":["Not enough fuel","Combustible insuficiente"],"marge":["margin","margen"],"il manque":["short by","faltan"],
 "Heure de départ":["Departure time","Hora de salida"],"Maintenant":["Now","Ahora"],"Arrivée estimée":["Estimated arrival","Llegada estimada"],"Nuit aéronautique à l'arrivée":["Aeronautical night at arrival","Noche aeronáutica en la llegada"],
 "Arrivée de jour":["Daylight arrival","Llegada de día"],"Arrivée après la nuit aéronautique":["Arrival after aeronautical night","Llegada después de la noche aeronáutica"],"Vent trop fort pour tenir la route sur cette branche":["Wind too strong to hold the track on this leg","Viento demasiado fuerte para mantener la ruta en este tramo"],
 "Vent prévu à l'altitude de croisière":["Forecast wind at cruise altitude","Viento previsto a la altitud de crucero"],"Vent indisponible : calcul sans vent":["Wind unavailable: computed with no wind","Viento no disponible: cálculo sin viento"],"Calcul du vent…":["Fetching wind…","Calculando viento…"],
 "Profil du relief":["Terrain profile","Perfil del relieve"],"Point le plus haut":["Highest point","Punto más alto"],"Marge sur le relief":["Terrain clearance","Margen sobre el relieve"],"Marge insuffisante : monte ou contourne le relief":["Clearance too low: climb or route around the terrain","Margen insuficiente: sube o rodea el relieve"],
 "Météo départ et arrivée":["Departure and arrival weather","Meteo de salida y llegada"],"Démarrer la navigation":["Start navigation","Iniciar navegación"],"Enregistrer la route":["Save route","Guardar ruta"],"Exporter en GPX":["Export GPX","Exportar GPX"],
 "Mes routes":["My routes","Mis rutas"],"Route enregistrée.":["Route saved.","Ruta guardada."],"Point":["Point","Punto"],"Routes vraies (géographiques). Aide à la préparation : ne remplace pas la carte officielle, les NOTAM, le SUP AIP ni la météo officielle.":["True tracks. Preparation aid: does not replace the official chart, NOTAM, AIP SUP or official weather.","Rutas verdaderas. Ayuda de preparación: no sustituye a la carta oficial, NOTAM, SUP AIP ni la meteo oficial."],
 "Prochain point":["Next point","Siguiente punto"],"Cap à suivre":["Bearing","Rumbo a seguir"],"Écart de route":["Off track","Desvío de ruta"],"à gauche":["left","a la izquierda"],"à droite":["right","a la derecha"],"Sur la route":["On track","En ruta"],
 "Vitesse sol":["Ground speed","Vel. suelo"],"Altitude":["Altitude","Altitud"],"Reste":["Remaining","Resta"],"Arrivée":["Arrival","Llegada"],"Suivant":["Next","Siguiente"],"Terrain proche":["Nearest field","Campo cercano"],"Quitter":["Quit","Salir"],
 "Recherche du signal GPS…":["Searching GPS…","Buscando GPS…"],"Tu es arrivé":["You have arrived","Has llegado"],"Terrains les plus proches":["Nearest airfields","Campos más cercanos"],"Direct vers":["Direct to","Directo a"],"piste":["runway","pista"],
 "Recentrer":["Recentre","Recentrar"],"Voix":["Voice","Voz"],"Fermer":["Close","Cerrar"],"Quitter la navigation ?":["Quit navigation?","¿Salir de la navegación?"],
 "L'écran reste allumé pendant la navigation. Garde toujours la carte officielle et le regard dehors.":["The screen stays on during navigation. Always keep the official chart and look outside.","La pantalla permanece encendida. Lleva siempre la carta oficial y mira afuera."],
 "Position indisponible. Autorise la localisation.":["Location unavailable. Allow location.","Ubicación no disponible. Autoriza la localización."],"atteint":["reached","alcanzado"],"cap":["heading","rumbo"],"nautiques":["nautical miles","millas"],"Prochain point :":["Next point:","Siguiente punto:"],"Simulation":["Simulation","Simulación"]
};
function T(s){ var i=A?A.lang():0; if(!i) return s; var t=TR[s]; return t && t[i-1]!=null ? t[i-1] : s; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function lget(k,d){ try{ var v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } }
function lset(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
function rad(x){ return x*Math.PI/180; } function deg(x){ return x*180/Math.PI; }
function distM(a,b){ var x=Math.sin(rad(b.lat-a.lat)/2), y=Math.sin(rad(b.lon-a.lon)/2), q=x*x+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*y*y; return 12742000*Math.asin(Math.min(1,Math.sqrt(q))); }
function brg(a,b){ var y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat)), x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon)); return (deg(Math.atan2(y,x))+360)%360; }
function mid(a,b,f){ return { lat:a.lat+(b.lat-a.lat)*f, lon:a.lon+(b.lon-a.lon)*f }; }
function d3(d){ d=Math.round(d)%360; if(d<=0) d+=360; return (d<100?"0":"")+(d<10?"0":"")+d+"°"; }
function p2(n){ return (n<10?"0":"")+n; } function hm(d){ return p2(d.getHours())+":"+p2(d.getMinutes()); }
function fDur(min){ min=Math.max(0,Math.round(min)); var h=Math.floor(min/60), m=min%60; return h ? h+" h "+p2(m) : m+" min"; }
function nf(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g," "); }
function toast(msg){ var t=document.createElement("div"); t.className="nv-toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 2600); }

// ---------- plan ----------
function loadPlan(){ P=lget("lf.ulm.plan", null); if(!P || !P.pts) P={ pts:[], ac:{ tas:150, burn:15, fuel:60 }, alt:2500, dep:"" }; if(!P.ac) P.ac={ tas:150, burn:15, fuel:60 }; if(!P.alt) P.alt=2500; }
function savePlan(){ lset("lf.ulm.plan", P); }
function ptOf(f){ return { name:f.name, code:f.code, lat:f.lat, lon:f.lon, elev:f.elev }; }
function depTime(){ if(P.dep){ var m=/^(\d{1,2}):(\d{2})$/.exec(P.dep); if(m){ var d=new Date(); d.setHours(+m[1],+m[2],0,0); if(d<Date.now()-6e5) d=new Date(+d+864e5); return d; } } return new Date(); }
function levelFor(altFt){ return altFt<1500 ? "180m" : altFt<3700 ? "925hPa" : altFt<7500 ? "850hPa" : "700hPa"; }
// vent prévu au milieu de chaque branche, à l'heure du départ
function fetchWinds(my){ var n=P.pts.length-1; if(n<1) return Promise.resolve(null); var lv=levelFor(P.alt), la=[], lo=[]; for(var i=0;i<n;i++){ var m=mid(P.pts[i],P.pts[i+1],0.5); la.push(m.lat.toFixed(3)); lo.push(m.lon.toFixed(3)); }
  return fetch("https://api.open-meteo.com/v1/forecast?latitude="+la.join(",")+"&longitude="+lo.join(",")+"&hourly=wind_speed_"+lv+",wind_direction_"+lv+"&wind_speed_unit=kn&timeformat=unixtime&forecast_days=2").then(function(r){ return r.json(); }).then(function(j){ if(my!==seq) return null; var arr=Array.isArray(j)?j:[j], t=depTime()/1000;
    return arr.map(function(x){ var H=x&&x.hourly; if(!H||!H.time) return null; var bi=0, bd=1e12; for(var k=0;k<H.time.length;k++){ var dd=Math.abs(H.time[k]-t); if(dd<bd){ bd=dd; bi=k; } } var s=H["wind_speed_"+lv][bi], d=H["wind_direction_"+lv][bi]; return (s==null||d==null)?null:{ k:s, d:d }; }); }); }
function fetchElev(my){ var pts=P.pts, n=pts.length-1; if(n<1) return Promise.resolve(null); var tot=0, L=[]; for(var i=0;i<n;i++){ L.push(distM(pts[i],pts[i+1])); tot+=L[i]; } var N=Math.max(24, Math.min(96, Math.round(tot/NM))), S=[], acc=0;
  for(var j=0;j<n;j++){ var k=Math.max(2, Math.round(N*L[j]/tot)); for(var q=0;q<k;q++){ var f=q/k, m=mid(pts[j],pts[j+1],f); S.push({ lat:m.lat, lon:m.lon, d:acc+L[j]*f, leg:j }); } acc+=L[j]; } S.push({ lat:pts[n].lat, lon:pts[n].lon, d:tot, leg:n-1 }); S=S.slice(0,100);
  return fetch("https://api.open-meteo.com/v1/elevation?latitude="+S.map(function(s){ return s.lat.toFixed(4); }).join(",")+"&longitude="+S.map(function(s){ return s.lon.toFixed(4); }).join(",")).then(function(r){ return r.json(); }).then(function(j){ if(my!==seq || !j || !j.elevation) return null; S.forEach(function(s,i){ s.e=Math.max(0,+j.elevation[i]||0); }); return { S:S, tot:tot }; }); }
function compute(winds){ var pts=P.pts, tas=Math.max(30,+P.ac.tas||150)/1.852, legs=[], tD=0, tT=0, tF=0;
  for(var i=0;i<pts.length-1;i++){ var d=distM(pts[i],pts[i+1])/NM, tr=brg(pts[i],pts[i+1]), w=winds&&winds[i], hd=tr, gs=tas, bad=false;
    if(w && w.k>0){ var a=rad(w.d-tr), sw=w.k*Math.sin(a)/tas; if(Math.abs(sw)>=1){ bad=true; gs=Math.max(5,tas-w.k); } else { var wca=Math.asin(sw); hd=(tr+deg(wca)+360)%360; gs=tas*Math.cos(wca)-w.k*Math.cos(a); if(gs<5){ bad=true; gs=5; } } }
    var t=d/gs*60, f=t/60*(+P.ac.burn||0); legs.push({ d:d, tr:tr, hd:hd, gs:gs, t:t, f:f, w:w, bad:bad }); tD+=d; tT+=t; tF+=f; }
  return { legs:legs, d:tD, t:tT, f:tF, wind:!!winds }; }
function recalc(){ var my=++seq; R=null; elev=null; if(P.pts.length<2){ paint(); return; } R=compute(null); R.pending=true; paint();
  fetchWinds(my).then(function(w){ if(my!==seq) return; R=compute(w); R.pending=false; R.nowind=!w; paintLog(); }).catch(function(){ if(my!==seq) return; R=compute(null); R.pending=false; R.nowind=true; paintLog(); });
  fetchElev(my).then(function(e){ if(my!==seq) return; elev=e; paintProfile(); }).catch(function(){});
  [0,P.pts.length-1].forEach(function(i){ var p=P.pts[i], k=p.lat.toFixed(2)+","+p.lon.toFixed(2); if(wxEnds[k]!==undefined || !A.loadWx) return; wxEnds[k]=null; A.loadWx({ lat:p.lat, lon:p.lon, icao:/^[A-Z]{4}$/.test(p.code||"")?p.code:"" }).then(function(o){ wxEnds[k]=o||false; if(my===seq) paintWx(); }).catch(function(){ wxEnds[k]=false; }); }); }

// ---------- styles ----------
var CSS=""
+".nv-card{background:#fff;border:1px solid var(--line-soft,#eef2f5);border-radius:20px;padding:14px;margin-top:12px;box-shadow:0 4px 14px rgba(13,40,45,.06)}.nv-h{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted,#66727d);margin:0 0 10px}"
+".nv-ac{display:grid;grid-template-columns:1fr 1fr;gap:8px}.nv-ac label{display:block;background:var(--tile,#f7f9fb);border-radius:14px;padding:9px 11px}.nv-ac span{display:block;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#66727d)}"
+".nv-ac div{display:flex;align-items:baseline;gap:5px}.nv-ac input{width:100%;min-width:0;border:0;background:none;font:inherit;font-size:20px;font-weight:800;padding:2px 0;color:var(--text,#0b0d10)}.nv-ac input:focus{outline:0}.nv-ac em{font-style:normal;font-size:12px;font-weight:700;color:var(--muted,#66727d);white-space:nowrap}"
+".nv-pt{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line,#e7ebef)}.nv-pt:first-child{border-top:0;padding-top:0}.nv-pt>i{font-style:normal;width:28px;height:28px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff;background:#c2379f}"
+".nv-pt>i.d{background:#1a9c55}.nv-pt>i.a{background:#12408a}.nv-pt>div{flex:1;min-width:0}.nv-pt b{display:block;font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nv-pt small{font-size:12px;color:var(--muted,#66727d)}"
+".nv-pt button{border:0;background:var(--tile,#f7f9fb);width:32px;height:32px;border-radius:10px;font-size:14px;color:var(--muted,#66727d);cursor:pointer;flex:none}"
+".nv-in{width:100%;box-sizing:border-box;border:1.5px solid var(--line,#e7ebef);border-radius:14px;padding:12px 13px;font:inherit;font-size:15.5px;background:#fff;margin-top:10px}.nv-res{border:1.5px solid var(--line,#e7ebef);border-radius:14px;margin-top:6px;overflow:hidden}"
+".nv-res button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:0;border-top:1px solid var(--line,#e7ebef);background:#fff;padding:10px 12px;font:inherit;font-size:14.5px;cursor:pointer}.nv-res button:first-child{border-top:0}.nv-res i{font-style:normal;font-size:11.5px;font-weight:800;color:#12408a;background:#e6eefb;border-radius:7px;padding:3px 6px;flex:none}.nv-res small{color:var(--muted,#66727d)}"
+".nv-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.nv-chip{border:1.5px solid var(--line,#e7ebef);background:#fff;border-radius:100px;padding:8px 12px;font:inherit;font-size:13px;font-weight:700;color:var(--text,#0b0d10);cursor:pointer}.nv-chip.on{background:#12408a;border-color:#12408a;color:#fff}"
+".nv-map{height:310px;border-radius:18px;overflow:hidden;margin-top:12px;position:relative;z-index:0;background:#e9eef1}.nv-map.pick{box-shadow:0 0 0 3px #c2379f}.nv-mk{width:26px;height:26px;border-radius:50%;background:#c2379f;color:#fff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)}.nv-mk.d{background:#1a9c55}.nv-mk.a{background:#12408a}"
+".nv-tbl{width:100%;border-collapse:collapse;font-size:13px}.nv-tbl th{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#66727d);font-weight:800;text-align:right;padding:0 5px 7px;white-space:nowrap}.nv-tbl th:first-child,.nv-tbl td:first-child{text-align:left}"
+".nv-tbl td{padding:8px 5px;border-top:1px solid var(--line,#e7ebef);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.nv-tbl td b{font-weight:800}.nv-tbl td.cap b{color:#c2379f;font-size:15px}.nv-tbl tr.tot td{font-weight:800;background:#f6f8fb}.nv-tbl tr.bad td{color:#b3261e}.nv-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}"
+".nv-sum{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px}.nv-sum div{background:var(--tile,#f7f9fb);border-radius:14px;padding:10px 6px;text-align:center;min-width:0}.nv-sum b{display:block;font-size:19px;font-weight:900;white-space:nowrap}.nv-sum b small{font-size:11px;font-weight:700;color:var(--muted,#66727d)}.nv-sum span{display:block;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#66727d);margin-top:2px}"
+".nv-ok,.nv-ko,.nv-info{display:flex;align-items:center;gap:9px;margin-top:9px;border-radius:13px;padding:10px 12px;font-size:13.5px;font-weight:700;line-height:1.35}.nv-ok{background:#eaf7f0;color:#12733f}.nv-ko{background:#fdecea;color:#b3261e}.nv-info{background:#eef4fb;color:#12408a}"
+".nv-note{font-size:11.5px;line-height:1.45;color:var(--muted,#66727d);margin-top:10px}.nv-go{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;margin-top:14px;border:0;border-radius:17px;padding:16px;font:inherit;font-size:17px;font-weight:900;color:#fff;background:linear-gradient(135deg,#7a1a63,#c2379f);box-shadow:0 10px 22px rgba(194,55,159,.35);cursor:pointer}.nv-go:active{transform:scale(.98)}"
+".nv-dep{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:14px;font-weight:700}.nv-dep input{border:1.5px solid var(--line,#e7ebef);border-radius:11px;padding:8px 10px;font:inherit;font-size:15px;font-weight:700}"
+".nv-wx{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line,#e7ebef);font-size:13.5px}.nv-wx:first-of-type{border-top:0}.nv-wx em{font-style:normal;font-size:11px;font-weight:900;color:#fff;border-radius:7px;padding:4px 7px;flex:none;min-width:38px;text-align:center}.nv-wx div{flex:1;min-width:0}.nv-wx b{display:block}.nv-wx small{color:var(--muted,#66727d)}"
+".nv-sv{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line,#e7ebef)}.nv-sv:first-of-type{border-top:0}.nv-sv button:first-child{flex:1;min-width:0;text-align:left;border:0;background:none;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text,#0b0d10)}.nv-sv small{color:var(--muted,#66727d);font-weight:600}"
+".nv-toast{position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:10001;background:#0b0d10;color:#fff;font-size:14px;font-weight:700;border-radius:100px;padding:11px 18px;box-shadow:0 8px 24px rgba(0,0,0,.3)}"
// mode vol
+".nv-fly{position:fixed;inset:0;z-index:9000;background:#0a1220;color:#fff;display:flex;flex-direction:column;font-family:inherit}.nv-fmap{flex:1;position:relative;z-index:0;background:#0a1220}"
+".nv-top{position:absolute;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top,0px));z-index:500;background:rgba(10,18,32,.9);backdrop-filter:blur(10px);border-radius:20px;padding:11px 13px;box-shadow:0 8px 24px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12)}"
+".nv-nx{display:flex;align-items:center;gap:10px}.nv-nx>div{flex:1;min-width:0}.nv-nx small{display:block;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#f09ad9}.nv-nx b{display:block;font-size:19px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".nv-x{border:0;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:16px;cursor:pointer;flex:none}"
+".nv-big{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:9px}.nv-big div{text-align:center;min-width:0}.nv-big b{display:block;font-size:25px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}.nv-big b small{font-size:12px;font-weight:700;opacity:.7;margin-left:2px}.nv-big span{display:block;font-size:9.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;opacity:.6}"
+".nv-big .mg b{color:#ff8be0}.nv-cdi{position:relative;height:22px;margin-top:9px;border-radius:11px;background:rgba(255,255,255,.1);overflow:hidden}.nv-cdi:before{content:'';position:absolute;left:50%;top:3px;bottom:3px;width:2px;background:rgba(255,255,255,.6)}"
+".nv-cdi i{position:absolute;top:3px;bottom:3px;width:10px;margin-left:-5px;border-radius:5px;background:#ff5ad2;transition:left .5s}.nv-cdi u{position:absolute;top:8px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:rgba(255,255,255,.35);text-decoration:none}.nv-cdt{font-size:11.5px;font-weight:700;text-align:center;margin-top:4px;opacity:.85}"
+".nv-bot{position:relative;z-index:500;background:#0a1220;padding:10px 10px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(255,255,255,.1)}.nv-st{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.nv-st div{background:rgba(255,255,255,.08);border-radius:13px;padding:8px 2px;text-align:center;min-width:0}"
+".nv-st b{display:block;font-size:19px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}.nv-st b small{font-size:10px;font-weight:700;opacity:.7;margin-left:2px}.nv-st span{display:block;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.6}"
+".nv-bts{display:flex;gap:6px;margin-top:8px}.nv-bts button{flex:1;border:0;border-radius:13px;padding:11px 2px;font:inherit;font-size:12.5px;font-weight:800;color:#fff;background:rgba(255,255,255,.12);cursor:pointer;white-space:nowrap}.nv-bts button.on{background:#c2379f}.nv-bts button.sos{background:#d1343f}"
+".nv-plane{width:44px;height:44px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 5px rgba(0,0,0,.6))}.nv-plane svg{width:40px;height:40px}"
+".nv-near{position:absolute;inset:0;z-index:800;background:rgba(10,18,32,.96);padding:calc(14px + env(safe-area-inset-top,0px)) 12px 14px;overflow-y:auto}.nv-near h3{margin:0 0 10px;font-size:18px;display:flex;justify-content:space-between;align-items:center}"
+".nv-near button.f{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#fff;border-radius:15px;padding:12px;margin-top:8px;font:inherit;cursor:pointer}.nv-near button.f b{display:block;font-size:16px}.nv-near button.f small{display:block;opacity:.7;font-size:12.5px;margin-top:2px}.nv-near button.f em{font-style:normal;font-size:19px;font-weight:900;color:#ff8be0;white-space:nowrap}.nv-near button.f>div{flex:1;min-width:0}"
+".nv-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:600;background:rgba(10,18,32,.9);border-radius:16px;padding:14px 18px;font-size:15px;font-weight:800;text-align:center;max-width:80%}";

// ---------- rendu de la préparation ----------
function ptRow(p,i,n){ var cls=i===0?"d":i===n-1?"a":"", lb=i===0?"D":i===n-1?"A":String(i);
  return '<div class="nv-pt"><i class="'+cls+'">'+lb+'</i><div><b>'+esc(p.name)+'</b><small>'+esc(p.code?p.code+" · ":"")+(i===0?esc(T("Départ")):i===n-1&&n>1?esc(T("Arrivée")):Math.abs(p.lat).toFixed(3)+"° "+(p.lat>=0?"N":"S")+" "+Math.abs(p.lon).toFixed(3)+"° "+(p.lon>=0?"E":"O"))+'</small></div>'
    +(i>0?'<button data-up="'+i+'" aria-label="↑">↑</button>':"")+'<button data-rm="'+i+'" aria-label="✕">✕</button></div>'; }
function paint(){ if(!box) return; killMap(); var n=P.pts.length, sv=lget("lf.ulm.routes",[]);
  var h='<div class="nv-card"><div class="nv-h">'+esc(T("Mon appareil"))+'</div><div class="nv-ac">'
    +'<label><span>'+esc(T("Vitesse de croisière"))+'</span><div><input type="number" inputmode="decimal" data-ac="tas" value="'+esc(P.ac.tas)+'"><em>km/h</em></div></label>'
    +'<label><span>'+esc(T("Consommation"))+'</span><div><input type="number" inputmode="decimal" data-ac="burn" value="'+esc(P.ac.burn)+'"><em>L/h</em></div></label>'
    +'<label><span>'+esc(T("Carburant à bord"))+'</span><div><input type="number" inputmode="decimal" data-ac="fuel" value="'+esc(P.ac.fuel)+'"><em>L</em></div></label>'
    +'<label><span>'+esc(T("Altitude de croisière"))+'</span><div><input type="number" inputmode="numeric" data-ac="alt" step="500" value="'+esc(P.alt)+'"><em>ft</em></div></label></div></div>';
  h+='<div class="nv-card"><div class="nv-h">'+esc(T("Ma route"))+'</div><div id="nvPts">'+P.pts.map(function(p,i){ return ptRow(p,i,n); }).join("")+'</div>'
    +'<input class="nv-in" id="nvQ" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="＋ '+esc(T("Ajouter un terrain (nom, ville ou code)"))+'"><div id="nvRes"></div>'
    +'<div class="nv-row"><button class="nv-chip'+(addOnMap?" on":"")+'" data-act="pick">📍 '+esc(T(addOnMap?"Touche la carte pour poser le point":"Ajouter un point sur la carte"))+'</button>'
    +(n>=2?'<button class="nv-chip" data-act="rt">↩ '+esc(T("Aller-retour"))+'</button><button class="nv-chip" data-act="rev">⇅ '+esc(T("Inverser"))+'</button>':"")+(n?'<button class="nv-chip" data-act="clr">✕ '+esc(T("Effacer"))+'</button>':"")
    +'<button class="nv-chip'+(aero?" on":"")+'" data-act="aero">🗺️ '+esc(T("Carte aéronautique"))+'</button></div><div class="nv-map'+(addOnMap?" pick":"")+'" id="nvMap"></div></div>';
  if(n<2) h+='<div class="nv-card"><div class="nv-note" style="margin:0;font-size:13.5px;text-align:center">'+esc(T("Ajoute au moins un départ et une arrivée pour calculer ton vol."))+'</div></div>';
  else h+='<div id="nvLog"></div><div id="nvProf"></div><div id="nvWx"></div><button class="nv-go" data-act="fly">▶ '+esc(T("Démarrer la navigation"))+'</button><div class="nv-row" style="justify-content:center"><button class="nv-chip" data-act="save">💾 '+esc(T("Enregistrer la route"))+'</button><button class="nv-chip" data-act="gpx">⬇ '+esc(T("Exporter en GPX"))+'</button></div>';
  if(sv.length) h+='<div class="nv-card"><div class="nv-h">'+esc(T("Mes routes"))+'</div>'+sv.map(function(r,i){ return '<div class="nv-sv"><button data-load="'+i+'">'+esc(r.name)+' <small>· '+r.pts.length+' pts</small></button><button class="nv-chip" data-del="'+i+'" style="padding:6px 10px">✕</button></div>'; }).join("")+'</div>';
  h+='<div class="nv-note" style="text-align:center;margin:14px 6px 0">'+esc(T("Routes vraies (géographiques). Aide à la préparation : ne remplace pas la carte officielle, les NOTAM, le SUP AIP ni la météo officielle."))+'</div>';
  box.innerHTML=h; bindSearch(); setTimeout(paintMap,30); if(n>=2){ paintLog(); paintProfile(); paintWx(); } }
function paintLog(){ var el=box&&box.querySelector("#nvLog"); if(!el || !R) return; var pts=P.pts, cum=0, dep=depTime(), h='<div class="nv-card"><div class="nv-h">'+esc(T("Log de navigation"))+'</div><div class="nv-scroll"><table class="nv-tbl"><tr><th>'+esc(T("Branche"))+'</th><th>'+esc(T("Route"))+'</th><th>'+esc(T("Cap"))+'</th><th>'+esc(T("Dist."))+'</th><th>'+esc(T("Vent"))+'</th><th>'+esc(T("Vit. sol"))+'</th><th>'+esc(T("Temps"))+'</th><th>'+esc(T("Carb."))+'</th></tr>';
  R.legs.forEach(function(l,i){ cum+=l.t; h+='<tr class="'+(l.bad?"bad":"")+'"><td><b>'+(i===0?"D":i)+" → "+(i===R.legs.length-1?"A":i+1)+'</b><br><small style="color:#66727d">'+esc(String(pts[i+1].name).slice(0,16))+'</small></td><td>'+d3(l.tr)+'</td><td class="cap"><b>'+d3(l.hd)+'</b></td><td>'+l.d.toFixed(1)+' NM<br><small style="color:#66727d">'+Math.round(l.d*1.852)+' km</small></td><td>'+(l.w?d3(l.w.d)+"<br>"+Math.round(l.w.k)+" kt":"–")+'</td><td>'+Math.round(l.gs)+' kt<br><small style="color:#66727d">'+Math.round(l.gs*1.852)+' km/h</small></td><td><b>'+fDur(l.t)+'</b><br><small style="color:#66727d">'+hm(new Date(+dep+cum*60000))+'</small></td><td>'+l.f.toFixed(1)+' L</td></tr>'; });
  h+='<tr class="tot"><td>'+esc(T("Total"))+'</td><td></td><td></td><td>'+R.d.toFixed(1)+' NM</td><td></td><td></td><td>'+fDur(R.t)+'</td><td>'+R.f.toFixed(1)+' L</td></tr></table></div>';
  var need=R.f+(+P.ac.burn||0)*0.5, have=+P.ac.fuel||0, arr=new Date(+dep+R.t*60000), last=pts[pts.length-1], sun=A.sunTimes?A.sunTimes(last.lat,last.lon,arr):null, night=sun?new Date(+sun.set+18e5):null;
  h+='<div class="nv-sum"><div><b>'+R.d.toFixed(0)+'<small> NM</small></b><span>'+esc(T("Distance"))+" · "+Math.round(R.d*1.852)+' km</span></div><div><b>'+fDur(R.t)+'</b><span>'+esc(T("Durée de vol"))+'</span></div><div><b>'+need.toFixed(0)+'<small> L</small></b><span>'+esc(T("Carburant nécessaire"))+'</span></div></div>';
  h+='<div class="nv-dep"><span>'+esc(T("Heure de départ"))+'</span><input type="time" id="nvDep" value="'+esc(P.dep||hm(new Date()))+'"><span style="color:#66727d;font-weight:600">→ '+esc(T("Arrivée estimée"))+' <b style="color:#0b0d10">'+hm(arr)+'</b></span></div>';
  h+= have>=need ? '<div class="nv-ok">⛽ '+esc(T("Carburant suffisant"))+" ("+esc(T("dont 30 min de réserve"))+") · "+esc(T("marge"))+" "+(have-need).toFixed(0)+' L</div>' : '<div class="nv-ko">⛽ '+esc(T("Carburant insuffisant"))+" ("+esc(T("dont 30 min de réserve"))+") · "+esc(T("il manque"))+" "+(need-have).toFixed(0)+' L</div>';
  if(night) h+= arr<=night ? '<div class="nv-ok">☀️ '+esc(T("Arrivée de jour"))+" · "+esc(T("Nuit aéronautique à l'arrivée"))+" "+hm(night)+'</div>' : '<div class="nv-ko">🌙 '+esc(T("Arrivée après la nuit aéronautique"))+" ("+hm(night)+')</div>';
  if(R.legs.some(function(l){ return l.bad; })) h+='<div class="nv-ko">💨 '+esc(T("Vent trop fort pour tenir la route sur cette branche"))+'</div>';
  h+='<div class="nv-info">💨 '+esc(R.pending?T("Calcul du vent…"):R.nowind?T("Vent indisponible : calcul sans vent"):T("Vent prévu à l'altitude de croisière")+" ("+nf(P.alt)+" ft)")+'</div></div>';
  el.innerHTML=h; var di=el.querySelector("#nvDep"); if(di) di.addEventListener("change", function(){ P.dep=di.value; savePlan(); recalc(); }); }
function paintProfile(){ var el=box&&box.querySelector("#nvProf"); if(!el) return; if(!elev){ el.innerHTML=""; return; } var S=elev.S, W=320, H=130, x0=36, y0=8, y1=H-18, altM=P.alt/FT, mx=0, hi=null; S.forEach(function(s){ if(s.e>mx){ mx=s.e; hi=s; } });
  var top=Math.max(altM*1.15, mx*1.25, 300), X=function(d){ return x0+(W-x0-4)*d/elev.tot; }, Y=function(m){ return y1-(y1-y0)*m/top; }, d="M"+x0+" "+y1+" ";
  S.forEach(function(s){ d+="L"+X(s.d).toFixed(1)+" "+Y(s.e).toFixed(1)+" "; }); d+="L"+X(elev.tot).toFixed(1)+" "+y1+" Z"; var g="";
  for(var i=0;i<=2;i++){ var m=top*i/2; g+='<line x1="'+x0+'" y1="'+Y(m).toFixed(1)+'" x2="'+(W-4)+'" y2="'+Y(m).toFixed(1)+'" stroke="#e3e9f0"/><text x="'+(x0-4)+'" y="'+(Y(m)+3.5).toFixed(1)+'" text-anchor="end" font-size="9.5" fill="#66727d">'+nf(m*FT)+'</text>'; }
  var acc=0; R&&R.legs.forEach(function(l,i){ acc+=l.d*NM; if(i<R.legs.length-1) g+='<line x1="'+X(acc).toFixed(1)+'" y1="'+y0+'" x2="'+X(acc).toFixed(1)+'" y2="'+y1+'" stroke="#c2379f" stroke-dasharray="3 3" opacity=".5"/>'; });
  var clr=(altM-mx)*FT, ok=clr>=500;
  el.innerHTML='<div class="nv-card"><div class="nv-h">'+esc(T("Profil du relief"))+'</div><svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+g+'<path d="'+d+'" fill="#b9a183" stroke="#7d6a4d" stroke-width="1.2"/><line x1="'+x0+'" y1="'+Y(altM).toFixed(1)+'" x2="'+(W-4)+'" y2="'+Y(altM).toFixed(1)+'" stroke="#c2379f" stroke-width="2.2"/><text x="'+(W-6)+'" y="'+(Y(altM)-4).toFixed(1)+'" text-anchor="end" font-size="10" font-weight="700" fill="#c2379f">'+nf(P.alt)+' ft</text><text x="'+x0+'" y="'+(H-5)+'" font-size="9.5" fill="#66727d">0</text><text x="'+(W-4)+'" y="'+(H-5)+'" text-anchor="end" font-size="9.5" fill="#66727d">'+(elev.tot/NM).toFixed(0)+' NM</text></svg>'
    +'<div class="'+(ok?"nv-ok":"nv-ko")+'">⛰️ '+esc(T("Point le plus haut"))+" : "+nf(mx*FT)+" ft · "+esc(T("Marge sur le relief"))+" : "+nf(clr)+' ft</div>'+(ok?"":'<div class="nv-note" style="color:#b3261e;font-weight:700">'+esc(T("Marge insuffisante : monte ou contourne le relief"))+'</div>')+'</div>'; }
function paintWx(){ var el=box&&box.querySelector("#nvWx"); if(!el) return; var rows=""; [0,P.pts.length-1].forEach(function(i){ var p=P.pts[i], o=wxEnds[p.lat.toFixed(2)+","+p.lon.toFixed(2)]; if(!o) return; var c=A.fltCat(o), w=o.wind||{};
    rows+='<div class="nv-wx"><em style="background:'+c[2]+'">'+c[0]+'</em><div><b>'+esc(p.name)+'</b><small>'+esc(o.st.id)+" · "+(w.spd==null?"":(w.dir!=null&&!w.vrb?d3(w.dir)+" ":"")+w.spd+" kt"+(w.gust?" G"+w.gust:"")+" · ")+(o.ceil!=null?nf(o.ceil)+" ft · ":"")+(o.vis!=null?(o.vis>=10000?"10 km+":nf(o.vis)+" m"):"")+(o.qnh?" · QNH "+o.qnh:"")+'</small></div></div>'; });
  el.innerHTML=rows?'<div class="nv-card"><div class="nv-h">'+esc(T("Météo départ et arrivée"))+'</div>'+rows+'</div>':""; }
function killMap(){ if(map){ try{ map.remove(); }catch(e){} map=null; lay=null; } }
function tiles(m, dark){ L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{ maxZoom:18, attribution:"© OpenStreetMap" }).addTo(m); if(aero) L.tileLayer("https://nwy-tiles-api.prod.newaydata.com/tiles/{z}/{x}/{y}.png?path=latest/aero/latest",{ minZoom:7, maxZoom:12, maxNativeZoom:12, opacity:.9, attribution:"© open flightmaps" }).addTo(m); }
function mkIcon(i,n){ return L.divIcon({ className:"", html:'<div class="nv-mk '+(i===0?"d":i===n-1?"a":"")+'">'+(i===0?"D":i===n-1?"A":i)+'</div>', iconSize:[26,26], iconAnchor:[13,13] }); }
function paintMap(){ var el=box&&box.querySelector("#nvMap"); if(!el || !window.L) return; killMap(); map=L.map(el,{ zoomControl:false }); tiles(map); var n=P.pts.length, ll=P.pts.map(function(p){ return [p.lat,p.lon]; });
  if(n>1){ L.polyline(ll,{ color:"#fff", weight:7, opacity:.9, interactive:false }).addTo(map); L.polyline(ll,{ color:"#c2379f", weight:4, interactive:false }).addTo(map); }
  P.pts.forEach(function(p,i){ var m=L.marker([p.lat,p.lon],{ icon:mkIcon(i,n), draggable:!p.code }).addTo(map); m.on("dragend", function(){ var q=m.getLatLng(); p.lat=q.lat; p.lon=q.lng; savePlan(); recalc(); }); });
  if(n>1) map.fitBounds(L.latLngBounds(ll),{ padding:[30,30], maxZoom:11 }); else if(n===1) map.setView(ll[0],9); else map.setView([46.6,2.4],5);
  map.on("click", function(e){ if(!addOnMap) return; var k=P.pts.filter(function(p){ return !p.code; }).length+1; addPt({ name:T("Point")+" "+k, code:"", lat:e.latlng.lat, lon:e.latlng.lng }); }); }
function addPt(p){ var n=P.pts.length; if(n>=2 && addOnMap===false && false){} P.pts.push(p); if(P.pts.length>20) P.pts=P.pts.slice(0,20); addOnMap=false; savePlan(); recalc(); }
function bindSearch(){ var q=box.querySelector("#nvQ"), res=box.querySelector("#nvRes"), t=null; if(!q) return;
  q.addEventListener("input", function(){ clearTimeout(t); t=setTimeout(function(){ var v=q.value; if(v.trim().length<2){ res.innerHTML=""; return; } A.loadDB().then(function(){ if(q.value!==v) return; var l=A.search(v).slice(0,7);
      res.innerHTML=l.length?'<div class="nv-res">'+l.map(function(a){ return '<button data-add="'+esc(a.code)+'"><i>'+esc(a.code)+'</i><span><b>'+esc(a.name)+'</b> <small>'+esc(a.city||"")+'</small></span></button>'; }).join("")+'</div>':""; }).catch(function(){}); }, 180); });
  box.querySelectorAll("[data-ac]").forEach(function(i){ i.addEventListener("change", function(){ var v=parseFloat(String(i.value).replace(",",".")); if(!(v>0)) return; if(i.dataset.ac==="alt") P.alt=Math.min(18000,Math.max(300,v)); else P.ac[i.dataset.ac]=v; savePlan(); recalc(); }); }); }
function gpx(){ var x='<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Lite Foil" xmlns="http://www.topografix.com/GPX/1/1">\n<rte><name>'+esc(routeName())+'</name>\n'+P.pts.map(function(p){ return '<rtept lat="'+p.lat.toFixed(6)+'" lon="'+p.lon.toFixed(6)+'"><name>'+esc(p.code||p.name)+'</name></rtept>'; }).join("\n")+'\n</rte>\n</gpx>\n';
  try{ var b=new Blob([x],{ type:"application/gpx+xml" }), f=new File([b], routeName().replace(/[^\w-]+/g,"_")+".gpx", { type:"application/gpx+xml" }); if(navigator.canShare && navigator.canShare({ files:[f] })){ navigator.share({ files:[f], title:routeName() }).catch(function(){}); return; }
    var a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=f.name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 800); }catch(e){} }
function routeName(){ var p=P.pts; return p.length ? (p[0].code||p[0].name)+" → "+(p[p.length-1].code||p[p.length-1].name) : "Route"; }
function onClick(e){ var b=e.target.closest("button"); if(!b || !box.contains(b)) return; var d=b.dataset;
  if(d.add){ var f=A.byCode(d.add); if(f){ addPt(ptOf(f)); } return; }
  if(d.rm!=null){ P.pts.splice(+d.rm,1); savePlan(); return recalc(); }
  if(d.up!=null){ var i=+d.up, x=P.pts[i]; P.pts[i]=P.pts[i-1]; P.pts[i-1]=x; savePlan(); return recalc(); }
  if(d.load!=null){ var r=lget("lf.ulm.routes",[])[+d.load]; if(r){ P.pts=JSON.parse(JSON.stringify(r.pts)); if(r.alt) P.alt=r.alt; savePlan(); recalc(); try{ window.scrollTo({top:0,behavior:"smooth"}); }catch(x2){} } return; }
  if(d.del!=null){ var l=lget("lf.ulm.routes",[]); l.splice(+d.del,1); lset("lf.ulm.routes",l); return paint(); }
  switch(d.act){
    case "pick": addOnMap=!addOnMap; paint(); if(addOnMap){ var m=box.querySelector("#nvMap"); if(m) m.scrollIntoView({ block:"center", behavior:"smooth" }); } return;
    case "aero": aero=!aero; lset("lf.ulm.aero",aero); return paint();
    case "rt": P.pts.push(JSON.parse(JSON.stringify(P.pts[0]))); savePlan(); return recalc();
    case "rev": P.pts.reverse(); savePlan(); return recalc();
    case "clr": P.pts=[]; savePlan(); return recalc();
    case "save": var l2=lget("lf.ulm.routes",[]).filter(function(r){ return r.name!==routeName(); }); l2.unshift({ name:routeName(), pts:P.pts, alt:P.alt }); lset("lf.ulm.routes", l2.slice(0,15)); toast(T("Route enregistrée.")); return paint();
    case "gpx": return gpx();
    case "fly": return startFly();
  } }

// ---------- navigation en vol ----------
var PLANE='<svg viewBox="0 0 48 48"><path d="M24 3c1.800 0 3 2.200 3 5v9l15 9v4l-15-4.500V35l4.500 3.500V42L24 40l-7.500 2v-3.500L21 35v-9.500L6 30v-4l15-9V8c0-2.800 1.200-5 3-5z" fill="#fff" stroke="#0a1220" stroke-width="1.6" stroke-linejoin="round"/></svg>';
function say(txt){ if(!FLY || !FLY.voice) return; try{ var u=new SpeechSynthesisUtterance(txt), i=A.lang(); u.lang=i===1?"en-GB":i===2?"es-ES":"fr-FR"; u.rate=1.02; speechSynthesis.cancel(); speechSynthesis.speak(u); }catch(e){} }
function startFly(sim){ if(P.pts.length<2 || FLY) return; killMap();
  var el=document.createElement("div"); el.className="nv-fly"; el.setAttribute("data-no-i18n","");
  el.innerHTML='<div class="nv-fmap" id="nvFMap"><div class="nv-top"><div class="nv-nx"><div><small>'+esc(T("Prochain point"))+'</small><b id="nvNx">–</b></div><button class="nv-x" data-f="quit" aria-label="'+esc(T("Quitter"))+'">✕</button></div>'
    +'<div class="nv-big"><div><b id="nvDs">–</b><span>'+esc(T("Distance"))+'</span></div><div class="mg"><b id="nvBg">–</b><span>'+esc(T("Cap à suivre"))+'</span></div><div><b id="nvEt">–</b><span>'+esc(T("Temps"))+'</span></div></div>'
    +'<div class="nv-cdi"><u style="left:10%"></u><u style="left:30%"></u><u style="left:70%"></u><u style="left:90%"></u><i id="nvCd" style="left:50%"></i></div><div class="nv-cdt" id="nvCt">'+esc(T("Recherche du signal GPS…"))+'</div></div><div class="nv-msg" id="nvMsg">'+esc(T("Recherche du signal GPS…"))+'</div></div>'
    +'<div class="nv-bot"><div class="nv-st"><div><b id="nvGs">–</b><span>'+esc(T("Vitesse sol"))+'</span></div><div><b id="nvAl">–</b><span>'+esc(T("Altitude"))+'</span></div><div><b id="nvRm">–</b><span>'+esc(T("Reste"))+'</span></div><div><b id="nvEa">–</b><span>'+esc(T("Arrivée"))+'</span></div></div>'
    +'<div class="nv-bts"><button data-f="center" class="on">◎ '+esc(T("Recentrer"))+'</button><button data-f="next">⏭ '+esc(T("Suivant"))+'</button><button data-f="near" class="sos">🛬 '+esc(T("Terrain proche"))+'</button><button data-f="voice" class="on">🔊 '+esc(T("Voix"))+'</button></div></div>';
  document.body.appendChild(el);
  FLY={ el:el, pts:JSON.parse(JSON.stringify(P.pts)), i:1, pos:null, trk:null, follow:true, voice:true, trail:[], last:null, done:false, sim:!!sim };
  var m=L.map(el.querySelector("#nvFMap"),{ zoomControl:false, attributionControl:true }); FLY.map=m; tiles(m); m.setView([FLY.pts[0].lat,FLY.pts[0].lon],11);
  FLY.line=L.polyline(FLY.pts.map(function(p){ return [p.lat,p.lon]; }),{ color:"#ff5ad2", weight:5, opacity:.95, interactive:false }).addTo(m); FLY.act=L.polyline([],{ color:"#fff", weight:2.5, dashArray:"6 7", interactive:false }).addTo(m); FLY.tr=L.polyline([],{ color:"#35d0ff", weight:3, opacity:.9, interactive:false }).addTo(m);
  FLY.pts.forEach(function(p,i){ L.marker([p.lat,p.lon],{ icon:mkIcon(i,FLY.pts.length), interactive:false }).addTo(m); });
  FLY.me=L.marker([FLY.pts[0].lat,FLY.pts[0].lon],{ icon:L.divIcon({ className:"", html:'<div class="nv-plane" id="nvPl">'+PLANE+'</div>', iconSize:[44,44], iconAnchor:[22,22] }), interactive:false, zIndexOffset:900 }).addTo(m);
  m.on("dragstart", function(){ FLY.follow=false; el.querySelector('[data-f="center"]').classList.remove("on"); });
  el.addEventListener("click", flyClick);
  try{ if(navigator.wakeLock) navigator.wakeLock.request("screen").then(function(w){ if(FLY) FLY.wl=w; else w.release(); }).catch(function(){}); }catch(e){}
  if(sim) simulate(); else if(navigator.geolocation){ FLY.watch=navigator.geolocation.watchPosition(function(g){ onPos({ lat:g.coords.latitude, lon:g.coords.longitude, alt:g.coords.altitude, spd:g.coords.speed, hdg:g.coords.heading, t:g.timestamp||Date.now() }); }, function(){ var mm=el.querySelector("#nvMsg"); if(mm) mm.textContent=T("Position indisponible. Autorise la localisation."); }, { enableHighAccuracy:true, maximumAge:1000, timeout:20000 }); }
  toast(T("L'écran reste allumé pendant la navigation. Garde toujours la carte officielle et le regard dehors."));
  setTimeout(function(){ if(FLY) say(T("Prochain point :")+" "+spk(FLY.pts[1])+", "+T("cap")+" "+Math.round(brg(FLY.pts[0],FLY.pts[1]))); }, 900); }
function spk(p){ return p.name; }
function simulate(){ var k=0, seg=0, spd=(+P.ac.tas||150)/3.6*14; FLY.simT=setInterval(function(){ if(!FLY) return; var a=FLY.pts[seg], b=FLY.pts[seg+1]; if(!b){ clearInterval(FLY.simT); return; } var d=distM(a,b); k+=spd/d; if(k>=1){ k=0; seg++; if(!FLY.pts[seg+1]){ onPos({ lat:b.lat, lon:b.lon, alt:(b.elev||0)/FT, spd:0, t:Date.now() }); clearInterval(FLY.simT); return; } a=FLY.pts[seg]; b=FLY.pts[seg+1]; }
    var p=mid(a,b,k), off=Math.sin(k*Math.PI)*0.004; onPos({ lat:p.lat+off, lon:p.lon+off, alt:P.alt/FT, spd:(+P.ac.tas||150)/3.6, t:Date.now() }); }, 1000); }
function onPos(g){ if(!FLY) return; var F=FLY, el=F.el, p={ lat:g.lat, lon:g.lon }, mm=el.querySelector("#nvMsg"); if(mm) mm.remove();
  var gs=(g.spd!=null && isFinite(g.spd) && g.spd>=0) ? g.spd : (F.last ? distM(F.last,p)/Math.max(0.5,(g.t-F.last.t)/1000) : 0);
  if(F.last && distM(F.last,p)>25) F.trk=brg(F.last,p); else if(g.hdg!=null && isFinite(g.hdg) && gs>3) F.trk=g.hdg;
  if(!F.last || distM(F.last,p)>25){ F.last={ lat:p.lat, lon:p.lon, t:g.t }; F.trail.push([p.lat,p.lon]); if(F.trail.length>600) F.trail.shift(); F.tr.setLatLngs(F.trail); }
  F.pos=p; F.gs=gs; F.me.setLatLng([p.lat,p.lon]); var pl=el.querySelector("#nvPl"); if(pl && F.trk!=null) pl.style.transform="rotate("+F.trk+"deg)"; if(F.follow) F.map.setView([p.lat,p.lon], F.map.getZoom(), { animate:true });
  // passage au point suivant
  while(!F.done){ var to=F.pts[F.i], fr=F.pts[F.i-1], dTo=distM(p,to), leg=distM(fr,to), passed=F.direct?false:(distM(fr,p)*Math.cos(rad(brg(fr,p)-brg(fr,to)))>=leg);
    if(dTo<(F.i===F.pts.length-1?600:1300) || (passed && dTo<6000)){ if(F.i>=F.pts.length-1){ F.done=true; say(T("Tu es arrivé")+" : "+spk(to)); break; } F.i++; F.direct=false; var nx=F.pts[F.i]; say(spk(to)+" "+T("atteint")+". "+T("Prochain point :")+" "+spk(nx)+", "+T("cap")+" "+Math.round(brg(p,nx))+", "+Math.round(distM(p,nx)/NM)+" "+T("nautiques")); } else break; }
  var to2=F.pts[F.i], fr2=F.direct?F.direct:F.pts[F.i-1], d2=distM(p,to2), b2=brg(p,to2), kt=gs*1.94384, set=function(id,v){ var e=el.querySelector("#"+id); if(e && e.dataset.v!==v){ e.dataset.v=v; e.innerHTML=v; } };
  F.act.setLatLngs([[p.lat,p.lon],[to2.lat,to2.lon]]);
  set("nvNx", F.done ? "✓ "+esc(T("Tu es arrivé")) : esc((to2.code?to2.code+" · ":"")+to2.name)); set("nvDs", (d2/NM).toFixed(d2<18520?1:0)+"<small>NM</small>"); set("nvBg", d3(b2)); set("nvEt", kt>15 ? fDur(d2/NM/kt*60) : "–");
  // écart de route (positif = à droite de la route)
  var xt=Math.asin(Math.sin(distM(fr2,p)/6371000)*Math.sin(rad(brg(fr2,p)-brg(fr2,to2))))*6371000, xn=xt/NM, cd=el.querySelector("#nvCd"); if(cd) cd.style.left=Math.max(4,Math.min(96,50-xn/2*40))+"%";
  set("nvCt", Math.abs(xn)<0.15 ? "✓ "+esc(T("Sur la route")) : esc(T("Écart de route"))+" : "+Math.abs(xn).toFixed(1)+" NM "+esc(T(xn>0?"à droite":"à gauche")));
  var rem=d2; for(var j=F.i;j<F.pts.length-1;j++) rem+=distM(F.pts[j],F.pts[j+1]);
  set("nvGs", Math.round(kt)+"<small>kt</small>"); set("nvAl", (g.alt!=null && isFinite(g.alt)) ? nf(g.alt*FT)+"<small>ft</small>" : "–"); set("nvRm", (rem/NM).toFixed(0)+"<small>NM</small>"); set("nvEa", kt>15 ? hm(new Date(Date.now()+rem/NM/kt*3600000)) : "–"); }
function flyClick(e){ var b=e.target.closest("button"); if(!b || !FLY) return; var F=FLY, d=b.dataset;
  if(d.f==="quit"){ if(!F.done && !confirm(T("Quitter la navigation ?"))) return; return stopFly(); }
  if(d.f==="center"){ F.follow=true; b.classList.add("on"); if(F.pos) F.map.setView([F.pos.lat,F.pos.lon], Math.max(F.map.getZoom(),11)); return; }
  if(d.f==="voice"){ F.voice=!F.voice; b.classList.toggle("on", F.voice); if(!F.voice){ try{ speechSynthesis.cancel(); }catch(x){} } return; }
  if(d.f==="next"){ if(F.i<F.pts.length-1){ F.i++; F.direct=F.pos?{ lat:F.pos.lat, lon:F.pos.lon }:null; if(F.pos) onPos({ lat:F.pos.lat, lon:F.pos.lon, spd:F.gs, t:Date.now() }); } return; }
  if(d.f==="near"){ var ref=F.pos||F.pts[0]; A.loadDB().then(function(){ if(!FLY) return; var l=A.nearest(ref.lat,ref.lon,8), h='<div class="nv-near" id="nvNear"><h3>🛬 '+esc(T("Terrains les plus proches"))+'<button class="nv-x" data-f="nclose">✕</button></h3>'
      +l.map(function(x){ var a=x[1], rw=(a.rw||[]).slice().sort(function(u,v){ return (v[2]||0)-(u[2]||0); })[0]; return '<button class="f" data-direct="'+esc(a.code)+'"><div><b>'+esc(a.name)+'</b><small>'+esc(a.code)+(rw?" · "+esc(T("piste"))+" "+esc(rw[0]+"/"+rw[1])+" · "+(rw[2]||"?")+" m":"")+(a.fq&&a.fq[0]?" · "+a.fq[0][1].toFixed(3):"")+'</small></div><em>'+d3(brg(ref,a))+" · "+(x[0]/1.852).toFixed(1)+' NM</em></button>'; }).join("")+'</div>';
      var o=F.el.querySelector("#nvNear"); if(o) o.remove(); F.el.querySelector("#nvFMap").insertAdjacentHTML("beforeend", h); }); return; }
  if(d.f==="nclose"){ var o2=F.el.querySelector("#nvNear"); if(o2) o2.remove(); return; }
  if(d.direct){ var f=A.byCode(d.direct), o3=F.el.querySelector("#nvNear"); if(o3) o3.remove(); if(!f) return; var here=F.pos||F.pts[0]; F.pts=[{ name:"", lat:here.lat, lon:here.lon }, ptOf(f)]; F.i=1; F.done=false; F.direct={ lat:here.lat, lon:here.lon };
    F.line.setLatLngs([[here.lat,here.lon],[f.lat,f.lon]]); L.marker([f.lat,f.lon],{ icon:mkIcon(1,2), interactive:false }).addTo(F.map); say(T("Direct vers")+" "+f.name+", "+T("cap")+" "+Math.round(brg(here,f))+", "+Math.round(distM(here,f)/NM)+" "+T("nautiques")); if(F.pos) onPos({ lat:F.pos.lat, lon:F.pos.lon, spd:F.gs, t:Date.now() }); return; } }
function stopFly(){ if(!FLY) return; var F=FLY; FLY=null; try{ if(F.watch!=null) navigator.geolocation.clearWatch(F.watch); }catch(e){} if(F.simT) clearInterval(F.simT); try{ if(F.wl) F.wl.release(); }catch(e){} try{ speechSynthesis.cancel(); }catch(e){} try{ F.map.remove(); }catch(e){} F.el.remove(); paint(); }

window.LFNav={ show:function(el, api){ A=api; if(box!==el){ box=el; box.addEventListener("click", onClick); if(!document.getElementById("nvCss")){ var st=document.createElement("style"); st.id="nvCss"; st.textContent=CSS; document.head.appendChild(st); } }
    if(!P){ loadPlan(); aero=!!lget("lf.ulm.aero",false); if(!P.pts.length && api.field) P.pts.push(ptOf(api.field)); }
    if(P.pts.length>=2 && !R) recalc(); else paint(); },
  _sim:function(){ startFly(true); }, _state:function(){ return { P:P, R:R, FLY:FLY }; } };
})();
