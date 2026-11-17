#!/usr/bin/env python3
"""Rebuild row-0/column-0 alpha boxes (prototype PETMETA alpha cutoffs).
Run after copying approved sheets. Requires Pillow. Does not modify images.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent / 'assets' / 'pets'
meta = {}
digest = hashlib.sha256()
for sheet in sorted(root.glob('*.webp')):
    data = sheet.read_bytes()
    digest.update(sheet.name.encode())
    digest.update(data)
    with Image.open(sheet) as image:
        if image.size != (768, 1144):
            raise ValueError(f'{sheet.name}: expected 8x11 frames of 96x104')
        alpha = image.convert('RGBA').crop((0, 0, 96, 104)).getchannel('A')
        # The final hermit patch includes its soft shell edge in the approved bbox.
        threshold = 0 if sheet.stem == 'crab-hermit' else 16
        box = alpha.point(lambda value: 255 if value > threshold else 0).getbbox()
        if box is None:
            raise ValueError(f'{sheet.name}: empty idle frame')
        x, y, right, bottom = box
        meta[sheet.stem] = dict(x=x, y=y, w=right-x, h=bottom-y)
(root / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n')
(root / 'revision.json').write_text(json.dumps(digest.hexdigest()[:16])+'\n')
print(f'{len(meta)} sheets verified; alpha boxes and cache revision rebuilt')
