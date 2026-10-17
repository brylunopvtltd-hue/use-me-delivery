/* USE ME V8 Phase 1-6: genuinely new private customer and owner workflows.
   Order management, pricing, seller permissions and promotions remain untouched. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const db=()=>typeof usemeDb!=='undefined'?usemeDb:null;
const node=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n};
const button=(label,fn,cls)=>{const b=node('button',cls||'v8-btn',label);b.type='button';b.addEventListener('click',fn);return b};
const fmt=n=>'LKR '+Number(n||0).toLocaleString('en-LK',{minimumFractionDigits:0,maximumFractionDigits:2});
const status=(id,msg)=>{if($(id))$(id).textContent=msg};
const uuid=x=>/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(String(x||''));
let signedUser=null, saved=new Set(),recent=[],inventory=[],allProductMap=new Map(),shopsMap=new Map(),myWallet=null;
const goTo=(page)=>typeof go==='function'?go(page):location.assign(page==='buy'?'/shop':'/'+page);
async function me(){if(!db())return null;try{const r=await db().auth.getUser();signedUser=r.data?.user||null;return signedUser}catch(e){return null}}
async function ensureUser(){const u=await me();if(!u){alert('Sign in to your USE ME account first.');goTo('account')}return u}
async function owner(){const u=await me();if(!u||!db())return false;const r=await db().rpc('is_owner');return r.data===true&&!r.error}
async function productData(ids){
 ids=[...new Set(ids)].filter(uuid).slice(0,150);
 if(!ids.length||!db())return [];
 const [pr,shops]=await Promise.all([db().from('products').select('id,shop_id,name,price_lkr,stock,active,image_path,category,description').in('id',ids),
 db().from('shops').select('id,name,status').limit(200)]);
 if(pr.error||shops.error)return [];
 shopsMap=new Map((shops.data||[]).filter(s=>s.status==='approved').map(s=>[s.id,s.name]));
 return (pr.data||[]).filter(p=>p.active&&shopsMap.has(p.shop_id)).map(p=>({...p,shop_name:shopsMap.get(p.shop_id)}));
}
function productCard(p,extra){
 const card=node('article','v8-product');
 const media=node('div','v8-product-img'),photo=typeof productImageUrl==='function'?productImageUrl(p.image_path):null;
 if(photo){const im=node('img');im.loading='lazy';im.src=photo;im.alt=p.name;media.append(im)}else media.append(node('span','','🛍️'));
 const body=node('div','v8-product-body');
 body.append(node('small','',p.shop_name||'Approved shop'),node('h3','',p.name),node('b','',fmt(p.price_lkr)),node('small','',Number(p.stock)>0?p.stock+' in stock':'Out of stock'));
 const actions=node('div','v8-product-actions');
 actions.append(button('View',()=>openProduct(p),'v8-soft'));
 if(extra)actions.append(button('♥ Remove',()=>toggleSave(p.id),'v8-soft'));
 else actions.append(button('+ Cart',()=>{if(p.stock>0&&typeof addLiveCart==='function')addLiveCart(p)},'v8-primary'));
 body.append(actions);card.append(media,body);return card;
}
function openProduct(p){
 trackViewed(p.id);
 if(typeof usemePromoQuickView==='function')usemePromoQuickView(p.id);
 else goTo('buy');
}
async function refreshSaved(){
 const root=$('v8SavedList'),recentRoot=$('v8RecentList');if(!root||!recentRoot||!db())return;
 const u=await me();
 root.replaceChildren();recentRoot.replaceChildren();
 if(!u){root.append(node('p','v8-note','Sign in to save products across devices.'));recentRoot.append(node('p','v8-note','Recently viewed products are private to your account.'));return}
 const [f,v]=await Promise.all([db().from('useme_v8_saved_products').select('product_id,created_at').eq('user_id',u.id).order('created_at',{ascending:false}).limit(120),
 db().from('useme_v8_recent_products').select('product_id,viewed_at').eq('user_id',u.id).order('viewed_at',{ascending:false}).limit(30)]);
 if(f.error||v.error){root.textContent='Saved products could not be loaded. Try again.';return}
 saved=new Set((f.data||[]).map(x=>x.product_id));recent=(v.data||[]).map(x=>x.product_id);
 const list=await productData([...saved,...recent]);
 allProductMap=new Map(list.map(p=>[p.id,p]));
 function fill(container,ids,hasRemove){
  const items=ids.map(id=>allProductMap.get(id)).filter(Boolean);
  if(!items.length){container.append(node('p','v8-note',hasRemove?'No saved products yet. Tap ♥ on any real product in Shop.':'No recently viewed products yet.'));return}
  const grid=node('div','v8-product-grid');items.forEach(p=>grid.append(productCard(p,hasRemove)));container.append(grid);
 }
 fill(root,[...saved],true);fill(recentRoot,recent,false);paintHearts();
}
async function toggleSave(id){
 if(!uuid(id))return;const u=await ensureUser();if(!u)return;
 let r;
 if(saved.has(id))r=await db().from('useme_v8_saved_products').delete().eq('user_id',u.id).eq('product_id',id);
 else r=await db().from('useme_v8_saved_products').insert({user_id:u.id,product_id:id});
 if(r.error){alert('Could not update saved products: '+r.error.message);return}
 if(saved.has(id))saved.delete(id);else saved.add(id);
 paintHearts();
 if($('saved')?.classList.contains('active'))refreshSaved();
}
function paintHearts(){
 const root=$('liveProducts');if(!root)return;
 root.querySelectorAll('.v3-product-card[data-product-id]').forEach(card=>{
  const id=card.dataset.productId,media=card.querySelector('.v3-product-media');
  if(!media)return;
  let heart=media.querySelector('.v8-favorite');
  if(!heart){heart=button('♡',()=>toggleSave(id),'v8-favorite');heart.setAttribute('aria-label','Save product');media.append(heart)}
  heart.textContent=saved.has(id)?'♥':'♡';
  heart.setAttribute('aria-pressed',String(saved.has(id)));
  heart.title=saved.has(id)?'Remove from saved products':'Save product';
 });
}
async function trackViewed(id){
 if(!uuid(id)||!db())return;const u=await me();if(!u)return;
 await db().from('useme_v8_recent_products').upsert({user_id:u.id,product_id:id,viewed_at:new Date().toISOString()},{onConflict:'user_id,product_id'});
}
async function personalized(){
 const root=$('v8Personalized');if(!root||!db())return;
 root.replaceChildren();
 const u=await me();if(!u){root.append(node('p','v8-note','Sign in to get recommendations based on your recently viewed categories.'));return}
 const rec=await db().from('useme_v8_recent_products').select('product_id').eq('user_id',u.id).order('viewed_at',{ascending:false}).limit(5);
 const seen=await productData((rec.data||[]).map(x=>x.product_id));
 const categories=new Set(seen.map(p=>p.category).filter(Boolean));
 const shops=await db().from('shops').select('id,name').eq('status','approved').limit(200);
 if(shops.error||!shops.data?.length)return;
 const map=new Map(shops.data.map(x=>[x.id,x.name]));
 const r=await db().from('products').select('id,shop_id,name,price_lkr,stock,active,image_path,category,description')
 .in('shop_id',[...map.keys()]).eq('active',true).gt('stock',0).limit(80);
 if(r.error)return;
 const candidates=(r.data||[]).filter(x=>map.has(x.shop_id)&&!(rec.data||[]).some(v=>v.product_id===x.id));
 candidates.sort((a,b)=>Number(categories.has(b.category))-Number(categories.has(a.category)));
 const result=candidates.slice(0,6).map(x=>({...x,shop_name:map.get(x.shop_id)}));
 if(!result.length){root.append(node('p','v8-note','New verified products will appear here.'));return}
 const grid=node('div','v8-product-grid');result.forEach(p=>grid.append(productCard(p,false)));root.append(grid);
}
async function loadWallet(){
 const root=$('v8WalletCard');if(!root||!db())return;
 root.replaceChildren();
 const u=await me();if(!u){root.append(node('p','v8-note','Sign in to see USE ME Coins and your referral code.'));return}
 const r=await db().rpc('useme_v8_my_wallet');
 if(r.error){root.append(node('p','v8-note','Coins temporarily unavailable: '+r.error.message));return}
 myWallet=r.data;
 const sum=node('div','v8-coin-summary');
 sum.append(node('span','v8-coin-icon','🪙'),node('b','',String(myWallet.coins||0)+' USE ME Coins'));
 root.append(sum,node('p','v8-note','Earn on qualifying delivered orders. Coins are loyalty points with no cash value; redemptions are not active.'));
 const code=node('div','v8-copy-code');code.append(node('strong','',myWallet.code),button('Copy code',()=>{navigator.clipboard?.writeText(myWallet.code).then(()=>status('v8WalletMsg','Referral code copied')).catch(()=>status('v8WalletMsg','Select the code and copy it manually.'))},'v8-primary'));root.append(code);
 const rform=$('v8ReferralForm');if(rform)rform.classList.toggle('hidden',!myWallet.referral_enabled);
 status('v8WalletMsg','Invite friends before their first order. Bonus coins are awarded only after their first qualifying delivered order.');
 const c=await db().from('useme_v8_coin_events').select('amount,kind,detail,created_at').eq('user_id',u.id).order('created_at',{ascending:false}).limit(12);
 const events=$('v8WalletEvents');if(events){events.replaceChildren();if(!c.error&&(c.data||[]).length)(c.data||[]).forEach(e=>events.append(node('div','v8-history-item','+'+e.amount+' coins · '+e.detail+' · '+new Date(e.created_at).toLocaleDateString())));else events.append(node('p','v8-note','No Coins earned yet.'))}
}
async function applyReferral(e){
 e.preventDefault();if(!await ensureUser())return;const code=$('v8FriendCode')?.value.trim().toUpperCase();if(!code)return;
 const r=await db().rpc('useme_v8_apply_referral',{p_code:code});status('v8WalletMsg',r.error?'Referral not applied: '+r.error.message:'✓ Referral recorded. Bonus applies after your first qualifying delivered order.');
}
async function loadCustomerDelivery(){
 const root=$('v8CustomerOrderPick');if(!root||!db())return;
 root.replaceChildren();const u=await me();if(!u){root.append(node('option','','Sign in first'));return}
 const r=await db().from('orders').select('id,status,service_type').eq('customer_id',u.id).in('status',['accepted','preparing','ready','out_for_delivery']).order('created_at',{ascending:false}).limit(60);
 if(r.error){root.append(node('option','','Unable to load orders'));return}
 if(!(r.data||[]).length){root.append(node('option','','No accepted delivery orders'));return}
 (r.data||[]).forEach(o=>{const p=node('option','',o.service_type+' · '+o.id.slice(0,8)+' · '+o.status);p.value=o.id;root.append(p)});
}
async function issueDeliveryPin(){
 if(!await ensureUser())return;const id=$('v8CustomerOrderPick')?.value;if(!uuid(id))return status('v8DeliveryPinResult','Choose a valid active order.');
 const r=await db().rpc('useme_v8_customer_delivery_pin',{p_order_id:id});
 const result=$('v8DeliveryPinResult');result.replaceChildren();
 if(r.error){result.textContent='Could not generate OTP: '+r.error.message;return}
 result.append(node('p','','Your private six-digit delivery code:'));
 const code=node('strong','v8-big-pin',r.data.pin);result.append(code,node('p','v8-note','Expires in 1 hour. Show only to USE ME Owner when receiving the package. A new code replaces the old one.'));
}
async function loadOwnerDelivery(){
 if(!await owner())return;
 const picker=$('v8OwnerDeliveryOrder');picker.replaceChildren();
 const r=await db().from('orders').select('id,status,service_type').in('status',['accepted','preparing','ready','out_for_delivery']).order('created_at',{ascending:false}).limit(80);
 if(r.error){status('v8OwnerDeliveryMsg','Could not load orders');return}
 if(!(r.data||[]).length){picker.append(node('option','','No active accepted orders'));return}
 for(const o of r.data){const x=node('option','',o.service_type+' · '+o.id.slice(0,8)+' · '+o.status);x.value=o.id;picker.append(x)}
}
async function verifyOwnerPin(e){
 e.preventDefault();if(!await owner())return;
 const id=$('v8OwnerDeliveryOrder')?.value,pin=$('v8OwnerPinInput')?.value.trim();
 if(!uuid(id))return status('v8OwnerDeliveryMsg','Select an active order first');
 const r=await db().rpc('useme_v8_owner_verify_delivery',{p_order_id:id,p_pin:pin});
 status('v8OwnerDeliveryMsg',r.error?'Verification error: '+r.error.message:r.data.status==='verified'?'✓ Customer delivery OTP verified. Order status is unchanged.':(r.data.message||r.data.status));
 $('v8OwnerPinInput').value='';
}
async function loadSellerInventory(){
 const root=$('v8SellerInventory');if(!root||!db())return;root.replaceChildren();
 const u=await me();if(!u){root.append(node('p','v8-note','Sign in to see inventory alerts.'));return}
 const shops=await db().from('shops').select('id,name,status').eq('owner_id',u.id).limit(80);
 if(shops.error||!shops.data?.length){root.append(node('p','v8-note','No shop associated with this signed-in account.'));return}
 const shopIds=(shops.data||[]).filter(s=>s.status==='approved').map(x=>x.id);
 if(!shopIds.length){root.append(node('p','v8-note','Your approved shop products will appear here.'));return}
 const r=await db().from('products').select('id,shop_id,name,stock,price_lkr,active').in('shop_id',shopIds).order('stock',{ascending:true}).limit(300);
 if(r.error){root.textContent='Inventory not available: '+r.error.message;return}
 inventory=r.data||[];
 const names=new Map(shops.data.map(x=>[x.id,x.name]));
 const count=inventory.filter(p=>p.active&&p.stock<=3).length;
 root.append(node('p','v8-statline',inventory.length+' products · '+count+' low-stock items (3 units or fewer)'));
 if(!count){root.append(node('p','v8-note','No currently published items are low in stock.'));return}
 const list=node('div','v8-inventory-list');
 inventory.filter(p=>p.active&&p.stock<=3).forEach(p=>{const item=node('div','v8-inventory-item');item.append(node('b','',p.name),node('small','',names.get(p.shop_id)+' · '+(p.stock===0?'Out of stock':p.stock+' left')));list.append(item)});
 root.append(list);
}
function downloadStock(){
 if(!inventory.length)return alert('Load your shop inventory first.');
 const rows=[['Product','Shop ID','Stock','Price LKR','Published'],...inventory.map(p=>[p.name,p.shop_id,p.stock,p.price_lkr,p.active?'Yes':'No'])];
 const safe=v=>{let s=String(v??'');if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
 const csv='\ufeff'+rows.map(r=>r.map(safe).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=node('a');a.href=url;a.download='useme-my-shop-inventory.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function loadB2B(){
 const root=$('v8MyB2BRequests');if(!root||!db())return;root.replaceChildren();
 const u=await me();if(!u){root.append(node('p','v8-note','Sign in to track your wholesale requests.'));return}
 const r=await db().from('useme_v8_b2b_requests').select('id,product_query,quantity,unit,state,quote_total_lkr,owner_note,created_at')
 .eq('buyer_id',u.id).order('created_at',{ascending:false}).limit(30);
 if(r.error){root.textContent='Could not load requests: '+r.error.message;return}
 if(!(r.data||[]).length){root.append(node('p','v8-note','No B2B requests submitted yet.'));return}
 r.data.forEach(x=>{
  const row=node('div','v8-request-row');row.append(node('b','',x.product_query+' · '+x.quantity+' '+x.unit),
  node('small','',x.state.toUpperCase()+(x.quote_total_lkr!=null?' · Owner quote '+fmt(x.quote_total_lkr):'')),
  node('p','',x.owner_note||'USE ME will review and contact you.'));root.append(row);
 });
}
async function submitB2B(e){
 e.preventDefault();const u=await ensureUser();if(!u)return;
 const get=id=>$(id)?.value.trim()||'';
 const body={buyer_id:u.id,product_query:get('v8RFQProduct'),quantity:Number(get('v8RFQQty')),
 unit:get('v8RFQUnit'),delivery_area:get('v8RFQArea'),budget_lkr:get('v8RFQBudget')?Number(get('v8RFQBudget')):null,requirements:get('v8RFQNotes')};
 const b=$('v8RFQSubmit');b.disabled=true;
 const r=await db().from('useme_v8_b2b_requests').insert(body);
 b.disabled=false;status('v8RFQStatus',r.error?'Request not submitted: '+r.error.message:'✓ Real B2B request saved securely. USE ME Owner will review it; this is not a supplier booking.');
 if(!r.error){$('v8RFQRealForm').reset();loadB2B()}
}
async function loadOwnerB2B(){
 if(!await owner())return;
 const root=$('v8OwnerB2BList');root.replaceChildren();
 const r=await db().from('useme_v8_b2b_requests').select('id,product_query,quantity,unit,delivery_area,budget_lkr,state,owner_note,quote_total_lkr,created_at').order('created_at',{ascending:false}).limit(80);
 if(r.error){root.textContent='Could not load B2B requests: '+r.error.message;return}
 if(!r.data?.length){root.append(node('p','v8-note','No real wholesale requests have been submitted.'));return}
 r.data.forEach(req=>{
  const row=node('article','v8-owner-b2b-card');
  row.append(node('h3','',req.product_query+' · '+req.quantity+' '+req.unit),
   node('p','',req.delivery_area+(req.budget_lkr!=null?' · Budget '+fmt(req.budget_lkr):'')));
  const state=node('select');['pending','reviewing','quoted','closed','cancelled'].forEach(x=>{const o=node('option','',x);o.value=x;state.append(o)});state.value=req.state;
  const price=node('input');price.type='number';price.min='0';price.step='0.01';price.placeholder='Owner quote LKR';price.value=req.quote_total_lkr??'';
  const notes=node('textarea');notes.maxLength=1500;notes.placeholder='Owner notes shown to requester';notes.value=req.owner_note||'';
  const save=button('Save B2B Update',async()=>{
   const patch={state:state.value,owner_note:notes.value.trim(),quote_total_lkr:price.value?Number(price.value):null,updated_at:new Date().toISOString()};
   save.disabled=true;const r=await db().from('useme_v8_b2b_requests').update(patch).eq('id',req.id);save.disabled=false;
   status('v8OwnerB2BStatus',r.error?'Could not save: '+r.error.message:'✓ B2B request updated and status notification queued.');if(!r.error)loadOwnerB2B();
  },'v8-primary');
  row.append(state,price,notes,save);root.append(row);
 });
}
async function loadFinance(){
 if(!await owner())return;
 const stats=$('v8FinanceStats'),list=$('v8FinanceHistory');stats.replaceChildren();list.replaceChildren();
 const [costs,receipts,orders,settings]=await Promise.all([
  db().from('useme_v8_business_costs').select('id,amount_lkr,kind,note,expense_date,order_id').order('expense_date',{ascending:false}).limit(500),
  db().from('useme_v8_cash_receipts').select('id,amount_lkr,method,note,received_date,order_id').order('received_date',{ascending:false}).limit(500),
  db().from('orders').select('id,status,final_items_subtotal_lkr,final_delivery_fee_lkr,items_subtotal_lkr,delivery_fee_lkr').eq('status','delivered').limit(500),
  db().from('useme_v8_reward_settings').select('*').eq('id',1).single()
 ]);
 if(costs.error||receipts.error||orders.error){stats.textContent='Private financial data could not be loaded.';return}
 const totalCost=(costs.data||[]).reduce((sum,x)=>sum+Number(x.amount_lkr),0);
 const collected=(receipts.data||[]).reduce((sum,x)=>sum+Number(x.amount_lkr),0);
 const quoted=(orders.data||[]).reduce((sum,x)=>sum+Number(x.final_items_subtotal_lkr??x.items_subtotal_lkr)+Number(x.final_delivery_fee_lkr??x.delivery_fee_lkr),0);
 const cards=[['Recorded cash received',fmt(collected)],['Recorded expenses',fmt(totalCost)],['Recorded difference',fmt(collected-totalCost)],['Delivered order quotations',fmt(quoted)]];
 cards.forEach(([name,val])=>{const c=node('div','v8-finance-card');c.append(node('small','',name),node('strong','',val));stats.append(c)});
 status('v8FinanceNote','Financial figures cover up to 500 recent entries per list. Recorded difference is NOT certified net profit: unrecorded costs, cash and tax are excluded. Delivered order quotes are not proof of payment.');
 (receipts.data||[]).slice(0,12).forEach(x=>list.append(node('div','v8-history-item','Received '+fmt(x.amount_lkr)+' · '+x.method+' · '+x.received_date+(x.note?' · '+x.note:''))));
 (costs.data||[]).slice(0,12).forEach(x=>list.append(node('div','v8-history-item','Expense '+fmt(x.amount_lkr)+' · '+x.kind+' · '+x.expense_date+(x.note?' · '+x.note:''))));
 if(!list.childElementCount)list.append(node('p','v8-note','No confirmed cash/expense entries recorded. Enter actual transactions only.'));
 if(!settings.error&&settings.data){
  for(const [id,key] of [['v8RewardOn','earn_enabled'],['v8ReferralOn','referral_enabled']])if($(id))$(id).checked=!!settings.data[key];
 }
}
async function financeSubmit(e,which){
 e.preventDefault();if(!await owner())return;
 const cost=which==='cost';const amount=Number($(cost?'v8ExpenseAmount':'v8ReceiptAmount').value);
 if(!(amount>0&&amount<100000000))return status('v8FinanceSaveStatus','Amount must be a positive LKR value.');
 const table=cost?'useme_v8_business_costs':'useme_v8_cash_receipts';
 const body=cost?{amount_lkr:amount,kind:$('v8ExpenseKind').value,note:$('v8ExpenseNote').value.trim()}:
 {amount_lkr:amount,method:$('v8ReceiptMethod').value,note:$('v8ReceiptNote').value.trim()};
 const orderId=$(cost?'v8ExpenseOrder':'v8ReceiptOrder')?.value.trim();if(orderId){if(!uuid(orderId))return status('v8FinanceSaveStatus','Order ID must be a full UUID or left blank');body.order_id=orderId}
 const r=await db().from(table).insert(body);
 status('v8FinanceSaveStatus',r.error?'Not saved: '+r.error.message:'✓ Verified Owner record saved.');
 if(!r.error){$(cost?'v8ExpenseForm':'v8ReceiptForm').reset();loadFinance()}
}
async function saveRewardSettings(e){
 e.preventDefault();if(!await owner())return;
 const r=await db().from('useme_v8_reward_settings').update({earn_enabled:$('v8RewardOn').checked,referral_enabled:$('v8ReferralOn').checked,updated_at:new Date().toISOString()}).eq('id',1);
 status('v8RewardSettingsStatus',r.error?'Could not update: '+r.error.message:'✓ Reward earning and referral switches saved.');
}
function formBindings(){
 $('v8ReferralForm')?.addEventListener('submit',applyReferral);
 $('v8IssuePin')?.addEventListener('click',issueDeliveryPin);
 $('v8OwnerVerifyPin')?.addEventListener('submit',verifyOwnerPin);
 $('v8SellerRefresh')?.addEventListener('click',loadSellerInventory);
 $('v8SellerCSV')?.addEventListener('click',downloadStock);
 $('v8RFQRealForm')?.addEventListener('submit',submitB2B);
 $('v8ExpenseForm')?.addEventListener('submit',e=>financeSubmit(e,'cost'));
 $('v8ReceiptForm')?.addEventListener('submit',e=>financeSubmit(e,'receipt'));
 $('v8RewardSettingsForm')?.addEventListener('submit',saveRewardSettings);
 $('v8OwnerFinanceRefresh')?.addEventListener('click',loadFinance);
 $('v8OwnerB2BRefresh')?.addEventListener('click',loadOwnerB2B);
 $('v8OwnerDeliveryRefresh')?.addEventListener('click',loadOwnerDelivery);
 for(const [tab,fn] of [['finance',loadFinance],['b2b-v8',loadOwnerB2B],['delivery-v8',loadOwnerDelivery]]){
  const x=document.querySelector('[data-owner-tab="'+tab+'"]');if(x)x.addEventListener('click',()=>setTimeout(fn,30));
 }
}
function observePages(){
 for(const [id,fn] of [['saved',refreshSaved],['seller',loadSellerInventory],['orders',loadCustomerDelivery],['b2b',loadB2B],['owner',()=>{}],['account',loadWallet]]){
  const root=$(id);if(!root)continue;
  new MutationObserver(()=>{if(root.classList.contains('active'))fn()}).observe(root,{attributes:true,attributeFilter:['class']});
 }
 const products=$('liveProducts');
 if(products){
  new MutationObserver(()=>paintHearts()).observe(products,{childList:true});
  products.addEventListener('click',e=>{const btn=e.target.closest('button.useme-quick-view');const id=btn?.closest('.v3-product-card')?.dataset.productId;if(id)trackViewed(id)});
 }
 const trending=$('usemePromoTrending');
 if(trending)trending.addEventListener('click',e=>{const b=e.target.closest('.useme-promo-product-actions button');if(b&&b.textContent.includes('View')){const card=b.closest('.useme-promo-product-card');if(card){const title=card.querySelector('h3')?.textContent;const p=[...allProductMap.values()].find(x=>x.name===title);if(p)trackViewed(p.id)}}});
}
function init(){
 if(!db())return;formBindings();observePages();
 me().then(()=>{refreshSaved();loadWallet();loadCustomerDelivery();loadB2B();personalized()});
 db().auth.onAuthStateChange(()=>setTimeout(()=>{me().then(()=>{refreshSaved();loadWallet();loadCustomerDelivery();loadB2B();personalized();paintHearts()})},400));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.usemeV8RefreshSaved=refreshSaved;
window.usemeV8LoadWallet=loadWallet;
window.usemeV8OpenProduct=openProduct;
window.usemeV8LoadInventory=loadSellerInventory;
})();