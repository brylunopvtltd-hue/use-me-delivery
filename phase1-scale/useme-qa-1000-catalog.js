/* USE ME QA: 1000 draft products; owner-only Supabase RLS; no purchases. */
(function(){
'use strict';
const PROJECT_URL='https://woytuayeuyfvucttvosw.supabase.co';
const PUBLIC_KEY='sb_publishable_NG-tEBNafW-8tZwOvW2njA_WYzXCq8C';
const TEST_SHOP='8a8d46f2-76bb-4e18-9f1e-e4c6aca171fb';
const PAGE_SIZE=40;
const categories=['All','Fashion','Electronics','Beauty','Home','Sports','Books'];
const $=id=>document.getElementById(id);
let client,offset=0,total=0,generation=0,loading=false,hasMore=false;
let pageTimes=[],photoLoaded=0;
function text(id,message){const el=$(id);if(el)el.textContent=message}
function photoIndex(product){
 const m=String(product.name||'').match(/Demo #(\d{4})/);
 return m?Number(m[1]):1;
}
const categoryFallback={
 Fashion:'photo-1542291026-7eec264c27ff',
 Electronics:'photo-1505740420928-5e560c06d30e',
 Beauty:'photo-1556228720-195a672e8a03',
 Home:'photo-1514228742587-6b1558fcca3d',
 Sports:'photo-1602143407151-7111542de6e8',
 Books:'photo-1531346878377-a5be20888e57'
};
function photoUrl(product){
 return 'https://picsum.photos/seed/useme-qa-'+photoIndex(product)+'/400/400';
}
function backupPhoto(product){
 return 'https://images.unsplash.com/'+(categoryFallback[product.category]||categoryFallback.Fashion)+'?auto=format&fit=crop&w=400&h=400&q=68';
}
function createCard(item){
 const article=document.createElement('article');article.className='product-card';
 const cover=document.createElement('div');cover.className='product-cover';
 const img=document.createElement('img');img.alt='Internet demonstration photograph — not actual product';img.loading='lazy';img.decoding='async';img.width=400;img.height=400;img.src=photoUrl(item);
 img.addEventListener('load',()=>{photoLoaded++;text('photoCount',photoLoaded+' images loaded')});
 img.addEventListener('error',()=>{if(!img.dataset.fallback){img.dataset.fallback='1';img.src=backupPhoto(item)}else{img.remove();cover.textContent='PHOTO UNAVAILABLE'}});
 cover.append(img);
 const content=document.createElement('div');content.className='product-info';
 const category=document.createElement('span');category.className='category';category.textContent=item.category||'General';
 const name=document.createElement('h3');name.textContent=item.name||'Test item';
 const price=document.createElement('strong');price.textContent='LKR '+Number(item.price_lkr||0).toLocaleString('en-LK');
 const note=document.createElement('p');note.textContent='Demo data · Draft · Stock 0 · Not for sale';
 const badge=document.createElement('small');badge.className='sku';badge.textContent='Test #'+String(photoIndex(item)).padStart(4,'0');
 content.append(category,name,price,note,badge);article.append(cover,content);return article;
}
function status(msg){text('status',msg)}
function showAuth(msg){
 $('authScreen').hidden=false;
 $('catalogScreen').hidden=true;
 text('authMessage',msg);
}
function syncActions(){
 $('loadMore').hidden=!hasMore;
 $('loadMore').disabled=loading;
 $('loadAll').hidden=!hasMore;
 $('loadAll').disabled=loading;
 text('loadedCount',String(offset));
 text('totalCount',String(total));
 text('pageTime',pageTimes.length?(Math.round(pageTimes.reduce((x,y)=>x+y,0)/pageTimes.length))+'ms avg DB request':'—');
}
function setupFilters(){
 const c=$('category');
 for(const entry of categories){const opt=document.createElement('option');opt.value=entry;opt.textContent=entry;c.append(opt)}
 $('searchForm').addEventListener('submit',e=>{e.preventDefault();restart()});
 c.addEventListener('change',restart);
 $('sort').addEventListener('change',restart);
 $('loadMore').addEventListener('click',()=>loadNext());
 $('loadAll').addEventListener('click',async()=>{
  $('loadAll').disabled=true;
  let safety=0;
  while(hasMore&&safety++<26){
   const ok=await loadNext();
   if(!ok)break;
  }
 });
}
function restart(){
 generation++;offset=0;total=0;hasMore=true;loading=false;pageTimes=[];photoLoaded=0;
 $('grid').replaceChildren();text('photoCount','0 images loaded');status('Loading test products...');
 syncActions();loadNext();
}
async function loadNext(){
 if(loading||!hasMore)return false;
 const g=generation;loading=true;syncActions();
 const t0=performance.now();
 try{
  let q=client.from('products')
    .select('id,name,category,description,price_lkr,stock,active,created_at',{count:'exact'})
    .eq('shop_id',TEST_SHOP).eq('active',false);
  const term=$('search').value.trim().slice(0,80).replace(/[%,().*"']/g,'').trim();
  if(term)q=q.ilike('name','%'+term+'%');
  const category=$('category').value;
  if(category!=='All')q=q.eq('category',category);
  const sort=$('sort').value;
  if(sort==='price-low'||sort==='price-high')q=q.order('price_lkr',{ascending:sort==='price-low'});
  else q=q.order('created_at',{ascending:false});
  q=q.order('id',{ascending:true}).range(offset,offset+PAGE_SIZE-1);
  const {data,error,count}=await q;
  if(g!==generation)return false;
  if(error)throw error;
  pageTimes.push(performance.now()-t0);
  const records=data||[];
  const fragment=document.createDocumentFragment();
  records.forEach(row=>fragment.append(createCard(row)));
  $('grid').append(fragment);
  offset+=records.length;total=typeof count==='number'?count:offset;
  hasMore=records.length===PAGE_SIZE&&offset<total;
  status(records.length?'Loaded '+offset+' of '+total+' test products.':'No matching test products found.');
  return true;
 }catch(error){
  if(g===generation){status('Could not load test products: '+String(error.message||error));hasMore=true}
  return false;
 }finally{if(g===generation){loading=false;syncActions()}}
}
async function initialize(){
 setupFilters();
 if(!window.supabase||!window.supabase.createClient){showAuth('Database library could not load. Check your internet connection.');return}
 client=window.supabase.createClient(PROJECT_URL,PUBLIC_KEY);
 try{
  const {data,error}=await client.auth.getUser();
  if(error||!data?.user){showAuth('Please log in to your USE ME Owner account on the main website, then reload this page.');return}
  const role=await client.rpc('my_useme_role');
  if(role.error||role.data!=='owner'){showAuth('Only the USE ME Owner can access these draft products.');return}
  $('authScreen').hidden=true;$('catalogScreen').hidden=false;
  text('accountStatus','Owner verified · test mode');
  restart();
 }catch(error){showAuth('Unable to verify Owner session: '+String(error.message||error))}
}
document.addEventListener('DOMContentLoaded',initialize);
})();