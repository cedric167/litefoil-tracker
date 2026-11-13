#!/usr/bin/env python3
"""Lite Foil (13/11/2026) : build iOS Codemagic.

Le build échouait : « Provisioning profile doesn't include the Sign In with Apple capability ».
Ce script, lancé sur la machine de build avec la clé API App Store Connect de l'intégration Codemagic :
  1) active « Sign in with Apple » sur l'identifiant de l'appli s'il ne l'est pas ;
  2) si le profil App Store n'est plus valide (ou n'a pas la capacité), en crée un nouveau avec le même
     certificat de distribution et l'installe sur la machine à la place de l'ancien.
Relançable sans risque : ne fait rien si tout est déjà en ordre.
"""
import base64, json, os, sys, time, glob, plistlib, subprocess, urllib.request, urllib.error

BUNDLE = os.environ.get("BUNDLE_ID", "fr.litefoil.tracker")
ISS, KID, KEY = (os.environ.get(k) for k in ("APP_STORE_CONNECT_ISSUER_ID", "APP_STORE_CONNECT_KEY_IDENTIFIER", "APP_STORE_CONNECT_PRIVATE_KEY"))
if not (ISS and KID and KEY):
    print("Clé API App Store Connect absente : étape ignorée."); sys.exit(0)
try:
    import jwt
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "pyjwt", "cryptography"])
    import jwt

# La clé peut arriver avec des \n littéraux, sur une seule ligne ou sans en-tête PEM : on la remet en forme.
import re, textwrap
NL = chr(10)
# Codemagic peut donner la clé sous la forme « @file:chemin » ou « @env:NOM » (convention de ses outils)
for _ in range(3):
    if KEY.startswith("@file:"): KEY = open(os.path.expanduser(KEY[6:])).read()
    elif KEY.startswith("@env:"): KEY = os.environ.get(KEY[5:], "")
    elif os.path.isfile(os.path.expanduser(KEY.strip())): KEY = open(os.path.expanduser(KEY.strip())).read()
print("clé API : longueur", len(KEY), "| en-tête PEM :", "BEGIN" in KEY, "| lignes :", KEY.count(NL) + 1)
_k = KEY.replace(chr(92) + "n", NL).strip()
_b = re.sub(r"-----[A-Z ]+-----|\s", "", _k)
KEY = "-----BEGIN PRIVATE KEY-----" + NL + NL.join(textwrap.wrap(_b, 64)) + NL + "-----END PRIVATE KEY-----" + NL
TOKEN = jwt.encode({"iss": ISS, "iat": int(time.time()), "exp": int(time.time()) + 900, "aud": "appstoreconnect-v1"}, KEY, algorithm="ES256", headers={"kid": KID})
API = "https://api.appstoreconnect.apple.com/v1"

def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        print("Apple a répondu", e.code, "sur", method, path.split("?")[0], ":", e.read().decode()[:600]); raise

ids = [b for b in call("GET", "/bundleIds?filter[identifier]=" + BUNDLE + "&limit=200")["data"] if b["attributes"]["identifier"] == BUNDLE]
if not ids:
    print("Identifiant", BUNDLE, "introuvable chez Apple."); sys.exit(1)
bid = ids[0]["id"]

caps = [c["attributes"]["capabilityType"] for c in call("GET", "/bundleIds/" + bid + "/bundleIdCapabilities")["data"]]
added = False
if "APPLE_ID_AUTH" in caps:
    print("Sign in with Apple : déjà activé sur", BUNDLE)
else:
    call("POST", "/bundleIdCapabilities", {"data": {"type": "bundleIdCapabilities",
         "attributes": {"capabilityType": "APPLE_ID_AUTH", "settings": [{"key": "APPLE_ID_AUTH_APP_CONSENT", "options": [{"key": "PRIMARY_APP_CONSENT"}]}]},
         "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bid}}}}})
    added = True
    print("Sign in with Apple : activé sur", BUNDLE)

profs = [p for p in call("GET", "/bundleIds/" + bid + "/profiles?limit=200")["data"] if p["attributes"]["profileType"] == "IOS_APP_STORE"]
def has_cap(p):
    try:
        raw = base64.b64decode(p["attributes"]["profileContent"]); a = raw.index(b"<?xml"); b = raw.index(b"</plist>") + 8
        return "com.apple.developer.applesignin" in plistlib.loads(raw[a:b]).get("Entitlements", {})
    except Exception:
        return False
good = [p for p in profs if p["attributes"]["profileState"] == "ACTIVE" and has_cap(p)]
PDIRS = [os.path.expanduser(d) for d in ("~/Library/MobileDevice/Provisioning Profiles", "~/Library/Developer/Xcode/UserData/Provisioning Profiles")]
for d in PDIRS: os.makedirs(d, exist_ok=True)
def install(p):
    for d in PDIRS:
        with open(os.path.join(d, p["attributes"]["uuid"] + ".mobileprovision"), "wb") as f:
            f.write(base64.b64decode(p["attributes"]["profileContent"]))
def forget(p):
    for f in [x for d in PDIRS for x in glob.glob(os.path.join(d, "*.mobileprovision"))]:
        try:
            if p["attributes"]["uuid"].encode() in open(f, "rb").read(): os.remove(f)
        except OSError: pass

if good and not added:
    for p in profs:
        if p not in good: forget(p)
    install(good[0]); print("Profil valide installé :", good[0]["attributes"]["name"]); sys.exit(0)

certs = []
for p in profs:
    try: certs += [c["id"] for c in call("GET", "/profiles/" + p["id"] + "/certificates")["data"]]
    except Exception: pass  # profil périmé : Apple ne donne plus ses certificats
if not certs:
    certs = [c["id"] for c in call("GET", "/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION&limit=200")["data"]]
certs = sorted(set(certs))
if not certs:
    print("Aucun certificat de distribution chez Apple."); sys.exit(1)
new = call("POST", "/profiles", {"data": {"type": "profiles",
      "attributes": {"name": "Lite Foil App Store Codemagic " + time.strftime("%Y%m%d-%H%M"), "profileType": "IOS_APP_STORE"},
      "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bid}},
                        "certificates": {"data": [{"type": "certificates", "id": c} for c in certs]}}}})["data"]
for p in profs: forget(p)
install(new)
print("Nouveau profil créé et installé :", new["attributes"]["name"])
