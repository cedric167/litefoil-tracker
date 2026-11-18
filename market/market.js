// Lite Foil : « Second Lite » (14/11/2026)
// Matériel neuf et d'occasion, location et prêt entre riders : annonces avec photos, filtres par discipline,
// état précis, historique des réparations, profil vendeur (quiver, badges, avis), carte des annonces.
// Données : /market (annonces), /marketMedia (photos), /marketReviews (avis vendeur), /quiver (profil vendeur).
(function(){
"use strict";
var root=null, view="vente", F={ q:"", sport:"", cat:"", brand:"", state:"", max:"", neuf:"", sort:"new" }, LIST=null, listAt=0, page=null, myPos=null, map=null, busy=false, formS=null, mem={};

// ---------- référentiel ----------
var A3=["Chaussures","Vêtements","Accessoires"];
var SPORTS=[
 ["surf","Surf","🏄",["Planche","Dérives et ailerons","Accessoires"]],
 ["sup","Stand up paddle","🛶",["Planche","Dérives et ailerons","Pagaie","Foil","Accessoires"]],
 ["efoil","E-foil","⚡",["Planche","Batterie","Accessoires"]],
 ["wingfoil","Wing foil","🪂",["Planche","Voile","Foil","Accessoires"]],
 ["windsurf","Windsurf","⛵",["Planche","Mât","Voile","Ailerons et dérives","Accessoires"]],
 ["pumpfoil","Pump foil","🦵",["Planche","Foil","Accessoires"]],
 ["parawing","Parawing","🪁",["Planche","Voile","Foil","Accessoires"]],
 ["bodyboard","Bodyboard","🌊",["Planche","Accessoires"]],
 ["canoe","Canoë / Kayak","🚣",["Canoë / Kayak","Accessoires"]],
 ["deriveur","Dériveur","⛵",["Bateau","Voile","Accessoires"]],
 ["swim","Natation","🏊",["Maillot","Bonnet","Accessoires"]],
 ["kitesurf","Kitesurf","🪁",["Planche","Aile","Ailerons et dérives","Accessoires"]],
 ["jetski","Jetski","🚤",["Jetski","Accessoires"]],
 ["running","Course à pied","🏃",A3],
 ["velo","Vélo","🚴",["Vélo de route","BMX","Vélo électrique","VTT","Accessoires"]],
 ["skate","Skateboard","🛹",["Skateboard","Longboard","Surfskate","Accessoires"]],
 ["marche","Marche athlétique","🚶",A3],
 ["rando","Randonnée","🥾",A3],
 ["trail","Trail","⛰️",A3],
 ["ski","Ski","🎿",["Skis","Bâtons","Chaussures","Vêtements","Accessoires"]],
 ["roller","Roller","🛼",["Rollers","Protections","Accessoires"]],
 ["athle","Athlétisme","🤸",A3],
 ["parapente","Parapente","🪂",["Parapente","Aile","Accessoires"]],
 ["snowboard","Snowboard","🏂",["Planche","Chaussures","Vêtements","Accessoires"]]
];
var SP={}; SPORTS.forEach(function(s){ SP[s[0]]={ k:s[0], n:s[1], e:s[2], cats:s[3] }; });
var B_FOIL=["Lite Foil","Fliteboard","Lift Foils","Waydoo","Audi e-tron foil","Aerofoils","Takuma","Manta5","SiFly","Awake","Radinn","F-One","Duotone","Fanatic","Naish","Cabrinha","North","Slingshot","Armstrong","Axis","Gong","AFS","Sabfoil","Starboard","KT","Appletree","Omen","Unifoil","Lokefoil","Code Foils","Ensis","Ozone","Reedin","Eleveight","Core","RRD","JP Australia","Tabou","Severne","Indiana","Sroka","Flysurfer","BRM","Ride Engine","Mystic","ION","Manera","Prolimit","Dakine"];
var B_SURF=["Rip Curl","Quiksilver","Billabong","O'Neill","Roxy","Hurley","Volcom","Channel Islands","Lost","Pyzel","JS Industries","Firewire","Slater Designs","DHD","Torq","NSP","Softech","Catch Surf","Olaian","Rusty","Sharp Eye","Pukas","Chilli","Haydenshapes","Bic / Tahe","FCS","Futures","Creatures of Leisure","Ocean & Earth","Dakine","Xcel","Patagonia","Vissla","Picture","Manera","Mystic","ION","Gong"];
var B_SUP=["Starboard","Fanatic","Red Paddle Co","Naish","SIC Maui","Itiwit","Tahe","JP Australia","NSP","Aztron","Aqua Marina","Jobe","Gong","F-One","Indiana","Sroka","RRD","Infinity","Mistral","Quatro","Black Project","Quickblade","Kialoa"];
var B_WIND=["Neil Pryde","Fanatic","Duotone","JP Australia","Starboard","Severne","Gaastra","GA Sails","Tabou","RRD","Goya","Quatro","Simmer Style","Point-7","Loftsails","North Sails","Ezzy","Naish","Mistral","Bic / Tahe","Exocet","Patrik","Future Fly","Unifiber","Chinook","Aeron","Select","MFC","Maui Ultra Fins","ION","Mystic","Prolimit","Dakine"];
var B_KITE=["Duotone","F-One","North","Cabrinha","Naish","Core","Ozone","Slingshot","Eleveight","Flysurfer","Airush","RRD","Reedin","Liquid Force","Best","Gaastra","Crazyfly","Nobile","Shinn","Lieuwe","Carved","Harlem","Ocean Rodeo","Takoon","Zeeko","Gong","Mystic","ION","Manera","Ride Engine","Prolimit","Dakine"];
var B_BODY=["Pride","NMD","Science","Sniper","Hubboards","Versus","VS","Found","Morey","Manta","Nomad","Olaian","Churchill","Viper","Limited Edition","Gyroll"];
var B_KAYAK=["Rotomod","Bic / Tahe","Dag","RTM","Itiwit","Sevylor","Gumotex","Advanced Elements","Perception","Wilderness Systems","Dagger","Pyranha","Prijon","Nelo","Hobie","Old Town","Ocean Kayak","Point 65","Aqua Marina","Zray","Select","Werner"];
var B_VOILE=["Laser / ILCA","RS Sailing","Hobie Cat","Nacra","Topper","Optimist","Bic / Tahe","Erplast","Zim","Devoti","Winner","North Sails","Elvstrøm","Harken","Ronstan","Spinlock","Musto","Helly Hansen","Gill","Zhik","Magic Marine","Rooster"];
var B_SWIM=["Speedo","Arena","TYR","Nabaiji","Zoggs","Aqua Sphere","Jaked","Mako","Head","Orca","Zone3","Huub","Sailfish","Mad Wave","Finis","Funkita","Kiwami"];
var B_JET=["Sea-Doo","Yamaha","Kawasaki","Krash","Belassi","Jobe","Jettribe","Riva Racing","Solas","WOW","O'Brien"];
var B_RUN=["Nike","Adidas","Asics","Hoka","Saucony","Brooks","New Balance","Salomon","On","Mizuno","Puma","Altra","Kiprun","Kalenji","Evadict","La Sportiva","Scarpa","The North Face","Columbia","Merrell","Millet","Lafuma","Quechua","Mammut","Salewa","Arc'teryx","Patagonia","Compressport","Raidlight","Instinct","Garmin","Suunto","Coros","Polar","Black Diamond","Leki","Petzl","Osprey","Deuter","Under Armour","Craft","Odlo","Gore Wear","Decathlon"];
var B_VELO=["Trek","Specialized","Giant","Cannondale","Scott","Canyon","BMC","Orbea","Lapierre","Look","Time","Pinarello","Bianchi","Cervélo","Colnago","Merida","Cube","Focus","Rose","Ridley","Wilier","Santa Cruz","Commencal","YT","Mondraker","Yeti","Rocky Mountain","Kona","GT","Sunn","Moustache","Haibike","Riese & Müller","Van Rysel","B'Twin","Rockrider","Triban","Peugeot","Gitane","Cowboy","VanMoof","Brompton","Cult","Sunday","WeThePeople","Mongoose","Haro","Shimano","SRAM","Campagnolo","Mavic","DT Swiss","Fox","RockShox","Garmin","Wahoo","Giro","Kask","POC","Abus","Met"];
var B_SKATE=["Santa Cruz","Element","Baker","Girl","Chocolate","Plan B","Powell Peralta","Toy Machine","Zero","Almost","Enjoi","Real","Antihero","Krooked","Globe","Arbor","Loaded","Landyachtz","Sector 9","Carver","YOW","Smoothstar","Slide","Miller","Flying Wheels","Long Island","Independent","Thunder","Venture","Spitfire","Bones","Vans","DC Shoes","Etnies","Oxelo","Rollerblade","K2","Powerslide","Seba","FR Skates","Fila","Micro","Roces"];
var B_SKI=["Rossignol","Salomon","Atomic","Head","Fischer","Völkl","Dynastar","K2","Nordica","Blizzard","Elan","Black Crows","Faction","Line","Armada","Movement","Zag","Scott","Dynafit","Lange","Tecnica","Dalbello","Marker","Look","Tyrolia","Leki","Burton","Jones","Nitro","Ride","Capita","Lib Tech","Gnu","Never Summer","Arbor","Nidecker","Bataleon","Rome","Union","Flow","Salomon Snowboards","Drake","ThirtyTwo","DC Shoes","Vans","Oakley","Smith","Anon","Giro","POC","Picture","Volcom","Quiksilver","Roxy","The North Face","Helly Hansen","Millet","Wedze","Dreamscape"];
var B_PARA=["Ozone","Advance","Gin","Nova","Niviuk","Skywalk","Swing","Supair","BGD","Phi","Triple Seven","Dudek","Mac Para","U-Turn","Sky Paragliders","AirDesign","Sup'Air","Kortel","Woody Valley","Neo","Syride","Skytraxx","XC Tracer","Flymaster","Icaro","Charly"];
var BR={ surf:B_SURF, sup:B_SUP.concat(B_FOIL), efoil:B_FOIL, wingfoil:B_FOIL, windsurf:B_WIND, pumpfoil:B_FOIL, parawing:B_FOIL, bodyboard:B_BODY, canoe:B_KAYAK, deriveur:B_VOILE, swim:B_SWIM, kitesurf:B_KITE, jetski:B_JET,
  running:B_RUN, velo:B_VELO, skate:B_SKATE, marche:B_RUN, rando:B_RUN, trail:B_RUN, ski:B_SKI, roller:B_SKATE, athle:B_RUN, parapente:B_PARA, snowboard:B_SKI };
function brandsOf(sp){ var l=sp && BR[sp] ? BR[sp] : [].concat(B_FOIL,B_SURF,B_SUP,B_WIND,B_KITE,B_RUN,B_VELO,B_SKATE,B_SKI,B_PARA,B_KAYAK,B_VOILE,B_SWIM,B_JET,B_BODY); var seen={}, out=[]; l.forEach(function(b){ var k=b.toLowerCase(); if(!seen[k]){ seen[k]=1; out.push(b); } }); return out.sort(function(a,b){ return a.localeCompare(b); }); }
var STATES=[["Neuf avec étiquette","#1a9c55"],["Excellent (très peu servi)","#39a845"],["Bon","#c9a200"],["Abîmé","#e07a1f"],["Mauvais état","#d1343f"]];
var SHIP=[["poste","La Poste","📮"],["colissimo","Colissimo","📦"],["geodis","Geodis","🚚"],["place","À venir chercher sur place","🤝"]];
var TYPES={ v:["Vente","À vendre"], l:["Location","À louer"], p:["Prêt","À prêter"] };
var PER={ j:"jour", we:"week-end", sem:"semaine" };

// ---------- langue ----------
var TR={
 "Second Lite":["Second Lite","Second Lite"],"Matériel neuf et d'occasion, location et prêt entre riders":["New and used gear, rental and lending between riders","Material nuevo y de segunda mano, alquiler y préstamo entre riders"],
 "Déposer une annonce":["Post a listing","Publicar un anuncio"],"Favoris":["Favourites","Favoritos"],"favoris":["favourites","favoritos"],"favori":["favourite","favorito"],"Aucun favori pour le moment.":["No favourites yet.","Aún no tienes favoritos."],"Ouvre une annonce et touche « Ajouter à mes favoris » pour la retrouver ici.":["Open a listing and tap “Add to my favourites” to find it here.","Abre un anuncio y toca «Añadir a mis favoritos» para encontrarlo aquí."],"Ajouter à mes favoris":["Add to my favourites","Añadir a mis favoritos"],"Dans mes favoris":["In my favourites","En mis favoritos"],"Ajoutée à tes favoris.":["Added to your favourites.","Añadido a tus favoritos."],"Retirée de tes favoris.":["Removed from your favourites.","Quitado de tus favoritos."],"Acheter":["Buy","Comprar"],"Louer":["Rent","Alquilar"],"Carte":["Map","Mapa"],"Mon espace":["My space","Mi espacio"],
 "Rechercher (planche, marque, ville…)":["Search (board, brand, town…)","Buscar (tabla, marca, ciudad…)"],"Toutes les disciplines":["All sports","Todas las disciplinas"],"Toutes les catégories":["All categories","Todas las categorías"],
 "Toutes les marques":["All brands","Todas las marcas"],"Tous les états":["Any condition","Cualquier estado"],"Prix max":["Max price","Precio máx"],"Neuf et occasion":["New and used","Nuevo y usado"],"Neuf":["New","Nuevo"],"Occasion":["Used","Segunda mano"],
 "Plus récentes":["Newest","Más recientes"],"Prix croissant":["Price low to high","Precio ascendente"],"Prix décroissant":["Price high to low","Precio descendente"],"Plus proches":["Nearest","Más cercanos"],
 "Effacer les filtres":["Clear filters","Borrar filtros"],"annonce":["listing","anuncio"],"annonces":["listings","anuncios"],"Chargement…":["Loading…","Cargando…"],
 "Aucune annonce ne correspond pour le moment.":["No listing matches for now.","Ningún anuncio coincide por ahora."],"Sois le premier à déposer la tienne.":["Be the first to post yours.","Sé el primero en publicar el tuyo."],
 "Vente":["Sale","Venta"],"Location":["Rental","Alquiler"],"Prêt":["Loan","Préstamo"],"À vendre":["For sale","En venta"],"À louer":["For rent","En alquiler"],"À prêter":["To lend","Para prestar"],"Gratuit":["Free","Gratis"],"Vendu":["Sold","Vendido"],
 "jour":["day","día"],"week-end":["weekend","fin de semana"],"semaine":["week","semana"],"Caution":["Deposit","Fianza"],
 "Neuf avec étiquette":["New with tag","Nuevo con etiqueta"],"Excellent (très peu servi)":["Excellent (barely used)","Excelente (muy poco uso)"],"Bon":["Good","Bueno"],"Abîmé":["Damaged","Dañado"],"Mauvais état":["Poor condition","Mal estado"],
 "État":["Condition","Estado"],"Description":["Description","Descripción"],"Historique des réparations":["Repair history","Historial de reparaciones"],"Aucune réparation déclarée par le vendeur.":["No repair declared by the seller.","Ninguna reparación declarada por el vendedor."],
 "Remise et envoi":["Handover and shipping","Entrega y envío"],"La Poste":["Post office","Correos"],"À venir chercher sur place":["Pick up on site","Recoger en el lugar"],"Lieu":["Location","Lugar"],
 "Le vendeur":["The seller","El vendedor"],"Voir le profil vendeur":["See seller profile","Ver perfil del vendedor"],"Message":["Message","Mensaje"],"Appeler":["Call","Llamar"],"Signaler":["Report","Denunciar"],"Signalée, merci.":["Reported, thank you.","Denunciado, gracias."],
 "Modifier":["Edit","Editar"],"Marquer comme vendu":["Mark as sold","Marcar como vendido"],"Remettre en ligne":["Put back online","Volver a publicar"],"Supprimer":["Delete","Eliminar"],"Supprimer cette annonce ?":["Delete this listing?","¿Eliminar este anuncio?"],
 "Retour":["Back","Volver"],"Rider Certifié":["Certified Rider","Rider Certificado"],"Local Spot":["Local Spot","Local Spot"],"Équipe Lite Foil":["Lite Foil Team","Equipo Lite Foil"],"Membre depuis":["Member since","Miembro desde"],
 "sorties enregistrées":["recorded sessions","salidas registradas"],"Spots favoris":["Favourite spots","Spots favoritos"],"avis":["reviews","opiniones"],"Aucun avis pour le moment.":["No review yet.","Sin opiniones por ahora."],
 "Annonces":["Listings","Anuncios"],"Quiver":["Quiver","Quiver"],"Avis":["Reviews","Opiniones"],"Laisser un avis":["Leave a review","Dejar una opinión"],"Ton avis sur ce vendeur (sérieux, état du matériel, échange…)":["Your review of this seller (reliability, gear condition, exchange…)","Tu opinión sobre este vendedor (seriedad, estado del material, trato…)"],
 "Publier mon avis":["Post my review","Publicar mi opinión"],"Choisis une note.":["Pick a rating.","Elige una nota."],"Merci, ton avis est publié.":["Thanks, your review is posted.","Gracias, tu opinión está publicada."],
 "Son quiver":["Their quiver","Su quiver"],"Mon quiver":["My quiver","Mi quiver"],"Le matériel que tu possèdes ou as possédé. Il s'affiche sur ton profil vendeur et rassure les acheteurs.":["The gear you own or have owned. It shows on your seller profile and reassures buyers.","El material que tienes o has tenido. Se muestra en tu perfil de vendedor y da confianza."],
 "Ajouter au quiver":["Add to quiver","Añadir al quiver"],"Modèle (ex. Fanatic Sky Wing 5'4)":["Model (e.g. Fanatic Sky Wing 5'4)","Modelo (p. ej. Fanatic Sky Wing 5'4)"],"Je l'ai encore":["I still own it","Aún lo tengo"],"Je l'ai eu":["I used to own it","Lo tuve"],"Actuel":["Current","Actual"],"Ancien":["Former","Anterior"],
 "Quiver vide pour le moment.":["Quiver empty for now.","Quiver vacío por ahora."],"Mes annonces":["My listings","Mis anuncios"],"Tu n'as pas encore d'annonce.":["You have no listing yet.","Aún no tienes anuncios."],"Voir mon profil vendeur":["See my seller profile","Ver mi perfil de vendedor"],
 "Nouvelle annonce":["New listing","Nuevo anuncio"],"Modifier l'annonce":["Edit listing","Editar anuncio"],"Type d'annonce":["Listing type","Tipo de anuncio"],"Photos (3 minimum, 6 maximum)":["Photos (3 minimum, 6 maximum)","Fotos (mínimo 3, máximo 6)"],"Ajouter":["Add","Añadir"],
 "Titre de l'annonce":["Listing title","Título del anuncio"],"Discipline":["Sport","Disciplina"],"Catégorie":["Category","Categoría"],"Marque":["Brand","Marca"],"Prix (€)":["Price (€)","Precio (€)"],"Prix de location (€)":["Rental price (€)","Precio de alquiler (€)"],"par":["per","por"],
 "Caution demandée (€)":["Deposit required (€)","Fianza solicitada (€)"],"Décris ton matériel : année, dimensions, volume, ce qui est inclus…":["Describe your gear: year, size, volume, what is included…","Describe tu material: año, medidas, volumen, qué incluye…"],
 "Réparations effectuées (ex. pet au rail réparé en 2025 par un pro). Laisse vide s'il n'y en a aucune.":["Repairs done (e.g. rail ding fixed by a pro in 2025). Leave empty if none.","Reparaciones hechas (p. ej. golpe en el canto reparado en 2025). Deja vacío si no hay."],
 "Contact":["Contact","Contacto"],"Par message dans l'appli":["By message in the app","Por mensaje en la app"],"Par téléphone":["By phone","Por teléfono"],"Numéro de téléphone":["Phone number","Número de teléfono"],
 "Où se trouve le matériel ?":["Where is the gear?","¿Dónde está el material?"],"Ville ou spot":["Town or spot","Ciudad o spot"],"Ma position":["My position","Mi posición"],"Seule la ville est affichée, jamais ton adresse.":["Only the town is shown, never your address.","Solo se muestra la ciudad, nunca tu dirección."],
 "Publier l'annonce":["Publish listing","Publicar anuncio"],"Enregistrer":["Save","Guardar"],"Annuler":["Cancel","Cancelar"],"Envoi des photos…":["Uploading photos…","Subiendo fotos…"],"Annonce en ligne.":["Listing online.","Anuncio publicado."],
 "Ajoute au moins 3 photos.":["Add at least 3 photos.","Añade al menos 3 fotos."],"Donne un titre à ton annonce.":["Give your listing a title.","Pon un título a tu anuncio."],"Choisis la discipline et la catégorie.":["Pick the sport and category.","Elige la disciplina y la categoría."],
 "Indique l'état du matériel.":["State the gear's condition.","Indica el estado del material."],"Indique un prix.":["Enter a price.","Indica un precio."],"Ajoute un descriptif (20 caractères minimum).":["Add a description (20 characters minimum).","Añade una descripción (mínimo 20 caracteres)."],
 "Choisis au moins un mode de remise ou d'envoi.":["Pick at least one handover or shipping option.","Elige al menos un modo de entrega o envío."],"Choisis au moins un moyen de contact.":["Pick at least one contact method.","Elige al menos un medio de contacto."],"Indique un numéro de téléphone valide.":["Enter a valid phone number.","Indica un número de teléfono válido."],
 "Indique où se trouve le matériel.":["Say where the gear is.","Indica dónde está el material."],"L'envoi a échoué. Vérifie ta connexion puis réessaie.":["Upload failed. Check your connection and try again.","El envío falló. Comprueba tu conexión e inténtalo de nuevo."],
 "Crée ton profil et valide ton e-mail (onglet Profil) pour déposer une annonce, écrire à un vendeur ou laisser un avis.":["Create your profile and verify your e-mail (Profile tab) to post a listing, message a seller or leave a review.","Crea tu perfil y valida tu e-mail (pestaña Perfil) para publicar, escribir a un vendedor o dejar una opinión."],
 "Entre riders : la caution et l'assurance se règlent directement entre vous à la remise du matériel. Faites un état des lieux en photos.":["Between riders: deposit and insurance are settled directly between you at handover. Take photos of the gear's condition.","Entre riders: la fianza y el seguro se acuerdan directamente entre vosotros en la entrega. Haced fotos del estado."],
 "Trouve du matériel sur ton spot ou sur ta route":["Find gear at your spot or on your way","Encuentra material en tu spot o en tu ruta"],"Autour de moi":["Near me","Cerca de mí"],"à":["at","a"],"km":["km","km"],
 "Conseil : rencontre le vendeur dans un lieu public et vérifie le matériel avant de payer. Ne paie jamais à l'avance à un inconnu.":["Tip: meet the seller in a public place and check the gear before paying. Never pay a stranger in advance.","Consejo: queda con el vendedor en un lugar público y revisa el material antes de pagar. No pagues nunca por adelantado a un desconocido."],
 "Second Lite ouvre très bientôt.":["Second Lite opens very soon.","Second Lite abre muy pronto."],"Connexion impossible. Vérifie le réseau puis réessaie.":["Connection failed. Check the network and try again.","Conexión imposible. Comprueba la red e inténtalo de nuevo."],"Réessayer":["Retry","Reintentar"],
 "Bonjour, ton annonce m'intéresse :":["Hello, I'm interested in your listing:","Hola, me interesa tu anuncio:"],"Ville introuvable.":["Town not found.","Ciudad no encontrada."],"Position indisponible.":["Location unavailable.","Ubicación no disponible."],"ami rider":["rider friend","amigo rider"],"amis riders":["rider friends","amigos riders"]
};
function lang(){ var l=""; try{ l=localStorage.getItem("lf-lang")||""; }catch(e){} if(!l) l=(navigator.language||"fr").slice(0,2); l=l.toLowerCase(); return l==="en"?1:l==="es"?2:0; }
function T(s){ var i=lang(); if(!i) return s; var t=TR[s]; return t && t[i-1]!=null ? t[i-1] : s; }

// ---------- utilitaires ----------
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function norm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,""); }
function money(n){ return String(Math.round(+n||0)).replace(/\B(?=(\d{3})+(?!\d))/g," ")+" €"; }
function distKm(a,b,c,d){ var r=Math.PI/180, x=Math.sin((c-a)*r/2), y=Math.sin((d-b)*r/2), q=x*x+Math.cos(a*r)*Math.cos(c*r)*y*y; return 12742*Math.asin(Math.min(1,Math.sqrt(q))); }
function ago(t){ var d=Math.max(0,Date.now()-(+t||0)), m=Math.round(d/60000), i=lang(); var u = m<60 ? [Math.max(1,m),"min"] : m<1440 ? [Math.round(m/60),"h"] : [Math.round(m/1440), i===1?"d":i===2?"d":"j"]; return i===1 ? u[0]+" "+u[1]+" ago" : i===2 ? "hace "+u[0]+" "+u[1] : "il y a "+u[0]+" "+u[1]; }
function priceText(a){ if(a.type==="p") return T("Gratuit"); return money(a.price)+(a.type==="l" ? ' <small>/ '+esc(T(PER[a.per]||"jour"))+'</small>' : ""); }
function toast(msg){ var t=document.createElement("div"); t.className="br-toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(function(){ t.classList.add("out"); setTimeout(function(){ t.remove(); },350); }, 2600); }

// ---------- accès aux données (Firebase, ou démonstration locale) ----------
function host(){ try{ return window.lfMk ? window.lfMk() : null; }catch(e){ return null; } }
var DEMO=/[?&]demo=1/.test(location.search), demoDb=null;
function demoImg(emoji, c1, c2, w){ var c=document.createElement("canvas"); c.width=w||640; c.height=w||640; var g=c.getContext("2d"), gr=g.createLinearGradient(0,0,c.width,c.height); gr.addColorStop(0,c1); gr.addColorStop(1,c2); g.fillStyle=gr; g.fillRect(0,0,c.width,c.height);
  g.font=(c.width*0.5)+"px serif"; g.textAlign="center"; g.textBaseline="middle"; g.fillText(emoji,c.width/2,c.height/2+c.width*0.03); return c.toDataURL("image/jpeg",0.7); }
function demoSeed(){ var now=Date.now(), L=[
   ["d1","u_marine","Marine66","v","E-foil Lite Foil Ultra 5'2 + batterie","efoil","Planche","Lite Foil",2,6900,"Leucate",42.911,3.03,"⚡","#0f6a6c","#19b3ad","Pack complet 2025 : planche carbone 5'2, mât 75 cm, aile 1300, télécommande, chargeur rapide. 38 sessions au compteur.","Aucun choc. Joint de trappe batterie remplacé en garantie (mars 2026).",["place","geodis"]],
   ["d2","u_tom","TomRide","v","Wing F-One Strike V4 5 m²","wingfoil","Voile","F-One",3,420,"Hyères",43.08,6.15,"🪂","#1b63c9","#0a2a55","Wing 5 m² saison 2024, bien entretenue, rincée après chaque session. Vendue avec sac et leash.","",["colissimo","poste","place"]],
   ["d3","u_lea","Léa_surf","v","Surf Pyzel Phantom 5'10","surf","Planche","Pyzel",3,380,"Biarritz",43.48,-1.56,"🏄","#ef8a46","#c75f24","Shortboard 5'10 x 19 1/4 x 2 7/16, 29 L. Boîtiers FCS II. Idéale vagues de 1 à 2 m.","Pet au nose réparé par un shaper (2025), étanche.",["place"]],
   ["d4","u_marine","Marine66","l","Paddle gonflable Red Paddle 10'6 (week-end)","sup","Planche","Red Paddle Co",2,35,"Leucate",42.9,3.04,"🛶","#2f8fe0","#12408a","Location à la journée ou au week-end, avec pagaie carbone, leash et pompe. Parfait pour une balade sur l'étang.","",["place"]],
   ["d5","u_nico","Nico_trail","v","Hoka Speedgoat 5, pointure 43","trail","Chaussures","Hoka",2,75,"Chamonix",45.92,6.87,"⛰️","#39a845","#14602a","Portées 60 km, semelle Vibram en très bon état. Taillent normalement.","",["colissimo","poste"]],
   ["d6","u_tom","TomRide","l","Snowboard Jones Flagship 158 + fixations","snowboard","Planche","Jones",2,28,"Font-Romeu",42.5,2.04,"🏂","#6c4bd8","#2a1a66","À louer au pied des pistes, fixations Union Force réglées à ta taille. Caution demandée à la remise.","Semelle refaite et carres affûtées en décembre 2025.",["place"]],
   ["d7","u_lea","Léa_surf","p","Prêt housse de voyage surf 6'6 (3 planches)","surf","Accessoires","Creatures of Leisure",3,0,"Hossegor",43.66,-1.44,"🧳","#c9a200","#7a5a00","Je prête ma housse de voyage aux membres de la communauté pour un trip. Roulettes OK.","",["place"]],
   ["d8","u_nico","Nico_trail","v","VTT Commencal Meta TR 29 taille M","velo","VTT","Commencal",3,1850,"Annecy",45.9,6.12,"🚴","#d1343f","#6d0a1c","Tout-suspendu 2022, fourche Fox 36, transmission SRAM GX. Révision complète faite.","Roulements de biellette changés (2025).",["place","geodis"]]
  ], db={ market:{}, marketMedia:{}, marketReviews:{}, quiver:{} };
  L.forEach(function(x,i){ var th=demoImg(x[13],x[14],x[15],320); db.market[x[0]]={ uid:x[1], pseudo:x[2], type:x[3], title:x[4], sport:x[5], cat:x[6], brand:x[7], state:x[8], price:x[9], per:x[3]==="l"?(i%2?"j":"we"):null, caution:x[3]!=="v"?(x[3]==="p"?50:300):null,
      place:x[10], lat:x[11], lon:x[12], desc:x[16], rep:x[17], ship:x[18], msg:true, tel:i%3===0?"0600000000":"", thumb:th, n:3, t:now-i*5400000-600000 };
    db.marketMedia[x[0]]={ 0:{ img:demoImg(x[13],x[14],x[15]) }, 1:{ img:demoImg(x[13],x[15],x[14]) }, 2:{ img:demoImg("📏","#22303a","#0b0d10") } }; });
  db.quiver={ u_marine:{ since:Date.UTC(2024,3,2), spots:["Leucate — Le Goulet","La Franqui"], n:64, items:{ a:{ title:"Lite Foil Ultra 5'2", sport:"efoil", brand:"Lite Foil", own:true }, b:{ title:"F-One Rocket Wing 5'0", sport:"wingfoil", brand:"F-One", own:true }, c:{ title:"Fanatic Sky SUP 6'11", sport:"sup", brand:"Fanatic", own:false } } },
    u_tom:{ since:Date.UTC(2025,0,15), spots:["L'Almanarre, Hyères"], n:22, items:{ a:{ title:"F-One Strike V4 5 m²", sport:"wingfoil", brand:"F-One", own:true } } }, u_lea:{ since:Date.UTC(2023,6,9), spots:["Biarritz","Hossegor"], n:118, items:{} }, u_nico:{ since:Date.UTC(2025,8,1), spots:[], n:3, items:{} } };
  db.marketReviews={ u_marine:{ u_tom:{ r:5, txt:"Matériel conforme à l'annonce, vendeuse très sérieuse. Je recommande.", pseudo:"TomRide", t:now-864e5*12 }, u_lea:{ r:5, txt:"Location du paddle nickel, tout était prêt à l'heure.", pseudo:"Léa_surf", t:now-864e5*30 }, u_nico:{ r:4, txt:"Très bon contact.", pseudo:"Nico_trail", t:now-864e5*50 } },
    u_tom:{ u_marine:{ r:4, txt:"Wing en bon état, envoi rapide.", pseudo:"Marine66", t:now-864e5*20 } } };
  return db; }
function dGet(path){ var p=path.split("/"), o=demoDb; for(var i=0;i<p.length && o!=null;i++) o=o[p[i]]; return o==null?null:JSON.parse(JSON.stringify(o)); }
function dSet(path,v){ var p=path.split("/"), o=demoDb; for(var i=0;i<p.length-1;i++){ if(o[p[i]]==null) o[p[i]]={}; o=o[p[i]]; } if(v==null) delete o[p[p.length-1]]; else o[p[p.length-1]]=JSON.parse(JSON.stringify(v)); }
var S={
  demo:function(){ var h=host(); return DEMO && !(h && h.uid); },
  me:function(){ var h=host(); if(S.demo()) return { uid:"u_me", pseudo:"Moi", ready:true, av:"" }; if(!h) return { uid:"", pseudo:"", ready:false, av:"" }; return { uid:h.uid, pseudo:h.pseudo, ready:h.ready, av:h.av||"" }; },
  get:function(path){ if(S.demo()){ if(!demoDb) demoDb=demoSeed(); return Promise.resolve(dGet(path)); } var h=host(); if(!h) return Promise.reject(new Error("hors ligne")); return h.get(path); },
  last:function(path,n){ if(S.demo()) return S.get(path); var h=host(); if(!h) return Promise.reject(new Error("hors ligne")); return h.last(path,n); },
  set:function(path,v){ if(S.demo()){ if(!demoDb) demoDb=demoSeed(); dSet(path,v); return Promise.resolve(); } var h=host(); if(!h) return Promise.reject(new Error("hors ligne")); return h.set(path,v); },
  key:function(){ if(S.demo()) return "n"+Date.now().toString(36); return host().key("market"); },
  now:function(){ if(S.demo()) return Date.now(); return host().ts(); },
  who:function(uid, fallback){ var h=host(); if(S.demo() || !h) return { ps:fallback||"Rider", av:"" }; var w=h.who(uid)||{}; return { ps:w.ps||fallback||"Rider", av:w.av||"", off:!!w.off }; }
};

// ---------- chargement ----------
function loadList(force){ if(LIST && !force && Date.now()-listAt<60000) return Promise.resolve(LIST);
  return S.last("market",150).then(function(o){ var l=[]; Object.keys(o||{}).forEach(function(k){ var a=o[k]; if(a && a.title && a.uid){ a.id=k; l.push(a); } }); l.sort(function(a,b){ return (+b.t||0)-(+a.t||0); }); LIST=l; listAt=Date.now(); return l; }); }
function filtered(kind){ var me=S.me(), q=norm(F.q).trim().split(/\s+/).filter(Boolean);
  var l=(LIST||[]).filter(function(a){ if(kind==="vente" && a.type!=="v") return false; if(kind==="loc" && a.type==="v") return false; if(a.sold && a.uid!==me.uid) return false;
    if(F.sport && a.sport!==F.sport) return false; if(F.cat && a.cat!==F.cat) return false; if(F.brand && norm(a.brand)!==norm(F.brand)) return false; if(F.state && +a.state!==+F.state) return false;
    if(F.neuf==="1" && +a.state!==1) return false; if(F.neuf==="0" && +a.state===1) return false; if(F.max && +a.price>+F.max) return false;
    if(q.length){ var hay=norm([a.title,a.brand,a.place,a.cat,(SP[a.sport]||{}).n,a.desc].join(" ")); for(var i=0;i<q.length;i++) if(hay.indexOf(q[i])<0) return false; } return true; });
  if(myPos) l.forEach(function(a){ a._km=(isFinite(a.lat)&&isFinite(a.lon))?distKm(myPos.lat,myPos.lon,a.lat,a.lon):null; });
  if(F.sort==="up") l.sort(function(a,b){ return a.price-b.price; }); else if(F.sort==="down") l.sort(function(a,b){ return b.price-a.price; }); else if(F.sort==="near" && myPos) l.sort(function(a,b){ return (a._km==null?1e9:a._km)-(b._km==null?1e9:b._km); });
  return l; }

// ---------- styles ----------
var CSS=""
+"#tab-bonride{padding-bottom:24px}"
+".br-hero{position:relative;overflow:hidden;border-radius:22px;padding:18px 16px 16px;color:#fff;background:linear-gradient(135deg,#1a1206 0%,#3a2608 45%,#c97d00 130%);box-shadow:0 12px 28px rgba(58,38,8,.28)}"
+".br-hero:after{content:'';position:absolute;right:-40px;top:-50px;width:190px;height:190px;border-radius:50%;background:radial-gradient(circle,rgba(255,196,84,.5),rgba(255,196,84,0) 70%)}"
+".br-hero small{display:block;font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#ffcf73}.br-hero h2{margin:3px 0 4px;font-size:27px;font-weight:900;letter-spacing:-.5px}.br-hero p{margin:0;font-size:13.5px;line-height:1.4;opacity:.85;max-width:290px;position:relative;z-index:1}"
+".br-cta{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;margin-top:13px;border:0;border-radius:100px;padding:11px 17px;font:inherit;font-size:14.5px;font-weight:800;color:#2a1b04;background:linear-gradient(135deg,#ffd77a,#f5a623);box-shadow:0 6px 16px rgba(245,166,35,.4);cursor:pointer}.br-cta:active{transform:scale(.97)}"
+".br-hrt{position:absolute;right:8px;top:8px;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.94);color:#e8384f;font-style:normal;font-size:15px;line-height:26px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.2)}.br-favb{display:block;width:100%;margin-top:12px;border:1.5px solid #e3e9ee;background:#fff;color:#0b0d10;border-radius:14px;padding:12px;font:inherit;font-size:14.5px;font-weight:800;cursor:pointer;min-height:0;box-shadow:none}.br-favb.on{border-color:#e8384f;color:#e8384f;background:#fff3f5}.br-tabs button{font-size:12px!important;padding:10px 1px!important}.br-tabs{display:flex;gap:4px;margin-top:12px;background:var(--tile,#f7f9fb);border-radius:15px;padding:4px}.br-tabs button{flex:1;border:0;background:transparent;border-radius:12px;padding:10px 2px;font:inherit;font-size:13px;white-space:nowrap;letter-spacing:-.2px;font-weight:700;color:var(--muted,#66727d);cursor:pointer}"
+".br-tabs button.on{background:#fff;color:var(--text,#0b0d10);box-shadow:0 2px 8px rgba(13,40,45,.12)}"
+".br-search{position:relative;margin-top:12px}.br-search input{width:100%;box-sizing:border-box;border:1.5px solid var(--line,#e7ebef);border-radius:15px;padding:12px 14px 12px 40px;font:inherit;font-size:15px;background:#fff}.br-search svg{position:absolute;left:13px;top:50%;width:18px;height:18px;margin-top:-9px;color:var(--muted,#66727d)}"
+".br-filters{display:flex;gap:7px;overflow-x:auto;margin-top:9px;padding-bottom:3px;-webkit-overflow-scrolling:touch}.br-filters::-webkit-scrollbar{display:none}"
+".br-filters select,.br-filters button{flex:none;border:1.5px solid var(--line,#e7ebef);background:#fff;color:var(--text,#0b0d10);border-radius:100px;padding:8px 12px;font:inherit;font-size:13px;font-weight:700;max-width:190px;cursor:pointer}"
+".br-filters select.on{border-color:#c97d00;background:#fff6e3;color:#7a4b00}.br-filters button{color:#b3261e;border-color:#f3c9c5}"
+".br-count{margin:12px 4px 8px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#66727d)}"
+".br-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.br-it{position:relative;display:flex;flex-direction:column;text-align:left;border:1px solid var(--line-soft,#eef2f5);background:#fff;border-radius:18px;overflow:hidden;padding:0;font:inherit;color:inherit;cursor:pointer;box-shadow:0 4px 12px rgba(13,40,45,.06);transition:transform .12s}"
+".br-it:active{transform:scale(.98)}.br-ph{position:relative;aspect-ratio:1/1;background:#eef2f5}.br-ph img{width:100%;height:100%;object-fit:cover;display:block}"
+".br-tag{position:absolute;left:8px;top:8px;font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#fff;border-radius:8px;padding:4px 7px;background:rgba(11,13,16,.72);backdrop-filter:blur(4px)}.br-tag.l{background:#1b63c9}.br-tag.p{background:#1a9c55}.br-tag.s{background:#d1343f}"
+".br-bd{padding:9px 10px 11px;min-width:0}.br-pr{font-size:17px;font-weight:900}.br-pr small{font-size:11.5px;font-weight:700;color:var(--muted,#66727d)}.br-ti{font-size:13px;font-weight:600;line-height:1.3;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:34px}"
+".br-st{display:inline-flex;align-items:center;gap:5px;margin-top:6px;font-size:11px;font-weight:700}.br-st i{width:8px;height:8px;border-radius:50%}.br-pl{font-size:11.5px;color:var(--muted,#66727d);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".br-empty{text-align:center;padding:34px 16px;color:var(--muted,#66727d);font-size:14px;line-height:1.5}.br-empty b{display:block;font-size:40px;margin-bottom:6px}.br-logo{display:block;width:150px;height:100px;margin:0 auto 12px;background:linear-gradient(135deg,#f5c45a 0%,#f5a623 55%,#b87300 100%);-webkit-mask:url(onb-logo.png) center/contain no-repeat;mask:url(onb-logo.png) center/contain no-repeat}.br-empty button{display:block;margin:12px auto 0}"
+".br-card{background:#fff;border:1px solid var(--line-soft,#eef2f5);border-radius:20px;padding:14px;margin-top:12px;box-shadow:0 4px 14px rgba(13,40,45,.06)}.br-h{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted,#66727d);margin:0 0 9px}"
+".br-back{display:inline-flex;align-items:center;gap:6px;border:0;background:var(--tile,#f7f9fb);border-radius:100px;padding:9px 14px 9px 10px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;color:var(--text,#0b0d10)}"
+".br-gal{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;margin-top:12px;border-radius:20px;-webkit-overflow-scrolling:touch}.br-gal::-webkit-scrollbar{display:none}.br-gal img{flex:none;width:100%;aspect-ratio:1/1;object-fit:cover;scroll-snap-align:center;border-radius:20px;background:#eef2f5}"
+".br-dots{display:flex;justify-content:center;gap:5px;margin-top:8px}.br-dots i{width:6px;height:6px;border-radius:50%;background:#cfd8de}.br-dots i.on{background:#0b0d10;width:16px;border-radius:4px}"
+".br-dpr{font-size:28px;font-weight:900;letter-spacing:-.5px}.br-dpr small{font-size:14px;font-weight:700;color:var(--muted,#66727d)}.br-dti{font-size:18px;font-weight:800;line-height:1.25;margin-top:4px}.br-meta{font-size:12.5px;color:var(--muted,#66727d);margin-top:6px}"
+".br-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.br-chips span{font-size:12.5px;font-weight:700;background:var(--tile,#f7f9fb);border-radius:100px;padding:6px 11px}"
+".br-state{margin-top:2px}.br-state b{font-size:15.5px}.br-bar{display:flex;gap:4px;margin-top:8px}.br-bar i{flex:1;height:7px;border-radius:4px;background:#e7ebef}.br-txt{font-size:14.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word}"
+".br-rep{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.5}.br-rep>i{font-style:normal;font-size:20px;flex:none}.br-ship{display:flex;flex-direction:column;gap:7px}.br-ship div{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:600}"
+".br-note{font-size:12px;line-height:1.45;color:var(--muted,#66727d);background:var(--tile,#f7f9fb);border-radius:12px;padding:9px 11px;margin-top:10px}"
+".br-sel{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;background:none;padding:0;font:inherit;color:inherit;cursor:pointer}.br-av{width:52px;height:52px;border-radius:50%;flex:none;object-fit:cover;background:linear-gradient(135deg,#0f6a6c,#19b3ad);color:#fff;display:flex;align-items:center;justify-content:center;font-size:21px;font-weight:800}"
+".br-sel>div{flex:1;min-width:0}.br-sel b{display:block;font-size:16.5px;font-weight:800}.br-sel small{display:block;font-size:12.5px;color:var(--muted,#66727d);margin-top:2px}.br-stars{color:#f5a623;letter-spacing:1px}"
+".br-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.br-bg{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:800;border-radius:100px;padding:6px 10px;background:#eaf7f0;color:#12733f}.br-bg.b{background:#e6eefb;color:#12408a}.br-bg.g{background:#fff3d6;color:#7a4b00}.br-bg.n{background:var(--tile,#f7f9fb);color:var(--text,#0b0d10)}"
+".br-act{position:sticky;bottom:calc(74px + env(safe-area-inset-bottom,0px));z-index:5;display:flex;gap:8px;margin-top:14px;padding:8px;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border-radius:20px;box-shadow:0 8px 24px rgba(13,40,45,.16)}"
+".br-b1,.br-b2{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:15px;padding:13px 10px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;text-decoration:none}.br-b1{color:#fff;background:linear-gradient(135deg,#0b0d10,#1d2a30)}.br-b2{color:var(--text,#0b0d10);background:var(--tile,#f7f9fb);border:1.5px solid var(--line,#e7ebef)}"
+".br-b1[disabled]{opacity:.5}.br-lnk{display:block;margin:14px auto 0;border:0;background:none;font:inherit;font-size:13px;font-weight:700;color:var(--muted,#66727d);text-decoration:underline;cursor:pointer}.br-lnk.red{color:#b3261e}"
+".br-own{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.br-own button{flex:1;min-width:120px}"
+".br-f label{display:block;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#66727d);margin:14px 0 6px}.br-f input[type=text],.br-f input[type=number],.br-f input[type=tel],.br-f select,.br-f textarea{width:100%;box-sizing:border-box;border:1.5px solid var(--line,#e7ebef);border-radius:14px;padding:12px 13px;font:inherit;font-size:15.5px;background:#fff;color:var(--text,#0b0d10)}"
+".br-f textarea{min-height:104px;resize:vertical;line-height:1.45}.br-seg{display:flex;gap:6px}.br-seg button{flex:1;border:1.5px solid var(--line,#e7ebef);background:#fff;border-radius:13px;padding:11px 4px;font:inherit;font-size:14px;font-weight:700;color:var(--muted,#66727d);cursor:pointer}.br-seg button.on{border-color:#0b0d10;background:#0b0d10;color:#fff}"
+".br-pics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.br-pic{position:relative;aspect-ratio:1/1;border-radius:14px;overflow:hidden;background:#eef2f5}.br-pic img{width:100%;height:100%;object-fit:cover}.br-pic button{position:absolute;right:5px;top:5px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(11,13,16,.75);color:#fff;font-size:14px;cursor:pointer}"
+".br-add{aspect-ratio:1/1;border:2px dashed #c9d2d9;border-radius:14px;background:var(--tile,#f7f9fb);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font:inherit;font-size:12.5px;font-weight:700;color:var(--muted,#66727d);cursor:pointer}.br-add b{font-size:26px;font-weight:400;line-height:1}"
+".br-sts{display:flex;flex-direction:column;gap:6px}.br-sts button{display:flex;align-items:center;gap:10px;text-align:left;border:1.5px solid var(--line,#e7ebef);background:#fff;border-radius:13px;padding:11px 12px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;color:var(--text,#0b0d10)}.br-sts button i{width:12px;height:12px;border-radius:50%;flex:none}.br-sts button.on{border-color:#0b0d10;box-shadow:0 0 0 1.5px #0b0d10 inset}"
+".br-ck{display:flex;align-items:center;gap:10px;padding:9px 0;font-size:15px;font-weight:600;cursor:pointer}.br-ck input{width:20px;height:20px;accent-color:#0b0d10;flex:none}.br-row{display:flex;gap:8px}.br-row>*{flex:1;min-width:0}"
+".br-err{margin-top:12px;font-size:13.5px;font-weight:700;color:#b3261e;text-align:center;min-height:18px}.br-res{border:1.5px solid var(--line,#e7ebef);border-radius:14px;margin-top:6px;overflow:hidden}.br-res button{display:block;width:100%;text-align:left;border:0;border-top:1px solid var(--line,#e7ebef);background:#fff;padding:11px 12px;font:inherit;font-size:14.5px;cursor:pointer}.br-res button:first-child{border-top:0}"
+".br-map{height:calc(100vh - 330px);min-height:340px;border-radius:20px;overflow:hidden;margin-top:12px;position:relative;z-index:0;background:#e9eef1}.br-mk{background:#0b0d10;color:#fff;font-size:12px;font-weight:800;border-radius:100px;padding:5px 9px;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,.35);border:2px solid #fff;transform:translate(-50%,-50%);display:inline-block}.br-mk.l{background:#1b63c9}.br-mk.p{background:#1a9c55}"
+".br-pop{display:flex;gap:10px;align-items:center;width:230px;border:0;background:none;padding:0;font:inherit;text-align:left;cursor:pointer;color:#0b0d10}.br-pop img{width:64px;height:64px;border-radius:12px;object-fit:cover;flex:none}.br-pop b{display:block;font-size:15px;font-weight:900}.br-pop span{display:block;font-size:12.5px;line-height:1.3;margin-top:2px}"
+".br-rv{border-top:1px solid var(--line,#e7ebef);padding:11px 0}.br-rv:first-of-type{border-top:0;padding-top:0}.br-rv b{font-size:14px}.br-rv small{color:var(--muted,#66727d);font-size:12px;margin-left:6px}.br-rv p{margin:4px 0 0;font-size:14px;line-height:1.5}"
+".br-rate{display:flex;gap:6px;justify-content:center;margin:6px 0 10px}.br-rate button{border:0;background:none;font-size:34px;line-height:1;color:#d7dee3;cursor:pointer;padding:0}.br-rate button.on{color:#f5a623}"
+".br-q{display:flex;align-items:center;gap:10px;border-top:1px solid var(--line,#e7ebef);padding:10px 0}.br-q:first-of-type{border-top:0}.br-q>i{font-style:normal;font-size:22px;flex:none}.br-q>div{flex:1;min-width:0}.br-q b{display:block;font-size:14.5px}.br-q small{font-size:12px;color:var(--muted,#66727d)}.br-q em{font-style:normal;font-size:11px;font-weight:800;border-radius:8px;padding:3px 7px;background:#eaf7f0;color:#12733f;flex:none}.br-q em.o{background:var(--tile,#f7f9fb);color:var(--muted,#66727d)}.br-q button{border:0;background:none;font-size:17px;color:var(--muted,#66727d);cursor:pointer}"
+".br-toast{position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:9999;background:#0b0d10;color:#fff;font-size:14px;font-weight:700;border-radius:100px;padding:11px 18px;box-shadow:0 8px 24px rgba(0,0,0,.3);transition:opacity .3s;max-width:86vw;text-align:center}.br-toast.out{opacity:0}"
+".br-sub{display:flex;gap:6px;margin-top:12px}.br-sub button{flex:1;border:0;border-bottom:3px solid transparent;background:none;padding:9px 2px;font:inherit;font-size:14.5px;font-weight:800;color:var(--muted,#66727d);cursor:pointer}.br-sub button.on{color:var(--text,#0b0d10);border-color:#f5a623}";

// ---------- éléments ----------
var IC_SEARCH='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.200-4.200"/></svg>';
function stars(r){ r=Math.round(r); var s=""; for(var i=1;i<=5;i++) s+=i<=r?"★":"☆"; return '<span class="br-stars">'+s+'</span>'; }
function stateBadge(st){ var s=STATES[(+st||3)-1]||STATES[2]; return '<span class="br-st"><i style="background:'+s[1]+'"></i>'+esc(T(s[0]))+'</span>'; }
function avatar(w, ps){ return w.av ? '<img class="br-av" src="'+esc(w.av)+'" alt="">' : '<span class="br-av">'+esc(String(ps||"R").charAt(0).toUpperCase())+'</span>'; }
function favs(){ try{ var f=JSON.parse(localStorage.getItem("lf.br.favs")||"[]"); return Array.isArray(f) ? f : []; }catch(e){ return []; } }
function isFav(id){ return favs().indexOf(id)>=0; }
function favToggle(id){ var f=favs(), i=f.indexOf(id); if(i>=0) f.splice(i,1); else f.unshift(id); try{ localStorage.setItem("lf.br.favs", JSON.stringify(f.slice(0,200))); }catch(e){} return i<0; }
function favHtml(){ var f=favs(), l=(LIST||[]).filter(function(a){ return f.indexOf(a.id)>=0; }).sort(function(a,b){ return f.indexOf(a.id)-f.indexOf(b.id); });
  if(!l.length) return '<div class="br-empty"><b>♡</b>'+esc(T("Aucun favori pour le moment."))+'<br>'+esc(T("Ouvre une annonce et touche « Ajouter à mes favoris » pour la retrouver ici."))+'</div>';
  return '<div class="br-count">'+l.length+" "+esc(T(l.length>1?"favoris":"favori"))+'</div><div class="br-grid">'+l.map(itemCard).join("")+'</div>'; }
function itemCard(a){ var km=a._km!=null ? " · "+(a._km<1.5?"1":Math.round(a._km))+" km" : "";
  return '<button class="br-it" data-open="'+esc(a.id)+'"><span class="br-ph">'+(a.thumb?'<img loading="lazy" src="'+esc(a.thumb)+'" alt="">':"")+(a.sold?'<i class="br-tag s">'+esc(T("Vendu"))+'</i>':a.type!=="v"?'<i class="br-tag '+a.type+'">'+esc(T(TYPES[a.type][0]))+'</i>':"")+(isFav(a.id)?'<i class="br-hrt">♥</i>':"")+'</span>'
    +'<span class="br-bd"><span class="br-pr">'+priceText(a)+'</span><span class="br-ti">'+esc(a.title)+'</span>'+stateBadge(a.state)+'<span class="br-pl">📍 '+esc(a.place||"")+km+'</span></span></button>'; }
function opt(v,l,sel){ return '<option value="'+esc(v)+'"'+(String(sel)===String(v)?" selected":"")+'>'+esc(l)+'</option>'; }
function hero(){ return '<div class="br-hero"><small>Lite Foil</small><h2>'+esc(T("Second Lite"))+'</h2><p>'+esc(T("Matériel neuf et d'occasion, location et prêt entre riders"))+'</p><button class="br-cta" data-act="new">＋ '+esc(T("Déposer une annonce"))+'</button></div>'
  +'<div class="br-tabs">'+[["vente","Acheter"],["loc","Louer"],["carte","Carte"],["fav","Favoris"],["moi","Mon espace"]].map(function(x){ return '<button data-view="'+x[0]+'" class="'+(view===x[0]?"on":"")+'">'+esc(T(x[1]))+'</button>'; }).join("")+'</div>'; }
function filtersHtml(){ var cats=F.sport && SP[F.sport] ? SP[F.sport].cats : [], on=function(v){ return v?' class="on"':""; }, any=F.sport||F.cat||F.brand||F.state||F.max||F.neuf||F.q;
  return '<div class="br-search">'+IC_SEARCH+'<input id="brQ" type="search" autocomplete="off" placeholder="'+esc(T("Rechercher (planche, marque, ville…)"))+'" value="'+esc(F.q)+'"></div><div class="br-filters">'
   +'<select data-f="sport"'+on(F.sport)+'>'+opt("",T("Toutes les disciplines"),F.sport)+SPORTS.map(function(s){ return opt(s[0],s[2]+" "+T(s[1]),F.sport); }).join("")+'</select>'
   +(cats.length?'<select data-f="cat"'+on(F.cat)+'>'+opt("",T("Toutes les catégories"),F.cat)+cats.map(function(c){ return opt(c,c,F.cat); }).join("")+'</select>':"")
   +'<select data-f="brand"'+on(F.brand)+'>'+opt("",T("Toutes les marques"),F.brand)+brandsOf(F.sport).map(function(b){ return opt(b,b,F.brand); }).join("")+'</select>'
   +'<select data-f="state"'+on(F.state)+'>'+opt("",T("Tous les états"),F.state)+STATES.map(function(s,i){ return opt(i+1,T(s[0]),F.state); }).join("")+'</select>'
   +'<select data-f="neuf"'+on(F.neuf)+'>'+opt("",T("Neuf et occasion"),F.neuf)+opt("1",T("Neuf"),F.neuf)+opt("0",T("Occasion"),F.neuf)+'</select>'
   +'<select data-f="max"'+on(F.max)+'>'+opt("",T("Prix max"),F.max)+[50,100,200,500,1000,2000,5000,10000].map(function(p){ return opt(p,"≤ "+money(p),F.max); }).join("")+'</select>'
   +'<select data-f="sort"'+on(F.sort!=="new")+'>'+opt("new",T("Plus récentes"),F.sort)+opt("up",T("Prix croissant"),F.sort)+opt("down",T("Prix décroissant"),F.sort)+opt("near",T("Plus proches"),F.sort)+'</select>'
   +(any?'<button data-act="clear">✕ '+esc(T("Effacer les filtres"))+'</button>':"")+'</div>'; }
function listHtml(kind){ var l=filtered(kind); if(!l.length) return '<div class="br-empty"><i class="br-logo" role="img" aria-label="Lite Foil"></i>'+esc(T("Aucune annonce ne correspond pour le moment."))+'<br>'+esc(T("Sois le premier à déposer la tienne."))+'</div>';
  return '<div class="br-count">'+l.length+" "+esc(T(l.length>1?"annonces":"annonce"))+'</div><div class="br-grid">'+l.map(itemCard).join("")+'</div>'; }

// ---------- vues ----------
function draw(){ if(!root) return; killMap();
  if(page && page.k==="detail") return drawDetail(page.a);
  if(page && page.k==="seller") return drawSeller(page.uid, page.ps, page.tab||"ann");
  if(page && page.k==="form") return drawForm();
  var h=hero();
  if(view==="vente"||view==="loc"){ h+=filtersHtml()+'<div id="brList">'+(LIST?listHtml(view):'<div class="br-empty">'+esc(T("Chargement…"))+'</div>')+'</div>'; }
  else if(view==="carte"){ h+='<div class="br-count">'+esc(T("Trouve du matériel sur ton spot ou sur ta route"))+'</div>'+filtersHtml()+'<div class="br-map" id="brMap"></div>'; }
  else if(view==="fav"){ h+='<div id="brList">'+(LIST?favHtml():'<div class="br-empty">'+esc(T("Chargement…"))+'</div>')+'</div>'; }
  else h+=mineHtml();
  root.innerHTML=h; bindQ();
  if(!LIST) loadList().then(function(){ if(!page) draw(); }).catch(function(){ var b=root.querySelector("#brList")||root; if(root.querySelector("#brList")) b.innerHTML='<div class="br-empty"><b>⏳</b>'+esc(T(S.demo()?"Connexion impossible. Vérifie le réseau puis réessaie.":"Second Lite ouvre très bientôt."))+'<button class="br-b2" data-act="reload" style="flex:none;padding:10px 18px">'+esc(T("Réessayer"))+'</button></div>'; });
  if(view==="carte" && LIST) setTimeout(paintMap, 40);
  if(view==="moi") loadMine(); }
function bindQ(){ var q=root.querySelector("#brQ"); if(!q) return; var t=null; q.addEventListener("input", function(){ F.q=q.value; clearTimeout(t); t=setTimeout(function(){ var b=root.querySelector("#brList"); if(b && LIST) b.innerHTML=listHtml(view); else if(view==="carte") paintMap(); }, 200); }); }
function killMap(){ if(map){ try{ map.remove(); }catch(e){} map=null; } }
function paintMap(){ var el=root.querySelector("#brMap"); if(!el || !window.L) return; killMap();
  map=L.map(el,{ zoomControl:false }); L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{ maxZoom:19, attribution:"© OpenStreetMap" }).addTo(map);
  var pts=[], l=filtered("all").filter(function(a){ return isFinite(a.lat) && isFinite(a.lon) && !a.sold; });
  l.forEach(function(a){ var m=L.marker([a.lat,a.lon],{ icon:L.divIcon({ className:"", html:'<span class="br-mk '+(a.type!=="v"?a.type:"")+'">'+(a.type==="p"?esc(T("Prêt")):money(a.price))+'</span>', iconSize:[0,0] }) }).addTo(map);
    m.bindPopup('<button class="br-pop" data-open="'+esc(a.id)+'">'+(a.thumb?'<img src="'+esc(a.thumb)+'" alt="">':"")+'<span><b>'+priceText(a)+'</b><span>'+esc(a.title)+'</span><span style="color:#66727d">📍 '+esc(a.place||"")+'</span></span></button>',{ closeButton:false, minWidth:230 }); pts.push([a.lat,a.lon]); });
  if(myPos){ L.circleMarker([myPos.lat,myPos.lon],{ radius:8, color:"#fff", weight:3, fillColor:"#2f7cf6", fillOpacity:1 }).addTo(map); }
  if(myPos && F.sort==="near") map.setView([myPos.lat,myPos.lon],9); else if(pts.length) map.fitBounds(L.latLngBounds(pts),{ padding:[36,36], maxZoom:11 }); else map.setView([46.6,2.4],5);
  var c=L.control({ position:"topright" }); c.onAdd=function(){ var b=L.DomUtil.create("button","br-b1"); b.style.cssText="flex:none;padding:9px 13px;font-size:13px;border-radius:100px;box-shadow:0 4px 12px rgba(0,0,0,.25)"; b.textContent="📍 "+T("Autour de moi"); L.DomEvent.on(b,"click",function(e){ L.DomEvent.stop(e); locate(function(){ if(map && myPos) map.setView([myPos.lat,myPos.lon],10); }); }); return b; }; c.addTo(map);
  map.on("popupopen", function(e){ var b=e.popup.getElement().querySelector("[data-open]"); if(b) b.addEventListener("click", function(){ openById(b.dataset.open); }); }); }
function locate(cb){ if(!navigator.geolocation){ toast(T("Position indisponible.")); return; } navigator.geolocation.getCurrentPosition(function(g){ myPos={ lat:g.coords.latitude, lon:g.coords.longitude }; if(cb) cb(); }, function(){ toast(T("Position indisponible.")); }, { enableHighAccuracy:false, maximumAge:300000, timeout:12000 }); }
function openById(id){ var a=(LIST||[]).filter(function(x){ return x.id===id; })[0]; if(a){ page={ k:"detail", a:a }; draw(); try{ window.scrollTo({top:0}); }catch(e){} } }

// ----- fiche annonce -----
function sellerInfo(uid){ if(mem["s:"+uid]) return Promise.resolve(mem["s:"+uid]);
  return Promise.all([S.get("quiver/"+uid).catch(function(){ return null; }), S.get("marketReviews/"+uid).catch(function(){ return null; })]).then(function(r){ var rv=[]; Object.keys(r[1]||{}).forEach(function(k){ var x=r[1][k]; if(x && x.r){ x.by=k; rv.push(x); } }); rv.sort(function(a,b){ return (+b.t||0)-(+a.t||0); });
    var o={ q:r[0]||{}, rv:rv, avg:rv.length?rv.reduce(function(s,x){ return s+(+x.r||0); },0)/rv.length:0 }; mem["s:"+uid]=o; return o; }); }
function badges(uid, info){ var q=info.q||{}, h="", w=S.who(uid), n=+q.n||0;
  if(w.off) h+='<span class="br-bg g">⭐ '+esc(T("Équipe Lite Foil"))+'</span>';
  if(n>=5 || info.rv.length>=3) h+='<span class="br-bg">✔ '+esc(T("Rider Certifié"))+'</span>';
  if(q.spots && q.spots.length) h+='<span class="br-bg b">📍 '+esc(T("Local Spot"))+" · "+esc(String(q.spots[0]).split(/[—,]/)[0].trim())+'</span>';
  if(q.since) h+='<span class="br-bg n">🗓️ '+esc(T("Membre depuis"))+" "+new Date(+q.since).toLocaleDateString(lang()===1?"en-GB":lang()===2?"es-ES":"fr-FR",{ month:"long", year:"numeric" })+'</span>';
  if(n) h+='<span class="br-bg n">🏄 '+n+" "+esc(T("sorties enregistrées"))+'</span>';
  if(+q.fr) h+='<span class="br-bg n">🤝 '+(+q.fr)+" "+esc(T(+q.fr>1?"amis riders":"ami rider"))+'</span>';
  return h; }
function drawDetail(a){ var me=S.me(), mine=a.uid===me.uid, st=STATES[(+a.state||3)-1]||STATES[2], sp=SP[a.sport]||{ n:a.sport, e:"" }, w=S.who(a.uid,a.pseudo);
  var h='<button class="br-back" data-act="back">‹ '+esc(T("Retour"))+'</button><div class="br-gal" id="brGal">'+(a.thumb?'<img src="'+esc(a.thumb)+'" alt="">':"")+'</div><div class="br-dots" id="brDots"></div>';
  h+='<div class="br-card"><div class="br-dpr">'+priceText(a)+(a.sold?' <span class="br-tag s" style="position:static;vertical-align:middle">'+esc(T("Vendu"))+'</span>':"")+'</div><div class="br-dti">'+esc(a.title)+'</div><div class="br-meta">'+esc(T(TYPES[a.type||"v"][1]))+" · 📍 "+esc(a.place||"")+" · "+esc(ago(a.t))+'</div>'
    +'<div class="br-chips"><span>'+sp.e+" "+esc(T(sp.n))+'</span>'+(a.cat?'<span>'+esc(a.cat)+'</span>':"")+(a.brand?'<span>'+esc(a.brand)+'</span>':"")+'</div>'
    +'<button class="br-favb'+(isFav(a.id)?" on":"")+'" data-fav="'+esc(a.id)+'">'+(isFav(a.id)?"♥ "+esc(T("Dans mes favoris")):"♡ "+esc(T("Ajouter à mes favoris")))+'</button>'
    +(a.type!=="v" && a.caution?'<div class="br-note">🔒 '+esc(T("Caution"))+" : <b>"+money(a.caution)+"</b>. "+esc(T("Entre riders : la caution et l'assurance se règlent directement entre vous à la remise du matériel. Faites un état des lieux en photos."))+'</div>':"")+'</div>';
  h+='<div class="br-card"><div class="br-h">'+esc(T("État"))+'</div><div class="br-state"><b style="color:'+st[1]+'">'+esc(T(st[0]))+'</b><div class="br-bar">'+[0,1,2,3,4].map(function(i){ return '<i style="'+(i<6-(+a.state||3)?"background:"+st[1]:"")+'"></i>'; }).join("")+'</div></div></div>';
  h+='<div class="br-card"><div class="br-h">'+esc(T("Description"))+'</div><div class="br-txt">'+esc(a.desc||"")+'</div></div>';
  h+='<div class="br-card"><div class="br-h">'+esc(T("Historique des réparations"))+'</div><div class="br-rep"><i>'+(a.rep?"🛠️":"✅")+'</i><div class="br-txt">'+esc(a.rep||T("Aucune réparation déclarée par le vendeur."))+'</div></div></div>';
  h+='<div class="br-card"><div class="br-h">'+esc(T("Remise et envoi"))+'</div><div class="br-ship">'+SHIP.filter(function(s){ return (a.ship||[]).indexOf(s[0])>=0; }).map(function(s){ return '<div><span>'+s[2]+'</span>'+esc(T(s[1]))+'</div>'; }).join("")+'</div></div>';
  h+='<div class="br-card"><div class="br-h">'+esc(T("Le vendeur"))+'</div><button class="br-sel" data-seller="'+esc(a.uid)+'" data-ps="'+esc(a.pseudo||"")+'">'+avatar(w,w.ps)+'<div><b>'+esc(w.ps)+'</b><small id="brSelSub">'+esc(T("Voir le profil vendeur"))+' ›</small></div></button><div class="br-badges" id="brSelBg"></div></div>';
  h+='<div class="br-note">'+esc(T("Conseil : rencontre le vendeur dans un lieu public et vérifie le matériel avant de payer. Ne paie jamais à l'avance à un inconnu."))+'</div>';
  if(mine) h+='<div class="br-own"><button class="br-b2" data-act="edit">✏️ '+esc(T("Modifier"))+'</button><button class="br-b2" data-act="sold">'+esc(T(a.sold?"Remettre en ligne":"Marquer comme vendu"))+'</button></div><button class="br-lnk red" data-act="del">'+esc(T("Supprimer"))+'</button>';
  else { h+='<div class="br-act">'+(a.msg!==false?'<button class="br-b1" data-act="msg">💬 '+esc(T("Message"))+'</button>':"")+(a.tel?'<a class="br-b2" href="tel:'+esc(String(a.tel).replace(/[^+\d]/g,""))+'">📞 '+esc(T("Appeler"))+'</a>':"")+'</div><button class="br-lnk" data-act="report">'+esc(T("Signaler"))+'</button>'; }
  root.innerHTML=h;
  S.get("marketMedia/"+a.id).then(function(m){ if(!page || page.a!==a) return; var imgs=[]; Object.keys(m||{}).sort().forEach(function(k){ if(m[k] && m[k].img) imgs.push(m[k].img); }); if(!imgs.length) return; var g=root.querySelector("#brGal"), d=root.querySelector("#brDots"); if(!g) return;
    g.innerHTML=imgs.map(function(s){ return '<img src="'+esc(s)+'" alt="">'; }).join(""); d.innerHTML=imgs.map(function(_,i){ return '<i class="'+(i?"":"on")+'"></i>'; }).join("");
    g.addEventListener("scroll", function(){ var i=Math.round(g.scrollLeft/(g.clientWidth+8)); Array.prototype.forEach.call(d.children, function(x,j){ x.classList.toggle("on", j===i); }); }, { passive:true }); }).catch(function(){});
  sellerInfo(a.uid).then(function(info){ if(!page || page.a!==a) return; var b=root.querySelector("#brSelBg"), s=root.querySelector("#brSelSub"); if(b) b.innerHTML=badges(a.uid,info); if(s && info.rv.length) s.innerHTML=stars(info.avg)+" "+info.avg.toFixed(1).replace(".",",")+" · "+info.rv.length+" "+esc(T("avis"))+" ›"; }); }

// ----- profil vendeur -----
function drawSeller(uid, ps, tab){ var me=S.me(), w=S.who(uid,ps), mine=uid===me.uid;
  var h='<button class="br-back" data-act="back">‹ '+esc(T("Retour"))+'</button><div class="br-card"><div class="br-sel" style="cursor:default">'+avatar(w,w.ps)+'<div><b>'+esc(w.ps)+'</b><small id="brSelSub">&nbsp;</small></div></div><div class="br-badges" id="brSelBg"></div><div id="brSpots"></div></div>'
    +'<div class="br-sub">'+[["ann","Annonces"],["quiver","Quiver"],["avis","Avis"]].map(function(x){ return '<button data-stab="'+x[0]+'" class="'+(tab===x[0]?"on":"")+'">'+esc(T(x[1]))+'</button>'; }).join("")+'</div><div id="brSBody"><div class="br-empty">'+esc(T("Chargement…"))+'</div></div>';
  root.innerHTML=h;
  Promise.all([sellerInfo(uid), loadList()]).then(function(r){ if(!page || page.k!=="seller" || page.uid!==uid) return; var info=r[0], b=root.querySelector("#brSelBg"), s=root.querySelector("#brSelSub"), body=root.querySelector("#brSBody"), sp=root.querySelector("#brSpots");
    b.innerHTML=badges(uid,info); s.innerHTML=info.rv.length ? stars(info.avg)+" "+info.avg.toFixed(1).replace(".",",")+" · "+info.rv.length+" "+esc(T("avis")) : esc(T("Aucun avis pour le moment."));
    if(info.q.spots && info.q.spots.length) sp.innerHTML='<div class="br-h" style="margin-top:12px">'+esc(T("Spots favoris"))+'</div><div class="br-chips" style="margin-top:0">'+info.q.spots.slice(0,6).map(function(x){ return '<span>📍 '+esc(x)+'</span>'; }).join("")+'</div>';
    if(tab==="ann"){ var l=(LIST||[]).filter(function(a){ return a.uid===uid && (mine || !a.sold); }); body.innerHTML=l.length?'<div class="br-grid" style="margin-top:12px">'+l.map(itemCard).join("")+'</div>':'<div class="br-empty">'+esc(T("Aucune annonce ne correspond pour le moment."))+'</div>'; }
    else if(tab==="quiver"){ body.innerHTML='<div class="br-card">'+quiverHtml(info.q.items, false)+'</div>'; }
    else { var hv='<div class="br-card">'+(info.rv.length?info.rv.map(function(x){ return '<div class="br-rv"><b>'+esc(x.pseudo||"Rider")+'</b>'+stars(x.r)+'<small>'+esc(ago(x.t))+'</small><p>'+esc(x.txt||"")+'</p></div>'; }).join(""):'<div class="br-empty" style="padding:14px">'+esc(T("Aucun avis pour le moment."))+'</div>')+'</div>';
      if(!mine){ var my=info.rv.filter(function(x){ return x.by===me.uid; })[0]; hv+='<div class="br-card br-f"><div class="br-h">'+esc(T("Laisser un avis"))+'</div><div class="br-rate" id="brRate" data-r="'+(my?my.r:0)+'">'+[1,2,3,4,5].map(function(i){ return '<button data-star="'+i+'" class="'+(my&&i<=my.r?"on":"")+'">★</button>'; }).join("")+'</div><textarea id="brRvTx" maxlength="600" placeholder="'+esc(T("Ton avis sur ce vendeur (sérieux, état du matériel, échange…)"))+'">'+esc(my?my.txt:"")+'</textarea><button class="br-b1" data-act="review" style="width:100%;margin-top:10px">'+esc(T("Publier mon avis"))+'</button><div class="br-err" id="brRvErr"></div></div>'; }
      body.innerHTML=hv; } }).catch(function(){ var body=root.querySelector("#brSBody"); if(body) body.innerHTML='<div class="br-empty">'+esc(T("Connexion impossible. Vérifie le réseau puis réessaie."))+'</div>'; }); }
function quiverHtml(items, edit){ var ks=Object.keys(items||{}); if(!ks.length) return '<div class="br-empty" style="padding:14px">'+esc(T("Quiver vide pour le moment."))+'</div>';
  return ks.map(function(k){ var x=items[k], sp=SP[x.sport]||{ e:"🏄", n:"" }; return '<div class="br-q"><i>'+sp.e+'</i><div><b>'+esc(x.title)+'</b><small>'+esc([T(sp.n),x.brand].filter(Boolean).join(" · "))+'</small></div><em class="'+(x.own?"":"o")+'">'+esc(T(x.own?"Actuel":"Ancien"))+'</em>'+(edit?'<button data-qdel="'+esc(k)+'" aria-label="'+esc(T("Supprimer"))+'">✕</button>':"")+'</div>'; }).join(""); }

// ----- mon espace -----
function gate(){ var me=S.me(); if(me.ready) return true; toast(T("Crée ton profil et valide ton e-mail (onglet Profil) pour déposer une annonce, écrire à un vendeur ou laisser un avis.")); return false; }
function mineHtml(){ return '<div id="brMine"><div class="br-empty">'+esc(T("Chargement…"))+'</div></div>'; }
function publishSeller(q){ // profil vendeur : ancienneté, spots favoris, nombre de sorties (lus par les acheteurs)
  var h=host(), me=S.me(); if(S.demo() || !h || !me.ready) return; var spots=[]; try{ spots=(JSON.parse(localStorage.getItem("lf.meteo.favs")||"[]")||[]).slice(0,6).map(function(x){ return String(x.name||"").slice(0,40); }).filter(Boolean); }catch(e){}
  var o={ since:(q&&q.since)||h.since||Date.now(), spots:spots, n:h.sessions||0, fr:h.friends||0, items:(q&&q.items)||null }, sig=JSON.stringify([o.since,o.spots,o.n,o.fr]); if(q && JSON.stringify([q.since,q.spots||[],q.n||0,q.fr||0])===sig) return;
  S.set("quiver/"+me.uid+"/since",o.since).catch(function(){}); S.set("quiver/"+me.uid+"/spots",spots.length?spots:null).catch(function(){}); S.set("quiver/"+me.uid+"/n",o.n).catch(function(){}); S.set("quiver/"+me.uid+"/fr",o.fr).catch(function(){}); }
function loadMine(){ var me=S.me(); Promise.all([loadList(), S.get("quiver/"+me.uid).catch(function(){ return null; })]).then(function(r){ var box=root.querySelector("#brMine"); if(!box || view!=="moi" || page) return; var q=r[1]||{}; mem.myQ=q; publishSeller(q);
    var l=(LIST||[]).filter(function(a){ return a.uid===me.uid; });
    var h='<button class="br-b2" data-seller="'+esc(me.uid)+'" data-ps="'+esc(me.pseudo||"")+'" style="width:100%;margin-top:12px">👤 '+esc(T("Voir mon profil vendeur"))+'</button>';
    h+='<div class="br-count">'+esc(T("Mes annonces"))+'</div>'+(l.length?'<div class="br-grid">'+l.map(itemCard).join("")+'</div>':'<div class="br-card"><div class="br-empty" style="padding:10px">'+esc(T("Tu n'as pas encore d'annonce."))+'<button class="br-cta" data-act="new">＋ '+esc(T("Déposer une annonce"))+'</button></div></div>');
    h+='<div class="br-count">'+esc(T("Mon quiver"))+'</div><div class="br-card"><div class="br-note" style="margin:0 0 10px">'+esc(T("Le matériel que tu possèdes ou as possédé. Il s'affiche sur ton profil vendeur et rassure les acheteurs."))+'</div>'+quiverHtml(q.items,true)
      +'<div class="br-f"><label>'+esc(T("Ajouter au quiver"))+'</label><input type="text" id="brQTi" maxlength="60" placeholder="'+esc(T("Modèle (ex. Fanatic Sky Wing 5'4)"))+'"><div class="br-row" style="margin-top:8px"><select id="brQSp">'+SPORTS.map(function(s){ return opt(s[0],s[2]+" "+T(s[1]),"efoil"); }).join("")+'</select><select id="brQOwn"><option value="1">'+esc(T("Je l'ai encore"))+'</option><option value="0">'+esc(T("Je l'ai eu"))+'</option></select></div><button class="br-b1" data-act="qadd" style="width:100%;margin-top:10px">＋ '+esc(T("Ajouter"))+'</button></div></div>';
    box.innerHTML=h; }).catch(function(){ var box=root.querySelector("#brMine"); if(box) box.innerHTML='<div class="br-empty"><b>⏳</b>'+esc(T(S.demo()?"Connexion impossible. Vérifie le réseau puis réessaie.":"Second Lite ouvre très bientôt."))+'</div>'; }); }

// ----- formulaire d'annonce -----
function newForm(a){ formS=a ? { id:a.id, type:a.type||"v", pics:null, keep:true, title:a.title, sport:a.sport, cat:a.cat||"", brand:a.brand||"", state:+a.state||0, price:a.price, per:a.per||"j", caution:a.caution||"", desc:a.desc||"", rep:a.rep||"", ship:(a.ship||[]).slice(), msg:a.msg!==false, tel:a.tel||"", place:a.place||"", lat:a.lat, lon:a.lon, thumb:a.thumb, t:a.t, sold:!!a.sold }
  : { id:"", type:view==="loc"?"l":"v", pics:[], title:"", sport:"", cat:"", brand:"", state:0, price:"", per:"j", caution:"", desc:"", rep:"", ship:[], msg:true, tel:"", place:"", lat:null, lon:null };
  page={ k:"form" }; draw(); try{ window.scrollTo({top:0}); }catch(e){}
  if(a) S.get("marketMedia/"+a.id).then(function(m){ if(!formS || formS.id!==a.id) return; formS.pics=[]; Object.keys(m||{}).sort().forEach(function(k){ if(m[k] && m[k].img) formS.pics.push(m[k].img); }); formS.keep=true; drawPics(); }).catch(function(){ if(formS) formS.pics=[]; }); }
function readForm(){ var f=formS, g=function(id){ var e=root.querySelector("#"+id); return e?e.value:""; }; if(!root.querySelector("#brFTi")) return;
  f.title=g("brFTi").trim(); f.sport=g("brFSp"); f.cat=g("brFCat"); f.brand=g("brFBr").trim(); f.price=g("brFPr"); f.per=g("brFPer")||f.per; f.caution=g("brFCau"); f.desc=g("brFDe").trim(); f.rep=g("brFRe").trim(); f.tel=g("brFTel").trim(); f.place=g("brFPl").trim()||f.place;
  f.ship=Array.prototype.map.call(root.querySelectorAll("[data-ship]:checked"), function(c){ return c.dataset.ship; }); var m=root.querySelector("#brFMsg"); if(m) f.msg=m.checked; }
function drawPics(){ var box=root.querySelector("#brPics"); if(!box || !formS) return; var p=formS.pics||[]; box.innerHTML=p.map(function(s,i){ return '<div class="br-pic"><img src="'+esc(s)+'" alt=""><button type="button" data-pdel="'+i+'">✕</button></div>'; }).join("")+(p.length<6?'<button type="button" class="br-add" data-act="pick"><b>＋</b>'+esc(T("Ajouter"))+'</button>':""); }
function drawForm(){ var f=formS, cats=f.sport&&SP[f.sport]?SP[f.sport].cats:[];
  var h='<button class="br-back" data-act="back">‹ '+esc(T("Annuler"))+'</button><div class="br-card br-f"><div class="br-dti" style="margin:0">'+esc(T(f.id?"Modifier l'annonce":"Nouvelle annonce"))+'</div>'
   +'<label>'+esc(T("Type d'annonce"))+'</label><div class="br-seg">'+["v","l","p"].map(function(k){ return '<button type="button" data-ftype="'+k+'" class="'+(f.type===k?"on":"")+'">'+esc(T(TYPES[k][0]))+'</button>'; }).join("")+'</div>'
   +'<label>'+esc(T("Photos (3 minimum, 6 maximum)"))+'</label><div class="br-pics" id="brPics"></div><input type="file" id="brFile" accept="image/*" multiple hidden>'
   +'<label>'+esc(T("Titre de l'annonce"))+'</label><input type="text" id="brFTi" maxlength="80" value="'+esc(f.title)+'">'
   +'<div class="br-row"><div><label>'+esc(T("Discipline"))+'</label><select id="brFSp"><option value="">—</option>'+SPORTS.map(function(s){ return opt(s[0],s[2]+" "+T(s[1]),f.sport); }).join("")+'</select></div><div><label>'+esc(T("Catégorie"))+'</label><select id="brFCat"><option value="">—</option>'+cats.map(function(c){ return opt(c,c,f.cat); }).join("")+'</select></div></div>'
   +'<label>'+esc(T("Marque"))+'</label><input type="text" id="brFBr" maxlength="40" list="brBrands" value="'+esc(f.brand)+'" autocomplete="off"><datalist id="brBrands">'+brandsOf(f.sport).map(function(b){ return '<option value="'+esc(b)+'">'; }).join("")+'</datalist>'
   +'<label>'+esc(T("État"))+'</label><div class="br-sts">'+STATES.map(function(s,i){ return '<button type="button" data-fstate="'+(i+1)+'" class="'+(f.state===i+1?"on":"")+'"><i style="background:'+s[1]+'"></i>'+esc(T(s[0]))+'</button>'; }).join("")+'</div>';
  if(f.type==="v") h+='<label>'+esc(T("Prix (€)"))+'</label><input type="number" id="brFPr" inputmode="decimal" min="0" max="200000" value="'+esc(f.price)+'">';
  else h+=(f.type==="l"?'<div class="br-row"><div><label>'+esc(T("Prix de location (€)"))+'</label><input type="number" id="brFPr" inputmode="decimal" min="0" value="'+esc(f.price)+'"></div><div><label>'+esc(T("par"))+'</label><select id="brFPer">'+Object.keys(PER).map(function(k){ return opt(k,T(PER[k]),f.per); }).join("")+'</select></div></div>':"")
    +'<label>'+esc(T("Caution demandée (€)"))+'</label><input type="number" id="brFCau" inputmode="decimal" min="0" value="'+esc(f.caution)+'"><div class="br-note">'+esc(T("Entre riders : la caution et l'assurance se règlent directement entre vous à la remise du matériel. Faites un état des lieux en photos."))+'</div>';
  h+='<label>'+esc(T("Description"))+'</label><textarea id="brFDe" maxlength="2000" placeholder="'+esc(T("Décris ton matériel : année, dimensions, volume, ce qui est inclus…"))+'">'+esc(f.desc)+'</textarea>'
   +'<label>'+esc(T("Historique des réparations"))+'</label><textarea id="brFRe" maxlength="800" style="min-height:74px" placeholder="'+esc(T("Réparations effectuées (ex. pet au rail réparé en 2025 par un pro). Laisse vide s'il n'y en a aucune."))+'">'+esc(f.rep)+'</textarea>'
   +'<label>'+esc(T("Remise et envoi"))+'</label>'+SHIP.map(function(s){ return '<label class="br-ck" style="text-transform:none;letter-spacing:0;margin:0;color:inherit;font-size:15px"><input type="checkbox" data-ship="'+s[0]+'"'+(f.ship.indexOf(s[0])>=0?" checked":"")+'><span>'+s[2]+" "+esc(T(s[1]))+'</span></label>'; }).join("")
   +'<label>'+esc(T("Contact"))+'</label><label class="br-ck" style="text-transform:none;letter-spacing:0;margin:0;color:inherit;font-size:15px"><input type="checkbox" id="brFMsg"'+(f.msg?" checked":"")+'><span>💬 '+esc(T("Par message dans l'appli"))+'</span></label><input type="tel" id="brFTel" maxlength="20" placeholder="📞 '+esc(T("Numéro de téléphone"))+" ("+esc(T("Par téléphone"))+')" value="'+esc(f.tel)+'" style="margin-top:6px">'
   +'<label>'+esc(T("Où se trouve le matériel ?"))+'</label><div class="br-row"><input type="text" id="brFPl" maxlength="50" placeholder="'+esc(T("Ville ou spot"))+'" value="'+esc(f.place)+'" autocomplete="off"><button type="button" class="br-b2" data-act="fgeo" style="flex:none;padding:11px 13px;font-size:13.5px">📍 '+esc(T("Ma position"))+'</button></div><div id="brFPlRes"></div><div class="br-note">'+esc(T("Seule la ville est affichée, jamais ton adresse."))+'</div>'
   +'<div class="br-err" id="brFErr"></div><button class="br-b1" data-act="save" style="width:100%">'+esc(T(f.id?"Enregistrer":"Publier l'annonce"))+'</button></div>';
  root.innerHTML=h; drawPics();
  var fi=root.querySelector("#brFile"); fi.addEventListener("change", function(){ addPics(fi.files); fi.value=""; });
  root.querySelector("#brFSp").addEventListener("change", function(){ readForm(); formS.cat=""; drawForm(); });
  var pl=root.querySelector("#brFPl"), pt=null; pl.addEventListener("input", function(){ formS.lat=null; formS.lon=null; clearTimeout(pt); var v=pl.value.trim(); if(v.length<2){ root.querySelector("#brFPlRes").innerHTML=""; return; } pt=setTimeout(function(){ geocode(v); }, 350); }); }
function geocode(v){ fetch("https://geocoding-api.open-meteo.com/v1/search?count=5&language=fr&name="+encodeURIComponent(v)).then(function(r){ return r.json(); }).then(function(j){ var box=root.querySelector("#brFPlRes"); if(!box) return; var l=(j&&j.results)||[]; if(!l.length){ box.innerHTML='<div class="br-note">'+esc(T("Ville introuvable."))+'</div>'; return; }
    box.innerHTML='<div class="br-res">'+l.map(function(x){ return '<button type="button" data-geo="'+esc(x.name)+'" data-lat="'+x.latitude+'" data-lon="'+x.longitude+'">📍 <b>'+esc(x.name)+'</b> <small style="color:#66727d">'+esc([x.admin2,x.admin1,x.country].filter(Boolean).join(", "))+'</small></button>'; }).join("")+'</div>'; }).catch(function(){}); }
function shrink(file, max, q){ return new Promise(function(res, rej){ var r=new FileReader(); r.onerror=rej; r.onload=function(){ var img=new Image(); img.onerror=rej; img.onload=function(){ var k=Math.min(1, max/Math.max(img.width,img.height)), c=document.createElement("canvas"); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k); c.getContext("2d").drawImage(img,0,0,c.width,c.height); res(c.toDataURL("image/jpeg",q)); }; img.src=r.result; }; r.readAsDataURL(file); }); }
function thumbOf(dataUrl){ return new Promise(function(res){ var img=new Image(); img.onload=function(){ var S2=300, c=document.createElement("canvas"); c.width=S2; c.height=S2; var m=Math.min(img.width,img.height); c.getContext("2d").drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,S2,S2); res(c.toDataURL("image/jpeg",0.6)); }; img.onerror=function(){ res(""); }; img.src=dataUrl; }); }
function addPics(files){ if(!formS) return; if(!formS.pics) formS.pics=[]; var l=Array.prototype.slice.call(files||[]).slice(0, 6-formS.pics.length); formS.keep=false;
  l.reduce(function(p,f){ return p.then(function(){ return shrink(f,1200,0.74).then(function(u){ if(u.length<390000) return u; return shrink(f,900,0.62); }).then(function(u){ if(formS && formS.pics.length<6 && u.length<400000) formS.pics.push(u); drawPics(); }).catch(function(){}); }); }, Promise.resolve()); }
function saveForm(){ if(busy) return; readForm(); var f=formS, err=function(m){ var e=root.querySelector("#brFErr"); if(e) e.textContent=T(m); return false; }, me=S.me();
  if(!gate()) return; if(!f.pics || f.pics.length<3) return err("Ajoute au moins 3 photos."); if(f.title.length<3) return err("Donne un titre à ton annonce."); if(!f.sport || !f.cat) return err("Choisis la discipline et la catégorie."); if(!f.state) return err("Indique l'état du matériel.");
  var price=f.type==="p"?0:parseFloat(String(f.price).replace(",",".")); if(f.type!=="p" && !(price>=0 && String(f.price)!=="")) return err("Indique un prix."); if(f.desc.length<20) return err("Ajoute un descriptif (20 caractères minimum).");
  if(!f.ship.length) return err("Choisis au moins un mode de remise ou d'envoi."); var tel=f.tel.replace(/[^+\d]/g,""); if(f.tel && tel.length<8) return err("Indique un numéro de téléphone valide."); if(!f.msg && !tel) return err("Choisis au moins un moyen de contact.");
  if(!f.place || !isFinite(f.lat) || f.lat==null) return err("Indique où se trouve le matériel.");
  busy=true; var e=root.querySelector("#brFErr"); if(e){ e.style.color="var(--muted,#66727d)"; e.textContent=T("Envoi des photos…"); } var id=f.id||S.key(), old=f.id?(LIST||[]).filter(function(x){ return x.id===f.id; })[0]:null, oldN=old?(+old.n||0):0;
  thumbOf(f.pics[0]).then(function(th){ var chain=Promise.resolve();
    if(!f.keep || !f.id){ f.pics.forEach(function(img,i){ chain=chain.then(function(){ return S.set("marketMedia/"+id+"/"+i, { uid:me.uid, img:img }); }); }); for(var j=f.pics.length;j<oldN;j++) (function(j){ chain=chain.then(function(){ return S.set("marketMedia/"+id+"/"+j, null); }); })(j); }
    return chain.then(function(){ var cau=parseFloat(String(f.caution).replace(",","."));
      var o={ uid:me.uid, pseudo:me.pseudo, type:f.type, title:f.title.slice(0,80), sport:f.sport, cat:f.cat, brand:f.brand.slice(0,40), state:f.state, price:Math.round(price*100)/100, per:f.type==="l"?f.per:null, caution:(f.type!=="v" && cau>0)?cau:null,
        desc:f.desc.slice(0,2000), rep:f.rep.slice(0,800), ship:f.ship, msg:!!f.msg, tel:tel||"", place:f.place.slice(0,50), lat:Math.round(f.lat*100)/100, lon:Math.round(f.lon*100)/100, thumb:th||f.thumb||"", n:f.pics.length, t:f.t||S.now(), sold:f.sold||null };
      return S.set("market/"+id, o).then(function(){ o.id=id; if(typeof o.t!=="number") o.t=Date.now(); return o; }); }); })
  .then(function(o){ busy=false; LIST=null; formS=null; toast(T("Annonce en ligne.")); return loadList(true).then(function(){ var a=(LIST||[]).filter(function(x){ return x.id===o.id; })[0]||o; page={ k:"detail", a:a }; draw(); try{ window.scrollTo({top:0}); }catch(x){} }); })
  .catch(function(){ busy=false; var e2=root.querySelector("#brFErr"); if(e2){ e2.style.color=""; e2.textContent=T("L'envoi a échoué. Vérifie ta connexion puis réessaie."); } }); }

// ---------- actions ----------
function onClick(e){ var b=e.target.closest("button, a"); if(!b || !root.contains(b)) return; var d=b.dataset, a=page && page.a, me=S.me();
  if(d.view){ view=d.view; page=null; return draw(); }
  if(d.open) return openById(d.open);
  if(d.fav){ var on=favToggle(d.fav); toast(T(on?"Ajoutée à tes favoris.":"Retirée de tes favoris.")); return draw(); }
  if(d.seller){ page={ k:"seller", uid:d.seller, ps:d.ps||"", tab:"ann", from:page }; draw(); try{ window.scrollTo({top:0}); }catch(x){} return; }
  if(d.stab){ page.tab=d.stab; return draw(); }
  if(d.star){ var box=root.querySelector("#brRate"); box.dataset.r=d.star; Array.prototype.forEach.call(box.children, function(x){ x.classList.toggle("on", +x.dataset.star<=+d.star); }); return; }
  if(d.ftype){ readForm(); formS.type=d.ftype; return drawForm(); }
  if(d.fstate){ readForm(); formS.state=+d.fstate; Array.prototype.forEach.call(root.querySelectorAll("[data-fstate]"), function(x){ x.classList.toggle("on", x===b); }); return; }
  if(d.pdel!=null){ formS.pics.splice(+d.pdel,1); formS.keep=false; return drawPics(); }
  if(d.geo){ formS.place=d.geo; formS.lat=+d.lat; formS.lon=+d.lon; root.querySelector("#brFPl").value=d.geo; root.querySelector("#brFPlRes").innerHTML=""; return; }
  if(d.qdel){ var q=mem.myQ||{}; if(q.items) delete q.items[d.qdel]; S.set("quiver/"+me.uid+"/items/"+d.qdel, null).then(function(){ delete mem["s:"+me.uid]; loadMine(); }).catch(function(){ toast(T("L'envoi a échoué. Vérifie ta connexion puis réessaie.")); }); return; }
  switch(d.act){
    case "new": if(gate()) newForm(null); return;
    case "back": if(page && page.k==="seller" && page.from){ page=page.from; } else page=null; formS=null; return draw();
    case "clear": F={ q:"", sport:"", cat:"", brand:"", state:"", max:"", neuf:"", sort:"new" }; return draw();
    case "reload": LIST=null; return draw();
    case "pick": root.querySelector("#brFile").click(); return;
    case "fgeo": if(!navigator.geolocation) return toast(T("Position indisponible.")); navigator.geolocation.getCurrentPosition(function(g){ if(!formS) return; formS.lat=g.coords.latitude; formS.lon=g.coords.longitude;
        fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat="+g.coords.latitude.toFixed(3)+"&lon="+g.coords.longitude.toFixed(3)).then(function(r){ return r.json(); }).then(function(j){ var ad=(j&&j.address)||{}, n=ad.city||ad.town||ad.village||ad.municipality||ad.county||""; if(n && formS){ formS.place=n; var i=root.querySelector("#brFPl"); if(i) i.value=n; } }).catch(function(){});
        var i=root.querySelector("#brFPl"); if(i && !i.value) i.value=T("Ma position"); if(!formS.place) formS.place=T("Ma position"); }, function(){ toast(T("Position indisponible.")); }, { timeout:12000, maximumAge:300000 }); return;
    case "save": return saveForm();
    case "edit": return newForm(a);
    case "sold": a.sold=!a.sold; S.set("market/"+a.id+"/sold", a.sold?true:null).then(function(){ draw(); }).catch(function(){ a.sold=!a.sold; toast(T("L'envoi a échoué. Vérifie ta connexion puis réessaie.")); }); return;
    case "del": if(!confirm(T("Supprimer cette annonce ?"))) return; var n=+a.n||6, ch=Promise.resolve(); for(var i=0;i<n;i++) (function(i){ ch=ch.then(function(){ return S.set("marketMedia/"+a.id+"/"+i, null).catch(function(){}); }); })(i);
      ch.then(function(){ return S.set("market/"+a.id, null); }).then(function(){ LIST=(LIST||[]).filter(function(x){ return x.id!==a.id; }); page=null; draw(); }).catch(function(){ toast(T("L'envoi a échoué. Vérifie ta connexion puis réessaie.")); }); return;
    case "msg": if(!gate()) return; var h=host(); if(S.demo() || !h){ toast("💬 "+a.pseudo); return; } h.openDM(a.uid, T("Bonjour, ton annonce m'intéresse :")+" « "+a.title+" » ("+(a.type==="p"?T("Prêt"):money(a.price))+")"); return;
    case "report": var h2=host(); if(h2 && h2.report) h2.report({ type:"annonce", targetUid:a.uid, targetPseudo:a.pseudo, text:("Second Lite, annonce "+a.id+" : "+a.title).slice(0,400) }); b.textContent="✓ "+T("Signalée, merci."); b.disabled=true; return;
    case "review": if(!gate()) return; var r=+root.querySelector("#brRate").dataset.r||0, tx=root.querySelector("#brRvTx").value.trim(), er=root.querySelector("#brRvErr"); if(!r){ er.textContent=T("Choisis une note."); return; }
      S.set("marketReviews/"+page.uid+"/"+me.uid, { r:r, txt:tx.slice(0,600), pseudo:me.pseudo, t:S.now() }).then(function(){ delete mem["s:"+page.uid]; toast(T("Merci, ton avis est publié.")); draw(); }).catch(function(){ er.textContent=T("L'envoi a échoué. Vérifie ta connexion puis réessaie."); }); return;
    case "qadd": if(!gate()) return; var ti=root.querySelector("#brQTi").value.trim(); if(ti.length<2) return; var sp=root.querySelector("#brQSp").value, k="q"+Date.now().toString(36);
      S.set("quiver/"+me.uid+"/items/"+k, { title:ti.slice(0,60), sport:sp, brand:"", own:root.querySelector("#brQOwn").value==="1" }).then(function(){ delete mem["s:"+me.uid]; loadMine(); }).catch(function(){ toast(T("L'envoi a échoué. Vérifie ta connexion puis réessaie.")); }); return;
  } }
function onChange(e){ var s=e.target; if(!s.dataset || !s.dataset.f) return; F[s.dataset.f]=s.value; if(s.dataset.f==="sport"){ F.cat=""; F.brand=""; }
  if(s.dataset.f==="sort" && s.value==="near" && !myPos){ locate(function(){ draw(); }); }
  var q=root.querySelector("#brQ"), foc=q && document.activeElement===q; draw(); }

window.LFBonRide={ show:function(pane){ if(root!==pane){ root=pane; root.setAttribute("data-no-i18n",""); if(!document.getElementById("brCss")){ var st=document.createElement("style"); st.id="brCss"; st.textContent=CSS; document.head.appendChild(st); } root.addEventListener("click", onClick); root.addEventListener("change", onChange); }
    if(!page) draw(); if(LIST && Date.now()-listAt>120000) loadList(true).then(function(){ if(!page) draw(); }).catch(function(){}); },
  go:function(w){ if(!root) return; if(w==="fav"){ view="fav"; page=null; formS=null; draw(); } else if(w==="new"){ if(gate()) newForm(null); } try{ window.scrollTo({top:0}); }catch(e){} },
  _t:{ SPORTS:SPORTS, brandsOf:brandsOf } };
})();
