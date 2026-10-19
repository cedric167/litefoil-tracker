# Sources du manuel de la télécommande

- `../telecommande.pdf` : édition française d'origine (+ section 19, source `fr-section19.html`).
- `../telecommande-en.pdf`, `../telecommande-es.pdf` : éditions anglaise et espagnole, construites ici.

Chaque page est un fragment `en/pNN.html` / `es/pNN.html` (`<section class="page">`), mis en forme par
`kit/manual.css` ; les photos et icônes sont dans `crops/`. `kit/GLOSSARY.md` fixe la terminologie.

Reconstruire un PDF (Chromium via Playwright, polices Google Fonts) :

    python3 kit/wrap.py en manual-en en/p*.html   # -> build/manual-en.pdf + aperçus, signale les débordements
    python3 kit/wrap.py es manual-es es/p*.html

puis copier `build/manual-xx.pdf` vers `../telecommande-xx.pdf` et changer le `?v=` des liens dans `index.html`.
