"""Local PDF preparation. Run after installing tools/requirements.txt.

The curated file is private input; unreviewed OCR is never shipped as an answer.
python tools/ingest.py --pdf-dir ... --pages-dir ... --ocr-dir ... --curated ...
"""
import argparse,hashlib,json,importlib.util,shutil
from pathlib import Path
from PIL import Image,ImageDraw

parser=argparse.ArgumentParser();parser.add_argument('--pdf-dir',type=Path,required=True);parser.add_argument('--pages-dir',type=Path,required=True);parser.add_argument('--ocr-dir',type=Path,required=True);parser.add_argument('--curated',type=Path,default=Path('content/private/curated.py'));args=parser.parse_args()
spec=importlib.util.spec_from_file_location('curated',args.curated);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);records=module.records
root=Path('public/content');root.mkdir(parents=True,exist_ok=True)
private=Path('content/private');private.mkdir(parents=True,exist_ok=True)
version='v1.0.0';stamp='2026-10-22'
chapters=[]
defs=[('social','s',[(1,2,'통합적 관점','통합사회 1'),(3,6,'인간, 사회, 환경과 행복','통합사회 1'),(7,16,'자연환경과 인간','통합사회 1'),(17,25,'문화와 다양성','통합사회 1'),(26,32,'생활공간과 사회','통합사회 1'),(33,46,'인권 보장과 헌법','통합사회 2'),(47,57,'사회 정의와 불평등','통합사회 2'),(58,67,'시장경제와 지속가능발전','통합사회 2'),(68,73,'세계화와 평화','통합사회 2'),(74,81,'미래와 지속가능한 삶','통합사회 2')]),('science','c',[(1,4,'과학의 기본량과 측정','과학의 기초'),(5,8,'우주와 원소','물질과 규칙성'),(9,10,'원소의 주기성과 화학 결합','물질과 규칙성'),(11,12,'자연의 구성 물질','물질과 규칙성'),(13,14,'지구시스템','시스템과 상호작용'),(15,18,'역학 시스템','시스템과 상호작용'),(19,24,'생명 시스템','시스템과 상호작용'),(25,29,'지질 시대와 생물다양성','변화와 다양성'),(30,36,'화학 변화와 에너지 출입','변화와 다양성'),(37,42,'생태계와 지구 환경 변화','환경과 에너지'),(43,50,'에너지 자원과 활용','환경과 에너지'),(51,54,'과학의 유용성과 과학 윤리','과학과 미래 사회')])]
for subject,prefix,entries in defs:
 for i,(start,end,title,parent) in enumerate(entries,1):chapters.append(dict(id=f'{prefix}{i:02}',subject=subject,title=title,parent=parent,pages=list(range(start,end+1))))
concept={'social':{1,2,3,4,7,8,9,10,17,18,19,20,21,26,27,28,29,33,34,35,47,48,49,58,59,60,61,68,69,70,74,75,76},'science':{1,2,5,6,9,10,11,12,13,14,15,16,19,20,25,26,30,31,32,37,38,39,40,43,44,45,51,52}}
uncertain={('social',45),('social',79)}
reference={'social':{15,16,24,25,32,46,55,56,57,66,67,73,80,81},'science':set()}
pages=[];documents=[]
for subject,filename,count in [('social','통합사회.pdf',81),('science','통합과학.pdf',54)]:
 path=args.pdf_dir/filename
 documents.append(dict(id=subject,file=filename,sha256=hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),bytes=path.stat().st_size,pages=count,edition='2028학년도 EBS 수능 스타트 (본문 하단에서 확인)'))
 for p in range(1,count+1):
  id=f'{subject}-{p:03}';dest=root/'pages'/f'{id}.jpg';dest.parent.mkdir(exist_ok=True);thumb=root/'thumbs'/f'{id}.webp';thumb.parent.mkdir(exist_ok=True)
  im=Image.open(args.pages_dir/f'{id}.jpg');rotation=90 if subject=='social' and p>=74 else 0
  if rotation:im=im.rotate(-90,expand=True);im.save(dest,quality=91)
  else:shutil.copy2(args.pages_dir/f'{id}.jpg',dest)
  w,h=im.size;im.thumbnail((260,360));im.save(thumb,quality=78)
  ch=next(c for c in chapters if c['subject']==subject and p in c['pages'])
  reviewed=any(r['subject']==subject and r['page']==p for r in records)
  printed=next((r['printed'] for r in records if r['subject']==subject and r['page']==p and r.get('printed')),None)
  classification='uncertain' if (subject,p) in uncertain else 'concept' if p in concept[subject] else 'reference' if p in reference[subject] else 'exercise'
  status='중복 촬영 · 과학 39쪽 학습 원문 참조' if subject=='science' and p==40 else '판독 확인 대기 · 학습 제외' if classification=='uncertain' else '선택 구간 검수 · 나머지 대기' if reviewed else '원본 보존 · 문장 검수 대기' if classification=='concept' else '원본 열람 · 기본 출제 제외'
  pages.append(dict(id=id,documentId=subject,pdfPage=p,printedPage=printed,image=f'./content/pages/{id}.jpg',thumbnail=f'./content/thumbs/{id}.webp',width=w,height=h,chapterId=ch['id'],classification=classification,status=status,rotation=rotation,originalToDisplay=[0,1,-1,0,1,0] if rotation else [1,0,0,1,0,0]))
units=[];corrections=[]
for r in records:
 number=len([u for u in units if u['chapterId']==r['chapter']])+1;id=f"{r['chapter']}-u{number:03}";blockid=id+'-b1'
 block=dict(id=blockid,type=r['type'],text=r['text'])
 for key in ['headers','rows','nodes']:
  if key in r:block[key]=r[key]
 if r['type']=='image':
  page=next(p for p in pages if p['documentId']==r['subject'] and p['pdfPage']==r['page']);im=Image.open('public/'+page['image'][2:]);w,h=im.size;b=r['box'];crop=im.crop((int(w*b[0]),int(h*b[1]),int(w*b[2]),int(h*b[3])));dest=root/'regions'/f'{id}.png';dest.parent.mkdir(exist_ok=True);crop.save(dest);block.update(image=f'./content/regions/{id}.png',bbox=b,caption=r['title'])
 targets=[]
 for i,answer in enumerate(r['answers']):
  start=r['text'].find(answer)
  if start<0:raise ValueError((id,answer))
  # UTF-16 offsets remain separate from Python codepoint indexes.
  start16=len(r['text'][:start].encode('utf-16-le'))//2;end16=start16+len(answer.encode('utf-16-le'))//2
  t=dict(id=id+f'-t{i+1}',expectedText=answer,blockId=blockid,startUtf16=start16,endUtf16=end16)
  if r.get('masks'):t['box']=r['masks'][i]
  targets.append(t)
 family=id
 if '규산염 사면체' in r['title']:family='c04-silicate'
 if r['title'] in ['에너지 효율','에너지 효율의 식']:family='c11-efficiency'
 units.append(dict(id=id,revision=1,subject=r['subject'],chapterId=r['chapter'],family=family,title=r['title'],type=r['type'],page=r['page'],printedPage=r.get('printed'),sourceBox=r['box'],blocks=[block],targets=targets,status='verified',origin='pdf',verifiedAt=stamp))
 raw=json.loads((args.ocr_dir/f"{r['subject']}-{r['page']:03}.json").read_text(encoding='utf-8-sig'))
 corrections.append(dict(unitId=id,page=r['page'],sourceSubject=r['subject'],rawText=raw.get('text',''),verifiedText=r['text'],reason='렌더링한 원본과 직접 대조; 사진 줄바꿈은 문맥 단위로 연결, OCR 오독 교정. 수치·부호는 검수 원문 또는 원본 이미지로 보존.',sourceBox=r['box']))
# Only institutional sources explicitly reviewed by the developer can be added.
official=private/'official.json'
if official.exists():
 for r in json.loads(official.read_text(encoding='utf-8')):
  id=r['id'];blockid=id+'-b1';text=r['text'];targets=[]
  for i,answer in enumerate(r['answers']):
   start=text.index(answer);targets.append(dict(id=f'{id}-t{i+1}',expectedText=answer,blockId=blockid,startUtf16=len(text[:start].encode('utf-16-le'))//2,endUtf16=len(text[:start+len(answer)].encode('utf-16-le'))//2))
  block=dict(id=blockid,type=r.get('type','text'),text=text)
  if 'nodes'in r:block['nodes']=r['nodes']
  if 'rows'in r:block.update(headers=r['headers'],rows=r['rows'])
  units.append(dict(id=id,revision=1,subject=r['subject'],chapterId=r['chapterId'],family=id,title=r['title'],type=block['type'],page=0,printedPage=None,sourceBox=[0,0,1,1],blocks=[block],targets=targets,status='verified',origin='official',sourceUrl=r['url'],sourceLabel=r['label'],verifiedAt=stamp))
packs=[]
for ch in chapters:
 urls={url for p in pages if p['chapterId']==ch['id'] for url in [p['image'],p['thumbnail']]}
 us=[u for u in units if u['chapterId']==ch['id']]
 urls.update(b['image'] for u in us for b in u['blocks'] if b.get('image'))
 assets=[]
 for url in sorted(urls):
  p=Path('public')/url[2:];assets.append(dict(url=url,bytes=p.stat().st_size,sha256=hashlib.file_digest(p.open('rb'),'sha256').hexdigest()))
 packs.append(dict(id=ch['id'],version=version,title=ch['title'],chapterId=ch['id'],bytes=sum(a['bytes'] for a in assets),assets=assets,units=[u['id'] for u in us]))
catalog=dict(schemaVersion=1,version=version,documents=documents,chapters=chapters,pages=pages,units=units,packs=packs,audit=dict(verifiedUnits=len(units),pendingPages=sum('검수 대기'in p['status'] or p['classification']=='uncertain' for p in pages),notes=['135쪽 전체를 렌더링·분류했습니다. 학습 원문은 선택 구간 대조 검수이며 교재 본문 전체 전사 검수 완료를 뜻하지 않습니다.','심한 왜곡·부분 잘림과 중복 촬영이 있어 원본 전체의 완전성을 보장하지 않습니다.','PDF 원문과 공식 기관 보완 자료를 출처로 구분합니다. 실시간 AI는 호출하지 않습니다.']))
(root/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(private/'corrections.json').write_text(json.dumps(corrections,ensure_ascii=False,indent=2),encoding='utf-8')
(private/'source-manifest.json').write_text(json.dumps(dict(documents=documents,pages=pages),ensure_ascii=False,indent=2),encoding='utf-8')
for size in [192,512]:
 im=Image.new('RGB',(size,size),'#173f36');d=ImageDraw.Draw(im);d.rounded_rectangle((size*.22,size*.2,size*.78,size*.8),radius=size*.025,fill='#f5f2e9');
 for y in [.35,.5,.65]:d.line((size*.32,size*y,size*.68,size*y),fill='#173f36',width=int(size*.04))
 d.rounded_rectangle((size*.45,size*.45,size*.72,size*.56),radius=size*.02,fill='#b8d4ad');im.save(f'public/icon-{size}.png')
report=['# 원문 자료 감사',f'\n검수일 {stamp}. 원본 PDF 두 개·135쪽, 전체 렌더링 및 OCR 완료.','\n## 원본']
for d in documents:report.append(f"- {d['file']}: {d['pages']}쪽, {d['bytes']:,} bytes, SHA-256 `{d['sha256']}`. 텍스트 레이어 없음. 판본은 본문 하단 2028학년도 EBS 수능 스타트로 확인; 표지 미제공.")
report+=['\n## 검수 범위',f"검수 학습 원문 {len(units)}개 / 가림 {sum(len(u['targets']) for u in units)}개. PDF {sum(u['origin']=='pdf' for u in units)}개, 공식 보완 {sum(u['origin']=='official' for u in units)}개. 페이지 전체 본문 검수는 완료하지 않았고 선택 구간만 확인했다. 사진 기반 자료의 누락된 문장을 추측하지 않았다.",'\n|과목|PDF 쪽|분류|학습 원문 수|상태|','|---|---:|---|---:|---|']
for p in pages:report.append(f"|{p['documentId']}|{p['pdfPage']}|{p['classification']}|{sum(u['origin']=='pdf' and u['subject']==p['documentId'] and u['page']==p['pdfPage'] for u in units)}|{p['status']}|")
report+=['\n## 판독·좌표 이력','- 사회 PDF 74~81쪽은 시계 방향 90° 회전하여 읽기 방향을 복원했다. 좌표는 회전 후 왼쪽 위 원점의 정규화 좌표이다. 원래 변환을 manifest에 기록했다.','- 사회 45, 79쪽: 심한 원근 왜곡/판독 불확실성으로 학습 제외, 원본은 열람 가능.','- 과학 27~28, 39~40, 48~49 및 사회 37~39, 43~44, 51~52 등 중복/부분 촬영 후보는 원본 페이지를 보존하고 중복 학습 단위를 만들지 않았다.','- 원본 파일, OCR 추출, 검수 원문, 표시 데이터 계층을 분리한다. private/corrections.json에 OCR 원문과 교정 후 원문·이유·좌표를 기록한다.','- 수식은 Unicode 표기와 원본 이미지로 보존한다. 복잡한 그래프 수치를 새로 추정하지 않았다.']
Path('docs/CONTENT_AUDIT.md').write_text('\n'.join(report),encoding='utf-8')
print(json.dumps(dict(pages=len(pages),units=len(units),targets=sum(len(u['targets']) for u in units),packs=len(packs),bytes=sum(p['bytes'] for p in packs))))
