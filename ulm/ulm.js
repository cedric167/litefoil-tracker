// Lite Foil : espace ULM / Avion (14/11/2026)
// Météo aéronautique d'un terrain : METAR et TAF décodés, rose des vents avec les pistes, vent de face et de travers,
// couches nuageuses, prévisions, vent en altitude, informations terrain, tendances sur 24 h.
// Données : METAR / TAF publics (aviationweather.gov via la fonction aeroWx, secours metar.vatsim.net),
// terrains OurAirports (domaine public), prévisions Open-Meteo.
(function(){
"use strict";
var API = "https://europe-west1-litefoil-communaute-222fd.cloudfunctions.net/aeroWx";
var mode = "wx"; try{ if(localStorage.getItem("lf.ulm.mode")==="nav") mode="nav"; }catch(e){}
var root = null, DB = null, dbP = null, F = null, WX = null, view = "metar", rwSel = "", hist = null, fc = null, seq = 0, lastLoad = 0, apiDown = false;

// ---------- langue (fr / en / es) ----------
var TR = {
 "Rechercher un terrain":["Find an airfield","Buscar un campo"],
 "Nom, ville ou code (LFMP, LF6651…)":["Name, town or code (LFMP, LF6651…)","Nombre, ciudad o código (LFMP, LF6651…)"],
 "📍 Terrains autour de moi":["📍 Airfields near me","📍 Campos cerca de mí"],
 "Mes terrains":["My airfields","Mis campos"],
 "Chargement…":["Loading…","Cargando…"],
 "Aucun terrain trouvé.":["No airfield found.","Ningún campo encontrado."],
 "Position indisponible. Autorise la localisation ou cherche un terrain par son nom.":["Location unavailable. Allow location or search an airfield by name.","Ubicación no disponible. Autoriza la localización o busca un campo por su nombre."],
 "Choisis ton terrain : base ULM, aérodrome ou aéroport. Tu y retrouves le METAR, le TAF, le vent sur la piste et les prévisions.":["Pick your airfield: ultralight base, aerodrome or airport. You get the METAR, the TAF, the wind on the runway and the forecast.","Elige tu campo: base ULM, aeródromo o aeropuerto. Tendrás el METAR, el TAF, el viento en pista y las previsiones."],
 "Base ULM / aérodrome":["Ultralight base / airfield","Base ULM / aeródromo"], "Aérodrome":["Aerodrome","Aeródromo"], "Aéroport":["Airport","Aeropuerto"],
 "Prévisions":["Forecast","Previsiones"], "Terrain":["Airfield","Campo"], "Tendances":["Trends","Tendencias"],
 "Ajouter à mes terrains":["Add to my airfields","Añadir a mis campos"], "Retirer de mes terrains":["Remove from my airfields","Quitar de mis campos"],
 "Station météo":["Weather station","Estación meteo"], "Observation de":["Observed at","Observación de"], "à":["at","a"],
 "il y a":["","hace"], "min":["min","min"], "ago":["ago",""],
 "Aucun METAR disponible près de ce terrain pour le moment.":["No METAR available near this airfield right now.","Ningún METAR disponible cerca de este campo por ahora."],
 "Connexion impossible. Vérifie le réseau puis réessaie.":["Connection failed. Check the network and try again.","Conexión imposible. Comprueba la red y vuelve a intentarlo."],
 "Réessayer":["Retry","Reintentar"], "Actualiser":["Refresh","Actualizar"],
 "Conditions de vol":["Flight conditions","Condiciones de vuelo"],
 "Bonnes conditions à vue":["Good visual conditions","Buenas condiciones visuales"], "Conditions à vue limites":["Marginal visual conditions","Condiciones visuales marginales"],
 "Vol aux instruments":["Instrument conditions","Condiciones instrumentales"], "Très mauvaises conditions":["Very poor conditions","Condiciones muy malas"],
 "Vent":["Wind","Viento"], "Calme":["Calm","Calma"], "Variable":["Variable","Variable"], "rafales":["gusts","rachas"], "variable de":["variable from","variable de"],
 "Visibilité":["Visibility","Visibilidad"], "Plafond":["Ceiling","Techo"], "Base des nuages":["Cloud base","Base de nubes"], "Aucun plafond":["No ceiling","Sin techo"],
 "Pression (QNH)":["Pressure (QNH)","Presión (QNH)"], "Température":["Temperature","Temperatura"], "Point de rosée":["Dew point","Punto de rocío"], "Humidité":["Humidity","Humedad"],
 "Soleil":["Sun","Sol"], "Lever":["Sunrise","Salida"], "Coucher":["Sunset","Puesta"], "Nuit aéronautique":["Aeronautical night","Noche aeronáutica"],
 "Ciel dégagé":["Clear sky","Cielo despejado"], "Peu nuageux":["Few clouds","Poco nuboso"], "Épars":["Scattered","Disperso"], "Fragmenté":["Broken","Fragmentado"], "Couvert":["Overcast","Cubierto"],
 "Ciel invisible":["Sky obscured","Cielo oscurecido"], "CAVOK : visibilité et plafond OK":["CAVOK: visibility and ceiling OK","CAVOK: visibilidad y techo OK"],
 "Vent et pistes":["Wind and runways","Viento y pistas"], "Piste":["Runway","Pista"], "face":["headwind","de frente"], "arrière":["tailwind","de cola"], "travers":["crosswind","cruzado"],
 "gauche":["left","izquierda"], "droite":["right","derecha"], "Piste conseillée":["Suggested runway","Pista aconsejada"],
 "Vent calme ou variable : pas de composante dominante.":["Calm or variable wind: no dominant component.","Viento en calma o variable: sin componente dominante."],
 "Orientation des pistes inconnue pour ce terrain.":["Runway headings unknown for this airfield.","Orientación de pistas desconocida para este campo."],
 "Nuages":["Clouds","Nubes"], "Aucun nuage significatif":["No significant cloud","Sin nubes significativas"],
 "Temps présent":["Present weather","Tiempo presente"], "Tendance":["Trend","Tendencia"], "Message brut":["Raw report","Mensaje en bruto"],
 "Pas de TAF pour cette station.":["No TAF for this station.","Sin TAF para esta estación."],
 "Le TAF sera disponible ici très bientôt.":["The TAF will be available here very soon.","El TAF estará disponible aquí muy pronto."],
 "Prévision de base":["Base forecast","Previsión base"], "Devenant":["Becoming","Cambiando a"], "Temporairement":["Temporarily","Temporalmente"], "À partir de":["From","A partir de"],
 "Probabilité":["Probability","Probabilidad"], "le":["on the","el"], "de":["from","de"], "h":["h","h"], "UTC":["UTC","UTC"], "Valable":["Valid","Válido"],
 "Sans changement significatif":["No significant change","Sin cambios significativos"],
 "Heure":["Time","Hora"], "Rafales":["Gusts","Rachas"], "Base estimée":["Estimated base","Base estimada"], "Pluie":["Rain","Lluvia"], "Visi":["Vis","Visi"],
 "Prévisions au sol":["Surface forecast","Previsión en superficie"], "Vent en altitude":["Winds aloft","Viento en altura"], "Isotherme 0 °C":["Freezing level","Isoterma 0 °C"],
 "Maintenant":["Now","Ahora"], "Aujourd'hui":["Today","Hoy"], "Demain":["Tomorrow","Mañana"],
 "Prévisions indisponibles pour le moment.":["Forecast unavailable right now.","Previsiones no disponibles por ahora."],
 "Pistes":["Runways","Pistas"], "Fréquences":["Frequencies","Frecuencias"], "Altitude du terrain":["Field elevation","Elevación del campo"], "Coordonnées":["Coordinates","Coordenadas"],
 "Altitude-pression":["Pressure altitude","Altitud de presión"], "Altitude-densité":["Density altitude","Altitud de densidad"], "Performances":["Performance","Rendimiento"],
 "Herbe":["Grass","Hierba"], "Revêtue":["Paved","Asfaltada"], "Béton":["Concrete","Hormigón"], "Gravier":["Gravel","Grava"], "Terre":["Dirt","Tierra"], "Sable":["Sand","Arena"], "Eau":["Water","Agua"],
 "Voir sur la carte":["Open in maps","Ver en el mapa"], "Cartes et infos officielles (SIA)":["Official charts and info (SIA)","Cartas e info oficiales (SIA)"], "Fiche BASULM":["BASULM sheet","Ficha BASULM"],
 "Météo officielle (Aeroweb)":["Official weather (Aeroweb)","Meteo oficial (Aeroweb)"],
 "Aucune piste renseignée.":["No runway on record.","Ninguna pista registrada."], "Aucune fréquence renseignée.":["No frequency on record.","Ninguna frecuencia registrada."],
 "Vent (kt)":["Wind (kt)","Viento (kt)"], "Pression (hPa)":["Pressure (hPa)","Presión (hPa)"], "Température et point de rosée (°C)":["Temperature and dew point (°C)","Temperatura y punto de rocío (°C)"],
 "Plafond (ft)":["Ceiling (ft)","Techo (ft)"], "Dernières 24 heures":["Last 24 hours","Últimas 24 horas"],
 "L'historique sur 24 h sera disponible ici très bientôt.":["The 24 h history will be available here very soon.","El historial de 24 h estará disponible aquí muy pronto."],
 "Aide à la préparation du vol. Ne remplace pas les sources officielles (SIA, Aeroweb de Météo-France, NOTAM) ni le jugement du commandant de bord.":["Flight preparation aid. Does not replace official sources (AIP, national weather service, NOTAM) or the pilot in command's judgement.","Ayuda para preparar el vuelo. No sustituye a las fuentes oficiales (AIP, servicio meteorológico, NOTAM) ni al criterio del piloto al mando."],
 "Changer de terrain":["Change airfield","Cambiar de campo"], "à côté":["nearby","al lado"],
 "faible":["light","débil"], "forte":["heavy","fuerte"], "à proximité":["in the vicinity","en las cercanías"], "averses de":["showers of","chubascos de"], "orage":["thunderstorm","tormenta"], "avec":["with","con"],
 "verglaçante":["freezing","engelante"], "bancs de":["patches of","bancos de"], "mince":["shallow","baja"], "partiel":["partial","parcial"], "chasse-":["blowing ","ventisca de "],
 "bruine":["drizzle","llovizna"], "pluie":["rain","lluvia"], "neige":["snow","nieve"], "neige en grains":["snow grains","cinarra"], "cristaux de glace":["ice crystals","cristales de hielo"],
 "granules de glace":["ice pellets","hielo granulado"], "grêle":["hail","granizo"], "grésil":["small hail","granizo pequeño"], "précipitation":["precipitation","precipitación"],
 "brume":["mist","neblina"], "brouillard":["fog","niebla"], "fumée":["smoke","humo"], "cendres volcaniques":["volcanic ash","ceniza volcánica"], "poussière":["dust","polvo"], "sable":["sand","arena"],
 "brume sèche":["haze","calima"], "tourbillons de poussière":["dust whirls","remolinos de polvo"], "grains":["squalls","turbonadas"], "trombe":["funnel cloud","tromba"],
 "tempête de sable":["sandstorm","tormenta de arena"], "tempête de poussière":["duststorm","tormenta de polvo"], "pas de temps significatif":["no significant weather","sin tiempo significativo"],
 "Météo terrain":["Airfield weather","Meteo del campo"],"Plan de vol":["Flight plan","Plan de vuelo"],
 "Espace ULM / Avion":["Ultralight / Aircraft area","Zona ULM / Avión"], "ou plus":["or more","o más"]
};
function lang(){ var l=""; try{ l=localStorage.getItem("lf-lang")||""; }catch(e){} if(!l) l=(navigator.language||"fr").slice(0,2); l=l.toLowerCase(); return l==="en"?1:l==="es"?2:0; }
function T(s){ var i=lang(); if(!i) return s; var t=TR[s]; return t && t[i-1]!=null ? t[i-1] : s; }
function ago(min){ var i=lang(); return i===1 ? min+" min ago" : i===2 ? "hace "+min+" min" : "il y a "+min+" min"; }

// ---------- utilitaires ----------
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function lget(k,d){ try{ var v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } }
function lset(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function norm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9 ]/g," "); }
function rad(x){ return x*Math.PI/180; }
function distKm(la1,lo1,la2,lo2){ var dLa=rad(la2-la1), dLo=rad(lo2-lo1), x=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(rad(la1))*Math.cos(rad(la2))*Math.sin(dLo/2)*Math.sin(dLo/2); return 12742*Math.asin(Math.min(1,Math.sqrt(x))); }
function nf(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g," "); }
function p2(n){ return (n<10?"0":"")+n; }
function hm(d){ return p2(d.getHours())+":"+p2(d.getMinutes()); }
function dirName(d){ var fr=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"], en=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"]; return (lang()===1?en:fr)[Math.round(((d%360)+360)%360/22.5)%16]; }
function d3(d){ d=Math.round(d)%360; if(d===0) d=360; return (d<100?"0":"")+(d<10?"0":"")+d+"°"; }
function jget(url, ms, text){ var c=("AbortController" in window)?new AbortController():null, t=setTimeout(function(){ if(c) c.abort(); }, ms||8000);
  return fetch(url, c?{signal:c.signal}:{}).then(function(r){ clearTimeout(t); if(!r.ok) throw new Error("http "+r.status); return text?r.text():r.json(); }, function(e){ clearTimeout(t); throw e; }); }
function cleanName(n){ return String(n||"").replace(/\s+(Airfield|Airport|Aerodrome|Airstrip)$/i,"").replace(/\s+Ultralight (Field|Airfield|Airport)$/i," ULM").replace(/\s+Glider (Field|Airfield)$/i," (planeurs)"); }
function typeName(f){ return T(f.type===2?"Aéroport":f.type===1?"Aérodrome":"Base ULM / aérodrome"); }

// ---------- base des terrains ----------
function loadDB(){ if(dbP) return dbP;
  dbP=jget("data/aero.json?v=1", 25000).then(function(l){ DB=l.map(function(a){ return { code:a[0], name:cleanName(a[1]), city:a[2], lat:a[3], lon:a[4], elev:a[5], type:a[6], cc:a[7], icao:a[8], rw:a[9]||[], fq:a[10]||[], k:norm(a[0]+" "+a[1]+" "+a[2]) }; }); return DB; });
  dbP.catch(function(){ dbP=null; }); return dbP; }
function byCode(c){ if(!DB) return null; for(var i=0;i<DB.length;i++) if(DB[i].code===c) return DB[i]; return null; }
function search(q){ q=norm(q).trim(); if(q.length<2 || !DB) return []; var w=q.split(/\s+/), out=[];
  for(var i=0;i<DB.length;i++){ var a=DB[i], ok=true; for(var j=0;j<w.length;j++) if(a.k.indexOf(w[j])<0){ ok=false; break; } if(!ok) continue;
    var c=a.code.toLowerCase(), s=(c===q?0:c.indexOf(q)===0?1:norm(a.name).indexOf(q)===0?2:norm(a.city).indexOf(q)===0?3:4)*10-(a.cc==="FR"?1:0)-a.type; out.push([s,a]); }
  out.sort(function(x,y){ return x[0]-y[0]; }); return out.slice(0,14).map(function(x){ return x[1]; }); }
function nearest(lat,lon,n,filter){ var l=[]; for(var i=0;i<DB.length;i++){ var a=DB[i]; if(filter && !filter(a)) continue; if(Math.abs(a.lat-lat)>3) continue; l.push([distKm(lat,lon,a.lat,a.lon),a]); }
  l.sort(function(x,y){ return x[0]-y[0]; }); return l.slice(0,n); }
function favs(){ try{ return (JSON.parse(lget("lf.ulm.favs","[]"))||[]).filter(function(x){ return typeof x==="string"; }); }catch(e){ return []; } }
function favToggle(c){ var l=favs(), i=l.indexOf(c); if(i>=0) l.splice(i,1); else l.unshift(c); lset("lf.ulm.favs", JSON.stringify(l.slice(0,12))); }

// ---------- décodage METAR / TAF ----------
var WXD={MI:1,PR:1,BC:1,DR:1,BL:1,SH:1,TS:1,FZ:1}, WXP={DZ:"bruine",RA:"pluie",SN:"neige",SG:"neige en grains",IC:"cristaux de glace",PL:"granules de glace",GR:"grêle",GS:"grésil",UP:"précipitation",
  BR:"brume",FG:"brouillard",FU:"fumée",VA:"cendres volcaniques",DU:"poussière",SA:"sable",HZ:"brume sèche",PO:"tourbillons de poussière",SQ:"grains",FC:"trombe",SS:"tempête de sable",DS:"tempête de poussière"};
function wxText(tok){ var m=/^(\+|-|VC)?((?:[A-Z]{2})+)$/.exec(tok); if(!m) return null; var parts=m[2].match(/[A-Z]{2}/g), ds=[], ps=[];
  for(var i=0;i<parts.length;i++){ if(WXD[parts[i]]) ds.push(parts[i]); else if(WXP[parts[i]]) ps.push(T(WXP[parts[i]])); else return null; }
  if(!ds.length && !ps.length) return null; var s=ps.join(", ");
  if(ds.indexOf("TS")>=0) s=T("orage")+(s?" "+T("avec")+" "+s:""); else if(ds.indexOf("SH")>=0) s=T("averses de")+" "+s; else if(ds.indexOf("FZ")>=0) s=s+" "+T("verglaçante");
  else if(ds.indexOf("BC")>=0) s=T("bancs de")+" "+s; else if(ds.indexOf("MI")>=0) s=s+" "+T("mince"); else if(ds.indexOf("PR")>=0) s=s+" "+T("partiel"); else if(ds.indexOf("BL")>=0||ds.indexOf("DR")>=0) s=T("chasse-")+s;
  if(m[1]==="-") s+=" "+T("faible"); else if(m[1]==="+") s+=" "+T("forte"); else if(m[1]==="VC") s+=" "+T("à proximité");
  return s.charAt(0).toUpperCase()+s.slice(1); }
// lit un groupe d'éléments (corps de METAR ou groupe de TAF)
function parseBody(tk){ var o={ clouds:[], wx:[], rest:[] };
  for(var i=0;i<tk.length;i++){ var t=tk[i], m;
    if(t==="AUTO"||t==="COR"||t==="NIL"||t==="AMD") continue;
    if((m=/^(VRB|\d{3}|\/\/\/)(\d{2,3}|\/\/)(?:G(\d{2,3}))?(KT|MPS|KMH)$/.exec(t))){ var k=m[4]==="MPS"?1.94384:m[4]==="KMH"?0.539957:1;
      o.wind={ vrb:m[1]==="VRB", dir:/^\d{3}$/.test(m[1])?+m[1]:null, spd:/^\d+$/.test(m[2])?Math.round(+m[2]*k):null, gust:m[3]?Math.round(+m[3]*k):null }; continue; }
    if((m=/^(\d{3})V(\d{3})$/.exec(t))){ o.vfrom=+m[1]; o.vto=+m[2]; continue; }
    if(t==="CAVOK"){ o.cavok=true; o.vis=10000; continue; }
    if(/^\d{4}$/.test(t) && o.vis==null){ o.vis=+t>=9999?10000:+t; continue; }
    if((m=/^(?:(\d+)|(\d)\/(\d))SM$/.exec(t))){ o.vis=Math.round((m[1]?+m[1]:(+m[2]/+m[3]))*1609.34); if(o.vis>=9600) o.vis=10000; continue; }
    if((m=/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU)?/.exec(t))){ o.clouds.push({ c:m[1], ft:/^\d+$/.test(m[2])?+m[2]*100:null, x:m[3]||"" }); continue; }
    if(/^(NSC|NCD|SKC|CLR)$/.test(t)){ o.nsc=true; continue; }
    if(t==="NSW"){ o.nsw=true; continue; }
    if((m=/^(M?\d{2})\/(M?\d{2})?$/.exec(t))){ o.temp=+m[1].replace("M","-"); if(m[2]) o.dew=+m[2].replace("M","-"); continue; }
    if((m=/^Q(\d{4})$/.exec(t))){ o.qnh=+m[1]; continue; }
    if((m=/^A(\d{4})$/.exec(t))){ o.qnh=Math.round(+m[1]/100*33.8639); continue; }
    if(/^\/+[A-Z]*$/.test(t) || /^R\d{2}/.test(t)) continue;
    var w=wxText(t); if(w){ o.wx.push(w); continue; }
    o.rest.push(t); }
  o.ceil=null; o.base=null; o.clouds.forEach(function(c){ if(c.ft==null) return; if(o.base==null||c.ft<o.base) o.base=c.ft; if((c.c==="BKN"||c.c==="OVC"||c.c==="VV") && (o.ceil==null||c.ft<o.ceil)) o.ceil=c.ft; });
  return o; }
function parseMetar(raw){ var tk=String(raw||"").replace(/=+\s*$/,"").trim().split(/\s+/), i=0;
  if(tk[i]==="METAR"||tk[i]==="SPECI") i++; if(tk[i]==="COR") i++;
  var icao=tk[i++], tm=/^(\d{2})(\d{2})(\d{2})Z$/.exec(tk[i]||""); if(tm) i++;
  var body=[], trend=[]; for(;i<tk.length;i++){ if(/^(NOSIG|BECMG|TEMPO|RMK)$/.test(tk[i])) break; body.push(tk[i]); } for(;i<tk.length;i++){ if(tk[i]==="RMK") break; trend.push(tk[i]); }
  var o=parseBody(body); o.raw=raw; o.icao=icao; o.trend=trend;
  if(tm){ var n=new Date(), d=new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), +tm[1], +tm[2], +tm[3])); if(d-n>864e5) d=new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth()-1, +tm[1], +tm[2], +tm[3])); o.time=d; }
  return o; }
// catégorie de vol (plafond et visibilité)
function fltCat(o){ var c=o.ceil==null?99999:o.ceil, v=o.vis==null?10000:o.vis;
  if(c<500||v<1600) return ["LIFR","Très mauvaises conditions","#c2379f"]; if(c<1000||v<4800) return ["IFR","Vol aux instruments","#d1343f"];
  if(c<=3000||v<=8000) return ["MVFR","Conditions à vue limites","#2f6fe0"]; return ["VFR","Bonnes conditions à vue","#1a9c55"]; }
function coverName(c){ return T({FEW:"Peu nuageux",SCT:"Épars",BKN:"Fragmenté",OVC:"Couvert",VV:"Ciel invisible"}[c]||c); }
function skyText(o){ if(o.cavok) return "CAVOK"; if(!o.clouds.length) return T("Ciel dégagé"); var top=o.clouds.slice().sort(function(a,b){ return "FEW SCT BKN OVC VV".indexOf(b.c)-"FEW SCT BKN OVC VV".indexOf(a.c); })[0]; return coverName(top.c); }
function skyIcon(o){ if(o.wx.length){ var r=o.raw||""; if(/TS/.test(r)) return "⛈️"; if(/SN|SG/.test(r)) return "🌨️"; if(/RA|DZ|SH/.test(r)) return "🌧️"; if(/FG|BR|HZ/.test(r)) return "🌫️"; }
  if(o.cavok||!o.clouds.length) return "☀️"; var m=0; o.clouds.forEach(function(c){ m=Math.max(m,"FEW SCT BKN OVC VV".indexOf(c.c)); }); return m>=8?"☁️":m>=4?"⛅":"🌤️"; }
function visText(v){ if(v==null) return "–"; if(v>=10000) return "10 km+"; return v>=5000 ? (Math.round(v/100)/10)+" km" : nf(v)+" m"; }
function windText(w, o){ if(!w||w.spd==null) return "–"; if(w.spd===0) return T("Calme"); var s=(w.vrb||w.dir==null?T("Variable"):d3(w.dir)+" "+dirName(w.dir))+" · "+w.spd+" kt"; if(w.gust) s+=", "+T("rafales")+" "+w.gust+" kt"; return s; }

// ---------- soleil ----------
function sunTimes(lat, lon, date){ var d0=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()), n=Math.floor((d0-Date.UTC(date.getUTCFullYear(),0,0))/864e5);
  var g=2*Math.PI/365*(n-1), eq=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  var dec=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  var ch=(Math.cos(rad(90.833))/(Math.cos(rad(lat))*Math.cos(dec)))-Math.tan(rad(lat))*Math.tan(dec); if(ch>1||ch<-1) return null;
  var ha=Math.acos(ch)*180/Math.PI, noon=720-4*lon-eq; return { rise:new Date(d0+(noon-4*ha)*60000), set:new Date(d0+(noon+4*ha)*60000) }; }

// ---------- chargement météo ----------
function fromVatsim(f){ // secours : METAR bruts, sans TAF
  var cand=nearest(f.lat,f.lon,7,function(a){ return a.icao && a.type>=1; }); if(f.icao && !cand.some(function(c){ return c[1].icao===f.icao; })) cand.unshift([0,f]);
  if(!cand.length) return Promise.resolve(null);
  return jget("https://metar.vatsim.net/"+cand.map(function(c){ return c[1].icao; }).join(","), 9000, true).then(function(txt){ var by={}; String(txt).split(/\r?\n/).forEach(function(l){ l=l.trim(); if(/^[A-Z]{4} /.test(l)) by[l.slice(0,4)]=l; });
    for(var i=0;i<cand.length;i++){ var a=cand[i][1]; if(by[a.icao]) return { id:a.icao, name:a.name, lat:a.lat, lon:a.lon, raw:by[a.icao], taf:"", limited:true }; } return null; }); }
function fromApi(f){ function box(d){ return API+"?bbox="+[f.lat-d, f.lon-d*1.4, f.lat+d, f.lon+d*1.4].map(function(x){ return x.toFixed(2); }).join(","); }
  function pick(l){ l=(l||[]).filter(function(x){ return x && x.raw && isFinite(x.lat) && isFinite(x.lon); }); if(!l.length) return null;
    l.forEach(function(x){ x.km=distKm(f.lat,f.lon,x.lat,x.lon); if(f.icao && x.id===f.icao) x.km=0; }); l.sort(function(a,b){ return a.km-b.km; });
    var s=l[0]; if(!s.taf){ for(var i=1;i<l.length;i++) if(l[i].taf && l[i].km<s.km+60){ s.taf=l[i].taf; s.tafFrom=l[i].id; break; } } return s; }
  return jget(box(1.2), 8000).then(function(l){ var s=pick(l); return s || jget(box(3), 8000).then(pick); }); }
function loadWx(f){ return (apiDown ? Promise.reject(new Error("api")) : fromApi(f)).catch(function(){ apiDown=true; return fromVatsim(f); }).then(function(s){ if(!s) return null;
    var o=parseMetar(s.raw); o.st=s; o.km=distKm(f.lat,f.lon,s.lat,s.lon); if(s.t) o.time=new Date(s.t*1000); return o; }); }

// ---------- styles ----------
var CSS=""
+"#tab-ulm{padding-bottom:20px}"
+".ul-mode{display:flex;gap:4px;background:var(--tile,#f7f9fb);border-radius:16px;padding:4px}.ul-mode button{flex:1;border:0;background:transparent;border-radius:13px;padding:11px 4px;font:inherit;font-size:14.5px;font-weight:800;color:var(--muted,#66727d);cursor:pointer}.ul-mode button.on{background:#12408a;color:#fff;box-shadow:0 4px 12px rgba(18,64,138,.3)}"
+".ul-card{background:#fff;border:1px solid var(--line-soft,#eef2f5);border-radius:20px;padding:14px;margin-top:12px;box-shadow:0 4px 14px rgba(13,40,45,.06)}"
+".ul-sky{color:#fff;background:linear-gradient(160deg,#0a2a55 0%,#12408a 55%,#1b63c9 100%);border:0;box-shadow:0 12px 28px rgba(10,42,85,.28)}"
+".ul-h{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted,#66727d);margin:0 0 10px}"
+".ul-sky .ul-h{color:rgba(255,255,255,.72)}"
+".ul-in{width:100%;box-sizing:border-box;border:0;border-radius:14px;padding:13px 14px;font-size:16px;font-family:inherit;background:rgba(255,255,255,.14);color:#fff}"
+".ul-in::placeholder{color:rgba(255,255,255,.6)}.ul-in:focus{outline:2px solid #7fd0ff}"
+".ul-res{margin-top:8px;border-radius:14px;overflow:hidden;background:#fff;color:var(--text,#0b0d10)}"
+".ul-r{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;border-top:1px solid var(--line,#e7ebef);background:none;padding:11px 12px;font-family:inherit;font-size:15px;color:inherit;cursor:pointer}"
+".ul-r:first-child{border-top:0}.ul-r:active{background:#eef4fb}.ul-r>span{flex:1;min-width:0}.ul-r b{display:block;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".ul-r small{display:block;color:var(--muted,#66727d);font-size:12px;margin-top:1px}.ul-r i{font-style:normal;font-size:12px;font-weight:700;color:#12408a;background:#e6eefb;border-radius:8px;padding:4px 7px;flex:none}"
+".ul-btn{display:block;width:100%;margin-top:10px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff;border-radius:14px;padding:11px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer}"
+".ul-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.ul-chips button{border:0;background:rgba(255,255,255,.16);color:#fff;border-radius:100px;padding:7px 12px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer}"
+".ul-note{font-size:13px;line-height:1.45;color:rgba(255,255,255,.8);margin-top:10px}"
+".ul-head{display:flex;align-items:flex-start;gap:10px}.ul-head>div{flex:1;min-width:0}.ul-code{font-size:12px;font-weight:800;letter-spacing:.06em;opacity:.8}"
+".ul-name{font-size:21px;font-weight:800;line-height:1.15;margin-top:2px}.ul-sub{font-size:13px;opacity:.8;margin-top:3px}"
+".ul-ic{width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;font-size:19px;cursor:pointer;flex:none}"
+".ul-st{margin-top:10px;font-size:12.5px;background:rgba(255,255,255,.12);border-radius:12px;padding:8px 10px;line-height:1.4}"
+".ul-seg{display:flex;gap:6px;overflow-x:auto;margin-top:12px;padding-bottom:2px;-webkit-overflow-scrolling:touch}.ul-seg::-webkit-scrollbar{display:none}"
+".ul-seg button{flex:none;border:1px solid var(--line,#e7ebef);background:#fff;color:var(--text,#0b0d10);border-radius:100px;padding:9px 15px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer}"
+".ul-seg button.on{background:#12408a;border-color:#12408a;color:#fff}"
+".ul-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ul-t{background:rgba(255,255,255,.11);border-radius:14px;padding:11px 12px;min-width:0}"
+".ul-t span{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.72}.ul-t b{display:block;font-size:20px;font-weight:800;margin-top:3px;line-height:1.15}"
+".ul-t small{display:block;font-size:12px;opacity:.8;margin-top:2px;line-height:1.3}.ul-cat{grid-column:1/-1;display:flex;align-items:center;gap:12px}"
+".ul-cat em{font-style:normal;font-size:19px;font-weight:900;letter-spacing:.04em;border-radius:11px;padding:9px 13px;color:#fff;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.35) inset}"
+".ul-cat div{min-width:0}.ul-inst{display:grid;grid-template-columns:1.25fr 1fr;gap:6px;align-items:center}.ul-inst svg{width:100%;height:auto;display:block}"
+".ul-rw{display:flex;flex-direction:column;gap:7px;margin-top:10px}.ul-rwb{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;border-radius:13px;padding:9px 11px;font-family:inherit;cursor:pointer}"
+".ul-rwb.on{background:rgba(255,255,255,.2);border-color:#fff}.ul-rwb b{font-size:18px;font-weight:900;min-width:44px}.ul-rwb span{flex:1;font-size:13px;line-height:1.35}.ul-rwb i{font-style:normal;font-size:11px;font-weight:800;background:#35c27a;border-radius:8px;padding:3px 7px;flex:none}"
+".ul-raw{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;background:#0b1c33;color:#d7e6ff;border-radius:12px;padding:11px 12px;word-break:break-word;user-select:text;-webkit-user-select:text}"
+".ul-kv{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line,#e7ebef);font-size:14.5px}.ul-kv:first-of-type{border-top:0}.ul-kv span{color:var(--muted,#66727d)}.ul-kv b{font-weight:700;text-align:right}"
+".ul-g{border-top:1px solid var(--line,#e7ebef);padding:11px 0}.ul-g:first-of-type{border-top:0;padding-top:0}.ul-g>b{display:flex;align-items:center;gap:8px;font-size:14.5px}.ul-g>b em{font-style:normal;font-size:11px;font-weight:800;color:#fff;border-radius:7px;padding:3px 7px}"
+".ul-g small{display:block;font-size:12px;color:var(--muted,#66727d);margin-top:2px}.ul-g p{margin:6px 0 0;font-size:14px;line-height:1.5}"
+".ul-tbl{width:100%;border-collapse:collapse;font-size:13.5px}.ul-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#66727d);font-weight:700;text-align:left;padding:0 4px 7px}"
+".ul-tbl td{padding:8px 4px;border-top:1px solid var(--line,#e7ebef);white-space:nowrap}.ul-tbl td b{font-weight:800}.ul-tbl tr.day td{background:#f2f6fb;font-weight:800;font-size:12px;color:#12408a;text-transform:uppercase;letter-spacing:.04em}"
+".ul-ar{display:inline-block;font-weight:900;color:#12408a;width:14px;text-align:center}.ul-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}"
+".ul-links{display:flex;flex-direction:column;gap:8px}.ul-links a{display:flex;align-items:center;justify-content:space-between;text-decoration:none;font-weight:700;font-size:14.5px;color:#12408a;background:#eef4fb;border-radius:13px;padding:12px 13px}"
+".ul-msg{text-align:center;font-size:14px;color:var(--muted,#66727d);padding:18px 6px;line-height:1.5}.ul-msg button{display:block;margin:12px auto 0;border:0;background:#12408a;color:#fff;border-radius:100px;padding:10px 20px;font-weight:700;font-family:inherit;font-size:14px;cursor:pointer}"
+".ul-sky .ul-msg{color:rgba(255,255,255,.85)}.ul-sky .ul-msg button{background:#fff;color:#12408a}"
+".ul-ch{margin-bottom:14px}.ul-ch svg{width:100%;height:auto;display:block}.ul-ch b{display:block;font-size:13px;margin-bottom:4px}"
+".ul-disc{font-size:11.5px;line-height:1.45;color:var(--muted,#66727d);margin:14px 4px 0;text-align:center}"
+".ul-wx{margin-top:8px;font-size:14px;line-height:1.45}.ul-wx b{font-weight:800}";

// ---------- dessins ----------
function compassSvg(o, f){ var w=o.wind||{}, S=260, c=130, R=112, h="";
  h+='<circle cx="'+c+'" cy="'+c+'" r="'+R+'" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>';
  for(var a=0;a<360;a+=10){ var big=a%30===0, r1=R-(big?11:6), x1=c+r1*Math.sin(rad(a)), y1=c-r1*Math.cos(rad(a)), x2=c+R*Math.sin(rad(a)), y2=c-R*Math.cos(rad(a));
    h+='<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="rgba(255,255,255,'+(big?".8":".35")+')" stroke-width="'+(big?2:1)+'"/>';
    if(big){ var lb=a===0?"N":a===90?"E":a===180?"S":a===270?(lang()===1?"W":"O"):String(a/10), rt=R-24, xt=c+rt*Math.sin(rad(a)), yt=c-rt*Math.cos(rad(a));
      h+='<text x="'+xt.toFixed(1)+'" y="'+(yt+5).toFixed(1)+'" text-anchor="middle" font-size="'+(a%90===0?15:12)+'" font-weight="'+(a%90===0?800:600)+'" fill="rgba(255,255,255,'+(a%90===0?1:.7)+')">'+lb+'</text>'; } }
  // secteur de variation
  if(o.vfrom!=null && o.vto!=null){ var a1=o.vfrom, a2=o.vto; if(a2<a1) a2+=360; var ra=R-3, xs=c+ra*Math.sin(rad(a1)), ys=c-ra*Math.cos(rad(a1)), xe=c+ra*Math.sin(rad(a2)), ye=c-ra*Math.cos(rad(a2));
    h+='<path d="M'+c+' '+c+' L'+xs.toFixed(1)+' '+ys.toFixed(1)+' A'+ra+' '+ra+' 0 '+((a2-a1)>180?1:0)+' 1 '+xe.toFixed(1)+' '+ye.toFixed(1)+' Z" fill="rgba(127,208,255,.22)"/>'; }
  // pistes
  var L=62; (f.rw||[]).forEach(function(r){ if(r[5]==null) return; var on=(rwSel===r[0]||rwSel===r[1]);
    h+='<g transform="rotate('+r[5]+' '+c+' '+c+')" opacity="'+(on?1:.5)+'"><rect x="'+(c-8)+'" y="'+(c-L)+'" width="16" height="'+(2*L)+'" rx="2" fill="#111c2c" stroke="#fff" stroke-width="'+(on?2:1)+'"/>'
      +'<line x1="'+c+'" y1="'+(c-L+18)+'" x2="'+c+'" y2="'+(c+L-18)+'" stroke="#fff" stroke-width="1.5" stroke-dasharray="6 6"/>'
      +'<text x="'+c+'" y="'+(c+L-5)+'" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">'+esc(r[0])+'</text>'
      +'<text x="'+c+'" y="'+(c-L+5)+'" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" transform="rotate(180 '+c+' '+(c-L+2)+')">'+esc(r[1])+'</text></g>'; });
  // flèche du vent (d'où il vient, pointe vers le centre)
  if(w.spd && w.dir!=null && !w.vrb){ h+='<g transform="rotate('+w.dir+' '+c+' '+c+')"><path d="M'+c+' '+(c-R+46)+' l-13 -26 h8 v-22 h10 v22 h8 z" fill="#fff" stroke="#0a2a55" stroke-width="1.5" stroke-linejoin="round"/></g>'; }
  return '<svg viewBox="0 0 '+S+' '+S+'" role="img" aria-label="'+esc(T("Vent et pistes"))+'">'+h+'</svg>'; }
function gaugeSvg(o){ var w=o.wind||{}, v=w.spd||0, g=w.gust||0, max=Math.max(40, Math.ceil(Math.max(v,g)/10)*10), c=100, R=80, a0=-120, a1=120, h="";
  function pt(val, r){ var a=rad(a0+(a1-a0)*Math.min(1,val/max)); return [c+r*Math.sin(a), c-r*Math.cos(a)]; }
  function arc(v1, v2, r){ var p=pt(v1,r), q=pt(v2,r), big=((a1-a0)*(v2-v1)/max)>180?1:0; return "M"+p[0].toFixed(1)+" "+p[1].toFixed(1)+" A"+r+" "+r+" 0 "+big+" 1 "+q[0].toFixed(1)+" "+q[1].toFixed(1); }
  h+='<path d="'+arc(0,max,R)+'" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="10" stroke-linecap="round"/>';
  if(v>0) h+='<path d="'+arc(0,v,R)+'" fill="none" stroke="#7fd0ff" stroke-width="10" stroke-linecap="round"/>';
  if(g>v) h+='<path d="'+arc(v,g,R)+'" fill="none" stroke="#ffb14a" stroke-width="10"/>';
  for(var t=0;t<=max;t+=5){ var big=t%10===0, p=pt(t,R-9), q=pt(t,R-(big?17:13)); h+='<line x1="'+p[0].toFixed(1)+'" y1="'+p[1].toFixed(1)+'" x2="'+q[0].toFixed(1)+'" y2="'+q[1].toFixed(1)+'" stroke="rgba(255,255,255,.7)" stroke-width="'+(big?2:1)+'"/>';
    if(big){ var s=pt(t,R-29); h+='<text x="'+s[0].toFixed(1)+'" y="'+(s[1]+4).toFixed(1)+'" text-anchor="middle" font-size="11" font-weight="700" fill="rgba(255,255,255,.8)">'+t+'</text>'; } }
  var n=pt(v,R-22); h+='<line x1="'+c+'" y1="'+c+'" x2="'+n[0].toFixed(1)+'" y2="'+n[1].toFixed(1)+'" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="'+c+'" cy="'+c+'" r="7" fill="#fff"/>';
  h+='<text x="'+c+'" y="'+(c+46)+'" text-anchor="middle" font-size="27" font-weight="900" fill="#fff">'+(w.spd==null?"–":v)+'</text><text x="'+c+'" y="'+(c+62)+'" text-anchor="middle" font-size="12" font-weight="700" fill="rgba(255,255,255,.75)">kt'+(g?" · G"+g:"")+'</text>';
  return '<svg viewBox="0 0 200 175" role="img">'+h+'</svg>'; }
function cloudSvg(o){ var top=5000; o.clouds.forEach(function(c){ if(c.ft!=null) top=Math.max(top, Math.ceil((c.ft+1000)/2500)*2500); }); top=Math.min(top,25000);
  var W=320, H=170, x0=46, y0=10, y1=150, step=top<=5000?1000:top<=10000?2500:5000, h="";
  function y(ft){ return y1-(y1-y0)*ft/top; }
  for(var ft=0; ft<=top; ft+=step){ h+='<line x1="'+x0+'" y1="'+y(ft).toFixed(1)+'" x2="'+(W-4)+'" y2="'+y(ft).toFixed(1)+'" stroke="rgba(255,255,255,.22)" stroke-width="1"/><text x="'+(x0-6)+'" y="'+(y(ft)+4).toFixed(1)+'" text-anchor="end" font-size="10.5" fill="rgba(255,255,255,.75)">'+(ft?nf(ft):"0 ft")+'</text>'; }
  o.clouds.forEach(function(c){ if(c.ft==null||c.ft>top) return; var yy=y(c.ft), n={FEW:3,SCT:5,BKN:8,OVC:11,VV:11}[c.c]||4, op={FEW:.55,SCT:.7,BKN:.88,OVC:1,VV:.6}[c.c]||.7, sp=(W-x0-70)/11;
    for(var i=0;i<n;i++){ var cx=x0+18+i*((W-x0-100)/Math.max(1,n-1)); h+='<ellipse cx="'+cx.toFixed(1)+'" cy="'+(yy-7).toFixed(1)+'" rx="15" ry="'+(8+(i%3)*2)+'" fill="#fff" opacity="'+op+'"/>'; }
    h+='<line x1="'+x0+'" y1="'+yy.toFixed(1)+'" x2="'+(W-4)+'" y2="'+yy.toFixed(1)+'" stroke="#7fd0ff" stroke-width="1.5"/>'
      +'<rect x="'+(W-74)+'" y="'+(yy+3).toFixed(1)+'" width="70" height="15" rx="4" fill="#0a2a55"/><text x="'+(W-39)+'" y="'+(yy+14).toFixed(1)+'" text-anchor="middle" font-size="10.5" font-weight="800" fill="#fff">'+c.c+" "+nf(c.ft)+(c.x?" "+c.x:"")+'</text>'; });
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img">'+h+'</svg>'; }
function lineChart(series, colors, opt){ opt=opt||{}; var W=320, H=120, x0=34, x1=W-6, y0=8, y1=H-20, mn=Infinity, mx=-Infinity, t0=Infinity, t1=-Infinity, h="";
  series.forEach(function(s){ s.forEach(function(p){ if(p[1]==null) return; mn=Math.min(mn,p[1]); mx=Math.max(mx,p[1]); t0=Math.min(t0,p[0]); t1=Math.max(t1,p[0]); }); });
  if(!isFinite(mn)) return ""; if(opt.min!=null) mn=Math.min(mn,opt.min); if(mx-mn<(opt.span||4)){ var m=(mx+mn)/2, sp=(opt.span||4)/2; mn=m-sp; mx=m+sp; if(opt.min!=null && mn<opt.min){ mx+=opt.min-mn; mn=opt.min; } } if(t1<=t0) t1=t0+1;
  function X(t){ return x0+(x1-x0)*(t-t0)/(t1-t0); } function Y(v){ return y1-(y1-y0)*(v-mn)/(mx-mn); }
  for(var i=0;i<=2;i++){ var v=mn+(mx-mn)*i/2; h+='<line x1="'+x0+'" y1="'+Y(v).toFixed(1)+'" x2="'+x1+'" y2="'+Y(v).toFixed(1)+'" stroke="#e3e9f0" stroke-width="1"/><text x="'+(x0-5)+'" y="'+(Y(v)+4).toFixed(1)+'" text-anchor="end" font-size="10" fill="#66727d">'+nf(v)+'</text>'; }
  for(var k=0;k<=4;k++){ var tt=t0+(t1-t0)*k/4, d=new Date(tt); h+='<text x="'+X(tt).toFixed(1)+'" y="'+(H-5)+'" text-anchor="'+(k===0?"start":k===4?"end":"middle")+'" font-size="10" fill="#66727d">'+p2(d.getHours())+' h</text>'; }
  series.forEach(function(s,si){ var d="", pen=false; s.forEach(function(p){ if(p[1]==null){ pen=false; return; } d+=(pen?"L":"M")+X(p[0]).toFixed(1)+" "+Y(p[1]).toFixed(1)+" "; pen=true; });
    if(d) h+='<path d="'+d+'" fill="none" stroke="'+colors[si]+'" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"'+(si&&opt.dash?' stroke-dasharray="4 4"':'')+'/>'; });
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img">'+h+'</svg>'; }

// ---------- vent sur les pistes ----------
function rwEnds(f){ var l=[]; (f.rw||[]).forEach(function(r){ if(r[5]==null) return; if(r[0]) l.push({ id:r[0], hd:r[5], len:r[2], sf:r[4] }); if(r[1]) l.push({ id:r[1], hd:(r[5]+180)%360, len:r[2], sf:r[4] }); }); return l; }
function rwComp(o, f){ var w=o.wind, ends=rwEnds(f); if(!ends.length) return { ends:[], msg:"Orientation des pistes inconnue pour ce terrain." };
  if(!w || w.spd==null || !w.spd || w.vrb || w.dir==null){ return { ends:ends, calm:true, msg:"Vent calme ou variable : pas de composante dominante." }; }
  ends.forEach(function(e){ var a=rad(w.dir-e.hd); e.head=Math.round(w.spd*Math.cos(a)); e.cross=Math.round(w.spd*Math.sin(a)); if(w.gust){ e.gcross=Math.abs(Math.round(w.gust*Math.sin(a))); } });
  ends.sort(function(a,b){ return b.head-a.head; }); return { ends:ends, best:ends[0].id }; }

// ---------- rendu ----------
function h1(s){ return '<div class="ul-h">'+esc(T(s))+'</div>'; }
function searchCard(){ var fv=favs().map(byCode).filter(Boolean);
  return '<div class="ul-card ul-sky" id="ulSearch"><div class="ul-h">✈️ '+esc(T("Rechercher un terrain"))+'</div>'
    +'<input class="ul-in" id="ulQ" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="'+esc(T("Nom, ville ou code (LFMP, LF6651…)"))+'">'
    +'<div id="ulRes"></div><button class="ul-btn" id="ulNear">'+esc(T("📍 Terrains autour de moi"))+'</button>'
    +(fv.length?'<div class="ul-h" style="margin:14px 0 0">'+esc(T("Mes terrains"))+'</div><div class="ul-chips">'+fv.map(function(a){ return '<button data-code="'+esc(a.code)+'">★ '+esc(a.name)+'</button>'; }).join("")+'</div>':"")
    +(F?"":'<div class="ul-note">'+esc(T("Choisis ton terrain : base ULM, aérodrome ou aéroport. Tu y retrouves le METAR, le TAF, le vent sur la piste et les prévisions."))+'</div>')+'</div>'; }
function resHtml(l, withKm){ if(!l.length) return '<div class="ul-res"><div class="ul-msg" style="padding:12px">'+esc(T("Aucun terrain trouvé."))+'</div></div>';
  return '<div class="ul-res">'+l.map(function(x){ var a=withKm?x[1]:x; return '<button class="ul-r" data-code="'+esc(a.code)+'"><i>'+esc(a.code)+'</i><span><b>'+esc(a.name)+'</b><small>'+esc((a.city?a.city+" · ":"")+typeName(a)+(withKm?" · "+(x[0]<1.5?T("à côté"):Math.round(x[0])+" km"):""))+'</small></span></button>'; }).join("")+'</div>'; }
function headCard(){ var f=F, fav=favs().indexOf(f.code)>=0, st="";
  if(WX){ var mins=WX.time?Math.max(0,Math.round((Date.now()-WX.time)/60000)):null;
    st='<div class="ul-st">'+esc(T("Station météo"))+' : <b>'+esc(WX.st.id)+'</b> · '+esc(cleanName(String(WX.st.name||"").split(",")[0]))+(WX.km>1.5?" ("+Math.round(WX.km)+" km)":"")
      +(WX.time?'<br>'+esc(T("Observation de"))+' <b>'+hm(WX.time)+'</b> · '+esc(mins<120?ago(mins):ago(mins)):"")+'</div>'; }
  return '<div class="ul-card ul-sky"><div class="ul-head"><div><div class="ul-code">'+esc(f.code)+' · '+esc(typeName(f))+'</div><div class="ul-name">'+esc(f.name)+'</div><div class="ul-sub">'+esc((f.city?f.city+" · ":"")+nf(f.elev)+" ft ("+nf(f.elev*0.3048)+" m)")+'</div></div>'
    +'<button class="ul-ic" id="ulFav" aria-label="'+esc(T(fav?"Retirer de mes terrains":"Ajouter à mes terrains"))+'">'+(fav?"★":"☆")+'</button><button class="ul-ic" id="ulChg" aria-label="'+esc(T("Changer de terrain"))+'">🔍</button><button class="ul-ic" id="ulRef" aria-label="'+esc(T("Actualiser"))+'">↻</button></div>'+st+'</div>'; }
function segHtml(){ return '<div class="ul-seg">'+[["metar","METAR"],["taf","TAF"],["prev",T("Prévisions")],["terrain",T("Terrain")],["tend",T("Tendances")]].map(function(x){ return '<button data-view="'+x[0]+'" class="'+(view===x[0]?"on":"")+'">'+esc(x[1])+'</button>'; }).join("")+'</div>'; }
function metarView(){ var o=WX, f=F; if(!o) return "";
  var cat=fltCat(o), w=o.wind||{}, sun=sunTimes(f.lat,f.lon,new Date()), rh=(o.temp!=null&&o.dew!=null)?Math.round(100*Math.exp(17.625*o.dew/(243.04+o.dew))/Math.exp(17.625*o.temp/(243.04+o.temp))):null;
  var h='<div class="ul-card ul-sky">'+h1("Conditions de vol")+'<div class="ul-tiles">'
    +'<div class="ul-t ul-cat"><em style="background:'+cat[2]+'">'+cat[0]+'</em><div><b style="font-size:17px">'+esc(T(cat[1]))+'</b><small>'+skyIcon(o)+" "+esc(skyText(o))+(o.temp!=null?" · "+o.temp+" °C":"")+'</small></div></div>'
    +'<div class="ul-t"><span>'+esc(T("Vent"))+'</span><b>'+(w.spd==null?"–":w.spd+" kt")+(w.gust?' <small style="display:inline;font-size:14px">G'+w.gust+'</small>':"")+'</b><small>'+esc(w.spd===0?T("Calme"):(w.vrb||w.dir==null?T("Variable"):d3(w.dir)+" "+dirName(w.dir)))+(o.vfrom!=null?" ("+d3(o.vfrom)+" - "+d3(o.vto)+")":"")+'</small></div>'
    +'<div class="ul-t"><span>'+esc(T("Visibilité"))+'</span><b>'+esc(visText(o.vis))+'</b><small>'+(o.cavok?"CAVOK":(o.wx[0]?esc(o.wx[0]):"&nbsp;"))+'</small></div>'
    +'<div class="ul-t"><span>'+esc(T(o.ceil!=null?"Plafond":"Base des nuages"))+'</span><b>'+(o.ceil!=null?nf(o.ceil)+" ft":o.base!=null?nf(o.base)+" ft":"–")+'</b><small>'+esc(o.ceil!=null?nf(o.ceil*0.3048)+" m":o.base!=null?nf(o.base*0.3048)+" m · "+T("Aucun plafond"):T("Aucun plafond"))+'</small></div>'
    +'<div class="ul-t"><span>'+esc(T("Pression (QNH)"))+'</span><b>'+(o.qnh!=null?nf(o.qnh)+" hPa":"–")+'</b><small>'+(o.qnh!=null?(o.qnh/33.8639).toFixed(2)+" inHg":"&nbsp;")+'</small></div>'
    +'<div class="ul-t"><span>'+esc(T("Température"))+'</span><b>'+(o.temp!=null?o.temp+" °C":"–")+'</b><small>'+(o.dew!=null?esc(T("Point de rosée"))+" "+o.dew+" °C"+(rh!=null?" · "+rh+" %":""):"&nbsp;")+'</small></div>'
    +'<div class="ul-t"><span>'+esc(T("Soleil"))+'</span><b>'+(sun?hm(sun.rise)+" · "+hm(sun.set):"–")+'</b><small>'+(sun?esc(T("Nuit aéronautique"))+" "+hm(new Date(+sun.set+18e5)):"&nbsp;")+'</small></div>'
    +'</div></div>';
  // vent et pistes
  var rc=rwComp(o,f); if(rc.ends.length && !rwSel) rwSel=rc.best||rc.ends[0].id;
  h+='<div class="ul-card ul-sky">'+h1("Vent et pistes")+'<div class="ul-inst">'+compassSvg(o,f)+gaugeSvg(o)+'</div>';
  if(rc.msg) h+='<div class="ul-note">'+esc(T(rc.msg))+'</div>';
  if(rc.ends.length && !rc.calm){ h+='<div class="ul-rw">'+rc.ends.map(function(e){ var side=e.cross>0?T("droite"):T("gauche"), ac=Math.abs(e.cross);
      return '<button class="ul-rwb'+(rwSel===e.id?" on":"")+'" data-rw="'+esc(e.id)+'"><b>'+esc(e.id)+'</b><span>'+(e.head>=0?esc(T("face"))+" <b>"+e.head+" kt</b>":esc(T("arrière"))+" <b>"+(-e.head)+" kt</b>")+" · "+esc(T("travers"))+" <b>"+ac+" kt</b>"+(ac?" ("+esc(side)+")":"")+(e.gcross?" · G "+e.gcross+" kt":"")+'</span>'+(e.id===rc.best?'<i>'+esc(T("Piste conseillée"))+'</i>':"")+'</button>'; }).join("")+'</div>'; }
  h+='</div>';
  // nuages
  h+='<div class="ul-card ul-sky">'+h1("Nuages")+(o.clouds.some(function(c){ return c.ft!=null; })?cloudSvg(o):'<div class="ul-note" style="margin-top:0">'+esc(o.cavok?T("CAVOK : visibilité et plafond OK"):T("Aucun nuage significatif"))+'</div>');
  if(o.clouds.length) h+='<div class="ul-wx">'+o.clouds.map(function(c){ return "<b>"+c.c+"</b> "+esc(coverName(c.c))+(c.ft!=null?" "+esc(T("à"))+" "+nf(c.ft)+" ft":"")+(c.x?" ("+c.x+")":""); }).join("<br>")+'</div>';
  if(o.wx.length) h+='<div class="ul-wx"><b>'+esc(T("Temps présent"))+' :</b> '+esc(o.wx.join(", "))+'</div>';
  if(o.trend.length) h+='<div class="ul-wx"><b>'+esc(T("Tendance"))+' :</b> '+esc(trendText(o.trend))+'</div>';
  h+='</div><div class="ul-card">'+h1("Message brut")+'<div class="ul-raw">'+esc(o.raw)+'</div></div>';
  return h; }
function bodyText(b){ var p=[]; if(b.wind) p.push(T("Vent")+" "+windText(b.wind)); if(b.cavok) p.push("CAVOK"); else if(b.vis!=null) p.push(T("Visibilité")+" "+visText(b.vis));
  b.wx.forEach(function(x){ p.push(x); }); if(b.nsw) p.push(T("pas de temps significatif")); b.clouds.forEach(function(c){ p.push(coverName(c.c)+(c.ft!=null?" "+nf(c.ft)+" ft":"")+(c.x?" "+c.x:"")); }); if(b.nsc) p.push(T("Aucun nuage significatif")); return p.join(" · "); }
function trendText(tk){ if(tk[0]==="NOSIG") return T("Sans changement significatif"); var k=tk[0]==="BECMG"?"Devenant":tk[0]==="TEMPO"?"Temporairement":""; return (k?T(k)+" : ":"")+(bodyText(parseBody(tk.slice(k?1:0)))||tk.join(" ")); }
function tafGroups(raw){ var tk=String(raw||"").replace(/=+\s*$/,"").trim().split(/\s+/), i=0, g=[], cur={ k:"base", tk:[] };
  while(i<tk.length && /^(TAF|AMD|COR)$/.test(tk[i])) i++; i++; if(/^\d{6}Z$/.test(tk[i]||"")) i++; if(/^\d{4}\/\d{4}$/.test(tk[i]||"")){ cur.per=tk[i]; i++; }
  for(;i<tk.length;i++){ var t=tk[i], m;
    if((m=/^FM(\d{2})(\d{2})(\d{2})$/.exec(t))){ g.push(cur); cur={ k:"fm", fm:m, tk:[] }; continue; }
    if(t==="BECMG"||t==="TEMPO"){ if(cur.k==="prob" && !cur.tk.length && !cur.sub && t==="TEMPO"){ cur.sub=true; continue; } g.push(cur); cur={ k:t==="BECMG"?"becmg":"tempo", tk:[] }; continue; }
    if((m=/^PROB(\d{2})$/.exec(t))){ g.push(cur); cur={ k:"prob", p:+m[1], tk:[] }; continue; }
    if(/^\d{4}\/\d{4}$/.test(t) && !cur.per && !cur.tk.length){ cur.per=t; continue; }
    if(/^T[XN]M?\d{2}\/\d{4}Z$/.test(t)) continue; cur.tk.push(t); }
  g.push(cur); return g; }
function perText(per){ var m=/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(per||""); if(!m) return ""; function loc(d,hh){ var n=new Date(), x=new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), +d, +hh)); if(x-n>20*864e5) x=new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth()-1, +d, +hh)); else if(n-x>20*864e5) x=new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth()+1, +d, +hh)); return x; }
  var a=loc(m[1],m[2]), b=loc(m[3],m[4]); return p2(a.getDate())+"/"+p2(a.getMonth()+1)+" "+hm(a)+" → "+(a.getDate()!==b.getDate()?p2(b.getDate())+"/"+p2(b.getMonth()+1)+" ":"")+hm(b); }
function tafView(){ var o=WX; if(!o) return ""; var raw=o.st.taf;
  if(!raw) return '<div class="ul-card"><div class="ul-msg">'+esc(T(o.st.limited?"Le TAF sera disponible ici très bientôt.":"Pas de TAF pour cette station."))+'</div></div>';
  var g=tafGroups(raw), h='<div class="ul-card">'+h1("TAF")+(o.st.tafFrom?'<div class="ul-g" style="padding-bottom:9px"><small>'+esc(T("Station météo"))+" : "+esc(o.st.tafFrom)+'</small></div>':"");
  g.forEach(function(x){ var b=parseBody(x.tk), cat=(b.vis!=null||b.clouds.length||b.cavok)?fltCat(b):null, lbl=x.k==="base"?T("Prévision de base"):x.k==="becmg"?T("Devenant"):x.k==="tempo"?T("Temporairement"):x.k==="fm"?T("À partir de"):T("Probabilité")+" "+x.p+" %"+(x.sub?" · "+T("Temporairement"):"");
    var per=x.k==="fm"?perText(x.fm[1]+x.fm[2]+"/"+x.fm[1]+x.fm[2]).split(" → ")[0]:perText(x.per);
    h+='<div class="ul-g"><b>'+esc(lbl)+(cat?' <em style="background:'+cat[2]+'">'+cat[0]+'</em>':"")+'</b>'+(per?'<small>'+esc(per)+'</small>':"")+'<p>'+esc(bodyText(b)||x.tk.join(" "))+'</p></div>'; });
  return h+'</div><div class="ul-card">'+h1("Message brut")+'<div class="ul-raw">'+esc(raw)+'</div></div>'; }
function arrow(d){ return '<span class="ul-ar" style="display:inline-block;transform:rotate('+((d+180)%360)+'deg)">↑</span>'; }
function prevView(){ if(fc==="err") return '<div class="ul-card"><div class="ul-msg">'+esc(T("Prévisions indisponibles pour le moment."))+'<button data-act="fc">'+esc(T("Réessayer"))+'</button></div></div>';
  if(!fc) return '<div class="ul-card"><div class="ul-msg">'+esc(T("Chargement…"))+'</div></div>';
  var H=fc.hourly, now=Date.now(), i0=0; for(var i=0;i<H.time.length;i++){ if(new Date(H.time[i]).getTime()>=now-36e5){ i0=i; break; } }
  var h='<div class="ul-card">'+h1("Prévisions au sol")+'<div class="ul-scroll"><table class="ul-tbl"><tr><th>'+esc(T("Heure"))+'</th><th>'+esc(T("Vent"))+'</th><th>'+esc(T("Rafales"))+'</th><th>'+esc(T("Nuages"))+'</th><th>'+esc(T("Base estimée"))+'</th><th>'+esc(T("Visi"))+'</th><th>'+esc(T("Pluie"))+'</th></tr>', lastDay="";
  for(var j=i0, n=0; j<H.time.length && n<30; j+=(n<12?1:3), n++){ var d=new Date(H.time[j]), dk=d.toDateString(); if(dk!==lastDay){ lastDay=dk; var dn=new Date(), tm=new Date(Date.now()+864e5);
      h+='<tr class="day"><td colspan="7">'+esc(dk===dn.toDateString()?T("Aujourd'hui"):dk===tm.toDateString()?T("Demain"):p2(d.getDate())+"/"+p2(d.getMonth()+1))+'</td></tr>'; }
    var base=(H.temperature_2m[j]!=null&&H.dew_point_2m[j]!=null)?Math.max(0,Math.round((H.temperature_2m[j]-H.dew_point_2m[j])*400/100)*100):null, vis=H.visibility[j];
    h+='<tr><td><b>'+p2(d.getHours())+' h</b></td><td>'+arrow(H.wind_direction_10m[j])+' <b>'+Math.round(H.wind_speed_10m[j])+'</b> kt</td><td>'+Math.round(H.wind_gusts_10m[j])+' kt</td><td>'+Math.round(H.cloud_cover[j])+' %</td><td>'+(H.cloud_cover_low[j]>=20&&base!=null?nf(base)+" ft":"–")+'</td><td>'+(vis==null?"–":vis>=10000?"10+ km":(vis/1000).toFixed(1)+" km")+'</td><td>'+(H.precipitation[j]>0?H.precipitation[j].toFixed(1)+" mm":"–")+'</td></tr>'; }
  h+='</table></div></div>';
  h+='<div class="ul-card">'+h1("Vent en altitude")+'<div class="ul-scroll"><table class="ul-tbl"><tr><th>'+esc(T("Heure"))+'</th><th>2 500 ft</th><th>5 000 ft</th><th>10 000 ft</th><th>'+esc(T("Isotherme 0 °C"))+'</th></tr>';
  [0,3,6,9,12,18,24].forEach(function(k){ var j=i0+k; if(j>=H.time.length) return; var d=new Date(H.time[j]); function c(l){ var s=H["wind_speed_"+l+"hPa"], dd=H["wind_direction_"+l+"hPa"]; return (s&&s[j]!=null)?arrow(dd[j])+" <b>"+Math.round(s[j])+"</b> kt · "+d3(dd[j]):"–"; }
    h+='<tr><td><b>'+(k===0?esc(T("Maintenant")):p2(d.getHours())+" h")+'</b></td><td>'+c(925)+'</td><td>'+c(850)+'</td><td>'+c(700)+'</td><td>'+(H.freezing_level_height&&H.freezing_level_height[j]!=null?nf(Math.round(H.freezing_level_height[j]*3.28084/100)*100)+" ft":"–")+'</td></tr>'; });
  return h+'</table></div></div>'; }
function surfName(s){ s=String(s||"").toUpperCase(); return /GR[AS]|TURF|HERB/.test(s)?T("Herbe"):/ASP|BIT|PAV|TAR|PEM/.test(s)?T("Revêtue"):/CON|BET/.test(s)?T("Béton"):/GRV|GRAV/.test(s)?T("Gravier"):/SAND/.test(s)?T("Sable"):/DIRT|EARTH|SOIL|CLA/.test(s)?T("Terre"):/WAT/.test(s)?T("Eau"):(s||"–"); }
function dms(v, pos, neg){ var a=Math.abs(v), d=Math.floor(a), m=(a-d)*60; return d+"° "+m.toFixed(2)+"' "+(v>=0?pos:neg); }
function terrainView(){ var f=F, o=WX, h='<div class="ul-card">'+h1("Pistes");
  if(!f.rw.length) h+='<div class="ul-msg" style="padding:6px">'+esc(T("Aucune piste renseignée."))+'</div>';
  f.rw.forEach(function(r){ h+='<div class="ul-kv"><span><b style="color:var(--text,#0b0d10);font-size:16px">'+esc(r[0]+(r[1]?" / "+r[1]:""))+'</b>'+(r[5]!=null?" · "+d3(r[5])+" / "+d3((r[5]+180)%360):"")+'</span><b>'+(r[2]?nf(r[2])+" m":"–")+(r[3]?" × "+r[3]+" m":"")+" · "+esc(surfName(r[4]))+'</b></div>'; });
  h+='</div><div class="ul-card">'+h1("Fréquences"); if(!f.fq.length) h+='<div class="ul-msg" style="padding:6px">'+esc(T("Aucune fréquence renseignée."))+'</div>';
  f.fq.forEach(function(q){ h+='<div class="ul-kv"><span>'+esc(q[0])+'</span><b>'+q[1].toFixed(3)+' MHz</b></div>'; });
  h+='</div><div class="ul-card">'+h1("Performances")+'<div class="ul-kv"><span>'+esc(T("Altitude du terrain"))+'</span><b>'+nf(f.elev)+" ft · "+nf(f.elev*0.3048)+' m</b></div>';
  if(o && o.qnh!=null){ var pa=f.elev+(1013.25-o.qnh)*27; h+='<div class="ul-kv"><span>'+esc(T("Altitude-pression"))+'</span><b>'+nf(pa)+' ft</b></div>';
    if(o.temp!=null){ var isa=15-2*pa/1000, da=pa+120*(o.temp-isa); h+='<div class="ul-kv"><span>'+esc(T("Altitude-densité"))+'</span><b>'+nf(da)+' ft</b></div>'; } }
  var sun=sunTimes(f.lat,f.lon,new Date()); if(sun) h+='<div class="ul-kv"><span>'+esc(T("Lever"))+" / "+esc(T("Coucher"))+'</span><b>'+hm(sun.rise)+" · "+hm(sun.set)+'</b></div><div class="ul-kv"><span>'+esc(T("Nuit aéronautique"))+'</span><b>'+hm(new Date(+sun.set+18e5))+'</b></div>';
  h+='<div class="ul-kv"><span>'+esc(T("Coordonnées"))+'</span><b>'+dms(f.lat,"N","S")+"<br>"+dms(f.lon,"E",lang()===1?"W":"O")+'</b></div></div>';
  h+='<div class="ul-card"><div class="ul-links"><a href="https://www.google.com/maps/search/?api=1&query='+f.lat+"%2C"+f.lon+'" target="_blank" rel="noopener">'+esc(T("Voir sur la carte"))+'<span>›</span></a>';
  if(f.cc==="FR"){ h+='<a href="https://www.sia.aviation-civile.gouv.fr/" target="_blank" rel="noopener">'+esc(T("Cartes et infos officielles (SIA)"))+'<span>›</span></a><a href="https://aviation.meteo.fr/" target="_blank" rel="noopener">'+esc(T("Météo officielle (Aeroweb)"))+'<span>›</span></a>';
    if(/^LF\d{4}$/.test(f.code)) h+='<a href="https://basulm.ffplum.fr/" target="_blank" rel="noopener">'+esc(T("Fiche BASULM"))+'<span>›</span></a>'; }
  return h+'</div></div>'; }
function tendView(){ if(hist==="err") return '<div class="ul-card"><div class="ul-msg">'+esc(T("L'historique sur 24 h sera disponible ici très bientôt."))+'</div></div>';
  if(!hist) return '<div class="ul-card"><div class="ul-msg">'+esc(T("Chargement…"))+'</div></div>';
  var W=[],G=[],Q=[],Tt=[],D=[],C=[]; hist.forEach(function(o){ var t=+o.time; W.push([t,o.wind?o.wind.spd:null]); G.push([t,o.wind&&o.wind.gust?o.wind.gust:(o.wind?o.wind.spd:null)]); Q.push([t,o.qnh]); Tt.push([t,o.temp]); D.push([t,o.dew]); C.push([t,o.ceil!=null?Math.min(o.ceil,10000):null]); });
  var h='<div class="ul-card">'+h1("Dernières 24 heures");
  h+='<div class="ul-ch"><b>'+esc(T("Vent (kt)"))+'</b>'+lineChart([W,G],["#12408a","#f08a24"],{min:0,span:10,dash:true})+'</div>';
  h+='<div class="ul-ch"><b>'+esc(T("Pression (hPa)"))+'</b>'+lineChart([Q],["#1a9c55"],{span:6})+'</div>';
  h+='<div class="ul-ch"><b>'+esc(T("Température et point de rosée (°C)"))+'</b>'+lineChart([Tt,D],["#d1343f","#2f8fe0"],{span:6,dash:true})+'</div>';
  if(C.some(function(p){ return p[1]!=null; })) h+='<div class="ul-ch"><b>'+esc(T("Plafond (ft)"))+'</b>'+lineChart([C],["#66727d"],{min:0,span:2000})+'</div>';
  return h+'</div>'; }
function modeBar(){ return '<div class="ul-mode"><button data-mode="wx" class="'+(mode==="wx"?"on":"")+'">🌤️ '+esc(T("Météo terrain"))+'</button><button data-mode="nav" class="'+(mode==="nav"?"on":"")+'">🧭 '+esc(T("Plan de vol"))+'</button></div>'; }
function showNav(){ var el=root.querySelector("#ulNav"); if(!el) return; var api={ lang:lang, loadDB:loadDB, search:search, nearest:nearest, byCode:byCode, sunTimes:sunTimes, loadWx:loadWx, fltCat:fltCat, parseMetar:parseMetar, field:F,
    metarBox:function(b){ return jget(API+"?bbox="+b.map(function(x){ return x.toFixed(2); }).join(","), 9000); } };
  if(window.LFNav){ window.LFNav.show(el, api); return; } el.innerHTML='<div class="ul-card"><div class="ul-msg">'+esc(T("Chargement…"))+'</div></div>'; if(showNav.ld) return; showNav.ld=true;
  var s0=document.createElement("script"); s0.src="ulm/safety.js?v=3"; document.head.appendChild(s0);
  var sc=document.createElement("script"); sc.src="ulm/nav.js?v=4"; sc.onload=function(){ var go=function(k){ var e2=root.querySelector("#ulNav"); if(!e2 || !window.LFNav) return; if(!window.LFSafe && k<20) return setTimeout(function(){ go(k+1); }, 150); window.LFNav.show(e2, api); }; go(0); }; sc.onerror=function(){ showNav.ld=false; el.innerHTML='<div class="ul-card"><div class="ul-msg">'+esc(T("Connexion impossible. Vérifie le réseau puis réessaie."))+'</div></div>'; }; document.head.appendChild(sc); }
function render(state){ if(!root) return; var h="";
  if(mode==="nav"){ if(root.querySelector("#ulNav")) return; root.innerHTML=modeBar()+'<div id="ulNav"></div>'; showNav(); return; }
  h=modeBar();
  if(!F){ h+=searchCard(); }
  else { h+=headCard();
    if(state==="load") h+='<div class="ul-card"><div class="ul-msg">'+esc(T("Chargement…"))+'</div></div>';
    else if(state==="err") h+='<div class="ul-card"><div class="ul-msg">'+esc(T("Connexion impossible. Vérifie le réseau puis réessaie."))+'<button data-act="reload">'+esc(T("Réessayer"))+'</button></div></div>';
    else if(!WX && view!=="prev" && view!=="terrain") h+=segHtml()+'<div class="ul-card"><div class="ul-msg">'+esc(T("Aucun METAR disponible près de ce terrain pour le moment."))+'</div></div>';
    else h+=segHtml()+(view==="taf"?tafView():view==="prev"?prevView():view==="terrain"?terrainView():view==="tend"?tendView():metarView()); }
  h+='<div class="ul-disc">'+esc(T("Aide à la préparation du vol. Ne remplace pas les sources officielles (SIA, Aeroweb de Météo-France, NOTAM) ni le jugement du commandant de bord."))+'</div>';
  root.innerHTML=h; var q=root.querySelector("#ulQ"); if(q) bindSearch(q); }
function bindSearch(q){ var res=root.querySelector("#ulRes"), t=null;
  q.addEventListener("input", function(){ clearTimeout(t); t=setTimeout(function(){ var v=q.value; if(norm(v).trim().length<2){ res.innerHTML=""; return; } loadDB().then(function(){ if(q.value===v) res.innerHTML=resHtml(search(v)); }).catch(function(){ res.innerHTML='<div class="ul-note">'+esc(T("Connexion impossible. Vérifie le réseau puis réessaie."))+'</div>'; }); }, 180); }); }
function nearMe(){ var res=root.querySelector("#ulRes"); if(!res) return; res.innerHTML='<div class="ul-note">'+esc(T("Chargement…"))+'</div>';
  function fail(){ var r=root.querySelector("#ulRes"); if(r) r.innerHTML='<div class="ul-note">'+esc(T("Position indisponible. Autorise la localisation ou cherche un terrain par son nom."))+'</div>'; }
  if(!navigator.geolocation) return fail();
  navigator.geolocation.getCurrentPosition(function(p){ loadDB().then(function(){ var r=root.querySelector("#ulRes"); if(r) r.innerHTML=resHtml(nearest(p.coords.latitude,p.coords.longitude,12),true); }).catch(fail); }, fail, { enableHighAccuracy:false, timeout:12000, maximumAge:600000 }); }
function loadHist(){ if(!WX) return; if(WX.st.limited){ hist="err"; render(); return; } var id=WX.st.id, my=seq; hist=null;
  jget(API+"?ids="+id+"&hours=24", 10000).then(function(l){ if(my!==seq) return; var a=(l||[]).filter(function(x){ return x.raw && x.id===id; }).map(function(x){ var o=parseMetar(x.raw); if(x.t) o.time=new Date(x.t*1000); return o; }).filter(function(o){ return o.time; });
    a.sort(function(x,y){ return x.time-y.time; }); hist=a.length>1?a:"err"; if(view==="tend") render(); }).catch(function(){ if(my!==seq) return; hist="err"; if(view==="tend") render(); }); }
function loadFc(){ if(!F) return; var my=seq; fc=null;
  jget("https://api.open-meteo.com/v1/forecast?latitude="+F.lat+"&longitude="+F.lon+"&hourly=temperature_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,cloud_cover_low,visibility,precipitation,freezing_level_height,wind_speed_925hPa,wind_direction_925hPa,wind_speed_850hPa,wind_direction_850hPa,wind_speed_700hPa,wind_direction_700hPa&wind_speed_unit=kn&timezone=auto&forecast_days=3", 12000)
    .then(function(j){ if(my!==seq) return; fc=(j&&j.hourly&&j.hourly.time)?j:"err"; if(view==="prev") render(); }).catch(function(){ if(my!==seq) return; fc="err"; if(view==="prev") render(); }); }
function select(f){ F=f; WX=null; hist=null; fc=null; rwSel=""; view="metar"; lset("lf.ulm.last", f.code); reload(); try{ window.scrollTo({top:0}); }catch(e){} }
function reload(){ if(!F) return; var my=++seq; hist=null; render("load");
  loadWx(F).then(function(o){ if(my!==seq) return; WX=o; lastLoad=Date.now(); render(); if(view==="tend") loadHist(); if(view==="prev" && !fc) loadFc(); }).catch(function(){ if(my!==seq) return; render("err"); }); }
function onClick(e){ var b=e.target.closest("button"); if(!b || !root.contains(b)) return;
  if(b.dataset.mode){ mode=b.dataset.mode; lset("lf.ulm.mode", mode); root.innerHTML=""; render(); return; }
  if(mode==="nav") return;
  if(b.dataset.code){ loadDB().then(function(){ var f=byCode(b.dataset.code); if(f) select(f); }); return; }
  if(b.id==="ulNear") return nearMe();
  if(b.id==="ulFav"){ favToggle(F.code); return render(); }
  if(b.id==="ulChg"){ F=null; WX=null; seq++; lset("lf.ulm.last",""); return render(); }
  if(b.id==="ulRef" || b.dataset.act==="reload") return reload();
  if(b.dataset.act==="fc") return loadFc(), render();
  if(b.dataset.view){ view=b.dataset.view; render(); if(view==="tend" && !hist) loadHist(); if(view==="prev" && !fc) loadFc(); return; }
  if(b.dataset.rw){ rwSel=b.dataset.rw; return render(); } }

window.LFUlm = { show:function(pane){
    if(root!==pane){ root=pane; root.setAttribute("data-no-i18n",""); if(!document.getElementById("ulCss")){ var st=document.createElement("style"); st.id="ulCss"; st.textContent=CSS; document.head.appendChild(st); } root.addEventListener("click", onClick);
      var last=lget("lf.ulm.last",""); render(last?"load":undefined);
      loadDB().then(function(){ var f=last?byCode(last):null; if(f){ F=f; reload(); } else render(); }).catch(function(){ render(); }); return; }
    if(F && Date.now()-lastLoad>5*60000) reload(); else if(!F) render(); },
  _t:{ parseMetar:parseMetar, tafGroups:tafGroups, fltCat:fltCat, rwComp:rwComp } };
})();
