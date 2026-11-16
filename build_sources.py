"""Rebuild the local, source-only library from the 17 supplied PDFs."""
import pathlib, json, re, io
import pymupdf
from PIL import Image

APP = pathlib.Path(__file__).parent
ROOT = APP.parent
(APP/'assets/pages').mkdir(parents=True, exist_ok=True)
(APP/'assets/questions').mkdir(parents=True, exist_ok=True)
docs=[]
questions=[]
dates=['Nov 2024 · Regular','Dec 2024 · Makeup','May 2025 · Regular','Jun 2025 · Makeup','Nov 2025 · Regular','Dec 2025 · Makeup','May 2026 · Regular','Jun 2026 · Makeup']
def render(page, path, clip=None, width=1350):
    rect=clip or page.rect
    pix=page.get_pixmap(matrix=pymupdf.Matrix(width/rect.width,width/rect.width),clip=clip,alpha=False)
    Image.frombytes('RGB',[pix.width,pix.height],pix.samples).save(path,'WEBP',quality=84)

for p in sorted(ROOT.rglob('*.pdf')):
    if APP in p.parents: continue
    rel=p.relative_to(ROOT)
    ident=('sdl'+p.name[0]) if rel.parts[0]=='SDL' else ('pyq'+p.name[0]) if rel.parts[0]=='pyq' else p.name[:2]
    pdf=pymupdf.open(p)
    pages=[]
    current=None
    for i,page in enumerate(pdf):
        image=f'assets/pages/{ident}-{i+1}.webp'
        if not (APP/image).exists(): render(page,APP/image)
        pages.append({'n':i+1,'text':page.get_text(),'image':image})
        if not ident.startswith('pyq'): continue
        blocks=page.get_text('blocks')
        labels=sorted([(b[1],re.match(r'^([1-5][ABC])\)',b[4].strip()).group(1)) for b in blocks if re.match(r'^[1-5][ABC]\)\s*$',b[4].strip())],key=lambda b:b[0])
        if not labels: continue
        bands=[]
        if i>0 and current and labels[0][0]>55: bands.append((30,labels[0][0]-2,current))
        for j,(y,label) in enumerate(labels):
            current={'id':ident+'-'+label,'paper':ident,'date':dates[int(ident[-1])-1],'label':label,'marks':4 if label in ['1A','2A','3C','4C','5C'] else 3,'text':'','images':[],'pages':[]}
            questions.append(current)
            end=labels[j+1][0]-2 if j+1<len(labels) else page.rect.height-30
            # Stop the final question before the appendix containing CO statistics.
            ends=[b[1] for b in blocks if '-----End-----' in b[4] and b[1]>y]
            if ends: end=min(end,min(ends))
            bands.append((y-2,end,current))
        for start,end,q in bands:
            selected=[]
            for b in sorted(blocks,key=lambda b:(round(b[1]/3),b[0])):
                t=b[4].strip()
                if b[1]>=start and b[1]<end and b[0]>52 and not re.match(r'^\([34]\)$',t) and not t.startswith(('Course Outcome:','Page ')):
                    selected.append(t)
            q['text']+='\n'+'\n'.join(selected)
            img=f"assets/questions/{q['id']}-{i+1}.webp"
            render(page,APP/img,pymupdf.Rect(30,start,page.rect.width-28,end),width=1350)
            q['images'].append(img); q['pages'].append(i+1)
    docs.append({'id':ident,'file':str(rel).replace('\\','/'),'pages':pages})
    print(ident,len(pdf),flush=True)
for q in questions: q['text']=q['text'].strip()
(APP/'data/sources.json').write_text(json.dumps(docs,ensure_ascii=False),encoding='utf8')
(APP/'data/questions.json').write_text(json.dumps(questions,ensure_ascii=False),encoding='utf8')
print('TOTAL',sum(len(d['pages']) for d in docs),'pages;',len(questions),'questions')
