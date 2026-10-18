/* USE ME V9 — Owner auto-dispatch and IN-APP road directions
   Supplements existing private Leaflet map; never creates orders or changes fees/status.
   Exact pickup/customer coordinates remain Owner-only. OSRM is used only after click+confirmation.
*/
(function(){
'use strict';
const $=id=>document.getElementById(id);
const db=()=>typeof usemeDb==='undefined'?null:usemeDb;
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x};
const b=(label,click,cls)=>{const x=el('button',cls||'v9-auto-btn',label);x.type='button';x.addEventListener('click',click);return x};
const uuid=x=>/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(x||''));
const valid=p=>p&&p.lat!==null&&p.lat!==undefined&&p.lng!==null&&p.lng!==undefined&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180;
const km=m=>(Number(m)/1000).toFixed(2)+' km';
const min=s=>Math.max(0,Math.round(Number(s)/60))+' min';
const msg=s=>{const x=$('v9AutoDispatchStatus');if(x)x.textContent=String(s||'')};
let itinerary=[],checkIds=new Set(),lastOrderId=null,buildBusy=false,mapPin=null;
async function owner(){
 if(!db())return false;
 const u=await db().auth.getUser();
 if(!u.data?.user||u.error)return false;
 const o=await db().rpc('is_owner');
 return !o.error&&o.data===true;
}
function waypoint(p,label,kind,orderId){
 return {lat:Math.round(Number(p.lat)*1e6)/1e6,lng:Math.round(Number(p.lng)*1e6)/1e6,
  label:String(label).slice(0,100),kind,orderId:orderId||null};
}
async function dbTable(table,select){return db().from(table).select(select)}
async function loadOrigin(){
 const saved=await dbTable('useme_v9_owner_dispatch_base','label,latitude,longitude,updated_at').eq('id',1).maybeSingle();
 if(saved.error)throw Error('Could not read your private dispatch base: '+saved.error.message);
 if(saved.data&&valid({lat:saved.data.latitude,lng:saved.data.longitude})){
  return {lat:Number(saved.data.latitude),lng:Number(saved.data.longitude),
   name:String(saved.data.label||'Saved Dispatch Base')+' · fixed, not live',source:'fixed'};
 }
 const live=await dbTable('useme_v9_owner_rate_origin','latitude,longitude,accuracy_m,updated_at,expires_at,enabled').eq('id',1).maybeSingle();
 if(live.error)throw Error('Cannot read Owner location: '+live.error.message);
 const p=live.data;
 if(p?.enabled&&new Date(p.expires_at).getTime()>Date.now()&&Date.now()-new Date(p.updated_at).getTime()<180000
  &&Number(p.accuracy_m)<=1500&&valid({lat:p.latitude,lng:p.longitude})){
  return {lat:Number(p.latitude),lng:Number(p.longitude),name:'Owner active private GPS · live',source:'live'};
 }
 throw Error('First set your Owner Dispatch Base with the “Save Selected Dispatch Base Once” button above. A fresh opted-in pricing GPS can also be used.');
}
async function selectedOrder(){
 const id=$('v9OwnerOrderSelect')?.value;
 if(!uuid(id))throw Error('Choose a customer Order first.');
 const r=await dbTable('orders','id,status,service_type,shop_id,delivery_latitude,delivery_longitude,delivery_address')
   .eq('id',id).maybeSingle();
 if(r.error||!r.data)throw Error('Order unavailable to your verified Owner account.');
 return r.data;
}
async function shopIdsForOrder(o){
 const ids=new Set();
 if(uuid(o.shop_id))ids.add(o.shop_id);
 const items=await dbTable('order_items','product_id,product_name').eq('order_id',o.id).limit(150);
 if(items.error)throw Error('Could not load Order Items: '+items.error.message);
 const pids=[...new Set((items.data||[]).map(x=>x.product_id).filter(uuid))];
 if(pids.length){
  const products=await dbTable('products','id,shop_id').in('id',pids);
  if(products.error)throw Error('Could not check ordered products: '+products.error.message);
  const indexed=new Map((products.data||[]).map(x=>[x.id,x.shop_id]));
  if(pids.some(id=>!indexed.has(id)))throw Error('Some ordered product records are no longer available. Verify shop pickup details manually; no route was guessed.');
  for(const id of pids){
   const shop=indexed.get(id);
   if(!uuid(shop))throw Error('A purchased product has no verified shop ID. Manual pickup review required.');
   ids.add(shop);
  }
 }
 return [...ids];
}
async function loadShopPoints(ids,orderId){
 if(!ids.length)return [];
 const [shops,pins]=await Promise.all([
  dbTable('shops','id,name,status').in('id',ids),
  dbTable('shop_pickup_details','shop_id,pickup_address,latitude,longitude').in('shop_id',ids)
 ]);
 if(shops.error||pins.error)throw Error('Shop pickup details are unavailable. Use manual Owner route planning.');
 const names=new Map((shops.data||[]).map(s=>[s.id,s]));
 const locations=new Map((pins.data||[]).map(s=>[s.shop_id,s]));
 const result=[];
 for(const id of ids){
  const s=names.get(id),p=locations.get(id);
  if(!s||s.status!=='approved')throw Error('A Shop in this order is not currently approved. Confirm the pickup address manually.');
  if(!p||!valid({lat:p.latitude,lng:p.longitude}))throw Error('Missing GPS Pickup Pin for '+String(s.name||'a shop').slice(0,90)+'. Ask the shop to confirm its pickup location before creating an automatic road route.');
  result.push(waypoint({lat:p.latitude,lng:p.longitude},'🏪 '+s.name,'shop',orderId));
 }
 return result;
}
function checklist(){
 const root=$('v9AutoDispatchChecklist');if(!root)return;
 root.replaceChildren();
 if(!itinerary.length){root.append(el('p','v9-auto-muted','Build a real order route to see its pickup checklist.'));return}
 const all=itinerary.filter((s,i)=>i>0&&i<itinerary.length-1);
 const checked=all.filter((s,i)=>checkIds.has(String(i))).length;
 const heading=el('p','v9-auto-progress',checked+' / '+all.length+' stops checked in this browser session (not saved to Order status)');
 root.append(heading);
 all.forEach((p,i)=>{
  const label=el('label','v9-auto-check');
  const input=el('input');input.type='checkbox';input.checked=checkIds.has(String(i));input.setAttribute('aria-label','Visited '+p.label);
  input.addEventListener('change',()=>{if(input.checked)checkIds.add(String(i));else checkIds.delete(String(i));const allNow=all.filter((x,j)=>checkIds.has(String(j))).length;heading.textContent=allNow+' / '+all.length+' stops checked in this browser session (not saved to Order status)'});
  label.append(input,el('span','',p.label));root.append(label);
 });
}
function routeSummary(stops,origin){
 const root=$('v9AutoDispatchSummary');if(!root)return;
 root.replaceChildren();
 const n=stops.filter(x=>x.kind==='shop').length;
 const lead=el('div','v9-auto-journey','📍 '+origin.name+' → '+n+' verified Shop Pickup'+(n===1?'':'s')+' → Customer → return to dispatch base');
 const last=el('p','v9-auto-muted','Full route has '+Math.max(0,stops.length-1)+' road legs. Stops can be moved using ↑ ↓ below. No road KM, ETA or customer fee is assumed until Road Route Preview succeeds.');
 root.append(lead,last);
}
async function autoBuild(){
 if(buildBusy)return;
 const btn=$('v9AutoBuildRoute');buildBusy=true;if(btn)btn.disabled=true;
 msg('Checking private Order, approved shops, pickup GPS pins and your saved dispatch base...');
 try{
  if(!await owner())throw Error('Verified USE ME Owner sign-in is required.');
  const order=await selectedOrder();
  if(order.status==='delivered'||order.status==='cancelled')throw Error('This Order is closed. Use an active Order for a new delivery route.');
  if(!valid({lat:order.delivery_latitude,lng:order.delivery_longitude}))throw Error('Customer delivery GPS pin is missing. Ask the customer to select and share their location.');
  const ids=await shopIdsForOrder(order);
  if(!ids.length){
   throw Error('This direct/parcel Order has no Shop GPS pickup. Confirm the REAL sender pickup point and add it manually to the Route Planner. We must not assume pickup occurs at the dispatch base.');
  }
  if(ids.length>9)throw Error('Order has more than nine shop pickups. Split it into separate Owner-approved routes; do not silently omit any stops.');
  const [start,shopPoints]=await Promise.all([loadOrigin(),loadShopPoints(ids,order.id)]);
  const base=waypoint(start,'🛵 '+start.name,'owner',order.id);
  const destination=waypoint({lat:order.delivery_latitude,lng:order.delivery_longitude},'🏠 Customer · Order '+order.id.slice(0,8),'customer',order.id);
  const full=[base,...shopPoints,destination,{...base,label:'🏁 Return · '+start.name}];
  if(full.length>12)throw Error('Route has too many points. Split and verify stops manually.');
  if(!window.usemeV9Maps?.ownerSetStops)throw Error('USE ME Owner Map is still loading. Try again.');
  await window.usemeV9Maps.ownerSetStops(full,order.id);
  itinerary=full;checkIds.clear();lastOrderId=order.id;checklist();routeSummary(full,start);
  msg('✓ Complete '+shopPoints.length+'-shop order route built INSIDE USE ME. Check the pickup sequence, then tap 🛣️ Road Route Preview to consent to third-party routing and see real road KM, ETA and written directions.');
  $('v9AutoDispatchRouteDirections')?.replaceChildren();
  $('v9AutoDispatchRouteDirections').hidden=true;
 }catch(error){
  msg('⚠️ '+String(error?.message||error));
 }finally{buildBusy=false;if(btn)btn.disabled=false}
}
function instruction(step){
 const m=step?.maneuver||{};
 const mod=String(m.modifier||'').replaceAll('_',' ');
 const type=String(m.type||'continue').replaceAll('_',' ');
 const road=String(step?.name||'').trim().slice(0,110);
 const direction=type==='depart'?'Start':type==='arrive'?'Arrive at stop':
 type==='turn'?'Turn'+(mod?' '+mod:''):
 type==='new name'?'Continue':type==='roundabout'||type==='rotary'?'Enter roundabout':
 type==='merge'?'Merge'+(mod?' '+mod:''):
 type==='fork'?'Keep'+(mod?' '+mod:''):
 type==='on ramp'?'Take ramp'+(mod?' '+mod:''):
 type==='off ramp'?'Take exit'+(mod?' '+mod:''):
 type==='end of road'?'At end of road, turn'+(mod?' '+mod:''):
 type==='continue'?'Continue':type.charAt(0).toUpperCase()+type.slice(1)+(mod?' '+mod:'');
 return direction+(road?' onto '+road:'')+'.';
}
function focusManeuver(map,step){
 const p=step?.maneuver?.location;
 if(!Array.isArray(p)||!valid({lat:p[1],lng:p[0]})||!map)return;
 map.setView([p[1],p[0]],16,{animate:true});
 map.getContainer()?.focus?.();
}
function showDirections(route,waypoints,map){
 const root=$('v9AutoDispatchRouteDirections');if(!root)return;
 root.replaceChildren();root.hidden=false;
 if(!route||!Array.isArray(route.legs)||!route.legs.length||!Array.isArray(waypoints)||waypoints.length<2){
  root.append(el('p','v9-auto-muted','Road maneuver data not returned by routing service. Verify route on the map.'));return;
 }
 const heading=el('div','v9-auto-road-header');
 heading.append(el('h3','','🧭 In-app Road Directions'),el('p','','Road distance: '+km(route.distance)+' · Estimated driving: '+min(route.duration)+' · Traffic not included · Third-party routing preview'));
 root.append(heading);
 route.legs.forEach((leg,index)=>{
  const group=el('details','v9-auto-leg');
  if(index===0)group.open=true;
  const name=el('summary','',String(waypoints[index]?.label||'Stop '+(index+1)).slice(0,100)+' → '+String(waypoints[index+1]?.label||'Stop '+(index+2)).slice(0,100)+' · '+km(leg.distance)+' · '+min(leg.duration));
  group.append(name);
  if(!Array.isArray(leg.steps)||!leg.steps.length){
   group.append(el('p','v9-auto-muted','No individual maneuvers returned for this road segment.'));root.append(group);return;
  }
  const ordered=el('ol','v9-auto-turn-list'),limit=200;
  leg.steps.slice(0,limit).forEach(step=>{
   const li=el('li','v9-auto-turn');
   const left=el('div','v9-auto-turn-text');
   left.append(el('span','',instruction(step)),el('small','',step.distance>0?Math.round(step.distance)+' m':'At stop'));
   const view=b('See on map',()=>focusManeuver(map,step),'v9-auto-mini');
   li.append(left,view);ordered.append(li);
  });
  group.append(ordered);
  if(leg.steps.length>limit)group.append(el('p','v9-auto-muted','Some maneuvers were omitted because this route has more than '+limit+' instructions in one leg. Open a shorter route for full details.'));
  root.append(group);
 });
 const notice=el('p','v9-auto-warning','Not live turn-by-turn navigation. Check road signs, closures, and driving conditions. Do not operate phone controls while riding. This does not update order status or confirm the customer fee.');
 root.append(notice);
}
function invalidateRoute(){
 const root=$('v9AutoDispatchRouteDirections');if(root){root.replaceChildren();root.hidden=true}
}
function init(){
 $('v9AutoBuildRoute')?.addEventListener('click',autoBuild);
 $('v9AutoDispatchChecklist')?.replaceChildren();
 msg('Owner only: select an active shop order and build a real pickup → drop-off → return route.');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.usemeDispatchV9ShowDirections=showDirections;
window.usemeDispatchV9InvalidateRoute=invalidateRoute;
})();