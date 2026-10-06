/* Petit serveur HTTPS pour utiliser la page de configuration depuis le telephone
   sans hebergement externe.
   Le Bluetooth web exige un contexte securise : un fichier ouvert en file:// ne
   convient pas, d'ou le HTTPS, meme avec un certificat auto-signe. */
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8443;
const DIR = __dirname;

const opts = {
  key:  fs.readFileSync(path.join(DIR, 'cert', 'cle.pem')),
  cert: fs.readFileSync(path.join(DIR, 'cert', 'cert.pem'))
};

const TYPES = { '.html':'text/html; charset=utf-8', '.md':'text/plain; charset=utf-8' };

https.createServer(opts, (req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]);
  if (f === '/' || f === '') f = '/index.html';
  const p = path.join(DIR, path.normalize(f).replace(/^[\\/]+/, ''));
  if (!p.startsWith(DIR)) { res.writeHead(403); return res.end('interdit'); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); return res.end('introuvable'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  const ips = [];
  for (const [nom, list] of Object.entries(os.networkInterfaces()))
    for (const a of list)
      if (a.family === 'IPv4' && !a.internal) ips.push(`${a.address}  (${nom})`);
  console.log('Serveur demarre. Adresses a ouvrir depuis le telephone :');
  for (const ip of ips) console.log('   https://' + ip.split(' ')[0] + ':' + PORT + '/     ' + ip.split('(')[1]?.replace(')',''));
  console.log('\nLe telephone affichera un avertissement de securite (certificat auto-signe) :');
  console.log('choisir "Parametres avances" puis "Continuer". Le contexte reste securise,');
  console.log('donc le Bluetooth web fonctionne.');
});
