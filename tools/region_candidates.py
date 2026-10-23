"""Create private image-occlusion candidates and visual proofs; NEVER approves candidates."""
import json,re,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

c=json.loads(Path('public/content/catalog.json').read_text(encoding='utf-8'))
extra={
 'social':{1:['역사적','도덕적'],2:['복잡성','세분화'],3:['해탈','이성'],4:['정주','도덕적'],5:['이성','고통'],6:['욕구','이성적'],7:['고상','수목'],8:['생태','안전'],13:['기온','강수량'],15:['서울','쿠마시'],16:['서울','기후'],17:['공통','문화권'],20:['상대주의','보편'],21:['소수자','공존'],22:['이슬람교','모스크'],23:['혼일강리역대국도지도','문화'],25:['직접','간접'],30:['도시화','산업화'],31:['농림어업','서비스업'],33:['보편성','천부성'],34:['법치주의','권력'],37:['선거권','재산'],38:['선거권','재산'],39:['선거권','재산'],40:['불경제','무임승차'],42:['휴게','시간'],43:['근로','임금'],46:['사회권','권리'],51:['소유','분배'],52:['소유','분배'],55:['최소','소유'],56:['능력','경제적'],57:['소득','인구'],64:['수익성','안전성'],66:['뉴딜','대공황'],67:['절약','소비'],73:['폭력','평화'],81:['외국인','중국']},
 'science':{3:['길이','기본량'],4:['헬륨','시간'],8:['방전관','분광기'],17:['연직','수평'],18:['질량','속력'],21:['효소','산소'],28:['항생제','자연선택'],34:['포도당','산화'],36:['이온','부피'],41:['이산화','온도'],46:['전류','자석'],47:['코일','자석'],48:['에너지','열에너지'],49:['에너지','열에너지']}}
font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',25)
extra['science'].update({14:['발산','수렴'],15:['중력','질량'],16:['관성','충격량'],19:['효소','활성화'],20:['삼투','농도'],23:['염기','아미노산'],24:['상보적','펩타이드'],25:['화석','유해'],26:['유전적','다양성'],27:['돌연변이','내성'],29:['자연선택','유전적'],37:['생물','개체'],38:['평형','먹이'],39:['엘니뇨','무역풍'],42:['온실','대기'],43:['핵융합','헬륨'],45:['에너지','보존'],50:['에너지','효율'],51:['빅데이터','자료'],52:['인공','센서'],53:['습도','이슬점']})
extra['social'].update({11:['대지','구성원'],12:['전체론','다양성'],18:['힌두교','불교'],19:['문화','발명'],35:['소수자','차별'],47:['정의','분배'],48:['최소','무지'],49:['불평등','계층'],53:['공공','필요'],54:['사회','보험'],60:['이자','채권'],61:['생산비','무역'],62:['뉴딜','대공황'],63:['스미스','케인스'],69:['직접적','구조적'],70:['칸트','국제'],71:['폭력','평화'],74:['노령화','인구'],75:['자원','기술'],76:['지속','미래'],77:['탄소','인공'],78:['인구','부양'],80:['동화','다문화']})
small=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',20)
out=Path('../expansion-review/regions');out.mkdir(parents=True,exist_ok=True)
records=[];proofs=[];missing=[]
for page in c['pages']:
 s,p=page['documentId'],page['pdfPage']
 if page['classification']=='uncertain' or (s=='social' and p in [38,39,45,79]) or (s=='science' and p in [28,40,49]):continue
 op=Path('../ocr-upright')/(page['id']+'.json') if s=='social' and p>=74 else Path('../ocr')/(page['id']+'.json')
 d=json.loads(op.read_text(encoding='utf-8-sig'));w,h=d['width'],d['height']
 words=[word for line in d['lines'] for word in line['words']]
 answers=[]
 for u in c['units']:
  if u['subject']==s and u['page']==p:
   for t in u['targets']:
    answers.extend(re.findall(r'[가-힣]{2,12}',t['expectedText']))
 answers=extra.get(s,{}).get(p,[])+answers
 # Each expected answer is from reviewed text or the explicit manual list above.
 selected=[]
 for answer in dict.fromkeys(answers):
  if len(answer)<2 or answer in ['이러한','수있는','있다','한다','같은','것이다']:continue
  matches=[v for v in words if answer in v['text'] and .005<v['y']/h<.96]
  if not matches:continue
  boxes=[]
  for v in matches:
   n=len(v['text']);at=v['text'].index(answer);left=v['x']+v['width']*at/n;right=left+v['width']*len(answer)/n
   # WinRT bounds are in the deskewed coordinate system. Map all four corners
   # back around the original bitmap centre before forming an enclosing mask.
   angle=math.radians(d.get('angle') or 0);co,si=math.cos(angle),math.sin(angle)
   corners=[(left-8,v['y']-8),(right+8,v['y']-8),(right+8,v['y']+v['height']+8),(left-8,v['y']+v['height']+8)]
   points=[(w/2+co*(x-w/2)-si*(y-h/2),h/2+si*(x-w/2)+co*(y-h/2)) for x,y in corners]
   boxes.append([max(0,min(x for x,y in points)/w),max(0,min(y for x,y in points)/h),min(1,max(x for x,y in points)/w),min(1,max(y for x,y in points)/h)])
  selected.append((answer,boxes))
  if len(selected)==2:break
 if not selected:missing.append(page['id']);continue
 title=('본문 원문 전체' if page['classification']=='concept' else '문항·해설 원문 전체' if page['classification']=='exercise' else '핵심 자료 원문 전체')+f' · PDF {p}쪽'
 records.append(dict(id=f"{page['chapterId']}-page{p:03}",subject=s,page=p,chapter=page['chapterId'],title=title,text='\n'.join(v[0] for v in selected),answers=[v[0] for v in selected],box=[0,0,1,1],type='image',usePageImage=True,maskGroups=[v[1] for v in selected],sourceRole='exam-source' if page['classification']=='exercise' else 'source-page',family=f"{page['chapterId']}-page{p:03}",reviewed=False))
 im=Image.open('public/'+page['image'][2:]);iw,ih=im.size
 card=Image.new('RGB',(960,300),'#fffefa');draw=ImageDraw.Draw(card);draw.text((14,8),page['id']+' · '+page['classification'],font=font,fill='#173f36')
 for i,(answer,boxes) in enumerate(selected):
  b=boxes[0];x0,y0,x1,y1=b;rect=(max(0,int(x0*iw)-55),max(0,int(y0*ih)-50),min(iw,int(x1*iw)+55),min(ih,int(y1*ih)+50))
  crop=im.crop(rect);ratio=min(420/crop.width,175/crop.height,2);crop=crop.resize((int(crop.width*ratio),int(crop.height*ratio)))
  card.paste(crop,(15+i*475,88));draw.text((15+i*475,47),answer+f' / {len(boxes)}곳',font=font,fill='#202c29')
  # Bounding box position is drawn on the pixel excerpt for visual verification.
  pen=ImageDraw.Draw(card);pen.rectangle((15+i*475+(x0*iw-rect[0])*ratio,88+(y0*ih-rect[1])*ratio,15+i*475+(x1*iw-rect[0])*ratio,88+(y1*ih-rect[1])*ratio),outline='#d22b2b',width=2)
 proofs.append(card)
for index in range(0,len(proofs),10):
 sheet=Image.new('RGB',(1920,1500),'#dedfd5')
 for n,card in enumerate(proofs[index:index+10]):sheet.paste(card,((n%2)*960,(n//2)*300))
 sheet.save(out/f'proof-{index//10+1:02}.jpg',quality=94)
Path('content/private/region-candidates.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(candidates=len(records),missing=missing,sheets=math.ceil(len(proofs)/10))))
