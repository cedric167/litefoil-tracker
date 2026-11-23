// Lite Foil, espace ULM / Avion : cartes de terrain affichées dans l'appli et gardées pour le vol sans réseau.
//   - carte VAC du SIA (atlas VAC de l'eAIP France, un dossier par cycle AIRAC de 28 jours) pour les terrains LFxx ;
//   - fiche BASULM de la FFPLUM pour les bases ULM LFdddd.
// Le fichier est lu directement sur le site officiel par le téléphone (jamais par un serveur Lite Foil), puis gardé sur l'appareil.
// Dans un navigateur, les sites officiels n'autorisent pas la lecture par une autre page : le lien s'ouvre alors sur le site officiel.
(function(){
"use strict";
var CACHE="lf-tiles-v1", KEY="https://docs.litefoil.invalid/", PDFJS="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
var MON=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"], BASE=Date.UTC(2026,9,29), CYC=28*86400000, OLD=28*86400000;
var TR={ "Carte du terrain":["Aerodrome chart","Carta del aeródromo"],"Source : ENAIRE (AIP España, Guía VFR)":["Source: ENAIRE (AIP España, Guía VFR)","Fuente: ENAIRE (AIP España, Guía VFR)"], "Carte VAC":["VAC chart","Carta VAC"], "Fiche BASULM":["BASULM sheet","Ficha BASULM"], "Chargement de la carte…":["Loading the chart…","Cargando la carta…"],
  "Source : SIA, atlas VAC":["Source: SIA (France), VAC atlas","Fuente: SIA (Francia), atlas VAC"], "Source : BASULM (FFPLUM)":["Source: BASULM (FFPLUM)","Fuente: BASULM (FFPLUM)"],
  "enregistrée le":["saved on","guardada el"], "Site officiel":["Official site","Sitio oficial"], "Fermer":["Close","Cerrar"],
  "Carte indisponible dans l'appli pour l'instant. Ouvre-la sur le site officiel.":["Chart unavailable in the app for now. Open it on the official site.","Carta no disponible en la app por ahora. Ábrela en el sitio oficial."],
  "Copie de plus de 28 jours : vérifie la version en vigueur sur le site officiel.":["Copy older than 28 days: check the current version on the official site.","Copia de más de 28 días: comprueba la versión vigente en el sitio oficial."],
  "Document officiel, à vérifier avant le vol. Lite Foil est une aide à la navigation.":["Official document, to be checked before the flight. Lite Foil is a navigation aid.","Documento oficial, a comprobar antes del vuelo. Lite Foil es una ayuda a la navegación."] };
function lang(){ var l=""; try{ l=localStorage.getItem("lf-lang")||""; }catch(e){} if(!l) l=(navigator.language||"fr").slice(0,2); l=l.toLowerCase(); return l==="en"?1:l==="es"?2:0; }
function T(s){ var i=lang(); return i && TR[s] ? TR[s][i-1] : s; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return "&#"+c.charCodeAt(0)+";"; }); }
function p2(n){ return (n<10?"0":"")+n; }
function dmy(t){ var d=new Date(t); return p2(d.getDate())+"/"+p2(d.getMonth()+1)+"/"+d.getFullYear(); }
function okCode(kind, code){ return kind==="vac" ? /^LF[A-Z]{2}$/.test(code) : kind==="bas" ? /^LF\d{4}$/.test(code) : kind==="es" ? /^(LE|GC|GE)[A-Z]{2}$/.test(code) : false; }
// Espagne : carte VAC de l'AIP España si le terrain en a une, sinon fiche de la Guía VFR (terrains à usage restreint). Lues sur le site d'ENAIRE.
function lab(kind){ return kind==="vac" ? T("Carte VAC") : kind==="es" ? T("Carte du terrain") : T("Fiche BASULM"); }
function src(kind){ return kind==="vac" ? T("Source : SIA, atlas VAC") : kind==="es" ? T("Source : ENAIRE (AIP España, Guía VFR)") : T("Source : BASULM (FFPLUM)"); }
function site(kind, code){ return kind==="es" ? "https://aip.enaire.es/AIP/" : urls(kind, code)[0]; }
function cyc(n){ var d=new Date(BASE+n*CYC); return "eAIP_"+p2(d.getUTCDate())+"_"+MON[d.getUTCMonth()]+"_"+d.getUTCFullYear(); }
// adresses officielles : pour la VAC, le cycle en vigueur puis le précédent (le nouveau dossier peut arriver avec un peu de retard)
function urls(kind, code){ if(kind==="bas") return ["https://basulm.ffplum.fr/PDF/"+code+".pdf"]; if(kind==="es") return ["https://aip.enaire.es/AIP/contenido_AIP/AD/AD2/"+code+"/LE_AD_2_"+code+"_VAC_1_en.pdf", "https://guiavfr.enaire.es/contenido_GuiaVFR/AD/LE_guiaVFR_"+code+".pdf"]; var n=Math.floor((Date.now()-BASE)/CYC);
  return [n, n-1].map(function(k){ return "https://www.sia.aviation-civile.gouv.fr/media/dvd/"+cyc(k)+"/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2."+code+".pdf"; }); }
function http(){ try{ var C=window.Capacitor; if(!C || !(C.isNativePlatform && C.isNativePlatform())) return null; return (C.Plugins && C.Plugins.CapacitorHttp) || null; }catch(e){ return null; } }
function isPdf(u){ return u && u.length>1000 && u[0]===0x25 && u[1]===0x50 && u[2]===0x44 && u[3]===0x46; }
function b64(s){ var bin=atob(String(s).replace(/\s+/g,"")), u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
function fetchPdf(url){ var H=http();
  if(H) return H.request({ url:url, method:"GET", responseType:"blob", connectTimeout:15000, readTimeout:40000 }).then(function(r){ if(!r || r.status!==200 || typeof r.data!=="string") throw new Error("http"); var u=b64(r.data); if(!isPdf(u)) throw new Error("pdf"); return u; });
  return fetch(url,{ mode:"cors", credentials:"omit" }).then(function(r){ if(!r.ok) throw new Error("http"); return r.arrayBuffer(); }).then(function(a){ var u=new Uint8Array(a); if(!isPdf(u)) throw new Error("pdf"); return u; }); }
function ck(kind, code){ return KEY+kind+"/"+code+".pdf"; }
function cget(kind, code){ if(!window.caches) return Promise.resolve(null);
  return caches.open(CACHE).then(function(c){ return c.match(ck(kind,code)); }).then(function(r){ if(!r) return null; var t=+(r.headers.get("x-lf-t")||0); return r.arrayBuffer().then(function(a){ return { bytes:new Uint8Array(a), t:t, saved:true }; }); }).catch(function(){ return null; }); }
function cput(kind, code, bytes){ if(!window.caches) return Promise.resolve();
  return caches.open(CACHE).then(function(c){ return c.put(ck(kind,code), new Response(bytes.slice(0),{ headers:{ "content-type":"application/pdf", "x-lf-t":String(Date.now()) } })); }).catch(function(){}); }
// copie récente gardée : on la sert tout de suite ; sinon on lit le site officiel, et à défaut de réseau on ressort l'ancienne copie
function get(kind, code){ return cget(kind, code).then(function(c){ if(c && Date.now()-c.t<OLD && isPdf(c.bytes)) return c;
    var l=urls(kind, code), i=0, step=function(){ if(i>=l.length) return Promise.reject(new Error("absent")); var u=l[i++]; return fetchPdf(u).catch(step); };
    return step().then(function(b){ cput(kind, code, b); return { bytes:b, t:Date.now(), saved:false }; }, function(e){ if(c && isPdf(c.bytes)) return c; throw e; }); }); }
// bibliothèque d'affichage PDF (pdf.js), gardée elle aussi pour le vol sans réseau
var libP=null;
function blobUrl(url){ var net=function(){ return fetch(url,{ mode:"cors", credentials:"omit" }).then(function(r){ if(!r.ok) throw new Error("lib"); if(window.caches){ var k=r.clone(); caches.open(CACHE).then(function(c){ return c.put(url, k); }).catch(function(){}); } return r.text(); }); };
  var p=window.caches ? caches.open(CACHE).then(function(c){ return c.match(url); }).then(function(r){ return r ? r.text() : net(); }, net) : net();
  return p.then(function(t){ return URL.createObjectURL(new Blob([t],{ type:"text/javascript" })); }); }
function lib(){ if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(!libP) libP=Promise.all([blobUrl(PDFJS+"pdf.min.js"), blobUrl(PDFJS+"pdf.worker.min.js")]).then(function(u){ return new Promise(function(ok, no){ var s=document.createElement("script"); s.src=u[0];
      s.onload=function(){ if(!window.pdfjsLib) return no(new Error("lib")); window.pdfjsLib.GlobalWorkerOptions.workerSrc=u[1]; ok(window.pdfjsLib); }; s.onerror=function(){ no(new Error("lib")); }; document.head.appendChild(s); }); })
    .catch(function(e){ libP=null; throw e; });
  return libP; }
function css(){ if(document.getElementById("lfDocCss")) return; var s=document.createElement("style"); s.id="lfDocCss";
  s.textContent=".lfd{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9800;background:#11181d;color:#fff;display:flex;flex-direction:column;font-family:inherit}"
   +".lfd-h{flex:none;display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;background:#0e1417}"
   +".lfd-h div{flex:1;min-width:0}.lfd-h b{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lfd-h small{display:block;font-size:11.5px;color:#9fb0b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
   +".lfd-h button,.lfd-h a{flex:none;display:flex;align-items:center;justify-content:center;min-width:40px;height:40px;padding:0 10px;border:0;border-radius:20px;background:#22303a;color:#fff;font:inherit;font-size:18px;font-weight:800;text-decoration:none;cursor:pointer}"
   +".lfd-h a{font-size:12.5px}.lfd-b{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;background:#5b6770}.lfd-w{width:100%;margin:0 auto}.lfd-w canvas{display:block;width:100%;height:auto;margin:0 0 6px;background:#fff}"
   +".lfd-m{padding:40px 22px;text-align:center;font-size:15px;line-height:1.5}.lfd-m a{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:14px;background:#159f9f;color:#fff;font-weight:800;text-decoration:none}"
   +".lfd-f{flex:none;padding:7px 12px calc(env(safe-area-inset-bottom,0px) + 7px);background:#0e1417;font-size:11px;line-height:1.4;color:#9fb0b8;text-align:center}.lfd-f b{color:#ffb4a8}";
  document.head.appendChild(s); }
function open(kind, code, title){ if(!okCode(kind, code)) return false; css(); var old=document.getElementById("lfDoc"); if(old) old.remove();
  var off=site(kind, code), el=document.createElement("div"); el.id="lfDoc"; el.className="lfd"; el.setAttribute("data-no-i18n","");
  el.innerHTML='<div class="lfd-h"><div><b>'+esc(lab(kind)+" · "+(title||code))+'</b><small id="lfDocS">'+esc(src(kind))+'</small></div>'
    +'<button type="button" data-z="-1" aria-label="−">−</button><button type="button" data-z="1" aria-label="+">+</button><a href="'+esc(off)+'" target="_blank" rel="noopener">'+esc(T("Site officiel"))+'</a><button type="button" data-z="x" aria-label="'+esc(T("Fermer"))+'">✕</button></div>'
    +'<div class="lfd-b"><div class="lfd-w" id="lfDocW"><div class="lfd-m">'+esc(T("Chargement de la carte…"))+'</div></div></div><div class="lfd-f" id="lfDocF">'+esc(T("Document officiel, à vérifier avant le vol. Lite Foil est une aide à la navigation."))+'</div>';
  document.body.appendChild(el); var zoom=1, W=el.querySelector("#lfDocW"), alive=function(){ return document.getElementById("lfDoc")===el; };
  el.addEventListener("click", function(ev){ var b=ev.target.closest("button"); if(!b) return; var z=b.dataset.z; if(z==="x"){ el.remove(); return; } zoom=Math.max(1, Math.min(4, zoom+(z==="1"?0.5:-0.5))); W.style.width=(zoom*100)+"%"; });
  var fail=function(){ if(!alive()) return; W.innerHTML='<div class="lfd-m">'+esc(T("Carte indisponible dans l'appli pour l'instant. Ouvre-la sur le site officiel."))+'<br><a href="'+esc(off)+'" target="_blank" rel="noopener">'+esc(T("Site officiel"))+'</a></div>'; };
  Promise.all([get(kind, code), lib()]).then(function(r){ if(!alive()) return; var doc=r[0], PJ=r[1];
    var s=el.querySelector("#lfDocS"); if(s) s.textContent=src(kind)+" · "+T("enregistrée le")+" "+dmy(doc.t);
    if(Date.now()-doc.t>OLD){ var f=el.querySelector("#lfDocF"); if(f) f.innerHTML='<b>'+esc(T("Copie de plus de 28 jours : vérifie la version en vigueur sur le site officiel."))+'</b>'; }
    return PJ.getDocument({ data:doc.bytes.slice(0) }).promise.then(function(pdf){ if(!alive()) return; W.innerHTML=""; var n=Math.min(pdf.numPages, 16), px=Math.min(2000, Math.round((window.innerWidth||400)*Math.min(3,(window.devicePixelRatio||1)*1.6)));
      var one=function(i){ if(i>n || !alive()) return; return pdf.getPage(i).then(function(pg){ var v0=pg.getViewport({ scale:1 }), v=pg.getViewport({ scale:px/v0.width }), cv=document.createElement("canvas"); cv.width=Math.round(v.width); cv.height=Math.round(v.height); W.appendChild(cv);
          return pg.render({ canvasContext:cv.getContext("2d"), viewport:v }).promise; }).then(function(){ return one(i+1); }); };
      return one(1); }); }).catch(fail);
  return true; }
// enregistre une carte pour le vol sans réseau (résout vrai si elle est sur l'appareil)
function save(kind, code){ if(!okCode(kind, code) || !http()) return Promise.resolve(false); lib().catch(function(){}); return get(kind, code).then(function(){ return true; }, function(){ return false; }); }
// un lien <a href="site officiel" data-lfdoc="vac" data-code="LFMP"> s'ouvre dans l'appli ; dans un navigateur il garde son comportement de lien
document.addEventListener("click", function(ev){ var a=ev.target && ev.target.closest ? ev.target.closest("[data-lfdoc]") : null; if(!a || !http()) return;
  if(open(a.dataset.lfdoc, a.dataset.code||"", a.dataset.title||"")){ ev.preventDefault(); ev.stopPropagation(); } }, true);
window.LFDocs={ open:open, save:save, ok:okCode, urls:urls, site:site, native:function(){ return !!http(); }, _get:get, _lib:lib, _cyc:cyc };
})();
