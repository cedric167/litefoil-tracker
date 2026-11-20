#!/usr/bin/env python3
"""Lite Foil : build iOS Codemagic avec l'appli Apple Watch.

L'appli montre a son propre identifiant (fr.litefoil.tracker.watchkitapp), qu'Apple veut signer avec son
propre profil App Store. Ce script, lancé sur la machine de build avec la clé API App Store Connect :
  1) enregistre l'identifiant de l'appli montre chez Apple s'il n'existe pas ;
  2) installe son profil App Store, ou en crée un avec le même certificat que l'appli iPhone.
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

WATCH = os.environ.get("WATCH_BUNDLE_ID", BUNDLE + ".watchkitapp")

def bundle(identifier):
    r = [b for b in call("GET", "/bundleIds?filter[identifier]=" + identifier + "&limit=200")["data"] if b["attributes"]["identifier"] == identifier]
    return r[0] if r else None

main = bundle(BUNDLE)
if not main:
    print("Identifiant", BUNDLE, "introuvable chez Apple."); sys.exit(1)
w = bundle(WATCH)
if w:
    print("Identifiant montre déjà enregistré :", WATCH)
else:
    w = call("POST", "/bundleIds", {"data": {"type": "bundleIds", "attributes": {"identifier": WATCH, "name": "Lite Foil Watch", "platform": "IOS"}}})["data"]
    print("Identifiant montre enregistré :", WATCH)

# droit HealthKit de l'appli montre (séance d'exercice pendant la sortie) : activé sur l'identifiant s'il ne l'est pas
caps = [c["attributes"]["capabilityType"] for c in call("GET", "/bundleIds/" + w["id"] + "/bundleIdCapabilities")["data"]]
if "HEALTHKIT" in caps:
    print("HealthKit déjà activé sur l'identifiant montre.")
else:
    call("POST", "/bundleIdCapabilities", {"data": {"type": "bundleIdCapabilities", "attributes": {"capabilityType": "HEALTHKIT", "settings": []},
         "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": w["id"]}}}}})
    print("HealthKit activé sur l'identifiant montre.")

PDIRS = [os.path.expanduser(d) for d in ("~/Library/MobileDevice/Provisioning Profiles", "~/Library/Developer/Xcode/UserData/Provisioning Profiles")]
for d in PDIRS: os.makedirs(d, exist_ok=True)
def install(p):
    for d in PDIRS:
        with open(os.path.join(d, p["attributes"]["uuid"] + ".mobileprovision"), "wb") as f:
            f.write(base64.b64decode(p["attributes"]["profileContent"]))

def store_profiles(b):
    return [p for p in call("GET", "/bundleIds/" + b["id"] + "/profiles?limit=200")["data"]
            if p["attributes"]["profileType"] == "IOS_APP_STORE" and p["attributes"]["profileState"] == "ACTIVE"]

# certificats de l'appli iPhone : le profil de la montre doit utiliser le même (celui présent sur la machine de build)
certs = []
for p in store_profiles(main):
    try: certs += [c["id"] for c in call("GET", "/profiles/" + p["id"] + "/certificates")["data"]]
    except Exception: pass
if not certs:
    certs = [c["id"] for c in call("GET", "/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION&limit=200")["data"]]
certs = sorted(set(certs))
if not certs:
    print("Aucun certificat de distribution chez Apple."); sys.exit(1)

for p in store_profiles(w):
    try: have = [c["id"] for c in call("GET", "/profiles/" + p["id"] + "/certificates")["data"]]
    except Exception: have = []
    # un profil créé avant l'activation de HealthKit ne porte pas ce droit : on ne le réutilise pas
    if set(certs) <= set(have) and b"com.apple.developer.healthkit" in base64.b64decode(p["attributes"]["profileContent"]):
        install(p); print("Profil montre valide installé :", p["attributes"]["name"]); sys.exit(0)

new = call("POST", "/profiles", {"data": {"type": "profiles",
      "attributes": {"name": "Lite Foil Watch App Store Codemagic " + time.strftime("%Y%m%d-%H%M"), "profileType": "IOS_APP_STORE"},
      "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": w["id"]}},
                        "certificates": {"data": [{"type": "certificates", "id": c} for c in certs]}}}})["data"]
install(new)
print("Profil montre créé et installé :", new["attributes"]["name"])
