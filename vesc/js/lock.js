// Code d'accès de l'Atelier VESC. Seule l'empreinte SHA-256 du code est dans la page.
// C'est une protection contre les changements par erreur, pas une sécurité forte :
// le code de la page reste lisible par qui le cherche.
(function () {
  'use strict';
  var HASH = '6273c8e2ab7dd05b30f60fc98e32a35e8f660eb19e3b949c8aeac4b225e5816d';
  var KEY = 'lf-vesc-unlocked';
  var screen = document.getElementById('lockScreen');
  var input = document.getElementById('lockCode');
  var err = document.getElementById('lockErr');

  function unlocked() {
    try { return sessionStorage.getItem(KEY) === HASH; } catch (e) { return false; }
  }

  function open() {
    screen.hidden = true;
    document.body.classList.remove('locked');
  }

  async function digest(code) {
    var bytes = new TextEncoder().encode('lite-foil-vesc:' + code);
    var buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  var tries = 0;
  async function check() {
    var h = await digest(input.value.trim());
    if (h === HASH) {
      try { sessionStorage.setItem(KEY, HASH); } catch (e) { /* stockage bloqué */ }
      open();
      return;
    }
    tries++;
    err.hidden = false;
    input.value = '';
    screen.querySelector('.lock-box').classList.remove('shake');
    void screen.offsetWidth;
    screen.querySelector('.lock-box').classList.add('shake');
    try { navigator.vibrate && navigator.vibrate([60, 40, 60]); } catch (e) { /* non pris en charge */ }
    // Après 5 essais ratés, on fait patienter un peu plus à chaque fois.
    if (tries >= 5) {
      var btn = document.getElementById('lockBtn');
      btn.disabled = true;
      setTimeout(function () { btn.disabled = false; }, 2000 * (tries - 4));
    }
  }

  if (unlocked()) { open(); return; }
  document.body.classList.add('locked');
  document.getElementById('lockBtn').onclick = check;
  input.onkeydown = function (e) { if (e.key === 'Enter') check(); };
  setTimeout(function () { input.focus(); }, 300);
})();
