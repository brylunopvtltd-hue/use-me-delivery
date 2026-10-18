import csv, io, json, os, urllib.request
from pathlib import Path
from datetime import datetime, timezone

URL='https://raw.githubusercontent.com/luminati-io/Amazon-dataset-samples/main/amazon-products.csv'
req=urllib.request.Request(URL, headers={'User-Agent':'USEME-Catalogue-Import/1.0 (GitHub public dataset sample)'})
with urllib.request.urlopen(req,timeout=45) as response:
 data=response.read(9_000_000)
 print('Source HTTP',response.status,'bytes',len(data))
text=data.decode('utf-8-sig','replace')
csv.field_size_limit(10_000_000)
reader=csv.DictReader(io.StringIO(text))
print('HEADERS',reader.fieldnames)
products=[]
codes=set()
for record in reader:
 title=(record.get('title') or record.get('product_title') or '').strip()
 code=(record.get('asin') or record.get('id') or '').strip()
 image=(record.get('image_url') or record.get('images') or '').strip()
 url=(record.get('url') or record.get('product_url') or '').strip()
 brand=(record.get('brand') or '').strip()
 if image.startswith('['):
  try: image=json.loads(image)[0]
  except Exception: pass
 if not title or len(title)<3 or not code or code in codes or not url.startswith('https://'):continue
 if not image.startswith('https://'):image=''
 codes.add(code)
 products.append({'code':code,'product_name':title[:150],'brands':brand[:90],'quantity':'','category':(record.get('categories') or 'External marketplace')[:130],'image_url':image,'source_url':url,'origin':'Amazon dataset sample — Bright Data'})
 if len(products)>=1000:break
print('COLLECTED',len(products),'WITH IMAGES',sum(bool(p['image_url']) for p in products))
if len(products)!=1000:raise RuntimeError(f'Only {len(products)} valid records, 1000 requested')
out={'schema_version':1,'source':'Bright Data public Amazon dataset sample','source_url':'https://github.com/luminati-io/Amazon-dataset-samples','date_captured':datetime.now(timezone.utc).isoformat(),'product_count':1000,'price_status':'Not confirmed for Sri Lanka','availability_status':'Unknown','products':products}
Path('phase1-scale/data').mkdir(parents=True,exist_ok=True)
Path('phase1-scale/data/real-1000-products.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('Saved source-attributed 1000 genuine eCommerce reference records')
