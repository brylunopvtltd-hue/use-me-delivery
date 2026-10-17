/* USE ME V9 Commerce + Help: actual routed products, verified shops, voice search, price comparison, and private support tickets. */
(function(){
'use strict';
const $=id=>document.getElementById(id),db=()=>typeof usemeDb==='undefined'?null:usemeDb;
const elem=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x};
const button=(title,click,cls='v9c-btn')=>{const x=elem('button',cls,title);x.type='button';x.addEventListener('click',click);return x};
const money=n=>'LKR '+Number(n||0).toLocaleString('en-LK',{minimumFractionDigits:0,maximumFractionDigits:2});
const uuid=x=>/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(x||''));
const safeStatus=(id,t)=>{if($(id))$(id).textContent=t};
let catalog=[],shops=[],shopById=new Map(),compareSet=new Set(),activeTicket=null,ownerTickets=[],publicProduct=null,productOrders=[];
const user=async()=>{if(!db())return null;try{return (await db().auth.getUser()).data?.user||null}catch(e){return null}};
const owner=async()=>{const u=await user();if(!u)return false;const r=await db().rpc('is_owner');return !r.error&&r.data===true};
function navigate(path){
 if(!path||path[0]!=='/')return;
 if(path==='/shop'&&typeof go==='function'){go('buy');return}
 const root=path.startsWith('/products/')?'productDetails':path.startsWith('/shops/')?'shopDetails':path.startsWith('/help')?'help':path==='/owner/support'?'ownerSupport':path==='/search'?'searchV9':'';
 if(root&&typeof go==='function'){
  go(root,{url:path});return
 }
 location.href=path;
}
async function loadCatalog(){
 if(!db())return [];
 const s=await db().from('shops').select('id,name,status').eq('status','approved').limit(180);
 if(s.error)return[];
 shops=s.data||[];shopById=new Map(shops.map(v=>[v.id,v.name]));
 if(!shops.length){catalog=[];return[]}
 const r=await db().from('products').select('id,shop_id,name,category,description,price_lkr,stock,active,image_path').eq('active',true).in('shop_id',shops.map(x=>x.id)).limit(400);
 catalog=(r.data||[]).filter(p=>shopById.has(p.shop_id)).map(p=>({...p,shop_name:shopById.get(p.shop_id)}));return catalog;
}
function photoOf(p){
 try{return typeof productImageUrl==='function'?productImageUrl(p.image_path):null}catch(e){return null}
}
function card(p,withCompare=false){
 const article=elem('article','v9c-item'),imageLink=elem('a','v9c-photo');imageLink.href='/products/'+p.id;
 imageLink.addEventListener('click',e=>{e.preventDefault();navigate(imageLink.getAttribute('href'))});
 const photo=photoOf(p);
 if(photo){const img=elem('img');img.loading='lazy';img.src=photo;img.alt=p.name;imageLink.append(img)}
 else imageLink.append(elem('span','','🛍️'));
 const body=elem('div','v9c-item-body');
 const shopLink=elem('a','v9c-shoplink','🏪 '+p.shop_name);shopLink.href='/shops/'+p.shop_id;
 shopLink.addEventListener('click',e=>{e.preventDefault();navigate(shopLink.getAttribute('href'))});
 const name=elem('a','v9c-item-name',p.name);name.href='/products/'+p.id;name.addEventListener('click',e=>{e.preventDefault();navigate(name.getAttribute('href'))});
 body.append(shopLink,name,elem('strong','v9c-price',money(p.price_lkr)),elem('small','',p.stock>0?p.stock+' available':'Out of stock'));
 const controls=elem('div','v9c-choices');
 controls.append(button('Details',()=>navigate('/products/'+p.id),'v9c-soft'));
 const add=button('+ Cart',()=>{if(p.stock>0&&typeof addLiveCart==='function')addLiveCart(p)},'v9c-buy');
 add.disabled=p.stock<=0;controls.append(add);body.append(controls);
 if(withCompare){
  const label=elem('label','v9c-compare');
  const check=elem('input');check.type='checkbox';check.checked=compareSet.has(p.id);
  check.addEventListener('change',()=>{if(check.checked&&compareSet.size>=3){check.checked=false;alert('Compare up to three verified products.');return}
   if(check.checked)compareSet.add(p.id);else compareSet.delete(p.id);
   safeStatus('v9CompareCount',compareSet.size+' selected for comparison');
  });
  label.append(check,elem('span','','Compare'));body.append(label)
 }
 article.append(imageLink,body);return article;
}
function renderSearch(){
 const root=$('v9SearchResults');if(!root)return;root.replaceChildren();
 const q=($('v9SearchInput')?.value||new URLSearchParams(location.search).get('q')||'').toLowerCase().trim();
 const category=$('v9SearchCategory')?.value||'All';
 const max=Number($('v9SearchMaxPrice')?.value||0);
 const order=$('v9SearchSort')?.value||'popular';
 const selected=catalog.filter(p=>(!q||[p.name,p.description,p.shop_name,p.category].some(s=>String(s||'').toLowerCase().includes(q)))
 &&(category==='All'||p.category===category)&&(max<=0||Number(p.price_lkr)<=max));
 if(order==='low')selected.sort((a,b)=>Number(a.price_lkr)-Number(b.price_lkr));
 else if(order==='high')selected.sort((a,b)=>Number(b.price_lkr)-Number(a.price_lkr));
 else selected.sort((a,b)=>(b.stock>0?1:0)-(a.stock>0?1:0));
 safeStatus('v9SearchStatus',selected.length+' verified products match your filters. Prices and stock come from actual local shops.');
 if(!selected.length){root.append(elem('p','v9c-muted','No published products match those filters. Try a new search.'));return}
 const grid=elem('div','v9c-grid');selected.forEach(p=>grid.append(card(p,true)));root.append(grid);
}
function fillSearchCategories(){
 const sel=$('v9SearchCategory');if(!sel)return;
 const keep=sel.value;sel.replaceChildren();
 const all=elem('option','','All categories');all.value='All';sel.append(all);
 [...new Set(catalog.map(p=>p.category).filter(Boolean))].sort().forEach(c=>{const o=elem('option','',c);o.value=c;sel.append(o)});
 if([...sel.options].some(x=>x.value===keep))sel.value=keep;
}
async function openSearch(){
 const input=$('v9SearchInput'),qp=new URLSearchParams(location.search).get('q');
 if(qp&&input)input.value=qp;
 await loadCatalog();fillSearchCategories();renderSearch();
}
function voiceSearch(){
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition)return safeStatus('v9SearchStatus','Voice input is not supported by this browser. Enter your search in Tamil, Sinhala or English.');
 const r=new Recognition();r.lang=$('v9VoiceLang')?.value||'ta-LK';r.interimResults=false;r.maxAlternatives=1;
 safeStatus('v9SearchStatus','Requesting microphone permission. Speak a product or shop name.');
 r.onresult=e=>{const word=e.results?.[0]?.[0]?.transcript;if(word){$('v9SearchInput').value=word;renderSearch()}};
 r.onerror=e=>safeStatus('v9SearchStatus','Voice search unavailable: '+e.error);
 try{r.start()}catch(e){safeStatus('v9SearchStatus','Could not start voice recognition.')}
}
function compare(){
 const ids=[...compareSet],root=$('v9CompareTable');
 if(!root)return;root.replaceChildren();
 if(ids.length<2)return safeStatus('v9SearchStatus','Select at least 2 products to compare real prices, stock and stores.');
 const p=ids.map(id=>catalog.find(p=>p.id===id)).filter(Boolean);
 if(p.length<2)return;
 const table=elem('table','v9c-compare-table');
 const fields=[['Product',x=>x.name],['Store',x=>x.shop_name],['Price',x=>money(x.price_lkr)],['Available stock',x=>x.stock],['Category',x=>x.category||'General']];
 fields.forEach(([title,get])=>{
  const tr=elem('tr');tr.append(elem('th','',title));p.forEach(x=>tr.append(elem('td','',get(x))));table.append(tr);
 });
 root.append(elem('h3','','Verified Product Comparison'),table);
 root.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function addShopDetailsLink(){
 document.querySelectorAll('#liveProducts .v3-product-card[data-product-id]').forEach(cardEl=>{
  if(cardEl.querySelector('.v9c-more'))return;
  const id=cardEl.dataset.productId;if(!uuid(id))return;
  const link=elem('a','v9c-more','Full product details →');link.href='/products/'+id;
  link.addEventListener('click',e=>{e.preventDefault();navigate(link.getAttribute('href'))});
  cardEl.querySelector('.v3-product-body')?.append(link);
 });
}
async function renderProduct(){
 const root=$('v9ProductDetail'),reviews=$('v9ProductReviews');if(!root)return;
 root.replaceChildren();reviews?.replaceChildren();
 const id=location.pathname.match(/^\/products\/([0-9a-f-]{36})\/?$/i)?.[1];
 if(!uuid(id)){root.append(elem('p','v9c-muted','Choose a product from Shop to see its real detail page.'));return}
 const s=await db().from('products').select('id,shop_id,name,category,description,price_lkr,stock,active,image_path').eq('id',id).eq('active',true).maybeSingle();
 if(s.error||!s.data){root.append(elem('p','v9c-muted','Product unavailable or removed.'));return}
 const p=s.data,shop=await db().from('shops').select('id,name,status').eq('id',p.shop_id).eq('status','approved').maybeSingle();
 if(shop.error||!shop.data){root.append(elem('p','v9c-muted','This product is not from an active approved shop.'));return}
 publicProduct={...p,shop_name:shop.data.name};
 const gallery=elem('div','v9c-detail-photo');
 const im=photoOf(p);if(im){const image=elem('img');image.src=im;image.alt=p.name;gallery.append(image)}else gallery.textContent='🛍️';
 const detail=elem('div','v9c-detail-info');
 detail.append(elem('small','',p.category||'Product'),elem('h2','',p.name),elem('b','v9c-detail-price',money(p.price_lkr)),
 elem('p','',p.description||'Verified local shop listing.'),
 elem('p','v9c-stock',p.stock>0?p.stock+' in stock':'Temporarily unavailable'));
 const shopLink=elem('a','v9c-shoplink','🏪 '+shop.data.name+' · Visit Shop →');shopLink.href='/shops/'+shop.data.id;
 shopLink.addEventListener('click',e=>{e.preventDefault();navigate(shopLink.getAttribute('href'))});detail.append(shopLink);
 const cartBtn=button(p.stock>0?'+ Add to Cart':'Out of Stock',()=>{if(p.stock>0&&typeof addLiveCart==='function')addLiveCart(publicProduct)},'v9c-buy');cartBtn.disabled=p.stock<=0;
 detail.append(cartBtn);root.append(gallery,detail);
 await loadProductReviews(p.id);
 await loadEligibleReviewOrders(p.id);
}
async function loadProductReviews(productId){
 const root=$('v9ProductReviews');if(!root)return;root.replaceChildren();
 const r=await db().rpc('useme_v9_public_reviews',{p_product_id:productId});
 if(r.error){root.append(elem('p','v9c-muted','Verified reviews unavailable.'));return}
 const list=Array.isArray(r.data)?r.data:[];
 if(!list.length){root.append(elem('p','v9c-muted','No Owner-approved, verified customer reviews yet.'));return}
 const avg=list.reduce((s,x)=>s+x.rating,0)/list.length;
 root.append(elem('strong','','★ '+avg.toFixed(1)+' / 5 · '+list.length+' verified approved review(s)'));
 list.forEach(item=>{
  const row=elem('article','v9c-review');
  row.append(elem('b','',('★'.repeat(item.rating))+'☆'.repeat(5-item.rating)),
 elem('p','',item.text),elem('small','',new Date(item.date).toLocaleDateString()));
 root.append(row);
 });
}
async function loadEligibleReviewOrders(productId){
 const select=$('v9ProductReviewOrder');if(!select)return;select.replaceChildren();
 const userData=await user();if(!userData){select.append(elem('option','','Sign in to review'));return}
 const orders=await db().from('orders').select('id,status,created_at').eq('customer_id',userData.id).eq('status','delivered').order('created_at',{ascending:false}).limit(70);
 if(orders.error||!orders.data?.length){select.append(elem('option','','No delivered orders'));return}
 const items=await db().from('order_items').select('order_id,product_id').eq('product_id',productId).in('order_id',orders.data.map(o=>o.id)).limit(70);
 if(items.error){select.append(elem('option','','Product delivery history unavailable'));return}
 productOrders=[...new Set((items.data||[]).map(x=>x.order_id))];
 if(!productOrders.length){select.append(elem('option','','No delivered order containing this product'));return}
 productOrders.forEach(id=>{const o=elem('option','',id.slice(0,8)+' --- TRUNCATED --- 23,063 chars