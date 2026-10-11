// Publie un firmware de télécommande pour la mise à jour par Bluetooth depuis l'appli.
//   node firmware/publier.js <chemin du .bin> <version> [notes]
// Copie le binaire sous firmware/telecommande-<version>.bin et écrit firmware/telecommande.json
// (version, taille, MD5, date, notes). L'appli lit ce JSON, compare avec la version que la
// télécommande annonce en Bluetooth, télécharge le binaire et vérifie son MD5 avant l'envoi.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const [bin, version, ...rest] = process.argv.slice(2);
if (!bin || !version) { console.error("usage: node firmware/publier.js <fichier.bin> <version> [notes]"); process.exit(1); }
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error("version attendue : x.y.z"); process.exit(1); }
const data = fs.readFileSync(bin);
if (data[0] !== 0xE9) { console.error("ce fichier ne ressemble pas à une image ESP32 (premier octet != 0xE9)"); process.exit(1); }
const dir = __dirname, file = "telecommande-" + version + ".bin";
fs.writeFileSync(path.join(dir, file), data);
const meta = { product: "telecommande", version, file, size: data.length, md5: crypto.createHash("md5").update(data).digest("hex"),
               date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), notes: rest.join(" ") || "" };
fs.writeFileSync(path.join(dir, "telecommande.json"), JSON.stringify(meta, null, 2) + "\n");
console.log("publié :", file, meta.size, "octets, md5", meta.md5);
