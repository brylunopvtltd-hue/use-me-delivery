(()=>{
'use strict';
const API='https://woytuayeuyfvucttvosw.supabase.co/rest/v1/useme_reference_products';
const KEY='sb_publishable_NG-tEBNafW-8tZwOvW2njA_WYzXCq8C';
const TARGET=1000,PAGE_SIZE=40;
const $=id=>document.getElementById(id);
const safe=(v,max=170)=>String(v??'').trim().slice(0,max);
let rows=[],filtered=[],displayed=0,loadedImages=0,busy=false,generation=0;
function image(url){return typeof url==='string'&&/^https:\/\/(m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)\//i.test(url)?url:null}
function source(url){return typeof url==='string'&&/^https:\/\/(www\.)?amazon\.[a-z.]+\//i.test(url)?url:null}
function updateCounters(){
 $('count').textContent=rows.length+' / '+TARGET;
 $('visible').textContent=filtered.length;
 $('images').textContent=loadedImages;
}
function card(p){
 const node=document.createElement('article');node.className='card';
 const visual=document.createElement('div');visual.className='visual';
 const picture=image(p.image_url);
 if(picture){
  const img=document.createElement('img');img.src=picture;img.alt='Reference photo — '+p.title;img.loading='lazy';img.decoding='async';img.width=400;img.height=400;
  img.addEventListener('load',()=>{loadedImages++;updateCounters()});
  img.addEventListener('error',()=>{img.remove();visual.textContent='Product image unavailable'});
  visual.append(img);
 }else visual.textContent='Product photo not supplied';
 const details=document.createElement('div');details.className='details';
 const brand=document.createElement('div');brand.className='brand';brand.textContent=p.brand||'Brand not specified';
 const title=document.createElement('h3');title.textContent=p.title;
 const meta=document.createElement('div');meta.className='meta';meta.textContent=(p.category||'Product')+' · ASIN '+p.asin;
 const warning=document.createElement('span');warning.className='not-sale';warning.textContent='Not for sale · Local price / stock unverified';
 const original=source(p.source_url);
 details.append(brand,title,meta,warning);
 if(original){
  const link=document.createElement('a');link.className='source';link.href=original;link.rel='noopener noreferrer nofollow';link.target='_blank';link.textContent='Original product listing ↗';details.append(link);
 }
 node.append(visual,details);return node;
}
function renderMore(){
 const frag=document.createDocumentFragment();
 filtered.slice(displayed,displayed+PAGE_SIZE).forEach(p=>frag.append(card(p)));
 $('products').append(frag);
 displayed=Math.min(displayed+PAGE_SIZE,filtered.length);
 $('more').hidden=displayed>=filtered.length;
 $('status').textContent='Showing '+displayed+' of '+filtered.length+' matching products · '+rows.length+' database records';
}
function filter(){
 const term=safe($('search').value,100).toLocaleLowerCase();
 const cat=$('category')?.value||'All';
 filtered=rows.filter(p=>(cat==='All'||p.category===cat)&&(!term||[p.title,p.brand,p.asin,p.category].some(s=>s.toLocaleLowerCase().includes(term))));
 const sort=$('sort').value;
 if(sort==='name')filtered.sort((a,b)=>a.title.localeCompare(b.title));
 if(sort==='brand')filtered.sort((a,b)=>a.brand.localeCompare(b.brand));
 displayed=0;$('products').replaceChildren();updateCounters();renderMore();
}
function categories(){
 const sel=$('category'),old=sel.value;
 const values=[...new Set(rows.map(p=>p.category).filter(Boolean))].sort();
 sel.replaceChildren();
 const first=document.createElement('option');first.value='All';first.textContent='All categories';sel.append(first);
 values.forEach(label=>{const opt=document.createElement('option');opt.value=label;opt.textContent=label;sel.append(opt)});
 if(values.includes(old))sel.value=old;
}
async function queryChunk(offset){
 const u=new URL(API);
 u.searchParams.set('select','asin,title,brand,category,image_url,source_url');
 u.searchParams.set('order','asin.asc');
 u.searchParams.set('offset',String(offset));
 u.searchParams.set('limit','500');
 const response=await fetch(u.toString(),{headers:{apikey:KEY,'Accept':'application/json'},cache:'no-store'});
 if(!response.ok)throw Error('USE ME database response '+response.status);
 const data=await response.json();
 if(!Array.isArray(data))throw Error('Invalid catalogue data');
 return data;
}
async function load(){
 if(busy)return;busy=true;const thisRun=++generation;
 $('refresh').disabled=true;$('error').hidden=true;
 $('status').textContent='Loading genuine product references from USE ME database...';
 try{
  const pages=await Promise.all([queryChunk(0),queryChunk(500)]);
  if(thisRun!==generation)return;
  const unique=new Map();
  for(const p of pages.flat()){
   const asin=safe(p.asin,14);
   const title=safe(p.title,180);
   if(!/^[A-Z0-9]{10}$/.test(asin)||title.length<3||unique.has(asin))continue;
   unique.set(asin,{asin,title,brand:safe(p.brand,90),category:safe(p.category,90),image_url:p.image_url,source_url:p.source_url});
  }
  rows=[...unique.values()];
  loadedImages=0;
  categories();
  filter();
  if(rows.length<TARGET)$('status').textContent='Loaded '+rows.length+' valid products of the 1000 source records; some records may be unavailable.';
 }catch(err){
  $('error').hidden=false;
  $('error').textContent='Unable to load the real product catalogue. '+String(err.message||err)+' — refresh this page to retry.';
  $('status').textContent='Catalogue temporarily unavailable';
 }finally{busy=false;$('refresh').disabled=false}
}
document.addEventListener('DOMContentLoaded',()=>{
 $('more').addEventListener('click',renderMore);
 $('refresh').addEventListener('click',load);
 $('sort').addEventListener('change',filter);
 $('category').addEventListener('change',filter);
 $('searchform').addEventListener('submit',e=>{e.preventDefault();filter()});
 load();
});
})();