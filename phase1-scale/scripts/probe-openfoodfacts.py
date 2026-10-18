import urllib.request,tarfile,tempfile,os,json,csv,io
url='https://static.openfoodfacts.org/exports/ingredients-lc-fr-country-fr-last-edit-date-2019-08-1k.tar.gz'
try:
 req=urllib.request.Request(url,headers={'User-Agent':'USEME-Catalogue-Data/1.0 (https://github.com/brylunopvtltd-hue/use-me-delivery)'})
 with urllib.request.urlopen(req,timeout=45) as r:
  print('response',r.status,r.getheader('Content-Type'),r.getheader('Content-Length'))
  b=r.read(45*1024*1024)
  print('download bytes',len(b))
 with tarfile.open(fileobj=io.BytesIO(b),mode='r:gz') as archive:
  names=archive.getnames()
  print('members',len(names),names[:20])
  for member in archive.getmembers():
   if member.isfile() and (member.name.endswith('.csv') or member.name.endswith('.tsv')):
    f=archive.extractfile(member)
    if f:
     sample=f.read(12000).decode('utf-8','replace')
     print('CSV sample',member.name,repr(sample[:3000]))
except Exception as ex:
 print('PROBE FAILED',type(ex).__name__,str(ex)[:600])
