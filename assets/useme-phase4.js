/* USE ME V3 Phase 4 — authenticated order operations, owner quote control and in-app notices.
   Classic script loaded after core app. All real writes go through Supabase RLS/RPCs. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const db=()=>typeof usemeDb!=='undefined'?usemeDb:null;
const el=(tag,cls,txt)=>{
 const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e;
};
const money=v=>'LKR '+Number(v||0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=v=>v?new Date(v).toLocaleString('en-LK'):'Not available';
const titleCase=v=>String(v||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const closed=s=>s==='cancelled'||s==='delivered';
const statusNext={
 pending:['accepted','cancelled'],accepted:['preparing','ready','cancelled'],
 preparing:['ready','cancelled'],ready:['out_for_delivery','delivered','cancelled'],
 out_for_delivery:['delivered','cancelled'],delivered:[],cancelled:[]
};
let managerOrders=[],managerItems=new Map(),managerEvents=new Map(),managerShops=new Map(),managerPickups=new Map();
let phase4Busy=false,noticeUserId=null,noticeChannel=null,unreadNotifications=0;
function textStatus(id,text){const node=$(id);if(node)node.textContent=text;}
function empty(node,heading,body,callback){
 const box=el('div','v4-empty');
 box.append(el('div','v4-empty-icon','📦'),el('h3','',heading),el('p','',body));
 if(callback){const b=el('button','btn','Explore USE ME →');b.onclick=callback;box.append(b)}
 node.append(box);
}
function visible(page){return $(page)?.classList.contains('active')}

const ownerWhatsAppNumber='94752351751';
const displayStatus=status=>({
 pending:'Order received · Owner review',accepted:'Owner confirmed · Going to shop',
 preparing:'Buying products at shop',ready:'Products purchased · Ready for delivery',
 out_for_delivery:'Out for delivery',delivered:'Delivered to customer',cancelled:'Cancelled'
})[status]||titleCase(status);
function orderMessage(o,items,shop,pickup){
 const q=quoteSummary(o);
 const lines=[
  '🛍️ USE ME — CUSTOMER ORDER',
  'Order: '+o.id,
  'Date: '+date(o.created_at),
  'Shop: '+(shop?.name||'USE ME direct service'),
  'Pickup address: '+(pickup?.pickup_address||'Shop pickup address not added'),
  'Shop phone: '+(pickup?.contact_phone||'Not added'),
  pickup?.pickup_notes?'Pickup notes: '+pickup.pickup_notes:'',
  '--- PRODUCTS ---',
  ...(items.length?items.map(x=>'• '+x.product_name+' × '+x.quantity+' = '+money(Number(x.unit_price_lkr)*x.quantity)):['Service: '+titleCase(o.service_type),'Notes: '+(o.order_notes||'Not provided')]),
  '--- CUSTOMER ---',
  'Customer: '+o.recipient_name,
  'Phone: '+o.recipient_phone,
  'Delivery address: '+o.delivery_address,
  'Distance estimate: '+(o.delivery_distance_km??'N/A')+' km',
  'Items estimate: '+money(o.items_subtotal_lkr),
  'Delivery estimate: '+money(o.delivery_fee_lkr),
  'Total estimate: '+money(Number(o.items_subtotal_lkr)+Number(o.delivery_fee_lkr)),
  q.confirmed?'Confirmed total: '+money(q.items+q.fee):'Final price pending USE ME Owner confirmation',
  'Status: '+displayStatus(o.status),
  'Owner dashboard: '+location.origin+'/seller?order='+encodeURIComponent(o.id)
 ];
 return lines.filter(Boolean).join('\n');
}

function quoteSummary(o){
 if(o.quote_confirmed_at){
  return {label:'USE ME Owner-confirmed quote',items:Number(o.final_items_subtotal_lkr),fee:Number(o.final_delivery_fee_lkr),confirmed:true};
 }
 return {label:'Estimated · USE ME Owner will confirm',items:Number(o.items_subtotal_lkr||0),fee:Number(o.delivery_fee_lkr||0),confirmed:false};
}
function initUi(){
 const management=$('managementPanel');
 if(management&&!$('v4ManagerMetrics')){
  const metrics=el('div','v4-metrics');metrics.id='v4ManagerMetrics';
  const toolbar=el('div','v4-orders-toolbar');toolbar.id='v4OrdersToolbar';
  const search=el('input','','');search.id='v4OrderSearch';search.type='search';search.placeholder='Search order ID, customer, service…';
  search.setAttribute('aria-label','Search managed orders');search.addEventListener('input',renderManagerOrders);
  const filter=el('select');filter.id='v4OrderFilter';filter.setAttribute('aria-label','Filter managed orders');
  for(const v of ['all','pending','accepted','preparing','ready','out_for_delivery','delivered','cancelled']){
   const option=el('option','',v==='all'?'All statuses':titleCase(v));option.value=v;filter.append(option);
  }
  filter.addEventListener('change',renderManagerOrders);
  const refresh=el('button','btn soft','↻ Refresh');refresh.onclick=()=>window.loadManagedOrders();
  toolbar.append(search,filter,refresh);
  const summary=$('ownerSummary')?.closest('.card')||management.firstElementChild;
  if(summary)summary.insertAdjacentElement('afterend',metrics);
  const incoming=$('managedOrders');if(incoming)incoming.before(toolbar);
 }
 const notifications=$('myNotifications');
 if(notifications&&!$('v4MarkAll')){
  const actions=el('div','v4-notice-actions');
  const btn=el('button','btn soft','✓ Mark recent notices read');btn.id='v4MarkAll';btn.onclick=markRecentNoticesRead;
  actions.append(btn);notifications.before(actions);
 }
}
function metricsUpdate(orders,role){
 const node=$('v4ManagerMetrics');if(!node)return;
 node.replaceChildren();
 const pending=orders.filter(x=>x.status==='pending').length;
 const active=orders.filter(x=>!closed(x.status)).length;
 const confirmed=orders.filter(x=>!!x.quote_confirmed_at).length;
 const complete=orders.filter(x=>x.status==='delivered').length;
 const figures=[
 ['New pickup requests',pending],['Buying / delivery',active],['Quotes confirmed',confirmed],['Delivered',complete]
 ];
 for(const [label,value] of figures){
  const tile=el('div','v4-metric');tile.append(el('span','',label),el('strong','',value));node.append(tile);
 }
 const summary=$('ownerSummary');
 if(summary){
  const quoted=orders.filter(o=>!!o.quote_confirmed_at).reduce((sum,o)=>sum+Number(o.final_items_subtotal_lkr||0)+Number(o.final_delivery_fee_lkr||0),0);
  summary.textContent=role==='owner'
   ?'Owner view · '+orders.length+' recent orders · confirmed order value '+money(quoted)+'. This is NOT payment received.'
   :'Shop view · '+orders.length+' authorized shop orders · confirmed order value '+money(quoted)+'. This is NOT payment received.';
 }
}
async function collectDetails(orders){
 const ids=orders.map(o=>o.id);
 managerItems=new Map();managerEvents=new Map();
 if(!ids.length)return;
 const d=db();
 const [items,events]=await Promise.allSettled([
   d.from('order_items').select('order_id,product_name,quantity,unit_price_lkr').in('order_id',ids).limit(300),
   d.from('order_status_events').select('order_id,old_status,new_status,created_at').in('order_id',ids).order('created_at',{ascending:true}).limit(300)
 ]);
 if(items.status==='fulfilled'&&!items.value.error)for(const item of items.value.data||[]){
  if(!managerItems.has(item.order_id))managerItems.set(item.order_id,[]);
  managerItems.get(item.order_id).push(item);
 }
 if(events.status==='fulfilled'&&!events.value.error)for(const ev of events.value.data||[]){
  if(!managerEvents.has(ev.order_id))managerEvents.set(ev.order_id,[]);
  managerEvents.get(ev.order_id).push(ev);
 }
}
function timeline(order,events){
 const wrap=el('div','v4-timeline');
 wrap.append(el('small','v4-timeline-heading','Order timeline'));
 const placed=el('div','v4-event');placed.append(el('b','','Order requested'),el('small','',date(order.created_at)));wrap.append(placed);
 if(order.quote_confirmed_at){
  const conf=el('div','v4-event');conf.append(el('b','','Final quote confirmed'),el('small','',date(order.quote_confirmed_at)));wrap.append(conf);
 }
 for(const ev of events||[]){
  const row=el('div','v4-event');
  row.append(el('b','',displayStatus(ev.new_status)),el('small','',date(ev.created_at)));
  wrap.append(row);
 }
 return wrap;
}
function renderManagerOrders(){
 const list=$('managedOrders');if(!list)return;
 list.replaceChildren();
 const term=($('v4OrderSearch')?.value||'').trim().toLowerCase();
 const filter=$('v4OrderFilter')?.value||'all';
 const results=managerOrders.filter(o=>
  (filter==='all'||o.status===filter)&&
  (!term||[o.id,o.recipient_name,o.recipient_phone,o.service_type,o.delivery_address].join(' ').toLowerCase().includes(term))
 );
 if(!results.length){empty(list,'No customer orders yet','When someone orders from a listed shop, the full order appears here for USE ME Owner to buy and deliver.');return}
 for(const o of results){
  const card=el('article','v4-order-card');card.id='usemeManaged_'+o.id;
  const heading=el('div','v4-order-heading');
  const left=el('div');left.append(el('small','v4-muted',date(o.created_at)),el('h3','',titleCase(o.service_type)+' · #'+o.id.slice(0,8)));
  const badge=el('span','v4-status v4-status-'+o.status,displayStatus(o.status));heading.append(left,badge);card.append(heading);
  const shop=managerShops.get(o.shop_id),pickup=managerPickups.get(o.shop_id);
  const pickupPanel=el('div','v4-pickup-box');
  pickupPanel.append(el('small','v4-pickup-kicker','🏪 STORE PICKUP · USE ME OWNER ONLY'));
  pickupPanel.append(el('h4','',shop?.name||'USE ME direct order — no partner shop'));
  if(o.shop_id){
   pickupPanel.append(el('p','',pickup?.pickup_address||'Pickup address not supplied. Request details from the shop partner.'));
   pickupPanel.append(el('small','v4-muted','Shop contact: '+(pickup?.contact_phone||'Not provided')));
   if(pickup?.pickup_notes)pickupPanel.append(el('small','v4-muted','Pickup instructions: '+pickup.pickup_notes));
   if(pickup?.contact_phone){
    const phone=el('a','v4-pickup-link','📞 Call shop');
    phone.href='tel:'+pickup.contact_phone.replace(/[^+0-9]/g,'');
    pickupPanel.append(phone);
   }
   if(pickup?.map_url&&/^https:\/\//.test(pickup.map_url)){
    const map=el('a','v4-pickup-link','📍 Open Maps');map.href=pickup.map_url;map.target='_blank';map.rel='noopener noreferrer';pickupPanel.append(map);
   }
  }
  card.append(pickupPanel);
  const recipient=el('p','v4-order-recipient','Customer: '+o.recipient_name+' · '+o.recipient_phone+' · '+o.delivery_address);
  card.append(recipient);
  const q=quoteSummary(o);
  const amount=el('div','v4-quote-summary');
  amount.append(el('small','',q.label),el('strong','',money(q.items+q.fee)));
  const line=el('small','v4-muted','Items '+money(q.items)+' · Delivery '+money(q.fee)+(q.confirmed?' · Confirmed':' · Estimated'));
  amount.append(line);card.append(amount);
  if(o.order_notes){const note=el('p','v4-order-note','Order notes: '+o.order_notes);card.append(note)}
  const lines=managerItems.get(o.id)||[];
  if(lines.length){
   const d=el('details','v4-order-details');
   d.append(el('summary','','View '+lines.length+' ordered product(s)'));
   for(const l of lines)d.append(el('p','',l.product_name+' × '+l.quantity+' · '+money(l.unit_price_lkr*l.quantity)));
   card.append(d);
  }
  card.append(timeline(o,managerEvents.get(o.id)||[]));
  const ownerTools=el('div','v4-owner-whatsapp-tools');
  const share=el('a','btn v4-whatsapp-share','💬 WhatsApp order details');
  share.href='https://wa.me/'+ownerWhatsAppNumber+'?text='+encodeURIComponent(orderMessage(o,lines,shop,pickup));
  share.target='_blank';share.rel='noopener noreferrer';share.title='Opens WhatsApp message composer; the message is not sent automatically';
  const copy=el('button','btn soft','📋 Copy order details');
  copy.onclick=async()=>{
   try{await navigator.clipboard.writeText(orderMessage(o,lines,shop,pickup));copy.textContent='Copied ✓'}
   catch(e){alert('Copy unavailable. Use WhatsApp order details instead.')}
  };
  ownerTools.append(share,copy);
  ownerTools.append(el('small','v4-muted','WhatsApp opens a pre-filled message; sending requires your confirmation. Automatic WhatsApp alerts need Business API integration.'));
  card.append(ownerTools);
  if(usemeRole==='owner'&&!q.confirmed&&!closed(o.status)){
   const form=el('div','v4-quote-form');
   form.append(el('h4','','Owner: Confirm final customer quote'));
   const fields=el('div','v4-quote-fields');
   const service=o.shop_id===null;
   const itemsLabel=el('label','','Item / service subtotal (LKR)');
   const itemInput=el('input');itemInput.type='number';itemInput.min='0';itemInput.max='10000000';itemInput.step='.01';itemInput.value=String(o.items_subtotal_lkr||0);
   itemInput.disabled=!service;
   itemsLabel.append(itemInput);
   const deliveryLabel=el('label','','Final delivery charge (LKR)');
   const deliveryInput=el('input');deliveryInput.type='number';deliveryInput.min='250';deliveryInput.max='100000';deliveryInput.step='.01';deliveryInput.value=String(o.delivery_fee_lkr||250);
   deliveryLabel.append(deliveryInput);fields.append(itemsLabel,deliveryLabel);form.append(fields);
   const action=el('button','btn','Confirm customer quote & continue to shop pickup');
   const response=el('p','v4-operation-status');
   action.onclick=async()=>{
    const itemTotal=Number(itemInput.value),delivery=Number(deliveryInput.value);
    if(!Number.isFinite(itemTotal)||itemTotal<0||!Number.isFinite(delivery)||delivery<250||delivery>100000){
     response.textContent='Check the product total and delivery charge.';return;
    }
    if(!confirm('Confirm '+money(itemTotal+delivery)+' as the customer quote for #'+o.id.slice(0,8)+'?'))return;
    action.disabled=true;response.textContent='Confirming quote...';
    try{
      const {error}=await db().rpc('confirm_order_quote',{
       p_order_id:o.id,p_delivery_fee_lkr:delivery,p_items_subtotal_lkr:service?itemTotal:null
      });
      if(error)throw error;
      await Promise.allSettled([window.loadManagedOrders(),window.loadNotifications()]);
    }catch(e){response.textContent='Quote not confirmed: '+(e.message||'Unexpected error');action.disabled=false}
   };
   form.append(action,response);card.append(form);
  }
  if(!closed(o.status)){
   const allowed=(statusNext[o.status]||[]).filter(v=>v!=='accepted'||!!o.quote_confirmed_at);
   const controls=el('div','v4-status-controls');
   if(allowed.length){
    const select=el('select');select.setAttribute('aria-label','Next status for order '+o.id.slice(0,8));
    for(const state of allowed){const option=el('option','',displayStatus(state));option.value=state;select.append(option)}
    const btn=el('button','btn dark','Update status');
    const msg=el('small','v4-operation-status');
    btn.onclick=async()=>{
     const next=select.value;
     if(!next)return;
     if(next==='cancelled'&&!confirm('Cancel order #'+o.id.slice(0,8)+'? Reserved product stock will be returned.'))return;
     btn.disabled=true;msg.textContent='Updating...';
     try{
      const {error}=await db().rpc('set_order_status',{p_order_id:o.id,p_new_status:next});
      if(error)throw error;
      await Promise.allSettled([window.loadManagedOrders(),window.loadNotifications()]);
     }catch(e){msg.textContent=e.message||'Could not update status';btn.disabled=false}
    };
    controls.append(select,btn,msg);
   }else if(o.status==='pending'&&!o.quote_confirmed_at){
    controls.append(el('small','v4-muted','Confirm the final quote before accepting this order.'));
   }
   card.append(controls);
  }
  list.append(card);
 }
}
window.loadManagedOrders=async function(){
 const panel=$('managementPanel'),list=$('managedOrders');
 if(!panel||!list||!db())return;
 const user=await currentUsemeUser();
 if(!user){panel.classList.add('hidden');return}
 const roleResult=await db().rpc('my_useme_role');
 if(roleResult.error){panel.classList.add('hidden');return}
 usemeRole=roleResult.data||'guest';
 if(usemeRole!=='owner'){panel.classList.add('hidden');return}
 panel.classList.remove('hidden');
 initUi();
 textStatus('managementRoleNote','Only USE ME Owner handles orders. Pick up from listed shops, purchase items and deliver. Shop partners never see customer order details.');
 const query=db().from('orders').select('id,customer_id,shop_id,service_type,status,recipient_name,recipient_phone,delivery_address,order_notes,created_at,updated_at,delivery_distance_km,delivery_fee_lkr,items_subtotal_lkr,final_items_subtotal_lkr,final_delivery_fee_lkr,quote_confirmed_at').order('created_at',{ascending:false}).limit(100);
 const {data,error}=await query;
 if(error){list.textContent='Could not load orders: '+error.message;return}
 managerOrders=data||[];
 const pickupIds=[...new Set(managerOrders.map(o=>o.shop_id).filter(Boolean))];
 managerShops=new Map();managerPickups=new Map();
 if(pickupIds.length){
  const [sRes,pRes]=await Promise.allSettled([
   db().from('shops').select('id,name').in('id',pickupIds),
   db().from('shop_pickup_details').select('shop_id,pickup_address,contact_phone,pickup_notes,map_url').in('shop_id',pickupIds)
  ]);
  if(sRes.status==='fulfilled'&&!sRes.value.error)
   managerShops=new Map((sRes.value.data||[]).map(shop=>[shop.id,shop]));
  if(pRes.status==='fulfilled'&&!pRes.value.error)
   managerPickups=new Map((pRes.value.data||[]).map(details=>[details.shop_id,details]));
 }
 await collectDetails(managerOrders);
 metricsUpdate(managerOrders,usemeRole);
 renderManagerOrders();
 await window.loadShopApprovals();
};
window.loadShopApprovals=async function(){
 const panel=$('shopApprovalPanel'),box=$('shopApprovalList');
 if(!panel||!box||!db())return;
 if(usemeRole!=='owner'){panel.classList.add('hidden');return}
 panel.classList.remove('hidden');
 box.textContent='Reviewing merchant applications...';
 const {data,error}=await db().from('shops').select('id,name,status,created_at').order('created_at',{ascending:false}).limit(150);
 box.replaceChildren();
 if(error){box.textContent='Unable to list shops: '+error.message;return}
 const shops=(data||[]).sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1));
 const counts=el('div','v4-shop-stats','Pending '+shops.filter(x=>x.status==='pending').length+' · Approved '+shops.filter(x=>x.status==='approved').length+' · Suspended '+shops.filter(x=>x.status==='suspended').length);
 box.append(counts);
 if(!shops.length){empty(box,'No merchant applications','New registrations will appear here for owner review.');return}
 for(const shop of shops){
  const row=el('article','v4-shop-row');
  const description=el('div');
  description.append(el('h4','',shop.name),el('small','v4-muted','Submitted '+date(shop.created_at)+' · '+titleCase(shop.status)));
  const actions=el('div','v4-shop-actions');
  for(const state of shop.status==='pending'?['approved','suspended']:shop.status==='approved'?['suspended']:['approved']){
   const button=el('button',state==='approved'?'btn':'btn soft',state==='approved'?'✓ Approve':'Suspend');
   button.onclick=async()=>{
    if(!confirm((state==='approved'?'Approve ':'Suspend ')+shop.name+'?'))return;
    button.disabled=true;
    const {error:err}=await db().rpc('set_shop_approval',{p_shop_id:shop.id,p_status:state});
    if(err){alert('Could not update merchant: '+err.message);button.disabled=false}
    else{await Promise.allSettled([window.loadShopApprovals(),loadSellerProducts()])}
   };
   actions.append(button);
  }
  row.append(description,actions);box.append(row);
 }
};
window.loadMyOrders=async function(){
 const box=$('myOrders');if(!box||!db())return;
 const user=await currentUsemeUser();
 if(!user){box.textContent='Sign in at Profile to view your orders.';return}
 const {data,error}=await db().from('orders')
  .select('id,service_type,shop_id,status,created_at,updated_at,delivery_fee_lkr,items_subtotal_lkr,final_items_subtotal_lkr,final_delivery_fee_lkr,quote_confirmed_at,order_notes')
  .eq('customer_id',user.id).order('created_at',{ascending:false}).limit(60);
 box.replaceChildren();
 if(error){box.textContent='Unable to load your orders: '+error.message;return}
 if(!data?.length){empty(box,'No orders yet','Place your first USE ME order to see its confirmation and delivery progress here.',()=>go('buy'));return}
 const ids=data.map(o=>o.id);
 const [itemsResult,eventsResult]=await Promise.allSettled([
  db().from('order_items').select('order_id,product_name,quantity,unit_price_lkr').in('order_id',ids).limit(350),
  db().from('order_status_events').select('order_id,new_status,created_at').in('order_id',ids).order('created_at',{ascending:true}).limit(350)
 ]);
 const items=new Map(),events=new Map();
 if(itemsResult.status==='fulfilled'&&!itemsResult.value.error){
  for(const item of itemsResult.value.data||[]){if(!items.has(item.order_id))items.set(item.order_id,[]);items.get(item.order_id).push(item)}
 }
 if(eventsResult.status==='fulfilled'&&!eventsResult.value.error){
  for(const ev of eventsResult.value.data||[]){if(!events.has(ev.order_id))events.set(ev.order_id,[]);events.get(ev.order_id).push(ev)}
 }
 const targetId=new URLSearchParams(location.search).get('order');
 for(const o of data){
  const card=el('article','v4-order-card v4-customer-order');
  card.id='usemeOrder_'+o.id;
  const head=el('div','v4-order-heading');
  const title=el('div');title.append(el('small','v4-muted',date(o.created_at)),el('h3','',titleCase(o.service_type)+' · #'+o.id.slice(0,8)));
  head.append(title,el('span','v4-status v4-status-'+o.status,displayStatus(o.status)));card.append(head);
  const quote=quoteSummary(o);
  const amount=el('div','v4-quote-summary');
  amount.append(el('small','',quote.label),el('strong','',money(quote.items+quote.fee)));
  amount.append(el('small','v4-muted','Items '+money(quote.items)+' · Delivery '+money(quote.fee)));
  card.append(amount);
  if(o.order_notes)card.append(el('p','v4-order-note',o.order_notes));
  const lines=items.get(o.id)||[];
  if(lines.length){
   const detail=el('details','v4-order-details');detail.append(el('summary','','Ordered items'));
   for(const item of lines)detail.append(el('p','',item.product_name+' × '+item.quantity+' · '+money(Number(item.unit_price_lkr)*item.quantity)));
   card.append(detail);
  }
  card.append(timeline(o,events.get(o.id)||[]));
  if(o.status==='pending'){
   const actions=el('div','v4-customer-actions');
   const button=el('button','btn soft','Cancel pending order');
   const msg=el('small','v4-operation-status');
   button.onclick=async()=>{
    if(!confirm('Cancel pending order #'+o.id.slice(0,8)+'?'))return;
    button.disabled=true;msg.textContent='Cancelling...';
    const {error:cancelError}=await db().rpc('cancel_my_pending_order',{p_order_id:o.id});
    if(cancelError){msg.textContent=cancelError.message;button.disabled=false}
    else{await Promise.allSettled([window.loadMyOrders(),window.loadNotifications()])}
   };
   actions.append(button,msg);card.append(actions);
  }
  card.append(el('small','v4-muted','No payment was collected on this website. Confirm payment and delivery directly with USE ME.'));
  if(targetId===o.id)card.classList.add('v4-highlight-order');
  box.append(card);
 }
};
let recentNotices=[];
window.loadNotifications=async function(){
 const box=$('myNotifications');if(!box||!db())return;
 const user=await currentUsemeUser();
 if(!user){box.textContent='Sign in to view notifications.';textStatus('notificationCount','0');recentNotices=[];return}
 const {data,error}=await db().from('notifications')
  .select('id,order_id,title,body,created_at,read_at').order('created_at',{ascending:false}).limit(70);
 box.replaceChildren();
 if(error){box.textContent='Unable to load notifications. Please try again.';return}
 recentNotices=data||[];
 unreadNotifications=recentNotices.filter(n=>!n.read_at).length;
 textStatus('notificationCount',String(unreadNotifications));
 const all=$('v4MarkAll');if(all)all.disabled=!unreadNotifications;
 if(!recentNotices.length){empty(box,'All caught up','Shop approvals, order updates and owner quotes will appear here.');return}
 for(const n of recentNotices){
  const card=el('article','v4-notification '+(n.read_at?'v4-read':'v4-unread'));
  const content=el('div','v4-notice-content');
  content.append(el('h3','',n.title),el('p','',n.body),el('small','v4-muted',date(n.created_at)));
  const buttons=el('div','v4-notice-buttons');
  if(n.order_id){
   const open=el('button','btn soft','View order →');
   open.onclick=async()=>{
    const role=await db().rpc('my_useme_role');
    const canManage=!role.error&&role.data==='owner';
    if(canManage){
     go('seller',{url:'/seller?order='+encodeURIComponent(n.order_id)});
     await window.loadManagedOrders();
     $('usemeManaged_'+n.order_id)?.scrollIntoView({behavior:'smooth',block:'center'});
    }else{
     go('orders',{url:'/orders?order='+encodeURIComponent(n.order_id)});
     await window.loadMyOrders();
     $('usemeOrder_'+n.order_id)?.scrollIntoView({behavior:'smooth',block:'center'});
    }
   };
   buttons.append(open);
  }
  if(!n.read_at){
   const mark=el('button','btn soft','✓ Read');
   mark.onclick=async()=>{
    mark.disabled=true;
    const {error:err}=await db().rpc('mark_notification_read',{p_notification_id:n.id});
    if(err){mark.disabled=false;alert('Unable to mark notification read.')}
    else await window.loadNotifications();
   };
   buttons.append(mark);
  }
  card.append(content,buttons);box.append(card);
 }
 const status=$('notificationLiveStatus');
 if(status)status.textContent='🔔 Updates appear here while the app is open. Live channel uses secure account access, with a 30-second refresh fallback.';
};
async function markRecentNoticesRead(){
 const button=$('v4MarkAll');if(!button||!db())return;
 button.disabled=true;button.textContent='Updating...';
 let failed=0;
 for(const n of recentNotices.filter(x=>!x.read_at)){
  const {error}=await db().rpc('mark_notification_read',{p_notification_id:n.id});
  if(error)failed++;
 }
 button.textContent='✓ Mark recent notices read';
 await window.loadNotifications();
 if(failed)alert('Some notifications could not be marked read. Please retry.');
}
let polling=false;
window.usemeBackgroundRefresh=async function(){
 if(polling||document.visibilityState==='hidden'||!db())return;
 polling=true;
 try{
  const user=await currentUsemeUser();
  if(!user)return;
  await window.loadNotifications();
  if(visible('orders'))await window.loadMyOrders();
  if(visible('seller'))await window.loadManagedOrders();
 }catch(e){console.warn('USE ME live refresh temporarily unavailable',e)}
 finally{polling=false}
};
async function connectLiveNoticeChannel(user){
 const d=db();
 if(!d)return;
 const uid=user?.id||null;
 if(uid===noticeUserId)return;
 if(noticeChannel){try{await d.removeChannel(noticeChannel)}catch(e){}noticeChannel=null}
 noticeUserId=uid;
 if(!uid)return;
 try{
  noticeChannel=d.channel('useme-notices-'+uid).on(
   'postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'recipient_id=eq.'+uid},
   ()=>{window.loadNotifications();if(visible('seller'))window.loadManagedOrders()}
  ).subscribe();
 }catch(e){console.warn('Realtime notices unavailable; fallback polling remains enabled',e)}
}
const initialLoad=async()=>{
 initUi();
 if(location.pathname==='/order/new'){
  const requested=new URLSearchParams(location.search).get('service');
  const service=$('serviceOrderType');
  if(service&&requested&&Array.from(service.options).some(x=>x.value===requested))service.value=requested;
 }
 const user=await currentUsemeUser();
 await connectLiveNoticeChannel(user);
 if(visible('orders'))await window.loadMyOrders();
 if(visible('notifications'))await window.loadNotifications();
 if(visible('seller'))await window.loadManagedOrders();
};
// Replace the old timer's captured callback with the Phase 4 refresh routine.
if(typeof usemeNotificationTimer!=='undefined'){
 if(usemeNotificationTimer)clearInterval(usemeNotificationTimer);
 usemeNotificationTimer=setInterval(window.usemeBackgroundRefresh,30000);
}
if(db()){
 db().auth.onAuthStateChange((_event,session)=>{
  setTimeout(async()=>{
   await connectLiveNoticeChannel(session?.user||null);
   if(visible('seller'))await refreshSellerPortal();
   if(visible('orders'))await window.loadMyOrders();
   if(visible('notifications'))await window.loadNotifications();
  },0);
 });
}
initialLoad().catch(e=>console.warn('USE ME Phase 4 initialization failed',e));
})();