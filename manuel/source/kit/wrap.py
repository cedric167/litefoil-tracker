# usage: python3 wrap.py LANG OUTNAME fragment.html [fragment.html ...]
# Wraps page fragments (<section class="page">...) into a full HTML document in build/OUTNAME.html,
# renders build/OUTNAME.pdf and build/OUTNAME-N.png previews (80 dpi), and prints overflow warnings.
import sys, subprocess, os, glob
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lang, name, frags = sys.argv[1], sys.argv[2], sys.argv[3:]
os.makedirs(f'{S}/build', exist_ok=True)
body = '\n'.join(open(f).read() for f in frags)
html = f'''<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><base href="file://{S}/">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&family=Nunito:wght@600;700;800;900&display=swap">
<link rel="stylesheet" href="kit/manual.css"></head><body>
{body}
</body></html>'''
out = f'{S}/build/{name}.html'
open(out, 'w').write(html)
subprocess.run(['node', f'{S}/kit/render.mjs', out, f'{S}/build/{name}.pdf'], check=True)
for f in glob.glob(f'{S}/build/{name}-*.png'): os.remove(f)
subprocess.run(['pdftoppm', '-r', '80', '-png', f'{S}/build/{name}.pdf', f'{S}/build/{name}'], check=True)
print('previews:', sorted(glob.glob(f'{S}/build/{name}-*.png')))
