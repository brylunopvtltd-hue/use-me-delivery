(()=>{'use strict';
const TBL='useme_reference_products',SIZE=40,LIMIT=12,MAX_QTY=10;
const $=id=>document.getElementById(id);
const items=new Map();
let db=null,all=[],filtered=[],offset=0,requestId=null,submitting=false,loading=false;
function status(message){const p=$('sourceStatus');if(p)p.textContent=message;}
function clean(v,len){return String(v??'').trim().slice(0,len);}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function pic(url){return typeof url==='string'&&/^https:\/\/m\.media-amazon\.com\/images\//i.test(url)?url:null;}
function getRecords(){
 return Promise.all([
  db.from(TBL).select('asin,title,brand,category,image_url,source_url').order('asin',{ascending:true}).range(0,499),
  db.from(TBL).select('asin,title,brand,category,image_url,source_url').order('asin',{ascending:true}).range(500,999)
 ]);
}
async function load(){
 if(loading)return;loading=true;status('Loading available-to-request product references...');
 $('sourceRefresh').disabled=true;
 try{
  if(!db){if(typeof usemeDb!=='undefined'&&usemeDb)db=usemeDb;
    else if(window.supabase)db=window.supabase.createClient('https://woytuayeuyfvucttvosw.supabase.co','sb_publishable_NG-tEBNafW-8tZwOvW2njA_WYzXCq8C');}
  if(!db)throw Error('Database not ready');
  const pages=await getRecords();
  const fail=pages.find(p=>p.error);if(fail)throw fail.error;
  const unique=new Map();
  pages.forEach(p=>(p.data||[]).forEach(row=>{
   if(row.asin&&row.title)unique.set(row.asin,row);
  }));
  all=[...unique.values()];
  const c=$('sourceCategory'),prior=c.value;
  c.replaceChildren();
  const first=el('option','','All categories');first.value='All';c.append(first);
  [...new Set(all.map(p=>p.category).filter(Boolean))].sort().forEach(cat=>{
   const x=el('option','',cat);x.value=cat;c.append(x);
  });
  if([...c.options].some(o=>o.value===prior))c.value=prior;
  search();
 }catch(e){status('Could not load request products: '+(e.message||String(e)));}
 finally{loading=false;$('sourceRefresh').disabled=false;}
}
function search(){
 const q=clean($('sourceSearch').value,100).toLowerCase();
 const cat=$('sourceCategory').value;
 const sort=$('sourceSort').value;
 filtered=all.filter(p=>(cat==='All'||p.category===cat)&&(!q||[p.title,p.brand,p.asin,p.category].some(t=>String(t||'').toLowerCase().includes(q))));
 if(sort==='a-z')filtered.sort((a,b)=>a.title.localeCompare(b.title));
 else if(sort==='brand')filtered.sort((a,b)=>String(a.brand||'').localeCompare(String(b.brand||'')));
 offset=0;$('sourceGrid').replaceChildren();
 renderMore();
}
function itemCard(p){
 const node=el('article','source-product');
 const photo=el('div','source-image');
 const url=pic(p.image_url);
 if(url){
  const im=el('img');im.src=url;im.alt=clean(p.title,100);im.loading='lazy';im.decoding='async';im.width=300;im.height=300;
  im.onerror=()=>{im.remove();photo.textContent='📦';};
  photo.append(im);
 }else photo.textContent='📦';
 const body=el('div','source-product-body');
 const brand=el('small','source-brand',p.brand||'Product');
 const title=el('h3','',p.title);
 const descriptor=el('p','source-subtitle','Item cost: confirmed by USE ME after sourcing');
 const info=el('small','source-asin','Ref: '+p.asin);
 const row=el('div','source-product-actions');
 const btn=el('button','source-primary','+ Request item');
 btn.type='button';
 btn.onclick=()=>{
  const entry=items.get(p.asin);
  if(entry&&entry.quantity>=MAX_QTY)return status('Maximum quantity per product: 10');
  items.set(p.asin,{product:p,quantity:entry?entry.quantity+1:1});requestId=null;renderCart();
  status('Added to order request: '+p.title+'. Final item price will be confirmed by Owner.');
 };
 const original=el('a','source-link','Source ↗');
 if(/^https:\/\/(?:www\.)?amazon\.[a-z.]+\//i.test(p.source_url||'')){original.href=p.source_url;original.target='_blank';original.rel='noopener noreferrer nofollow';row.append(btn,original);}
 else row.append(btn);
 body.append(brand,title,descriptor,info,row);
 node.append(photo,body);
 return node;
}
function renderMore(){
 const frag=document.createDocumentFragment();
 filtered.slice(offset,offset+SIZE).forEach(p=>frag.append(itemCard(p)));
 $('sourceGrid').append(frag);
 offset=Math.min(offset+SIZE,filtered.length);
 $('sourceMore').hidden=offset>=filtered.length;
 status('Showing '+offset+' of '+filtered.length+' requestable products · '+all.length+' loaded. Subject to availability and Owner quote.');
}
function cartChanges(asin,diff){
 const entry=items.get(asin);if(!entry)return;
 entry.quantity+=diff;
 if(entry.quantity<=0)items.delete(asin);
 else entry.quantity=Math.min(MAX_QTY,entry.quantity);
 requestId=null;renderCart();
}
function renderCart(){
 const list=$('sourceCartItems');list.replaceChildren();
 let totalQty=0;
 for(const [asin,entry] of items){
  totalQty+=entry.quantity;
  const row=el('div','source-cart-line');
  const label=el('span','',clean(entry.product.title,105));label.title=entry.product.title;
  const controls=el('div','source-cart-buttons');
  const minus=el('button','','−');minus.type='button';minus.onclick=()=>cartChanges(asin,-1);
  const qty=el('strong','',String(entry.quantity));
  const plus=el('button','','+');plus.type='button';plus.disabled=entry.quantity>=MAX_QTY;plus.onclick=()=>cartChanges(asin,1);
  controls.append(minus,qty,plus);row.append(label,controls);list.append(row);
 }
 if(!items.size)list.append(el('p','source-hint','Choose products above to make a sourcing order.'));
 $('sourceCartCount').textContent=totalQty+' items / '+items.size+' products';
 $('sourceCheckout').disabled=items.size===0||submitting;
 $('sourceCartTrigger').textContent='🛒 Request Cart ('+totalQty+')';
}
async function checkout(event){
 event.preventDefault();if(submitting||!items.size)return;
 if(items.size>LIMIT)return status('Choose at most 12 different products per request.');
 const userResult=await db.auth.getUser();
 if(userResult.error||!userResult.data?.user){
  status('Sign in to your USE ME account first to submit the order request.');
  const login=$('sourceLoginHint');login.hidden=false;return;
 }
 const name=clean($('sourceName').value,100),phone=clean($('sourcePhone').value,22),address=clean($('sourceAddress').value,350),note=clean($('sourceNote').value,400);
 if(name.length<2||phone.length<7||address.length<6)return status('Enter your name, phone number and full delivery address.');
 if(!requestId)requestId=crypto.randomUUID();
 submitting=true;$('sourceCheckout').disabled=true;status('Submitting your request securely...');
 try{
  const lines=[...items.values()].map(i=>({asin:i.product.asin,quantity:i.quantity}));
  const r=await db.rpc('place_useme_catalog_order_once',{
   p_request_id:requestId,p_items:lines,
   p_recipient_name:name,p_recipient_phone:phone,
   p_delivery_address:address,p_customer_note:note
  });
  if(r.error)throw r.error;
  const orderId=r.data;
  items.clear();requestId=null;renderCart();
  const success=$('sourceSuccess');success.hidden=false;success.replaceChildren();
  success.append(el('strong','','✓ USE ME Order Request submitted'));
  success.append(el('p','','Order reference: '+orderId));
  success.append(el('p','','USE ME Owner will check item availability, confirm actual item price and quote delivery fee. Do not pay until you receive confirmation.'));
  const orders=el('a','source-link','View My Orders →');orders.href='/orders';orders.onclick=e=>{if(typeof openMyOrders==='function'){e.preventDefault();openMyOrders();}};success.append(orders);
  $('sourceOrderForm').reset();$('sourceCart').open=false;
  status('Order request sent to USE ME Owner Dashboard. Reference: '+orderId.slice(0,8));
 }catch(err){
  status('Order not submitted: '+(err.message||String(err))+'. Please retry. Your selected products remain in the cart.');
 }finally{submitting=false;renderCart();}
}
document.addEventListener('DOMContentLoaded',()=>{
 if(!$('sourceCatalog'))return;
 $('sourceSearchForm').addEventListener('submit',e=>{e.preventDefault();search();});
 $('sourceCategory').addEventListener('change',search);
 $('sourceSort').addEventListener('change',search);
 $('sourceMore').addEventListener('click',renderMore);
 $('sourceRefresh').addEventListener('click',load);
 $('sourceCartTrigger').addEventListener('click',()=>{$('sourceCart').open=true;$('sourceCart').scrollIntoView({behavior:'smooth',block:'start'});});
 $('sourceOrderForm').addEventListener('submit',checkout);
 $('sourceClear').addEventListener('click',()=>{items.clear();requestId=null;renderCart();});
 renderCart();load();
});
})();