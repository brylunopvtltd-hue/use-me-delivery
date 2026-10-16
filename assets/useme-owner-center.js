/* USE ME OWNER CONTROL V4 — privileged operations, announcements and scoped staff.
 * Every privileged write is enforced in Supabase RPCs and RLS. Never expose service role keys.
 * Customer orders and private GPS are never delegated to staff.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const db=()=>typeof usemeDb!=='undefined'?usemeDb:null;
const create=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=String(text);return e};
const row=(...elements)=>{const x=create('div','owner-flex');for(const e of elements)x.append(e);return x};
const formatLkr=v=>'LKR '+Number(v||0).toLocaleString('en-LK',{maximumFractionDigits:2});
const dt=x=>x?new Date(x).toLocaleString('en-LK'):'–';
const uuid=s=>/^[0-9a-f-]{36}$/i.test(s||'');
const normalizeError=e=>e?.message||String(e||'Unknown error');
let userRole='guest',lastUser=null,ownerLoading=false,publicData=null;
let allProfiles=[],staffGrants=new Map(),allProducts=[],allShops=[],shopLocations=new Map(),announcements=[];
let currentTab='overview';
const defaults={min_delivery_lkr:250,reference_roundtrip_km:22,reference_delivery_lkr:750,marketplace_enabled:true,service_orders_enabled:true,owner_whatsapp:'94752351751',support_note:'USE ME confirms the total before payment.'};
window.usemePublicSettings={...defaults};
window.usemeCalculateFee=(km,extra=0)=>{
 const config=window.usemePublicSettings||defaults;
 const n=Math.max(0,Number(km)||0);
 return Math.round(Math.max(Number(config.min_delivery_lkr),n*Number(config.reference_delivery_lkr)/Math.max(1,Number(config.reference_roundtrip_km)))+Math.max(0,Number(extra)||0));
};
function toast(message,kind='info'){
 const area=$('usemeOwnerToast');if(!area)return;
 area.className='owner-toast '+kind;area.textContent=message;
}
const clear=node=>{if(node)node.replaceChildren()};
const button=(label,onClick,kind='soft')=>{
 const b=create('button','owner-btn '+kind,label);b.type='button';b.onclick=onClick;return b;
};
const link=(text,url)=>{const a=create('a','owner-link',text+' ↗');a.href=url;a.onclick=e=>{if(typeof go==='function'){e.preventDefault();const pages={'/seller':'seller','/orders':'orders','/notifications':'notifications','/shop':'buy','/owner':'owner','/team':'team'};if(pages[url])go(pages[url]);else window.location.href=url}};return a};
const metric=(label,value,sub)=>{
 const c=create('article','owner-metric'),b=create('b','',value),l=create('small','',label);
 c.append(l,b);if(sub)c.append(create('span','',sub));return c;
};
const msg=(target,headline,body)=>{
 const e=$(target);if(!e)return;
 e.replaceChildren();e.append(create('h3','',headline),create('p','',body));
};
const currentUser=async()=>db()?(await db().auth.getUser()).data?.user:null;
async function roleInfo(){
 const user=await currentUser();if(!user)return {user:null,role:'guest'};
 const {data,error}=await db().rpc('my_useme_role');
 if(error)return {user,role:'guest',error};
 return {user,role:data};
}
const staffCan=scope=>scope==='announcements'?'can_manage_announcements':'can_review_catalogue';
function setTab(tab){
 currentTab=tab;
 document.querySelectorAll('#ownerControlPanel [data-owner-tab]').forEach(b=>{
  const selected=b.dataset.ownerTab===tab;b.classList.toggle('selected',selected);b.setAttribute('aria-selected',String(selected));
 });
 document.querySelectorAll('#ownerControlPanel [data-owner-content]').forEach(p=>p.classList.toggle('hidden',p.dataset.ownerContent!==tab));
}
window.usemeOwnerTab=function(tab){setTab(tab);refreshSection(tab)};
async function fetchExactCount(table,filter){
 const q=db().from(table).select('*',{count:'exact',head:true});
 if(filter)filter(q);
 const r=await q;return r.error?null:r.count;
}
async function loadOwnerOverview(){
 const metrics=$('ownerMetricGrid');if(!metrics)return;
 metrics.replaceChildren();metrics.append(create('p','owner-muted','Loading verified database totals...'));
 const client=db();
 const promises=[
  client.from('orders').select('id,status,service_type,items_subtotal_lkr,delivery_fee_lkr,final_items_subtotal_lkr,final_delivery_fee_lkr,quote_confirmed_at,created_at').order('created_at',{ascending:false}).limit(500),
  client.from('shops').select('id,status').limit(200),
  client.from('products').select('id,active,stock').limit(500),
  client.from('profiles').select('id',{count:'exact',head:true}),
  client.from('notifications').select('id',{count:'exact',head:true}).is('read_at',null)
 ];
 const settled=await Promise.allSettled(promises);const get=i=>settled[i].status==='fulfilled'&&!settled[i].value.error?settled[i].value:null;
 const orders=get(0)?.data||[],shops=get(1)?.data||[],products=get(2)?.data||[];
 metrics.replaceChildren();
 const active=orders.filter(o=>!['cancelled','delivered'].includes(o.status));
 const pending=orders.filter(o=>o.status==='pending');
 const complete=orders.filter(o=>o.status==='delivered');
 const confirmed=orders.filter(o=>o.quote_confirmed_at);
 const value=confirmed.reduce((t,o)=>t+Number(o.final_items_subtotal_lkr||0)+Number(o.final_delivery_fee_lkr||0),0);
 const cards=[
  ['New orders',pending.length,'Awaiting USE ME Owner'],
  ['Active deliveries',active.length,'Not closed'],
  ['Approved shops',shops.filter(s=>s.status==='approved').length,'Shop pickup partners'],
  ['Listed products',products.length,products.filter(x=>x.active).length+' published'],
  ['Customers & accounts',get(3)?.count??'—','Signed-up profiles'],
  ['Unread notifications',get(4)?.count??'—','In-app messages'],
  ['Delivered orders',complete.length,'Completion status'],
  ['Confirmed order value',formatLkr(value),'Not actual payments collected']
 ];
 for(const [label,val,sub] of cards)metrics.append(metric(label,val,sub));
 const meta=$('ownerOverviewMeta');if(meta)meta.textContent='Recent '+orders.length+' order records included. Counts for orders, shops and products are capped for dashboard speed. Confirmed value is NOT collected revenue.';
}
async function loadOwnerShops(){
 const node=$('ownerShopsList');if(!node)return;
 msg('ownerShopsList','Loading shops','Reading current shop applications and pickup details...');
 const [s,d]=await Promise.all([
  db().from('shops').select('id,name,status,created_at').order('created_at',{ascending:false}).limit(150),
  db().from('shop_pickup_details').select('shop_id,pickup_address,contact_phone,latitude,longitude').limit(150)
 ]);
 if(s.error){msg('ownerShopsList','Shop list unavailable',s.error.message);return}
 allShops=s.data||[];shopLocations=new Map((d.data||[]).map(x=>[x.shop_id,x]));
 node.replaceChildren();
 const filter=$('ownerShopFilter')?.value||'all';
 const matches=allShops.filter(shop=>filter==='all'||shop.status===filter);
 if(!matches.length){msg('ownerShopsList','No shops in this status','Shop partners appear after registration.');return}
 for(const shop of matches){
  const item=create('article','owner-record');
  const location=shopLocations.get(shop.id);
  const left=create('div','owner-record-body');
  left.append(create('h3','',shop.name),create('small','owner-muted',shop.status.toUpperCase()+' · '+dt(shop.created_at)));
  left.append(create('p','',location?'📍 '+location.pickup_address+' · ☎ '+location.contact_phone:'Pickup address missing — approval disabled'));
  if(location?.latitude!=null)left.append(create('small','owner-good','● GPS pickup pin shared'));
  const actions=create('div','owner-actions');
  if(shop.status!=='approved'){
   const approve=button('✓ Approve',()=>changeShop(shop.id,'approved'),'primary');
   approve.disabled=!location;approve.title=location?'Review this shop before confirming':'Pickup address and phone are required';
   actions.append(approve);
  }
  if(shop.status!=='suspended')actions.append(button('Suspend',()=>changeShop(shop.id,'suspended'),'danger'));
  if(shop.status!=='pending')actions.append(button('Pending review',()=>changeShop(shop.id,'pending')));
  item.append(left,actions);node.append(item);
 }
}
async function changeShop(shopId,status){
 const shop=allShops.find(x=>x.id===shopId);if(!shop)return;
 if(!confirm((status==='approved'?'APPROVE':status==='suspended'?'SUSPEND':'Move to pending')+' shop "'+shop.name+'"? This changes product visibility.'))return;
 const {error}=await db().rpc('set_shop_approval',{p_shop_id:shopId,p_status:status});
 if(error){toast('Shop update failed: '+error.message,'error');return}
 toast('Shop status changed to '+status+'.','success');
 await Promise.allSettled([loadOwnerShops(),loadOwnerOverview()]);
}
async function loadOwnerCatalogue(){
 const node=$('ownerCatalogList');if(!node)return;
 msg('ownerCatalogList','Loading products','Approved and unpublished shop products...');
 const [products,shops]=await Promise.all([
  db().from('products').select('id,shop_id,name,category,price_lkr,stock,active,image_path,created_at').order('created_at',{ascending:false}).limit(250),
  db().from('shops').select('id,name').limit(250)
 ]);
 if(products.error){msg('ownerCatalogList','Could not load products',products.error.message);return}
 allProducts=products.data||[];const names=new Map((shops.data||[]).map(x=>[x.id,x.name]));
 const term=($('ownerProductFilter')?.value||'').toLowerCase().trim();
 node.replaceChildren();
 const filtered=allProducts.filter(x=>!term||[x.name,x.category,names.get(x.shop_id)].join(' ').toLowerCase().includes(term));
 if(!filtered.length){msg('ownerCatalogList','No matching listings','No real products have been uploaded for this category or search.');return}
 for(const p of filtered){
  const line=create('article','owner-record'),info=create('div','owner-record-body');
  info.append(create('h3','',p.name),create('small','owner-muted',(names.get(p.shop_id)||'Shop unknown')+' · '+(p.category||'General')));
  info.append(create('p','',formatLkr(p.price_lkr)+' · Stock '+p.stock+' · '+(p.active?'Published':'Unpublished')));
  const actions=create('div','owner-actions');
  const toggle=button(p.active?'Unpublish':'Publish',async()=>{
   const wanted=!p.active;
   if(!confirm((wanted?'Publish':'Unpublish')+' '+p.name+'?'))return;
   const {error}=await db().rpc('useme_review_catalogue_item',{p_product:p.id,p_active:wanted});
   if(error)toast(error.message,'error');else{toast('Product review saved.','success');await Promise.allSettled([loadOwnerCatalogue(),loadOwnerOverview()])}
  },p.active?'danger':'primary');
  actions.append(toggle);
  const price=create('input','owner-small-number');price.type='number';price.min='1';price.step='.01';price.value=Number(p.price_lkr);
  price.setAttribute('aria-label','Price for '+p.name);
  const stock=create('input','owner-small-number');stock.type='number';stock.min='0';stock.step='1';stock.value=Number(p.stock);
  stock.setAttribute('aria-label','Stock for '+p.name);
  const save=button('Save price / stock',async()=>{
   const amount=Number(price.value),quantity=Number(stock.value);
   if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(quantity)||quantity<0){toast('Enter a positive price and valid stock.','error');return}
   save.disabled=true;
   const {error}=await db().from('products').update({price_lkr:amount,stock:quantity}).eq('id',p.id);
   if(error){toast('Could not save: '+error.message,'error');save.disabled=false}
   else{toast('Price/stock saved.','success');await loadOwnerCatalogue()}
  });
  const edit=create('div','owner-product-editor');edit.append(price,stock,save);
  actions.append(edit);line.append(info,actions);node.append(line);
 }
}
async function loadOwnerProfiles(){
 const panel=$('ownerUsersList');if(!panel)return;
 msg('ownerUsersList','Loading access list','Reading accounts and scoped permission grants...');
 const [p,staff]=await Promise.all([
  db().from('profiles').select('id,display_name,phone,role,created_at').order('created_at',{ascending:false}).limit(150),
  db().from('useme_staff_permissions').select('user_id,can_manage_announcements,can_review_catalogue,updated_at').limit(150)
 ]);
 if(p.error){msg('ownerUsersList','Users unavailable',p.error.message);return}
 allProfiles=p.data||[];staffGrants=new Map((staff.data||[]).map(g=>[g.user_id,g]));
 renderProfiles();
}
function renderProfiles(){
 const panel=$('ownerUsersList');if(!panel)return;
 panel.replaceChildren();
 const needle=($('ownerUserSearch')?.value||'').trim().toLowerCase();
 const filtered=allProfiles.filter(u=>!needle||[u.id,u.display_name,u.phone,u.role].join(' ').toLowerCase().includes(needle));
 if(!filtered.length){msg('ownerUsersList','No matching users','Search another name, phone, or account ID.');return}
 for(const u of filtered){
  const item=create('article','owner-record'),info=create('div','owner-record-body');
  info.append(create('h3','',u.display_name||'Account '+u.id.slice(0,8)));
  info.append(create('small','owner-muted',(u.role||'customer').toUpperCase()+' · '+dt(u.created_at)));
  info.append(create('p','owner-muted','Account ID: '+u.id.slice(0,8)+'…'+(u.phone?' · Phone: '+u.phone:'')));
  const permissions=create('div','owner-permissions');
  if(u.role==='owner'){
   permissions.append(create('span','owner-privileged','● Full platform Owner — protected'));
  }else{
   const existing=staffGrants.get(u.id)||{};
   const announcement=create('label','owner-checkbox');
   const a=create('input');a.type='checkbox';a.checked=!!existing.can_manage_announcements;
   announcement.append(a,create('span','','Can publish announcements'));
   const review=create('label','owner-checkbox');
   const c=create('input');c.type='checkbox';c.checked=!!existing.can_review_catalogue;
   review.append(c,create('span','','Can review products'));
   const save=button('Save permissions',async()=>{
    if(!confirm('Apply limited permissions to '+(u.display_name||u.id.slice(0,8))+'? No order/customer management rights are included.'))return;
    save.disabled=true;
    const {error}=await db().rpc('useme_owner_grant_staff',{p_user:u.id,p_announcements:a.checked,p_catalogue:c.checked});
    if(error){toast('Permission change failed: '+error.message,'error');save.disabled=false}
    else{toast('Permissions saved. Customer orders remain Owner-only.','success');await loadOwnerProfiles()}
   },'primary');
   permissions.append(announcement,review,save);
  }
  item.append(info,permissions);panel.append(item);
 }
}
async function loadOwnerAnnouncements(){
 const list=$('ownerAnnouncementsList');if(!list)return;
 const {data,error}=await db().from('useme_announcements').select('id,title,body,active,created_at').order('created_at',{ascending:false}).limit(75);
 if(error){msg('ownerAnnouncementsList','Announcements unavailable',error.message);return}
 announcements=data||[];
 list.replaceChildren();
 if(!announcements.length){msg('ownerAnnouncementsList','No announcements yet','Write an announcement and choose Publish to show it on public service pages.');return}
 for(const a of announcements){
  const entry=create('article','owner-record');const text=create('div','owner-record-body');
  text.append(create('h3','',a.title),create('small','owner-muted',(a.active?'PUBLISHED':'DRAFT')+' · '+dt(a.created_at)));
  text.append(create('p','',a.body));
  const actions=create('div','owner-actions');
  actions.append(button('Edit',()=>{ $('ownerAnnouncementTitle').value=a.title;$('ownerAnnouncementBody').value=a.body;$('ownerAnnouncementActive').checked=a.active;$('ownerAnnouncementId').value=a.id; $('ownerAnnouncementTitle').focus()}));
  actions.append(button(a.active?'Unpublish':'Publish',async()=>{
   if(!confirm((a.active?'Unpublish':'Publish')+' this announcement?'))return;
   await saveAnnouncement(a.id,a.title,a.body,!a.active);
  },a.active?'danger':'primary'));
  entry.append(text,actions);list.append(entry);
 }
}
async function saveAnnouncement(id,title,body,active){
 const {data,error}=await db().rpc('useme_save_announcement',{p_id:uuid(id)?id:null,p_title:title,p_body:body,p_active:active});
 if(error){toast('Announcement not saved: '+error.message,'error');return false}
 toast(active?'Announcement published.':'Announcement draft saved.','success');
 await loadOwnerAnnouncements();await window.usemeLoadPublicExperience();
 return true;
}
window.usemeOwnerSaveAnnouncement=async function(){
 const title=$('ownerAnnouncementTitle').value.trim(),body=$('ownerAnnouncementBody').value.trim(),id=$('ownerAnnouncementId').value;
 if(title.length<3||body.length<5){toast('Write a title and message first.','error');return}
 const ok=await saveAnnouncement(id,title,body,$('ownerAnnouncementActive').checked);
 if(ok){$('ownerAnnouncementId').value='';$('ownerAnnouncementTitle').value='';$('ownerAnnouncementBody').value='';$('ownerAnnouncementActive').checked=false}
};
window.usemeOwnerResetAnnouncement=()=>{for(const id of ['ownerAnnouncementId','ownerAnnouncementTitle','ownerAnnouncementBody'])$(id).value='';$('ownerAnnouncementActive').checked=false};
async function loadOwnerSettings(){
 const {data,error}=await db().from('useme_owner_settings')
  .select('min_delivery_lkr,reference_roundtrip_km,reference_delivery_lkr,marketplace_enabled,service_orders_enabled,owner_whatsapp,support_note,updated_at').eq('id',1).single();
 if(error){toast('Settings unavailable: '+error.message,'error');return}
 const fields={ownerSettingMinimum:'min_delivery_lkr',ownerSettingReferenceKm:'reference_roundtrip_km',ownerSettingBaseFee:'reference_delivery_lkr',ownerSettingWhatsApp:'owner_whatsapp',ownerSettingSupport:'support_note'};
 for(const [id,key]of Object.entries(fields)){const x=$(id);if(x)x.value=data[key]}
 $('ownerSettingMarketplace').checked=data.marketplace_enabled;
 $('ownerSettingServices').checked=data.service_orders_enabled;
 $('ownerSettingUpdated').textContent='Last updated '+dt(data.updated_at)+'. Changes affect new orders only.';
}
window.usemeOwnerSaveSettings=async function(){
 const data={
  min_delivery_lkr:Number($('ownerSettingMinimum').value),
  reference_roundtrip_km:Number($('ownerSettingReferenceKm').value),
  reference_delivery_lkr:Number($('ownerSettingBaseFee').value),
  owner_whatsapp:$('ownerSettingWhatsApp').value.trim().replace(/\D/g,''),
  support_note:$('ownerSettingSupport').value.trim(),
  marketplace_enabled:$('ownerSettingMarketplace').checked,
  service_orders_enabled:$('ownerSettingServices').checked
 };
 if(data.min_delivery_lkr<250||data.reference_delivery_lkr<data.min_delivery_lkr||data.reference_roundtrip_km<1||
  !/^94[0-9]{9}$/.test(data.owner_whatsapp)||data.support_note.length<5){
  toast('Please correct the minimum fee, reference rate, WhatsApp number or note.','error');return
 }
 if((!data.marketplace_enabled||!data.service_orders_enabled)&&
 !confirm('You are disabling new customer orders for one or more services. Existing orders stay unchanged. Continue?'))return;
 const {error}=await db().rpc('useme_owner_save_settings',{p:data});
 if(error){toast('Settings not saved: '+error.message,'error');return}
 toast('Owner settings saved in Supabase. New checkout requests use the updated fees and switches.','success');
 await Promise.allSettled([loadOwnerSettings(),window.usemeLoadPublicExperience(),loadOwnerAudit()]);
};
async function loadOwnerAudit(){
 const node=$('ownerAuditList');if(!node)return;
 const {data,error}=await db().from('useme_owner_audit')
  .select('id,actor_id,action,target_kind,target_id,meta,happened_at')
  .order('happened_at',{ascending:false}).limit(75);
 if(error){msg('ownerAuditList','Audit history unavailable',error.message);return}
 node.replaceChildren();
 if(!data?.length){msg('ownerAuditList','No recorded actions','New Settings, Product Review, Shop Status and Permission changes are logged from now on.');return}
 for(const a of data){
  const row=create('article','owner-audit-record');
  const headline=create('div','owner-audit-main');headline.append(create('strong','',a.action),create('small','',dt(a.happened_at)));
  row.append(headline,create('p','owner-muted',(a.target_kind||'Record')+' · '+String(a.target_id||'—').slice(0,40)+' · actor '+String(a.actor_id||'System').slice(0,8)));
  node.append(row);
 }
}
async function refreshSection(tab){
 if(userRole!=='owner')return;
 const load={overview:loadOwnerOverview,shops:loadOwnerShops,catalogue:loadOwnerCatalogue,users:loadOwnerProfiles,
  announcements:loadOwnerAnnouncements,settings:loadOwnerSettings,audit:loadOwnerAudit};
 if(load[tab])try{await load[tab]()}catch(e){toast('Section temporarily unavailable: '+normalizeError(e),'error')}
}
window.usemeOwnerOpen=async function(){
 const gate=$('ownerAccessGate'),panel=$('ownerControlPanel');
 if(!gate||!panel||!db())return;
 if(ownerLoading)return;
 ownerLoading=true;
 try{
  const info=await roleInfo();userRole=info.role;lastUser=info.user;
  gate.classList.toggle('hidden',info.role==='owner');
  panel.classList.toggle('hidden',info.role!=='owner');
  const accountLink=$('ownerAccountAccess');if(accountLink)accountLink.classList.toggle('hidden',info.role!=='owner');
  const sellerLink=$('ownerSellerAccess');if(sellerLink)sellerLink.classList.toggle('hidden',info.role!=='owner');
  if(info.role==='owner'){
   const name=$('ownerGreeting');
   if(name)name.textContent='Private Owner Control · authenticated';
   setTab(currentTab);await refreshSection(currentTab);
  }else if(!info.user){
   msg('ownerAccessGate','Owner login required','Please sign in to your verified USE ME Owner account in Profile before opening this control center.');
  }else{
   msg('ownerAccessGate','Private area','This account has no full platform Owner permissions. Shop partners may only manage their listings.');
  }
 }catch(e){msg('ownerAccessGate','Authorization check unavailable','Try again after signing in. No private data is displayed.')}
 finally{ownerLoading=false}
};
window.usemeOwnerReload=()=>refreshSection(currentTab);
window.usemeOwnerExportOrders=async function(){
 const info=await roleInfo();if(info.role!=='owner'){toast('Owner access required','error');return}
 if(!confirm('Download a private CSV containing customer addresses and phone numbers? Store it securely and do not share publicly.'))return;
 const {data,error}=await db().from('orders')
  .select('id,service_type,status,recipient_name,recipient_phone,delivery_address,items_subtotal_lkr,delivery_fee_lkr,final_items_subtotal_lkr,final_delivery_fee_lkr,created_at')
  .order('created_at',{ascending:false}).limit(500);
 if(error){toast(error.message,'error');return}
 const names=['id','service_type','status','recipient_name','recipient_phone','delivery_address','items_subtotal_lkr','delivery_fee_lkr','final_items_subtotal_lkr','final_delivery_fee_lkr','created_at'];
 const csv=v=>{
  let str=String(v??'');
  if(/^[=+\-@\t\r]/.test(str))str="'"+str;
  return '"'+str.replace(/"/g,'""')+'"';
 };
 const rows=[names.map(csv).join(','),...(data||[]).map(x=>names.map(k=>csv(x[k])).join(','))].join('\r\n');
 const file=new Blob([String.fromCharCode(0xfeff)+rows],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(file),anchor=document.createElement('a');
 anchor.href=url;anchor.download='useme-private-orders-'+new Date().toISOString().slice(0,10)+'.csv';
 anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 toast('Private CSV prepared. Up to 500 recent order records; not a financial statement.','success');
};
function renderPublicAnnouncements(data){
 const visible=(data||[]).filter(x=>x.active).slice(0,3);
 for(const page of ['buy','offers','placeorder','send']){
  const section=$(page);if(!section)continue;
  let box=section.querySelector('[data-public-owner-announcements]');
  if(!box){box=create('div','owner-public-announcements');box.dataset.publicOwnerAnnouncements='true';
   const stage=section.querySelector('.v3-page-stage');
   if(stage)stage.insertAdjacentElement('afterend',box);else section.prepend(box)}
  box.replaceChildren();
  for(const a of visible){
   const item=create('article','owner-public-notice');
   item.append(create('strong','','📢 '+a.title),create('p','',a.body));
   box.append(item);
  }
  box.classList.toggle('hidden',!visible.length);
 }
}
window.usemeLoadPublicExperience=async function(){
 if(!db())return;
 const [c,a]=await Promise.allSettled([
  db().rpc('useme_public_config'),
  db().from('useme_announcements').select('title,body,active').eq('active',true).order('created_at',{ascending:false}).limit(3)
 ]);
 if(c.status==='fulfilled'&&!c.value.error&&c.value.data){
  publicData={...defaults,...c.value.data};window.usemePublicSettings=publicData;
  const support=$('ownerPublicOrderingNotice');
  if(support)support.textContent=publicData.support_note;
  if(typeof renderLiveCart==='function')renderLiveCart();
  if(typeof calcFare==='function')calcFare();
  if(typeof updateServiceFee==='function')updateServiceFee();
 }
 if(a.status==='fulfilled'&&!a.value.error)renderPublicAnnouncements(a.value.data);
};
function init(){
 const section=$('ownerControlPanel');if(!section)return;
 document.querySelectorAll('#ownerControlPanel [data-owner-tab]').forEach(b=>b.onclick=()=>window.usemeOwnerTab(b.dataset.ownerTab));
 $('ownerShopFilter')?.addEventListener('change',loadOwnerShops);
 $('ownerProductFilter')?.addEventListener('input',()=>{if(userRole==='owner')loadOwnerCatalogue()});
 $('ownerUserSearch')?.addEventListener('input',()=>{if(userRole==='owner')renderProfiles()});
 window.usemeLoadPublicExperience().catch(()=>{});
 if(location.pathname==='/owner')window.usemeOwnerOpen();
 db()?.auth.onAuthStateChange((_event,session)=>{
  setTimeout(()=>{if(location.pathname==='/owner')window.usemeOwnerOpen();else{
   const link=$('ownerAccountAccess'),seller=$('ownerSellerAccess');
   if(!session){link?.classList.add('hidden');seller?.classList.add('hidden')}
   else roleInfo().then(r=>{
    link?.classList.toggle('hidden',r.role!=='owner');
    seller?.classList.toggle('hidden',r.role!=='owner');
   }).catch(()=>{});
  }},0);
 });
 roleInfo().then(r=>{
  $('ownerAccountAccess')?.classList.toggle('hidden',r.role!=='owner');
  $('ownerSellerAccess')?.classList.toggle('hidden',r.role!=='owner');
 }).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();