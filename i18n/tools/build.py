#!/usr/bin/env python3
"""Génère i18n/en.json et i18n/es.json à partir de i18n/strings.json ({ "français": {"en": …, "es": …} }).

Pour corriger une traduction : modifier strings.json puis lancer  python3 i18n/tools/build.py
"""
import json
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = json.load(open(os.path.join(HERE, 'strings.json'), encoding='utf-8'))
for lang in ('en', 'es'):
    out = {fr: tr[lang] for fr, tr in sorted(src.items()) if tr.get(lang) and tr[lang] != fr}
    with open(os.path.join(HERE, lang + '.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(lang, len(out), 'entrées')
