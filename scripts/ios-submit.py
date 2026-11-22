#!/usr/bin/env python3
"""Lite Foil : soumet à Apple (validation App Store) un build déjà présent sur TestFlight.

Lancé par Codemagic avec la clé API App Store Connect, quand on pousse une étiquette Git
« submit-<version>-<build> », par exemple submit-1.7.2-29922009. Aucune connexion au site d'Apple n'est nécessaire.
  1) retrouve le build ; 2) prépare la version (créée si besoin) et lui rattache le build ;
  3) écrit les nouveautés dans chaque langue de la fiche ; 4) envoie la version en validation.
Les nouveautés sont dans scripts/ios-nouveautes.json. Relançable sans risque.
"""
import json, os, re, sys, time, subprocess, textwrap, urllib.request, urllib.error

BUNDLE = os.environ.get("BUNDLE_ID", "fr.litefoil.tracker")
TAG = os.environ.get("CM_TAG") or (sys.argv[1] if len(sys.argv) > 1 else "")
m = re.match(r"^submit-(\d+(?:\.\d+){1,2})-(\d+)(-remplace)?$", TAG)
if not m:
    print("Étiquette attendue : submit-<version>-<build>. Reçu :", TAG); sys.exit(1)
VERSION, BUILD = m.group(1), m.group(2)
# « -remplace » à la fin de l'étiquette : si une autre version attend encore sa vérification chez Apple, elle est retirée de la
# file et celle-ci prend sa place (elle doit contenir tout ce que l'autre apportait). Sans effet si l'examen a déjà commencé.
REMPLACE = bool(m.group(3))
ISS, KID, KEY = (os.environ.get(k) for k in ("APP_STORE_CONNECT_ISSUER_ID", "APP_STORE_CONNECT_KEY_IDENTIFIER", "APP_STORE_CONNECT_PRIVATE_KEY"))
if not (ISS and KID and KEY):
    print("Clé API App Store Connect absente."); sys.exit(1)
try:
    import jwt
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "pyjwt", "cryptography"])
    import jwt

NL = chr(10)
for _ in range(3):
    if KEY.startswith("@file:"): KEY = open(os.path.expanduser(KEY[6:])).read()
    elif KEY.startswith("@env:"): KEY = os.environ.get(KEY[5:], "")
    elif os.path.isfile(os.path.expanduser(KEY.strip())): KEY = open(os.path.expanduser(KEY.strip())).read()
_b = re.sub(r"-----[A-Z ]+-----|\s", "", KEY.replace(chr(92) + "n", NL).strip())
KEY = "-----BEGIN PRIVATE KEY-----" + NL + NL.join(textwrap.wrap(_b, 64)) + NL + "-----END PRIVATE KEY-----" + NL
API = "https://api.appstoreconnect.apple.com/v1"

def token():
    return jwt.encode({"iss": ISS, "iat": int(time.time()), "exp": int(time.time()) + 900, "aud": "appstoreconnect-v1"}, KEY, algorithm="ES256", headers={"kid": KID})

def call(method, path, body=None, ok=()):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        if e.code in ok: return {"_code": e.code, "_txt": txt}
        print("Apple a répondu", e.code, "sur", method, path.split("?")[0], ":", txt[:1200]); raise

app = [a for a in call("GET", "/apps?filter[bundleId]=" + BUNDLE)["data"] if a["attributes"]["bundleId"] == BUNDLE][0]
APP = app["id"]
print("Appli :", app["attributes"]["name"], APP)

# 1) le build
bl = call("GET", "/builds?filter[app]=" + APP + "&filter[version]=" + BUILD + "&filter[preReleaseVersion.version]=" + VERSION + "&limit=5")["data"]
if not bl:
    print("Build", VERSION, "(" + BUILD + ") introuvable chez Apple."); sys.exit(1)
b = bl[0]
print("Build :", BUILD, "| état :", b["attributes"]["processingState"], "| expiré :", b["attributes"].get("expired"))
if b["attributes"]["processingState"] != "VALID" or b["attributes"].get("expired"):
    print("Ce build n'est pas utilisable."); sys.exit(1)

# 2) la version : celle déjà en préparation, sinon une nouvelle
EDIT = ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY")
vs = call("GET", "/apps/" + APP + "/appStoreVersions?filter[platform]=IOS&limit=20")["data"]
for v in vs: print("  version", v["attributes"]["versionString"], v["attributes"]["appStoreState"])
busy = [v for v in vs if v["attributes"]["appStoreState"] in ("WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE", "PROCESSING_FOR_APP_STORE")]
WAIT = ("WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE", "PROCESSING_FOR_APP_STORE")
if busy and REMPLACE and busy[0]["attributes"]["versionString"] != VERSION and busy[0]["attributes"]["appStoreState"] == "WAITING_FOR_REVIEW":
    old = busy[0]["attributes"]["versionString"]
    for rs in call("GET", "/reviewSubmissions?filter[app]=" + APP + "&filter[platform]=IOS&filter[state]=WAITING_FOR_REVIEW&limit=5")["data"]:
        call("PATCH", "/reviewSubmissions/" + rs["id"], {"data": {"type": "reviewSubmissions", "id": rs["id"], "attributes": {"canceled": True}}})
        print("Version", old, "retirée de la file d'attente d'Apple.")
    for _ in range(40):
        time.sleep(6)
        vs = call("GET", "/apps/" + APP + "/appStoreVersions?filter[platform]=IOS&limit=20")["data"]
        if not [v for v in vs if v["attributes"]["appStoreState"] in WAIT]: break
    for v in vs: print("  version", v["attributes"]["versionString"], v["attributes"]["appStoreState"])
    busy = [v for v in vs if v["attributes"]["appStoreState"] in WAIT]
if busy:
    print("Une version est déjà chez Apple (" + busy[0]["attributes"]["versionString"] + ", " + busy[0]["attributes"]["appStoreState"] + ") : rien à soumettre."); sys.exit(0 if busy[0]["attributes"]["versionString"] == VERSION else 1)
ed = [v for v in vs if v["attributes"]["appStoreState"] in EDIT]
if ed:
    v = ed[0]
    if v["attributes"]["versionString"] != VERSION:
        call("PATCH", "/appStoreVersions/" + v["id"], {"data": {"type": "appStoreVersions", "id": v["id"], "attributes": {"versionString": VERSION}}})
else:
    v = call("POST", "/appStoreVersions", {"data": {"type": "appStoreVersions", "attributes": {"platform": "IOS", "versionString": VERSION, "releaseType": "AFTER_APPROVAL"},
                                                    "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})["data"]
VID = v["id"]
print("Version", VERSION, "prête :", VID)
call("PATCH", "/appStoreVersions/" + VID + "/relationships/build", {"data": {"type": "builds", "id": b["id"]}})
print("Build rattaché à la version.")

# 3) nouveautés, dans les langues déjà présentes sur la fiche
NEWS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ios-nouveautes.json"), encoding="utf-8"))
for l in call("GET", "/appStoreVersions/" + VID + "/appStoreVersionLocalizations?limit=50")["data"]:
    loc = l["attributes"]["locale"]
    txt = NEWS.get(loc) or NEWS.get(loc.split("-")[0]) or NEWS["en"]
    call("PATCH", "/appStoreVersionLocalizations/" + l["id"], {"data": {"type": "appStoreVersionLocalizations", "id": l["id"], "attributes": {"whatsNew": txt}}})
    print("Nouveautés écrites :", loc)

# note aux vérificateurs : on y ajoute le paragraphe Santé s'il manque
rd = call("GET", "/appStoreVersions/" + VID + "/appStoreReviewDetail", ok=(404,)).get("data")
if rd and NEWS.get("_note"):
    notes = rd["attributes"].get("notes") or ""
    if "HealthKit" not in notes:
        call("PATCH", "/appStoreReviewDetails/" + rd["id"], {"data": {"type": "appStoreReviewDetails", "id": rd["id"], "attributes": {"notes": (notes + NL + NL + NEWS["_note"]).strip()[:3900]}}})
        print("Note aux vérificateurs complétée.")

# 4) envoi en validation
subs = call("GET", "/reviewSubmissions?filter[app]=" + APP + "&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=5")["data"]
if subs:
    sub = subs[0]
else:
    sub = call("POST", "/reviewSubmissions", {"data": {"type": "reviewSubmissions", "attributes": {"platform": "IOS"}, "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})["data"]
SID = sub["id"]
items = call("GET", "/reviewSubmissions/" + SID + "/items?limit=20")["data"]
if not items:
    call("POST", "/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems", "relationships": {
        "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": SID}},
        "appStoreVersion": {"data": {"type": "appStoreVersions", "id": VID}}}}})
r = call("PATCH", "/reviewSubmissions/" + SID, {"data": {"type": "reviewSubmissions", "id": SID, "attributes": {"submitted": True}}})
print("ENVOYÉ À APPLE : version", VERSION, "build", BUILD, "| état :", r["data"]["attributes"]["state"])
