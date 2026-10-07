"""Preserve the site's typefaces, keeping Latin, Cyrillic and all used symbols.

One-time build dependencies: pip install --target .performance/python fonttools brotli
Font sources: node scripts/prepare-fonts.cjs
The browser needs only the generated WOFF2 files, not these build tools.
"""
from pathlib import Path
import sys
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'.performance/python'))
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib.instancer import instantiateVariableFont

unicodes=set(range(0x100)) | set(range(0x400,0x460)) | set(range(0x2000,0x2070)) | {0x20bd,0x2116,0x2190,0x2191,0x2192,0x2193}
for source in ['index.html','styles.css','site.js']:
    unicodes.update(ord(char) for char in (root/source).read_text(encoding='utf-8'))
for name,output,weight in [('GolosText','golos', (400,700)),('PlayfairDisplay','playfair',600)]:
    font=TTFont(root/'.performance'/f'{name}.ttf')
    font=instantiateVariableFont(font,{'wght':weight},inplace=True)
    if 'gvar' in font:
        for glyph in font.getGlyphOrder():
            if glyph not in font['gvar'].variations:
                font['gvar'].variations[glyph]=[]
    options=subset.Options()
    options.layout_features=['*']
    options.name_IDs=['*']
    subsetter=subset.Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.flavor='woff2'
    target=root/'fonts'/f'{output}.woff2'
    font.save(target)
    print(output,target.stat().st_size)
