/* USE ME Promotions V1: real campaigns and private owner management. No invented prices, ratings or purchases. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const db=()=>typeof usemeDb!=='undefined'?usemeDb:null;
const el=(tag,cls,content)=>{const v=document.createElement(tag);if(cls)v.className=cls;if(content!==undefined)v.textContent=String(content);return v};
const btn=(txt,fn,cls='')=>{const b=el('button',cls,txt);b.type='button';b.addEventListener('click',fn);return b};
const live=c=>c&&c.active&&new Date(c.starts_at).getTime()<=Date.now()&&(!c.ends_at||new Date(c.ends_at).getTime()>Date.now());
const linkOK=path=>typeof path==='string'&&/^\/(shop|offers|send|ride|wholesale|cart|order\/new|profile|notifications)(\?[a-zA-Z0-9_=&%.-]{0,150})?$/.test(path);
const money=n=>'LKR '+Number(n||0).toLocaleString('en-LK',{maximumFractionDigits:2});
const safeText=s=>String(s||'').slice(0,260);
const token=()=>Math.random().toString(36).slice(2,8);
let pollingTimer=null;let promos=[],allProducts=[],productMap=new Map(),claims=new Set(),timers=[],ownerRows=[],editId=null,adminReady=false,ownerProducts=[],popupTimer=null;
const kindText={banner:'Banner',ad:'Sponsored ad',ticker:'News ticker',flash:'Flash promotion',coupon:'Voucher',collection:'Collection',popup:'Pop-up'};
const productURL=p=>{
 if(!p||!p.image_path||typeof productImageUrl!=='function')return '';
 try{return productImageUrl(p.image_path)||''}catch(e){return ''}
};
const imageURL=path=>{
 if(!path||!/^campaigns\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(path)||!db())return '';
 try{return db().storage.from('useme-campaign-images').getPublicUrl(path).data.publicUrl||''}catch(e){return ''}
};
function navigate(path){
 if(!linkOK(path))return;
 if(path.startsWith('/shop')){
  const category=new URLSearchParams(path.split('?')[1]||'').get('category');
  if(category&&typeof window.category==='function')window.category(category);
  else if(typeof window.go==='function')window.go('buy',{url:path});
  else location.href=path;
  return;
 }
 const map={'/offers':'offers','/send':'send','/cart':'cart','/profile':'account','/notifications':'notifications','/wholesale':'b2b','/ride':'ride','/order/new':'placeorder'};
 const root=path.split('?')[0];
 if(typeof window.go==='function'&&map[root])window.go(map[root],{url:path});
 else location.href=path;
}
const action=(campaign,label)=>btn(label||campaign.cta_label||'Explore now',()=>navigate(campaign.link_path),'useme-campaign-cta');
function setMessage(id,message){const x=$(id);if(x)x.textContent=message}
function clearTimers(){timers.forEach(clearInterval);timers=[];if(popupTimer){clearTimeout(popupTimer);popupTimer=null}}
function get(kind,slot){return promos.filter(p=>p.kind===kind&&live(p)&&p.slots&&p.slots.includes(slot))}
function createSlide(p){
 const slide=el('article','useme-campaign-slide kind-'+p.kind);
 slide.setAttribute('aria-label',p.title);
 const media=el('div','useme-campaign-media');
 const url=imageURL(p.image_path);
 if(url){const img=el('img');img.src=url;img.alt='';img.loading='lazy';media.append(img)}
 else{const mark=el('span','useme-campaign-symbol','✦');mark.setAttribute('aria-hidden','true');media.append(mark)}
 const copy=el('div','useme-campaign-copy');
 copy.append(el('span','useme-campaign-badge',p.kind==='ad'?'Sponsored · '+p.sponsor:(p.badge||'USE ME SPECIAL')));
 copy.append(el('h2','',p.title),el('p','',p.subtitle||'Browse verified USE ME products and services.'));
 copy.append(action(p,p.cta_label));
 slide.append(copy,media);
 return slide;
}
function renderCarousel(id,slot){
 const root=$(id);if(!root)return;
 const rows=promos.filter(p=>live(p)&&p.slots?.includes(slot)&&['banner','ad'].includes(p.kind)).sort((a,b)=>a.priority-b.priority);
 root.replaceChildren();
 if(!rows.length){root.classList.add('hidden');return}
 root.classList.remove('hidden');root.setAttribute('aria-roledescription','carousel');root.setAttribute('aria-label','USE ME current campaigns');
 const track=el('div','useme-campaign-track');
 const slides=rows.map(createSlide);slides.forEach(s=>track.append(s));root.append(track);
 let i=0;
 const controls=el('div','useme-campaign-controls');
 const prev=btn('‹',()=>show((i-1+rows.length)%rows.length),'useme-campaign-prev');
 const next=btn('›',()=>show((i+1)%rows.length),'useme-campaign-next');
 prev.setAttribute('aria-label','Previous offer');next.setAttribute('aria-label','Next offer');
 const dots=el('div','useme-campaign-dots');
 const indicators=rows.map((p,n)=>{const b=btn('•',()=>show(n));b.setAttribute('aria-label','Show promotion '+(n+1));dots.append(b);return b});
 function show(index){i=index;slides.forEach((s,n)=>{s.hidden=n!==i;s.setAttribute('aria-hidden',String(n!==i))});indicators.forEach((b,n)=>b.setAttribute('aria-current',String(n===i)));}
 if(rows.length>1){controls.append(prev,dots,next);root.append(controls)}
 show(0);
 let touchX=0;root.addEventListener('touchstart',ev=>{touchX=ev.changedTouches[0]?.screenX||0},{passive:true});
 root.addEventListener('touchend',ev=>{const diff=(ev.changedTouches[0]?.screenX||0)-touchX;if(Math.abs(diff)>42&&rows.length>1)show((i+(diff<0?1:rows.length-1))%rows.length)},{passive:true});
 const canMove=()=>rows[i]?.animation!==false&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.hidden&&!root.matches(':hover')&&!root.contains(document.activeElement);
 if(rows.length>1)timers.push(setInterval(()=>{if(canMove())show((i+1)%rows.length)},5200));
}
function renderTicker(id,slot){
 const root=$(id);if(!root)return;root.replaceChildren();
 const rows=get('ticker',slot);if(!rows.length){root.classList.add('hidden');return}root.classList.remove('hidden');
 const label=el('span','useme-live-label','● LIVE UPDATES');
 const stream=el('div','useme-ticker-stream');
 const make=hidden=>{const line=el('div','useme-ticker-items');if(hidden)line.setAttribute('aria-hidden','true');
 rows.forEach(p=>{const a=el('a','',p.title);a.href=linkOK(p.link_path)?p.link_path:'/shop';a.addEventListener('click',e=>{e.preventDefault();navigate(a.getAttribute('href'))});line.append(a)});return line};
 stream.append(make(false),make(true));root.append(label,stream);
 if(rows.every(x=>!x.animation))stream.classList.add('useme-motion-off');
}
function renderTrust(){
 const root=$('usemePromoTrust');if(!root)return;root.replaceChildren();
 [['shield-check','✓ Verified shops'],['truck','📦 Owner-managed delivery'],['badge-check','✓ Real product prices'],['map','📍 Location with permission']].forEach(([,name])=>root.append(el('span','',name)));
}
function renderShortcuts(){
 const root=$('usemePromoShortcuts');if(!root)return;root.replaceChildren();
 const choices=[['🧴','Beauty','/shop?category=Beauty'],['🛍️','Shopping','/shop'],['👕','Fashion','/shop?category=Fashion'],['🍛','Food','/shop?category=Food'],['🏠','Home','/shop?category=Home'],['📦','Parcel','/send'],['🏍️','Rides','/ride'],['🎁','Offers','/offers']];
 choices.forEach(([ico,name,path])=>{
  const a=el('a','useme-promo-shortcut');a.href=path;
  const symbol=el('span','',ico),txt=el('small','',name);
  a.append(symbol,txt);a.addEventListener('click',e=>{e.preventDefault();navigate(path)});root.append(a);
 });
}
function countdown(end){const seconds=Math.max(0,Math.floor((new Date(end).getTime()-Date.now())/1000));const d=Math.floor(seconds/86400);const h=Math.floor((seconds%86400)/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;return(d?d+'d ':'')+[h,m,s].map(n=>String(n).padStart(2,'0')).join(':')}
function cardForProduct(p,campaign){
 const card=el('article','useme-promo-product-card');
 const picture=el('div','useme-promo-product-image'),src=productURL(p);
 if(src){const img=el('img');img.src=src;img.alt=p.name;img.loading='lazy';picture.append(img)}
 else picture.append(el('span','useme-product-fallback','🛍️'));
 if(campaign){picture.append(el('span','useme-promo-flash-badge','⚡ FEATURED'))}
 const info=el('div','useme-promo-product-info');
 info.append(el('small','',p.shop_name||'Approved USE ME shop'),el('h3','',p.name),el('strong','',money(p.price_lkr)),el('small','',p.stock+' in stock'));
 const row=el('div','useme-promo-product-actions');
 row.append(btn('View details',()=>quickView(p.id),'useme-promo-secondary'));
 row.append(btn('+ Cart',()=>{if(typeof addLiveCart==='function')addLiveCart(p);else navigate('/shop')},'useme-promo-primary'));
 info.append(row);card.append(picture,info);return card;
}
async function fetchProducts(){
 const d=db();if(!d)return;
 const shops=await d.from('shops').select('id,name').eq('status','approved').limit(160);
 if(shops.error||!shops.data?.length)return;
 const names=new Map(shops.data.map(s=>[s.id,s.name]));
 const result=await d.from('products').select('id,shop_id,name,description,category,price_lkr,stock,active,image_path,created_at')
 .in('shop_id',[...names.keys()]).eq('active',true).gt('stock',0).order('created_at',{ascending:false}).limit(100);
 if(result.error)return;
 allProducts=(result.data||[]).map(p=>({...p,shop_name:names.get(p.shop_id)}));
 productMap=new Map(allProducts.map(p=>[p.id,p]));
}
function renderFlash(id,slot){
 const root=$(id);if(!root)return;root.replaceChildren();
 const rows=get('flash',slot).filter(c=>c.product_id&&productMap.has(c.product_id)&&c.ends_at);
 if(!rows.length){root.classList.add('hidden');return}root.classList.remove('hidden');
 const title=el('div','useme-promo-heading');
 title.append(el('h2','','⚡ Flash Deals · Live Now'),el('p','','Owner-selected real products. Standard listed product prices shown.'));
 root.append(title);
 const grid=el('div','useme-promo-deal-grid');
 rows.slice(0,8).forEach(p=>{
  const card=cardForProduct(productMap.get(p.product_id),p);
  const timer=el('div','useme-promo-countdown','Ends in '+countdown(p.ends_at));
  card.append(timer);grid.append(card);
  timers.push(setInterval(()=>{timer.textContent='Ends in '+countdown(p.ends_at);if(Date.now()>=new Date(p.ends_at).getTime()){card.remove();if(!grid.childElementCount)root.classList.add('hidden')}},1000));
 });
 root.append(grid);
}
function renderCollections(id,slot){
 const root=$(id);if(!root)return;root.replaceChildren();
 const rows=get('collection',slot);if(!rows.length){root.classList.add('hidden');return}root.classList.remove('hidden');
 const head=el('div','useme-promo-heading');
 head.append(el('h2','','Discover USE ME collections'),el('p','','Curated local categories — explore available products.'));root.append(head);
 const grid=el('div','useme-promo-collection-grid');
 rows.slice(0,6).forEach((p,n)=>{
  const item=el('article','useme-promo-collection col-'+(n%4));const badge=el('small','',p.badge||'USE ME PICKS');
  item.append(badge,el('h3','',p.title),el('p','',p.subtitle),action(p,p.cta_label));grid.append(item);
 });root.append(grid);
}
function voucherTerms(c){
 const d=c.discount_type==='percent'?c.discount_value+'% savings':c.discount_type==='delivery'?'LKR '+c.discount_value+' delivery saving':'LKR '+c.discount_value+' saving';
 return d+(Number(c.min_order_lkr)>0?' · Min. order '+money(c.min_order_lkr):'');
}
function renderCoupons(id,slot){
 const root=$(id);if(!root)return;root.replaceChildren();
 const rows=get('coupon',slot);
 const head=el('div','useme-promo-heading');
 head.append(el('h2','','🎟️ Vouchers & Coupons'),el('p','','Eligible savings are confirmed by USE ME Owner before payment. Not deducted automatically online.'));
 const header=el('div','useme-coupon-head');header.append(head);
 if(rows.length>1)header.append(btn('Collect All',()=>claimAll(rows),'useme-collect-all'));
 root.append(header);
 if(!rows.length){const empty=el('div','useme-coupon-empty');empty.append(el('strong','','New vouchers coming soon'),el('p','','Watch this space for real offers published by USE ME.'));root.append(empty);return}
 const grid=el('div','useme-promo-coupon-grid');
 rows.slice(0,12).forEach(c=>{
  const item=el('article','useme-promo-voucher');
  const text=el('div');
  text.append(el('small','','USE ME COUPON'),el('h3','',c.title),el('strong','',voucherTerms(c)));
  const note=el('p','',c.subtitle||(c.ends_at?'Ends '+new Date(c.ends_at).toLocaleDateString():'Owner confirmation required.'));
  const row=el('div','useme-promo-voucher-action');
  row.append(el('span','useme-voucher-code',claims.has(c.id)?c.coupon_code:'CODE AFTER CLAIM'));
  const action=btn(claims.has(c.id)?'✓ Claimed':'Collect',()=>claimOne(c),'useme-voucher-claim');
  action.disabled=claims.has(c.id);row.append(action);item.append(text,note,row);grid.append(item);
 });root.append(grid);
}
async function loadClaims(){
 claims=new Set();const d=db();if(!d)return;
 const user=await d.auth.getUser().then(x=>x.data?.user).catch(()=>null);if(!user)return;
 const r=await d.from('useme_coupon_claims').select('campaign_id').eq('user_id',user.id).limit(200);
 if(!r.error)claims=new Set((r.data||[]).map(x=>x.campaign_id));
}
async function claimOne(c){
 const d=db();if(!d)return;
 const user=await d.auth.getUser().then(x=>x.data?.user).catch(()=>null);
 if(!user){alert('Sign in to USE ME first to collect your voucher.');navigate('/profile');return}
 const r=await d.rpc('useme_claim_coupon',{p_campaign_id:c.id});
 if(r.error){alert('Unable to claim: '+r.error.message);return}
 claims.add(c.id);renderCoupons('usemePromoHomeCoupons','home');renderCoupons('usemePromoShopCoupons','shop');renderCoupons('usemePromoOffersCoupons','offers');
 alert('Voucher saved: '+c.coupon_code+'. USE ME Owner must confirm eligible discount in the final quote. No automatic checkout deduction.');
}
async function claimAll(rows){
 const d=db(),user=await db()?.auth.getUser().then(x=>x.data?.user).catch(()=>null);
 if(!d||!user){alert('Please sign in first to collect vouchers.');navigate('/profile');return}
 let count=0;
 for(const c of rows){if(claims.has(c.id))continue;const r=await d.rpc('useme_claim_coupon',{p_campaign_id:c.id});if(!r.error){claims.add(c.id);count++}}
 await loadClaims();renderCoupons('usemePromoHomeCoupons','home');renderCoupons('usemePromoShopCoupons','shop');renderCoupons('usemePromoOffersCoupons','offers');
 alert(count+' new voucher(s) saved. Owner confirmation is required before any discount applies.');
}
function renderTrending(){
 const root=$('usemePromoTrending');if(!root)return;root.replaceChildren();
 if(!allProducts.length){root.classList.add('hidden');return}root.classList.remove('hidden');
 const header=el('div','useme-promo-heading');header.append(el('h2','','🛍️ Fresh from local shops'),el('p','','Recently listed real products · actual prices'));
 const grid=el('div','useme-promo-product-grid');allProducts.slice(0,6).forEach(p=>grid.append(cardForProduct(p)));
 root.append(header,grid);
}
function productBadges(){
 const root=$('liveProducts');if(!root)return;
 root.querySelectorAll('.v3-product-card[data-product-id]').forEach(card=>{
  const id=card.dataset.productId;
  if(!card.querySelector('.useme-quick-view')){
   const b=btn('Quick view',()=>quickView(id),'useme-quick-view');
   card.querySelector('.v3-product-body')?.insertBefore(b,card.querySelector('.v3-add-cart'));
  }
  const c=promos.find(p=>p.kind==='flash'&&p.product_id===id&&live(p));
  const media=card.querySelector('.v3-product-media');
  if(c&&media&&!media.querySelector('.useme-feature-badge'))media.append(el('span','useme-feature-badge','⚡ FEATURED OFFER'));
 });
}
function quickView(id){
 const p=productMap.get(id);
 if(!p){navigate('/shop');return}
 const overlay=$('usemeQuickOverlay');if(!overlay)return;
 const content=$('usemeQuickContent');content.replaceChildren();
 const media=el('div','useme-quick-media'),src=productURL(p);
 if(src){const img=el('img');img.src=src;img.alt=p.name;media.append(img)}else media.append(el('span','','🛍️'));
 const details=el('div','useme-quick-details');
 details.append(el('small','','✓ '+p.shop_name),el('h2','',p.name),el('strong','',money(p.price_lkr)),el('p','',p.description||'Verified USE ME merchant product.'),el('small','',p.stock+' in stock'));
 details.append(btn('+ Add to cart',()=>{overlay.hidden=true;if(typeof addLiveCart==='function')addLiveCart(p)},'useme-promo-primary'));
 content.append(media,details);overlay.hidden=false;
 const close=$('usemeQuickClose');close?.focus();
}
function popup(){
 const items=promos.filter(p=>p.kind==='popup'&&live(p)&&p.slots?.some(s=>['home','shop'].includes(s)));
 if(!items.length||!($('home')?.classList.contains('active')||$('buy')?.classList.contains('active')))return;
 const c=items[0];const flag='useme-campaign-seen-'+c.id;
 try{if(sessionStorage.getItem(flag))return;sessionStorage.setItem(flag,'yes')}catch(e){}
 if(popupTimer)clearTimeout(popupTimer);
 popupTimer=setTimeout(()=>{
  const overlay=$('usemePromoPopup');if(!overlay)return;
  const body=$('usemePromoPopupBody');body.replaceChildren();
  body.append(el('small','','USE ME PROMOTION'),el('h2','',c.title),el('p','',c.subtitle),action(c,c.cta_label));
  overlay.hidden=false;
 },4500);
}
function renderAll(){
 clearTimers();
 renderCarousel('usemePromoHomeCarousel','home');renderCarousel('usemePromoShopCarousel','shop');
 renderTicker('usemePromoHomeTicker','home');renderTicker('usemePromoShopTicker','shop');
 renderTrust();renderShortcuts();
 renderFlash('usemePromoHomeFlash','home');renderFlash('usemePromoShopFlash','shop');renderFlash('usemePromoOffersFlash','offers');
 renderCollections('usemePromoHomeCollections','home');renderCollections('usemePromoShopCollections','shop');
 renderCoupons('usemePromoHomeCoupons','home');renderCoupons('usemePromoShopCoupons','shop');renderCoupons('usemePromoOffersCoupons','offers');
 renderTrending();productBadges();popup();
}
async function loadPublic(){
 const d=db();if(!d)return;
 const result=await d.from('useme_campaigns').select('*').order('priority',{ascending:true}).limit(160);
 if(result.error){setMessage('usemePromoHomeCarousel','Promotions temporarily unavailable. Browse the shop normally.');return}
 promos=(result.data||[]).filter(live);
 await Promise.allSettled([fetchProducts(),loadClaims()]);
 renderAll();
}
function ownerStatus(str){setMessage('usemeCampaignStatus',str)}
function dateLocal(v){if(!v)return '';const x=new Date(v);if(Number.isNaN(x.getTime()))return '';const z=new Date(x.getTime()-x.getTimezoneOffset()*60000);return z.toISOString().slice(0,16)}
function dateValue(v){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString()}
async function loadAdmin(){
 if(!$('usemeCampaignManager')||!db())return;
 const role=await db().rpc('is_owner');
 if(role.error||role.data!==true){ownerStatus('Only the verified USE ME Owner can manage advertisements.');return}
 adminReady=true;ownerStatus('Loading your live advertising campaigns...');
 const [r,s,p]=await Promise.all([
  db().from('useme_campaigns').select('*').order('created_at',{ascending:false}).limit(200),
  db().from('shops').select('id,name').eq('status','approved').limit(100),
  db().from('products').select('id,name,shop_id,price_lkr,stock,active').limit(160)
 ]);
 if(r.error){ownerStatus('Unable to load campaigns: '+r.error.message);return}
 ownerRows=r.data||[];
 const shopMap=new Map((s.data||[]).map(x=>[x.id,x.name]));
 ownerProducts=(p.data||[]).filter(x=>x.active&&shopMap.has(x.shop_id)).map(x=>({...x,shop_name:shopMap.get(x.shop_id)}));
 fillProductOptions();renderAdmin();
 ownerStatus(ownerRows.length+' campaigns loaded · changes are saved to Supabase.');
}
function fillProductOptions(){
 const select=$('usemeCampaignProduct');if(!select)return;
 const selected=select.value;select.replaceChildren();
 const none=el('option','','No linked product');none.value='';select.append(none);
 ownerProducts.forEach(p=>{const o=el('option','',p.name+' · '+p.shop_name+' · '+money(p.price_lkr)+' · stock '+p.stock);o.value=p.id;select.append(o)});
 select.value=selected;
}
function formData(){
 const get=id=>($(id)?.value||'').trim();
 const kind=get('usemeCampaignKind'),title=get('usemeCampaignTitle');
 const item={
  kind,title,subtitle:get('usemeCampaignSubtitle'),badge:get('usemeCampaignBadge'),
  sponsor:get('usemeCampaignSponsor'),cta_label:get('usemeCampaignCTA')||'Explore now',
  link_path:get('usemeCampaignLink')||'/shop',priority:Math.round(Number(get('usemeCampaignPriority')||50)),
  starts_at:dateValue(get('usemeCampaignStart'))||new Date().toISOString(),
  ends_at:dateValue(get('usemeCampaignEnd')),
  slots:[...document.querySelectorAll('input[name="usemeCampaignSlot"]:checked')].map(x=>x.value),
  active:!!$('usemeCampaignActive')?.checked,animation:!!$('usemeCampaignAnimate')?.checked,
  product_id:get('usemeCampaignProduct')||null,
  coupon_code:kind==='coupon'?get('usemeCampaignCode').toUpperCase():null,
  discount_type:kind==='coupon'?get('usemeCampaignDiscountType'):null,
  discount_value:kind==='coupon'?Number(get('usemeCampaignDiscount')||0):0,
  min_order_lkr:kind==='coupon'?Number(get('usemeCampaignMinOrder')||0):0,
  max_claims:kind==='coupon'&&get('usemeCampaignMaxClaims')?Number(get('usemeCampaignMaxClaims')):null
 };
 if(!['banner','ad','ticker','flash','coupon','collection','popup'].includes(kind))throw Error('Choose a valid campaign type.');
 if(title.length<3||title.length>110)throw Error('Title must be 3–110 characters.');
 if(!linkOK(item.link_path))throw Error('Target must be an internal USE ME URL such as /shop, /send or /shop?category=Beauty.');
 if(!item.slots.length)throw Error('Select at least one display location.');
 if(item.ends_at&&new Date(item.ends_at)<=new Date(item.starts_at))throw Error('Campaign end must be after start.');
 if(kind==='ad'&&item.sponsor.length<2)throw Error('Sponsored ads must identify the sponsor.');
 if(kind==='flash'&&(!item.product_id||!item.ends_at))throw Error('Flash deal must link a real product and have an end time.');
 if(kind==='coupon'&&(!/^[A-Z0-9_-]{4,24}$/.test(item.coupon_code)||item.discount_value<=0||(item.discount_type==='percent'&&item.discount_value>100)))throw Error('Voucher code and savings must be valid.');
 if(!Number.isInteger(item.priority)||item.priority<0||item.priority>1000)throw Error('Priority must be between 0 and 1000.');
 return item;
}
function resetForm(){
 editId=null;$('usemeCampaignForm')?.reset();
 $('usemeCampaignStart').value=dateLocal(new Date().toISOString());
 $('usemeCampaignPriority').value='50';$('usemeCampaignCTA').value='Explore now';$('usemeCampaignLink').value='/shop';
 $('usemeCampaignAnimate').checked=true;
 document.querySelectorAll('input[name="usemeCampaignSlot"]').forEach(x=>x.checked=x.value==='home'||x.value==='shop');
 $('usemeCampaignSave').textContent='Publish / Save Campaign';$('usemeCampaignCancel').hidden=true;
 $('usemeCampaignFile').value='';updateKind();previewCampaign();
}
function editCampaign(c){
 editId=c.id;
 const pairs={usemeCampaignKind:c.kind,usemeCampaignTitle:c.title,usemeCampaignSubtitle:c.subtitle,usemeCampaignBadge:c.badge,
  usemeCampaignSponsor:c.sponsor,usemeCampaignCTA:c.cta_label,usemeCampaignLink:c.link_path,
  usemeCampaignPriority:c.priority,usemeCampaignStart:dateLocal(c.starts_at),usemeCampaignEnd:dateLocal(c.ends_at),
  usemeCampaignProduct:c.product_id||'',usemeCampaignCode:c.coupon_code||'',usemeCampaignDiscountType:c.discount_type||'fixed',
  usemeCampaignDiscount:c.discount_value,usemeCampaignMinOrder:c.min_order_lkr,usemeCampaignMaxClaims:c.max_claims||''};
 Object.entries(pairs).forEach(([id,value])=>{const input=$(id);if(input)input.value=value==null?'':String(value)});
 $('usemeCampaignActive').checked=!!c.active;$('usemeCampaignAnimate').checked=!!c.animation;
 document.querySelectorAll('input[name="usemeCampaignSlot"]').forEach(x=>x.checked=c.slots?.includes(x.value));
 $('usemeCampaignSave').textContent='Update Campaign';$('usemeCampaignCancel').hidden=false;
 $('usemeCampaignFile').value='';updateKind();previewCampaign();
 $('usemeCampaignForm')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function updateKind(){
 const v=$('usemeCampaignKind')?.value;
 ['usemeCampaignCouponFields','usemeCampaignSponsorFields'].forEach(id=>{if($(id))$(id).hidden=id==='usemeCampaignCouponFields'?v!=='coupon':v!=='ad'});
 if($('usemeCampaignProductLabel'))$('usemeCampaignProductLabel').hidden=!['flash','collection','banner','ad'].includes(v);
}
function previewCampaign(){
 const node=$('usemeCampaignPreview');if(!node)return;node.replaceChildren();
 const card=el('div','useme-campaign-preview');
 const heading=el('span','',($('usemeCampaignBadge')?.value||'USE ME SPECIAL'));
 card.append(heading,el('h3','',($('usemeCampaignTitle')?.value||'Your campaign title')),el('p','',($('usemeCampaignSubtitle')?.value||'Your campaign description')));
 card.append(el('b','',($('usemeCampaignCTA')?.value||'Explore now')+' →'));
 node.append(card);
}
async function uploadImage(file){
 if(!file)return null;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5242880||file.size<1)throw Error('Banner photo must be JPG, PNG or WebP under 5 MB.');
 const ext=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp';
 const name='campaigns/'+crypto.randomUUID()+'.'+ext;
 const r=await db().storage.from('useme-campaign-images').upload(name,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
 if(r.error)throw Error('Banner upload failed: '+r.error.message);
 return name;
}
async function saveCampaign(ev){
 ev.preventDefault();if(!adminReady)return;
 const submit=$('usemeCampaignSave');submit.disabled=true;
 try{
  const values=formData(),prev=ownerRows.find(x=>x.id===editId);
  values.image_path=prev?.image_path||null;
  const file=$('usemeCampaignFile')?.files?.[0];
  if(file){ownerStatus('Uploading original banner artwork...');values.image_path=await uploadImage(file)}
  let result;
  if(editId){ownerStatus('Saving campaign edits...');result=await db().from('useme_campaigns').update({...values,updated_at:new Date().toISOString()}).eq('id',editId).select('id').single()}
  else{const user=await db().auth.getUser();result=await db().from('useme_campaigns').insert({...values,created_by:user.data?.user?.id||null}).select('id').single()}
  if(result.error)throw Error(result.error.message);
  ownerStatus('✓ Campaign saved successfully. Public promotions will update shortly.');resetForm();
  await Promise.all([loadAdmin(),loadPublic()]);
 }catch(e){ownerStatus('Could not save: '+e.message)}
 finally{submit.disabled=false}
}
async function toggleCampaign(c){
 const ok=await db().rpc('is_owner');if(ok.data!==true)return ownerStatus('Owner access required.');
 const r=await db().from('useme_campaigns').update({active:!c.active,updated_at:new Date().toISOString()}).eq('id',c.id);
 if(r.error){ownerStatus('Could not change status: '+r.error.message);return}
 await Promise.all([loadAdmin(),loadPublic()]);
}
async function deleteCampaign(c){
 if(!confirm('Delete the '+c.kind+' campaign "'+c.title+'"? This cannot be undone.'))return;
 const r=await db().from('useme_campaigns').delete().eq('id',c.id);
 if(r.error){ownerStatus('Delete failed: '+r.error.message);return}
 ownerStatus('Campaign deleted.');await Promise.all([loadAdmin(),loadPublic()]);
}
function renderAdmin(){
 const box=$('usemeCampaignList');if(!box)return;box.replaceChildren();
 const active=ownerRows.filter(x=>live(x)).length,scheduled=ownerRows.filter(x=>x.active&&new Date(x.starts_at)>new Date()).length;
 setMessage('usemeCampaignStats',ownerRows.length+' campaigns · '+active+' live · '+scheduled+' scheduled');
 if(!ownerRows.length){box.append(el('p','','No campaigns. Create your first USE ME banner above.'));return}
 ownerRows.forEach(c=>{
  const article=el('article','useme-owner-campaign-card');
  const image=el('div','useme-owner-campaign-thumb');const src=imageURL(c.image_path);
  if(src){const img=el('img');img.src=src;img.alt='';img.loading='lazy';image.append(img)}else image.textContent=c.kind==='coupon'?'🎟️':c.kind==='flash'?'⚡':'📢';
  const details=el('div','useme-owner-campaign-details');
  const status=live(c)?'LIVE':c.active&&(new Date(c.starts_at)>new Date())?'SCHEDULED':c.active&&c.ends_at&&new Date(c.ends_at)<=new Date()?'EXPIRED':'DRAFT / PAUSED';
  details.append(el('small','',kindText[c.kind]+' · '+status),el('h4','',c.title),el('p','',c.subtitle));
  const summary=el('small','',(c.slots||[]).join(', ')+' · '+(c.ends_at?'Ends '+new Date(c.ends_at).toLocaleString():'No expiry'));
  details.append(summary);
  const actions=el('div','useme-owner-campaign-actions');
  actions.append(btn('Edit',()=>editCampaign(c),'useme-owner-action'),btn(c.active?'Pause':'Activate',()=>toggleCampaign(c),'useme-owner-action'),btn('Delete',()=>deleteCampaign(c),'useme-owner-danger'));
  details.append(actions);article.append(image,details);box.append(article);
 });
}
function attachOwner(){
 const form=$('usemeCampaignForm');if(!form||form.dataset.bound)return;
 form.dataset.bound='yes';form.addEventListener('submit',saveCampaign);
 ['usemeCampaignKind','usemeCampaignTitle','usemeCampaignSubtitle','usemeCampaignBadge','usemeCampaignCTA'].forEach(id=>{
  $(id)?.addEventListener('input',()=>{if(id==='usemeCampaignKind')updateKind();previewCampaign()});
 });
 $('usemeCampaignCancel')?.addEventListener('click',resetForm);
 $('usemeCampaignRefresh')?.addEventListener('click',loadAdmin);
 document.querySelector('[data-owner-tab="promotions"]')?.addEventListener('click',()=>setTimeout(loadAdmin,0));
 resetForm();
 const ownerPanel=$('ownerControlPanel');
 if(ownerPanel){new MutationObserver(()=>{if(!ownerPanel.classList.contains('hidden')&&document.querySelector('[data-owner-tab="promotions"]')?.classList.contains('selected'))loadAdmin()}).observe(ownerPanel,{attributes:true,attributeFilter:['class']})}
}
function attachQuickObserver(){
 const root=$('liveProducts');if(!root)return;
 let scheduled=false;
 new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;productBadges()})}).observe(root,{childList:true});
 productBadges();
}
function start(){
 $('usemeQuickClose')?.addEventListener('click',()=>{$('usemeQuickOverlay').hidden=true});
 $('usemeQuickOverlay')?.addEventListener('click',e=>{if(e.target===$('usemeQuickOverlay'))e.currentTarget.hidden=true});
 $('usemePromoPopupClose')?.addEventListener('click',()=>{$('usemePromoPopup').hidden=true});
 $('usemePromoPopup')?.addEventListener('click',e=>{if(e.target===$('usemePromoPopup'))e.currentTarget.hidden=true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if($('usemeQuickOverlay'))$('usemeQuickOverlay').hidden=true;if($('usemePromoPopup'))$('usemePromoPopup').hidden=true}});
 attachOwner();attachQuickObserver();
 if(db()){loadPublic().catch(e=>console.warn('Promotions unavailable:',e));if(!pollingTimer)pollingTimer=setInterval(()=>{if(!document.hidden)loadPublic()},60000);
  db().auth.onAuthStateChange(()=>setTimeout(()=>{loadClaims().then(()=>{renderCoupons('usemePromoHomeCoupons','home');renderCoupons('usemePromoShopCoupons','shop')})},100));
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.usemePromoRefresh=loadPublic;
window.usemePromoQuickView=quickView;
})();