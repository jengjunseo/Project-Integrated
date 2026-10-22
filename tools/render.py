"""Render supplied scans; raw output is private input, not reviewed answer text."""
import argparse
from pathlib import Path
import fitz

p=argparse.ArgumentParser()
p.add_argument('--pdf-dir',type=Path,required=True)
p.add_argument('--output-dir',type=Path,required=True)
p.add_argument('--width',type=int,default=2000)
args=p.parse_args()
args.output_dir.mkdir(parents=True,exist_ok=True)
for name,key in [('통합사회','social'),('통합과학','science')]:
    with fitz.open(args.pdf_dir/(name+'.pdf')) as doc:
        for number,page in enumerate(doc,1):
            target=args.output_dir/f'{key}-{number:03}.jpg'
            pix=page.get_pixmap(matrix=fitz.Matrix(args.width/page.rect.width,args.width/page.rect.width))
            pix.save(target,jpg_quality=88)
        print(key,len(doc),flush=True)
