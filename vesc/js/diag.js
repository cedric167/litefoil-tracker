// Diagnostic de connexion : les causes réelles de « could not read firmware version » relevées
// sur les forums VESC (esk8.news, foil.zone, vesc-project), dans l'ordre où les vérifier.

import { el, sheet } from './ui.js';

const STEPS = [
  ['Une seule appli à la fois',
    "Ferme VESC Tool, l'onglet VESC de Lite Foil et toute autre appli connectée : un module Bluetooth n'accepte qu'un téléphone."],
  ['Module oublié dans les réglages du téléphone',
    "Si le module apparaît dans les réglages Bluetooth du téléphone (appareils appairés), choisis « Oublier ». Une liaison système empêche l'appli de s'y connecter."],
  ['Bon type de module',
    "Les modules VESC (NRF51/NRF52, VESC Express, Flipsky BT) fonctionnent. Les BT05 et HC-05 ne fonctionnent pas ; les vieux HM-10 sont peu fiables."],
  ["L'UART est activé dans le VESC",
    "« APP to Use » doit inclure l'UART (« UART », « PPM and UART » ou « ADC and UART »), ou « Enable Permanent UART » doit être coché. En « PPM » seul, le Bluetooth ne parle pas au contrôleur. À corriger par USB si besoin."],
  ['Câblage TX / RX',
    "Le TX du module va sur le RX du VESC, et le RX sur le TX. Inversés, le module se connecte au téléphone mais le contrôleur ne répond jamais."],
  ['Alimentation du module',
    "Vérifie la tension demandée par le module (3,3 V ou 5 V) et que la masse est commune avec le VESC."],
  ['Débit 115200',
    "Le module et le VESC doivent utiliser le même débit UART (115200 par défaut, « Baudrate » dans App > UART)."],
  ['Redémarrer',
    "Éteins la planche dix secondes, rallume-la, puis réessaie. Sur Android, couper puis rallumer le Bluetooth du téléphone aide aussi."],
];

export function showDiagnostic(error) {
  const parts = [];
  if (error) parts.push(el('div', 'banner bad', 'Erreur : ' + error));
  parts.push(el('p', 'muted small-text', 'Vérifie ces points dans l\'ordre : ils règlent presque tous les cas.'));
  const list = el('ol', 'diag-list');
  for (const [title, text] of STEPS) {
    const li = el('li');
    li.append(el('b', '', title), el('span', '', text));
    if (title.startsWith('Câblage')) {
      const img = el('img', 'diag-img');
      img.src = 'img/controller.webp';
      img.alt = 'Connecteurs du contrôleur : TX et RX sur le connecteur COMM';
      li.append(img, el('span', 'diag-cap', 'Le module Bluetooth se branche sur le connecteur COMM (TX, RX, 5 V ou 3,3 V, GND).'));
    }
    list.append(li);
  }
  parts.push(list);
  return sheet('Diagnostic de connexion', parts);
}
