#!/usr/bin/env python3
"""Convertit les XML de paramètres de VESC Tool (res/config/<fw>/) en JSON compacts.

Usage : python3 convert_config.py <chemin/vers/vesc_tool/res/config> <dossier/sortie>
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "head"):
            self.skip = True
        elif tag == "br":
            self.out.append("\n")
        elif tag == "li":
            self.out.append("\n• ")

    def handle_endtag(self, tag):
        if tag in ("style", "head"):
            self.skip = False
        elif tag in ("p", "li", "tr", "h1", "h2", "h3"):
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def html_to_text(html):
    if not html or html == "TODO":
        return ""
    p = _Text()
    p.feed(html)
    txt = "".join(p.out)
    txt = re.sub(r"[ \t]+", " ", txt)
    txt = re.sub(r"\n\s*\n\s*\n+", "\n\n", txt)
    return txt.strip()


def qint(v):
    # Comme QString::toInt() : 0 si la chaîne n'est pas un entier valide.
    try:
        return int(v.strip())
    except ValueError:
        return 0


def qfloat(v):
    try:
        return float(v.strip())
    except ValueError:
        return 0.0


def crc32c(data):
    crc = 0xFFFFFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ (0x82F63B78 & -(crc & 1))
    return (~crc) & 0xFFFFFFFF


def convert(path):
    root = ET.parse(path).getroot()
    params = {}
    for p in root.find("Params"):
        d = {"t": 0, "tx": 0}
        enums = []
        for c in p:
            v = c.text or ""
            tag = c.tag
            if tag == "longName":
                d["n"] = v
            elif tag == "type":
                d["t"] = qint(v)
            elif tag == "vTx":
                d["tx"] = qint(v)
            elif tag == "vTxDoubleScale":
                d["sc"] = qfloat(v)
            elif tag == "transmittable":
                d["tr"] = qint(v)
            elif tag == "description":
                txt = html_to_text(v)
                if txt:
                    d["d"] = txt
            elif tag == "enumNames":
                enums.append(v)
            elif tag in ("minDouble", "maxDouble", "stepDouble", "editorScale", "valDouble"):
                d[{"minDouble": "min", "maxDouble": "max", "stepDouble": "step",
                   "editorScale": "es", "valDouble": "v"}[tag]] = qfloat(v)
            elif tag in ("minInt", "maxInt", "stepInt", "valInt", "editorDecimalsDouble", "maxLen"):
                d[{"minInt": "min", "maxInt": "max", "stepInt": "step", "valInt": "v",
                   "editorDecimalsDouble": "dec", "maxLen": "ml"}[tag]] = qint(v)
            elif tag == "valString":
                d["v"] = v
            elif tag == "suffix":
                if v:
                    d["u"] = v
            elif tag == "editAsPercentage":
                if qint(v):
                    d["pct"] = 1
            elif tag == "showDisplay":
                pass
        if enums:
            d["e"] = enums
        params[p.tag] = d

    ser = [s.text for s in root.find("SerOrder")] if root.find("SerOrder") is not None else []

    groups = []
    g = root.find("Grouping")
    if g is not None:
        for group in g.findall("group"):
            subs = []
            for sub in group.findall("subgroup"):
                names = [x.text for x in sub.find("subgroupParams").findall("param")]
                subs.append([sub.findtext("subgroupName"), names])
            groups.append([group.findtext("groupName"), subs])

    sig = ""
    for s in ser:
        sig += s
        p = params.get(s)
        if p:
            sig += str(p["t"]) + str(p["tx"]) + "".join(p.get("e", []))
    signature = crc32c(sig.encode("utf-8"))

    # Les paramètres non sérialisés et absents des groupes (aides, etc.) sont inutiles ici.
    used = set(ser)
    for _, subs in groups:
        for _, names in subs:
            used.update(n for n in names if not n.startswith("::sep::"))
    params = {k: v for k, v in params.items() if k in used}

    return {"signature": signature, "params": params, "ser": ser, "groups": groups}


def main():
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    index = []
    for ver in sorted(os.listdir(src)):
        d = os.path.join(src, ver)
        mc = os.path.join(d, "parameters_mcconf.xml")
        if not os.path.isfile(mc):
            continue
        entry = {"folder": ver}
        info = os.path.join(d, "info.xml")
        if os.path.isfile(info):
            fw = ET.parse(info).getroot().find("Params/fw_version")
            entry["fw"] = [e.text for e in fw.findall("enumNames")] if fw is not None else [ver]
        for name in ("mcconf", "appconf"):
            f = os.path.join(d, "parameters_%s.xml" % name)
            if not os.path.isfile(f):
                continue
            data = convert(f)
            entry[name] = data["signature"]
            with open(os.path.join(dst, "%s_%s.json" % (ver, name)), "w") as out:
                json.dump(data, out, separators=(",", ":"), ensure_ascii=False)
        index.append(entry)
    with open(os.path.join(dst, "index.json"), "w") as out:
        json.dump(index, out, indent=1)


if __name__ == "__main__":
    main()
