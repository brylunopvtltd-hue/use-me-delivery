import fs from 'node:fs/promises';
import path from 'node:path';
const MAX=1000, LIMIT=500, MAX_PAGE=8;
const items=new Map();
let pages=0,scanned=0;
for(let page=1;page<=MAX_PAGE&&items.size<MAX;page++){
 const url=new URL('https://world.openfoodfacts.org/api/v2/search');
 const fields=['code','product_name','product_name_en','brands','quantity','image_front_small_url','image_front_url','categories','main_category_en'];
 for(const [k,v] of Object.entries({page:String(page),page_size:String(LIMIT),sort_by:'scans_n',fields:fields.join(',')}))url.searchParams.set(k,v);
 let products=null;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await fetch(url.toString(),{headers:{'Accept':'application/json','User-Agent':'USEME-Product-Reference/1.0 (https://github.com/brylunopvtltd-hue/use-me-delivery)'} ,signal:AbortSignal.timeout(35000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const json=await response.json();
   if(!Array.isArray(json.products))throw Error('Unexpected API format');
   products=json.products;
   break;
  }catch(e){console.warn('page',page,'attempt',attempt,e.message);if(attempt===3)throw e;await new Promise(r=>setTimeout(r,attempt*3500))}
 }
 pages++;scanned+=products.length;
 for(const p of products){
  const code=String(p.code||'').replace(/[^0-9]/g,'');
  const name=String(p.product_name||p.product_name_en||'').trim().slice(0,140);
  const image=String(p.image_front_small_url||p.image_front_url||'');
  if(!/^[0-9]{8,18}$/.test(code)||name.length<3||!image.startsWith('https://images.openfoodfacts.org/')||items.has(code))continue;
  items.set(code,{code,product_name:name,brands:String(p.brands||'').slice(0,90),quantity:String(p.quantity||'').slice(0,60),category:String(p.main_category_en||p.categories||'').slice(0,100),image_url:image,source_url:'https://world.openfoodfacts.org/product/'+code});
  if(items.size===MAX)break;
 }
 console.log('page',page,'received',products.length,'total validated',items.size);
}
if(items.size!==MAX)throw Error('Need exactly 1000 validated product records, have '+items.size);
const obj={
 schema_version:1,
 source:'Open Food Facts',
 source_url:'https://world.openfoodfacts.org/',
 data_license:'ODbL',
 image_license:'CC BY-SA',
 captured_at:new Date().toISOString(),
 product_count:items.size,
 pages_requested:pages,
 records_scanned:scanned,
 products:[...items.values()]
};
const out='phase1-scale/data/openfoodfacts-1000.json';
await fs.mkdir(path.dirname(out),{recursive:true});
await fs.writeFile(out,JSON.stringify(obj));
console.log('SUCCESS wrote',items.size,'real source-linked products to',out);
