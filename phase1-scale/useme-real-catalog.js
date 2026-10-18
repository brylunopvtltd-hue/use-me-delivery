(()=>{'use strict';
const TARGET=1000,MAX_PAGE=8,PAGE_SIZE=40;
const $=x=>document.getElementById(x);
const coll=new Map();let rows=[],filtered=[],displayed=0,images=0,getting=false;
const safe=(v,max=150)=>String(v??'').trim().slice(0,max);
function image(url){return typeof url==='string'&&/^https:\/\/images\.openfoodfacts\.org\//.test(url)?url:null}
function update(){ $('count').textContent=rows.length+' / '+TARGET;$('visible').textContent=filtered.length;$('images').textContent=images }
function view(p){
 const item=document.createElement('article');item.className='card';
 const cover=document.createElement('div');cover.className='visual';
 if(p.image){const img=document.createElement('img');img.src=p.image;img.alt='Photo: '+p.name;img.loading='lazy';img.decoding='async';
 img.addEventListener('load',()=>{images++;update()});img.addEventListener('error',()=>{img.remove();cover.textContent='Image unavailable'});cover.append(img)}
 else cover.textContent='No image';
 const content=document.createElement('div');content.className='details';
 const brand=document.createElement('div');brand.className='brand';brand.textContent=p.brand||'Brand not listed';
 const name=document.createElement('h3');name.textContent=p.name;
 const meta=document.createElement('div');meta.className='meta';meta.textContent=(p.quantity||'Quantity not listed')+' · Barcode '+p.barcode;
 const stock=document.createElement('span');stock.className='not-sale';stock.textContent='விலை / Stock உறுதிசெய்யப்படவில்லை';
 const src=document.createElement('a');src.className='source';src.href='https://world.openfoodfacts.org/product/'+encodeURIComponent(p.barcode);src.rel='noopener noreferrer';src.target='_blank';src.textContent='View original product ↗';
 content.append(brand,name,meta,stock,src);item.append(cover,content);return item
}
function renderMore(){const frag=document.createDocumentFragment();filtered.slice(displayed,displayed+PAGE_SIZE).forEach(p=>frag.append(view(p)));
 $('products').append(frag);displayed=Math.min(displayed+PAGE_SIZE,filtered.length);$('more').hidden=displayed>=filtered.length;
 $('status').textContent='Showing '+displayed+' / '+filtered.length+' matching products · '+rows.length+' real source records loaded';}
function filter(){
 const term=safe($('search').value,100).toLocaleLowerCase();
 filtered=rows.filter(p=>!term||[p.name,p.brand,p.barcode,p.category].some(t=>t.toLocaleLowerCase().includes(term)));
 const sort=$('sort').value;
 if(sort==='name')filtered.sort((a,b)=>a.name.localeCompare(b.name));else if(sort==='brand')filtered.sort((a,b)=>a.brand.localeCompare(b.brand));
 displayed=0;$('products').replaceChildren();update();renderMore();
}
async function getRemote(){
 $('status').textContent='Connecting to open product database...';$('error').hidden=true;getting=true;$('refresh').disabled=true;
 coll.clear();rows=[];filtered=[];displayed=0;images=0;$('products').replaceChildren();update();
 let failures=0;
 for(let page=1;page<=MAX_PAGE&&coll.size<TARGET;page++){
  try{
   const response=await fetch('/api/real-products?page='+page,{cache:'default'});
   if(!response.ok)throw Error('Product service HTTP '+response.status);
   const info=await response.json();const data=Array.isArray(info.products)?info.products:[];
   if(!data.length){failures++;if(failures>=2)break;continue}
   for(const p of data){
    const barcode=safe(p.code,24).replace(/[^0-9]/g,'');
    const name=safe(p.product_name||p.product_name_en,140);
    const img=image(p.image_front_small_url)||image(p.image_front_url);
    if(!barcode||!name||!img||coll.has(barcode))continue;
    coll.set(barcode,{barcode,name,brand:safe(p.brands,100),quantity:safe(p.quantity,80),category:safe(p.main_category_en||p.categories,100),image:img});
    if(coll.size>=TARGET)break;
   }
   rows=[...coll.values()];$('status').textContent='Loaded '+rows.length+' of '+TARGET+' verifiable products...';update();
  }catch(err){failures++;if(failures>=2){$('error').hidden=false;$('error').textContent='Source temporarily unavailable: '+String(err.message||err);break}}
 }
 rows=[...coll.values()];getting=false;$('refresh').disabled=false;filter();
 if(rows.length===0){$('error').hidden=false;$('error').textContent='Product feed could not be retrieved. Please retry. This page will not invent product data.'}
 else if(rows.length<TARGET){$('status').textContent='Loaded '+rows.length+' actual products. The source supplied fewer usable image-and-name records than the 1000 target.'}
}
document.addEventListener('DOMContentLoaded',()=>{$('more').addEventListener('click',renderMore);$('refresh').addEventListener('click',()=>{if(!getting)getRemote()});$('sort').addEventListener('change',filter);$('searchform').addEventListener('submit',e=>{e.preventDefault();filter()});getRemote()});
})();