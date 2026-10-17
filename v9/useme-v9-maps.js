/* USE ME V9 MAPS — independently routed, consent-first location suite.
  Shared legacy state and checkout unchanged. Public mapping may load map tiles from
  OpenStreetMap. Optional road preview sends ONLY selected coordinates to OSRM after consent.
*/
(function(){
'use strict';
const $=id=>document.getElementById(id);
const db=()=>typeof usemeDb!=='undefined'?usemeDb:null;
const dom=(name,cls,txt)=>{const e=document.createElement(name);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e};
const action=(label,fn,cls)=>{const e=dom('button',cls||'v9-button',label);e.type='button';e.addEventListener('click',fn);return e};
const info=(id,msg)=>{const e=$(id);if(e)e.textContent=msg};
const isUUID=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''));
const validCoord=(lat,lng)=>lat!==null&&lat!==undefined&&lat!==''&&lng!==null&&lng!==undefined&&lng!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lng))<=180;
const six=n=>Math.round(Number(n)*1e6)/1e6;
const point=(lat,lng,label,kind,orderId)=>({lat:six(lat),lng:six(lng),label:String(label||'Map pin').slice(0,100),kind:kind||'manual',orderId:orderId||null});
const km=(p,q)=>{const toRad=Math.PI/180,R=6371;const dlat=(q.lat-p.lat)*toRad,dlon=(q.lng-p.lng)*toRad;const a=Math.sin(dlat/2)**2+Math.cos(p.lat*toRad)*Math.cos(q.lat*toRad)*Math.sin(dlon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))};
let mapPromise=null,maps={},layers={},publicPosition=null,manualPoint=null,selectedPoint=null,ownerOrders=[],ownerShops=new Map(),ownerPickup=new Map(),selectedOrder=null;
let stops=[],routeLayer=null,sharingOrder=null,gpsWatch=null,shareHeartbeat=null,lastPublishedAt=0,lastLocation=null,sessionStart=0,trackingInterval=null,sharingBusy=false,routePlans=[];
const iconColors={shop:'#1677c9',customer:'#f68c24',owner:'#0ba575',manual:'#6455c5',private:'#405a90'};
const iconGlyphs={shop:'🏪',customer:'🏠',owner:'🛵',manual:'📍',private:'📌'};
const haveMap=async()=>{
 if(window.L)return window.L;
 if(mapPromise)return mapPromise;
 mapPromise=new Promise((resolve,reject)=>{
  if(!document.getElementById('v9LeafletCss')){
   const link=dom('link');link.id='v9LeafletCss';link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(link);
  }
  const script=dom('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.async=true;script.crossOrigin='anonymous';
  script.onload=()=>window.L?resolve(window.L):reject(Error('Map library failed to initialize'));
  script.onerror=()=>reject(Error('Map library not available. Check your internet connection.'));
  document.head.append(script);
 }).catch(e=>{mapPromise=null;throw e});
 return mapPromise;
};
async function initMap(id,opts={}){
 const container=$(id);if(!container)return null;
 if(maps[id]){setTimeout(()=>maps[id].invalidateSize(),100);return maps[id]}
 try{
  const L=await haveMap();
  if(!container.isConnected)return null;
  maps[id]=L.map(container,{zoomControl:true,scrollWheelZoom:false,preferCanvas:true}).setView([7.8731,80.7718],7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
   attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
   maxZoom:19
  }).addTo(maps[id]);
  layers[id]=L.layerGroup().addTo(maps[id]);
  if(opts.pick)maps[id].on('click',e=>onMapClick(id,e.latlng));
  setTimeout(()=>maps[id]?.invalidateSize(),160);
  return maps[id];
 }catch(e){info(opts.status||'v9PublicStatus','Map could not load: '+e.message);return null}
}
function clearMarkers(id){if(layers[id])layers[id].clearLayers()}
function marker(id,p,colorKey,popupContent){
 if(!validCoord(p.lat,p.lng)||!maps[id]||!window.L)return null;
 const L=window.L,c=iconColors[colorKey]||iconColors.manual;
 const icon=L.divIcon({className:'v9-map-pin',html:'<span style="background:'+c+'">'+(iconGlyphs[colorKey]||'📍')+'</span>',
 iconSize:[34,39],iconAnchor:[17,38]});
 const m=L.marker([p.lat,p.lng],{icon}).addTo(layers[id]);
 m.bindPopup(dom('div','',popupContent||p.label));return m;
}
function fit(id,positions){
 const p=positions.filter(x=>x&&validCoord(x.lat,x.lng));
 if(!maps[id]||!p.length||!window.L)return;
 if(p.length===1)maps[id].setView([p[0].lat,p[0].lng],16,{animate:false});
 else maps[id].fitBounds(window.L.latLngBounds(p.map(x=>[x.lat,x.lng])).pad(.17),{maxZoom:16});
}
function gpsOnce(){
 return new Promise((resolve,reject)=>{
  if(!window.isSecureContext||!navigator.geolocation)return reject(Error('HTTPS and browser GPS are required. You may select a pin manually.'));
  navigator.geolocation.getCurrentPosition(p=>resolve({lat:six(p.coords.latitude),lng:six(p.coords.longitude),
   accuracy:Math.min(100000,Math.max(0,Math.round(p.coords.accuracy||0)))}),reject,{enableHighAccuracy:true,maximumAge:0,timeout:25000});
 });
}
async function locateManual(){
 info('v9PublicStatus','Requesting your location with browser permission. It will stay on this device until you choose to save.');
 try{
  const p=await gpsOnce();publicPosition=p;
  manualPoint=point(p.lat,p.lng,'My current position','private');
  await initMap('v9PublicMap',{pick:true,status:'v9PublicStatus'});
  paintPublic();info('v9PublicStatus','✓ GPS ±'+p.accuracy+' m. Coordinates NOT sent to USE ME automatically. Save a place only if you choose.');
 }catch(e){info('v9PublicStatus',e.code===1?'Location permission denied. Tap the map to choose a location manually.':e.message||'Unable to find GPS.')}
}
function onMapClick(id,latlng){
 if(id==='v9PublicMap'){manualPoint=point(latlng.lat,latlng.lng,'Chosen place','manual');paintPublic();info('v9PublicStatus','Selected a pin manually. It is not saved or shared until you press Save Place.');}
 if(id==='v9OwnerMap'&&$('v9MapClickMode')?.checked){
  const txt=prompt('Enter a short stop label (no customer phone/address required):','New route stop');
  if(!txt||txt.trim().length<2)return;
  addStop(point(latlng.lat,latlng.lng,txt.trim(),'manual'));
 }
}
async function paintPublic(){
 const m=await initMap('v9PublicMap',{pick:true,status:'v9PublicStatus'});if(!m)return;
 clearMarkers('v9PublicMap');
 if(manualPoint){marker('v9PublicMap',manualPoint,manualPoint.kind,'Your selected pin · '+manualPoint.lat+', '+manualPoint.lng);fit('v9PublicMap',[manualPoint]);}
}
async function savePlace(){
 const u=await signedIn();if(!u)return;
 if(!manualPoint)return info('v9PublicStatus','Tap Locate Me or tap the map to choose a pin first.');
 const label=$('v9PlaceLabel')?.value.trim(),address=$('v9PlaceAddress')?.value.trim()||'';
 if(!label||label.length<2)return info('v9PublicStatus','Enter a name for this place.');
 const r=await db().from('useme_v9_saved_places').insert({user_id:u.id,label,address_text:address,latitude:manualPoint.lat,longitude:manualPoint.lng});
 info('v9PublicStatus',r.error?'Could not save place: '+r.error.message:'✓ Saved privately to your account. No order is placed.');
 if(!r.error)loadSavedPlaces();
}
async function loadSavedPlaces(){
 const root=$('v9SavedPlaces');if(!root||!db())return;
 root.replaceChildren();
 const u=await silentUser();
 if(!u){root.append(dom('p','v9-muted','Sign in to save and manage personal places.'));return}
 const r=await db().from('useme_v9_saved_places').select('id,label,address_text,latitude,longitude,created_at')
   .eq('user_id',u.id).order('created_at',{ascending:false}).limit(50);
 if(r.error){root.append(dom('p','v9-muted','Saved places unavailable.'));return}
 if(!r.data?.length){root.append(dom('p','v9-muted','No private places saved yet.'));return}
 r.data.forEach(place=>{
  const row=dom('div','v9-place-item');
  const names=dom('div');names.append(dom('strong','',place.label),dom('small','',place.address_text||'GPS coordinates saved privately'));
  const buttons=dom('div','v9-row');
  buttons.append(action('Show pin',()=>{
   if(!validCoord(place.latitude,place.longitude))return;
   manualPoint=point(place.latitude,place.longitude,place.label,'private');paintPublic();
  },'v9-button-small'));
  buttons.append(action('Delete',async()=>{
   if(!confirm('Delete this saved place from your account?'))return;
   const res=await db().from('useme_v9_saved_places').delete().eq('id',place.id).eq('user_id',u.id);
   if(res.error)info('v9PublicStatus','Unable to delete: '+res.error.message);else loadSavedPlaces();
  },'v9-danger-small'));
  row.append(names,buttons);root.append(row);
 });
}
async function silentUser(){if(!db())return null;try{return (await db().auth.getUser()).data?.user||null}catch(e){return null}}
async function signedIn(){const u=await silentUser();if(!u){info('v9PublicStatus','Sign in first to save locations.');if(typeof go==='function')go('account')}return u}
async function ownerAuth(){const u=await silentUser();if(!u)return null;const r=await db().rpc('is_owner');return !r.error&&r.data===true?u:null}
const fmtOrder=o=>o.service_type+' · '+o.id.slice(0,8)+' · '+o.status.replace(/_/g,' ');
async function loadDispatch(){
 const root=$('v9DispatchOrders'),sel=$('v9OwnerOrderSelect');if(!root||!sel||!db())return;
 root.replaceChildren();sel.replaceChildren();
 const u=await ownerAuth();
 if(!u){
  info('v9OwnerAuth','🔒 Owner-only map. Sign in with your verified USE ME Owner account.');
  $('v9OwnerTools').hidden=true;
  return;
 }
 info('v9OwnerAuth','✓ Verified USE ME Owner. Only you may view private customer pickup/delivery pins.');
 $('v9OwnerTools').hidden=false;
 const [orders,shopData,pickup]=await Promise.all([
  db().from('orders').select('id,customer_id,shop_id,status,service_type,delivery_latitude,delivery_longitude,delivery_location_accuracy_m,delivery_address,created_at')
  .order('created_at',{ascending:false}).limit(120),
  db().from('shops').select('id,name,status').limit(200),
  db().from('shop_pickup_details').select('shop_id,pickup_address,latitude,longitude,location_accuracy_m').limit(200)
 ]);
 if(orders.error){info('v9OwnerStatus','Unable to load orders: '+orders.error.message);return}
 ownerOrders=orders.data||[];
 ownerShops=new Map((shopData.data||[]).map(x=>[x.id,x]));
 ownerPickup=new Map((pickup.data||[]).map(x=>[x.shop_id,x]));
 const empty=dom('option','','Select an order');empty.value='';sel.append(empty);
 ownerOrders.forEach(o=>{const opt=dom('option','',fmtOrder(o));opt.value=o.id;sel.append(opt)});
 info('v9OwnerStatus','Loaded '+ownerOrders.length+' recent orders. GPS pins appear only if previously shared by the customer/shop.');
 if(!ownerOrders.length){root.append(dom('p','v9-muted','No orders available.'));return}
 ownerOrders.slice(0,85).forEach(o=>{
  const card=dom('article','v9-dispatch-order');
  const shopName=ownerShops.get(o.shop_id)?.name||'Direct delivery';
  card.append(dom('strong','',o.service_type+' · '+o.id.slice(0,8)),dom('small','',shopName+' · '+o.status.replace(/_/g,' ')));
  const controls=dom('div','v9-row');
  controls.append(action('Show pins',()=>{sel.value=o.id;selectOwnerOrder(o.id)},'v9-button-small'));
  controls.append(action('Pickup +',()=>addShopStop(o),'v9-button-small'));
  controls.append(action('Drop-off +',()=>addCustomerStop(o),'v9-button-small'));
  card.append(controls);root.append(card);
 });
 await initMap('v9OwnerMap',{pick:true,status:'v9OwnerStatus'});
 if(selectedOrder&&ownerOrders.some(x=>x.id===selectedOrder.id))await selectOwnerOrder(selectedOrder.id);
}
async function selectOwnerOrder(orderId){
 selectedOrder=ownerOrders.find(x=>x.id===orderId)||null;
 $('v9OwnerOrderSelect').value=selectedOrder?.id||'';
 if(!selectedOrder)return;
 await paintOwnerMap();
 info('v9OwnerStatus','Order '+selectedOrder.id.slice(0,8)+' selected · '+selectedOrder.status.replace(/_/g,' ')+' · Customer GPS '+(validCoord(selectedOrder.delivery_latitude,selectedOrder.delivery_longitude)?'shared':'not shared'));
}
const shopPin=o=>{
 const p=ownerPickup.get(o.shop_id);
 return p&&validCoord(p.latitude,p.longitude)?point(p.latitude,p.longitude,'Shop pickup · '+(ownerShops.get(o.shop_id)?.name||'Shop'),'shop',o.id):null;
};
const customerPin=o=>validCoord(o.delivery_latitude,o.delivery_longitude)?point(o.delivery_latitude,o.delivery_longitude,'Customer drop-off · #'+o.id.slice(0,8),'customer',o.id):null;
function addShopStop(o){const p=shopPin(o);if(!p)return info('v9OwnerStatus','Shop GPS not shared. Ask the shop to provide pickup GPS before planning this stop.');addStop(p)}
function addCustomerStop(o){const p=customerPin(o);if(!p)return info('v9OwnerStatus','Customer has not shared a GPS pin for this order. Typed addresses remain available on Order Details.');addStop(p)}
function addStop(p){
 if(!validCoord(p.lat,p.lng))return;
 if(stops.length>=12)return info('v9OwnerStatus','Maximum 12 stops per route plan.');
 if(stops.some(x=>x.lat===p.lat&&x.lng===p.lng&&x.orderId===p.orderId))return info('v9OwnerStatus','Stop is already in this plan.');
 stops.push({...p});renderStops();paintOwnerMap();
}
function renderStops(){
 const root=$('v9StopList');if(!root)return;root.replaceChildren();
 if(!stops.length){root.append(dom('p','v9-muted','Add pickup/drop-off pins from orders, enter coordinates, or enable Tap Map to Add.'));return}
 stops.forEach((p,i)=>{
  const row=dom('div','v9-stop-row');const copy=dom('div');
  copy.append(dom('b','',(i+1)+'. '+p.label),dom('small','',p.lat+', '+p.lng+' · '+(p.kind||'manual')));
  const controls=dom('div','v9-row');
  controls.append(action('↑',()=>moveStop(i,-1),'v9-stop-tool'));
  controls.append(action('↓',()=>moveStop(i,1),'v9-stop-tool'));
  controls.append(action('×',()=>{stops.splice(i,1);renderStops();paintOwnerMap()},'v9-stop-tool'));
  row.append(copy,controls);root.append(row);
 });
 if(stops.length>1){
  let total=0;for(let i=1;i<stops.length;i++)total+=km(stops[i-1],stops[i]);
  root.append(dom('p','v9-muted','Straight-line stop sequence '+total.toFixed(2)+' km (NOT road distance / customer delivery fee).'));
 }
}
function moveStop(i,d){const j=i+d;if(j<0||j>=stops.length)return;[stops[i],stops[j]]=[stops[j],stops[i]];renderStops();paintOwnerMap()}
function optimizeStops(){
 if(stops.length<3)return info('v9OwnerStatus','At least 3 stops are needed for optional order suggestions.');
 const start=stops[0],remaining=stops.slice(1),sorted=[start];
 while(remaining.length){remaining.sort((a,b)=>km(sorted[sorted.length-1],a)-km(sorted[sorted.length-1],b));sorted.push(remaining.shift())}
 stops=sorted;renderStops();paintOwnerMap();
 info('v9OwnerStatus','✓ Suggested nearest-neighbour stop order. This is straight-line estimation only; verify real road route and safety before driving.');
}
function manualStop(){
 const label=$('v9StopName').value.trim(),lat=Number($('v9StopLat').value),lng=Number($('v9StopLng').value);
 if(label.length<2||!validCoord(lat,lng))return info('v9OwnerStatus','Enter a stop label and valid latitude/longitude.');
 addStop(point(lat,lng,label,'manual'));$('v9StopName').value='';$('v9StopLat').value='';$('v9StopLng').value='';
}
async function paintOwnerMap(){
 const m=await initMap('v9OwnerMap',{pick:true,status:'v9OwnerStatus'});if(!m)return;
 clearMarkers('v9OwnerMap');
 if(routeLayer){m.removeLayer(routeLayer);routeLayer=null}
 const all=[...stops];
 if(selectedOrder){for(const p of [shopPin(selectedOrder),customerPin(selectedOrder)])if(p&&!all.some(x=>x.lat===p.lat&&x.lng===p.lng))all.push(p)}
 all.forEach(p=>marker('v9OwnerMap',p,p.kind,p.label));
 if(lastLocation){const p=point(lastLocation.lat,lastLocation.lng,'My current GPS','owner');marker('v9OwnerMap',p,'owner','Owner phone GPS · local map. Sharing only if explicitly enabled.');all.push(p)}
 if(stops.length>1&&window.L){
  routeLayer=window.L.polyline(stops.map(x=>[x.lat,x.lng]),{color:'#1375c2',weight:3,opacity:.67,dashArray:'5,9'}).addTo(m);
 }
 if(all.length)fit('v9OwnerMap',all);
}
async function previewRoad(){
 if(stops.length<2)return info('v9OwnerStatus','Add at least two stops before calculating a road preview.');
 const proceed=confirm('Road preview uses a public third-party OSRM demo service. This will send the selected stop GPS coordinates to that external service. It is a TEST preview, not guaranteed production navigation. Continue?');
 if(!proceed)return;
 info('v9OwnerStatus','Requesting in-app road route preview from OSRM (third-party). Please wait...');
 try{
  const points=stops.map(x=>x.lng+','+x.lat).join(';');
  const url='https://router.project-osrm.org/route/v1/driving/'+points+'?overview=full&geometries=geojson&steps=false';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);
  let response;try{response=await fetch(url,{signal:controller.signal,mode:'cors'})}finally{clearTimeout(timeout)}
  if(!response.ok)throw Error('Road routing provider returned '+response.status);
  const data=await response.json();
  const result=data.routes?.[0];
  if(data.code!=='Ok'||!result?.geometry?.coordinates?.length)throw Error('No drivable road route found');
  const m=await initMap('v9OwnerMap',{pick:true,status:'v9OwnerStatus'});
  if(routeLayer)m.removeLayer(routeLayer);
  routeLayer=window.L.geoJSON(result.geometry,{style:{color:'#12a574',weight:5,opacity:.9}}).addTo(m);
  m.fitBounds(routeLayer.getBounds().pad(.09));
  info('v9OwnerStatus','Road PREVIEW: '+(result.distance/1000).toFixed(2)+' km · '+Math.round(result.duration/60)+' minutes. Third-party estimate, not a fare quote; live traffic not included.');
 }catch(e){
  info('v9OwnerStatus','Road preview not available: '+e.message+'. Existing pins and approximate sequence remain available.');
 }
}
async function loadPlans(){
 const select=$('v9PlansSelect');if(!select||!await ownerAuth())return;
 const r=await db().from('useme_v9_route_plans').select('id,title,stops,updated_at').order('updated_at',{ascending:false}).limit(60);
 if(r.error){info('v9OwnerStatus','Saved route plans unavailable: '+r.error.message);return}
 routePlans=r.data||[];
 select.replaceChildren();const opt=dom('option','','Select saved private route');opt.value='';select.append(opt);
 routePlans.forEach(p=>{const opt=dom('option','',p.title+' · '+new Date(p.updated_at).toLocaleDateString());opt.value=p.id;select.append(opt)});
}
function recallPlan(){
 const p=routePlans.find(p=>p.id===$('v9PlansSelect')?.value);if(!p)return;
 stops=Array.isArray(p.stops)?p.stops.filter(x=>validCoord(x.lat,x.lng)).slice(0,12):[];
 $('v9PlanTitle').value=p.title;
 renderStops();paintOwnerMap();info('v9OwnerStatus','✓ Saved route restored privately. Recalculate road preview before driving.');
}
async function savePlan(){
 if(!await ownerAuth())return info('v9OwnerStatus','Owner login is required to save private dispatch routes.');
 const title=$('v9PlanTitle')?.value.trim();
 if(!title||title.length<3||stops.length<2)return info('v9OwnerStatus','Enter a route name and at least 2 GPS stops.');
 const payload=stops.map(p=>({lat:p.lat,lng:p.lng,label:String(p.label||'Stop').slice(0,100)}));
 const r=await db().from('useme_v9_route_plans').insert({title,stops:payload});
 info('v9OwnerStatus',r.error?'Could not save route: '+r.error.message:'✓ Route plan saved privately to Owner account; not available to shops/customers.');
 if(!r.error)loadPlans();
}
async function startShare(){
 if(sharingBusy||sharingOrder)return;
 if(!await ownerAuth())return info('v9LiveStatus','Verified Owner login required for live GPS sharing.');
 if(!selectedOrder||selectedOrder.status!=='out_for_delivery'){
  info('v9LiveStatus','Choose an order marked Out for Delivery to share Owner live GPS.');return;
 }
 if(!navigator.geolocation||!window.isSecureContext){
  info('v9LiveStatus','GPS requires a secure HTTPS browser and browser location permission.');return;
 }
 if(!confirm('Start sharing your LIVE phone GPS for this Out for Delivery order? ONLY that customer and your verified Owner account can read fresh positions. The sharing ends when you Stop, leave this page, or after 30 minutes.'))return;
 const orderId=selectedOrder.id;
 sharingBusy=true;sessionStart=Date.now();lastPublishedAt=0;sharingOrder=orderId;lastLocation=null;
 $('v9ShareButton').textContent='■ Stop Sharing Live GPS';
 $('v9ShareButton').classList.add('v9-stop-sharing');
 info('v9LiveStatus','Requesting phone location... No coordinates sent before your browser permits GPS.');
 shareHeartbeat=setInterval(()=>{if(!sharingOrder)return;if(Date.now()-sessionStart>30*60*1000){stopShare();return}if(lastLocation&&Date.now()-lastPublishedAt>20000&&!sharingBusy)publishLocation(lastLocation,orderId)},20000);
 gpsWatch=navigator.geolocation.watchPosition(async raw=>{
  if(sharingOrder!==orderId||Date.now()-sessionStart>30*60*1000){await stopShare();return}
  const coords=raw.coords;
  const p={lat:six(coords.latitude),lng:six(coords.longitude),accuracy:Math.min(100000,Math.max(0,Math.round(coords.accuracy||0))),
    heading:Number.isFinite(coords.heading)?coords.heading:null,speed:Number.isFinite(coords.speed)?coords.speed:null};
  lastLocation=p;
  if(Date.now()-lastPublishedAt>10000)await publishLocation(p,orderId);
  paintOwnerMap();
 },async error=>{
  info('v9LiveStatus',error.code===1?'GPS permission denied; sharing stopped.':'GPS error: '+error.message+'; sharing stopped.');
  await stopShare();
 },{enableHighAccuracy:true,maximumAge:0,timeout:25000});
 sharingBusy=false;
}
async function publishLocation(p,orderId){
 if(sharingOrder!==orderId||!p||sharingBusy)return;
 sharingBusy=true;
 try{
  const ret=await db().rpc('useme_v9_publish_owner_location',{
   p_order_id:orderId,p_lat:p.lat,p_lng:p.lng,p_accuracy_m:p.accuracy,p_heading:p.heading,p_speed:p.speed
  });
  if(ret.error){info('v9LiveStatus','Live sharing refused: '+ret.error.message);await stopShare();return}
  lastPublishedAt=Date.now();
  info('v9LiveStatus','● Live GPS ON for selected order only · GPS accuracy ±'+Math.round(p.accuracy)+' m · refreshed '+new Date().toLocaleTimeString()+'. Stops automatically within 30 minutes.');
 }finally{sharingBusy=false}
}
async function stopShare(){
 if(shareHeartbeat!==null){clearInterval(shareHeartbeat);shareHeartbeat=null}
 if(gpsWatch!==null&&navigator.geolocation){navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null}
 const old=sharingOrder;sharingOrder=null;sharingBusy=false;lastPublishedAt=0;lastLocation=null;
 if($('v9ShareButton')){$('v9ShareButton').textContent='▶ Start Live GPS Sharing';$('v9ShareButton').classList.remove('v9-stop-sharing')}
 if(old&&db()){
  try{
   const r=await db().rpc('useme_v9_stop_owner_location',{p_order_id:old});
   info('v9LiveStatus',r.error?'Browser GPS stopped. Server cleanup pending: '+r.error.message:'✓ Live GPS sharing stopped; precise location deleted from active sharing table.');
  }catch(e){info('v9LiveStatus','Browser GPS stopped. Server session will expire automatically if the network is offline.')}
 }else info('v9LiveStatus','Location sharing is OFF.');
 paintOwnerMap();
}
function toggleShare(){if(sharingOrder)stopShare();else startShare()}
function watchLeave(){
 if(sharingOrder&&(!$('ownerMap')?.classList.contains('active')||document.hidden))stopShare();
 if(!$('tracking')?.classList.contains('active'))stopTracking();
}
async function fillTrackingOrders(){
 const select=$('v9TrackingOrderSelect');if(!select||!db())return;
 const old=select.value;select.replaceChildren();
 const u=await silentUser();
 if(!u){info('v9TrackingInfo','Sign in to see your own orders and any Owner-shared live position.');return}
 const r=await db().from('orders').select('id,service_type,status,delivery_latitude,delivery_longitude,delivery_location_accuracy_m,delivery_address,shop_id,created_at')
  .eq('customer_id',u.id).order('created_at',{ascending:false}).limit(75);
 if(r.error){info('v9TrackingInfo','Unable to load your orders.');return}
 const data=r.data||[],option=dom('option','','Select one of your orders');option.value='';select.append(option);
 data.forEach(o=>{const op=dom('option','',fmtOrder(o));op.value=o.id;select.append(op)});
 let fromUrl=location.pathname.match(/^\/tracking\/([0-9a-f-]{36})\/?$/i)?.[1];
 if(fromUrl&&!data.some(o=>o.id===fromUrl))fromUrl=null;
 const id=fromUrl||old;
 if(id&&data.some(o=>o.id===id))select.value=id;
 if(select.value)await refreshTracking();
}
async function refreshTracking(){
 const id=$('v9TrackingOrderSelect')?.value;stopTracking();
 if(!isUUID(id)){info('v9TrackingInfo','Select your own order for private delivery tracking.');await initMap('v9TrackingMap',{status:'v9TrackingInfo'});clearMarkers('v9TrackingMap');return}
 const u=await silentUser();if(!u)return;
 const ret=await db().from('orders').select('id,status,service_type,shop_id,delivery_latitude,delivery_longitude,delivery_location_accuracy_m,created_at')
 .eq('id',id).eq('customer_id',u.id).maybeSingle();
 if(ret.error||!ret.data){info('v9TrackingInfo','Order not found or private access denied.');return}
 const order=ret.data;
 const map=await initMap('v9TrackingMap',{status:'v9TrackingInfo'});if(!map)return;
 if(location.pathname!='/tracking/'+id&&$('tracking')?.classList.contains('active'))history.replaceState({useme:'tracking'},'','/tracking/'+id);
 const draw=async()=>{
  const active=$('tracking')?.classList.contains('active');if(!active){stopTracking();return}
  const [o,loc]=await Promise.all([
   db().from('orders').select('status,delivery_latitude,delivery_longitude').eq('id',id).eq('customer_id',u.id).maybeSingle(),
   db().from('useme_v9_live_owner_locations').select('latitude,longitude,accuracy_m,shared_at,expires_at').eq('order_id',id).maybeSingle()
  ]);
  if(o.error||!o.data)return info('v9TrackingInfo','Unable to refresh private order.');
  clearMarkers('v9TrackingMap');
  const pts=[];
  const dest=o.data;
  if(validCoord(dest.delivery_latitude,dest.delivery_longitude)){
   const p=point(dest.delivery_latitude,dest.delivery_longitude,'My shared delivery pin','customer');
   pts.push(p);marker('v9TrackingMap',p,'customer','Your delivery GPS pin');
  }
  const share=loc.data;
  if(!loc.error&&share&&dest.status==='out_for_delivery'
    &&new Date(share.expires_at).getTime()>Date.now()
    &&Date.now()-new Date(share.shared_at).getTime()<90000
    &&validCoord(share.latitude,share.longitude)){
    const p=point(share.latitude,share.longitude,'Owner live position','owner');
    pts.push(p);marker('v9TrackingMap',p,'owner','USE ME Owner · last GPS ±'+share.accuracy_m+' m · '+new Date(share.shared_at).toLocaleTimeString());
    info('v9TrackingInfo','🟢 Owner GPS is sharing for this order · updated '+new Date(share.shared_at).toLocaleTimeString()+' · Accuracy ±'+share.accuracy_m+' m. Auto-refresh every 12 seconds.');
    if(pts.length>1&&window.L)window.L.polyline(pts.map(x=>[x.lat,x.lng]),{color:'#339b92',dashArray:'7 10',weight:3}).addTo(layers.v9TrackingMap);
  }else{
   info('v9TrackingInfo','Order: '+dest.status.replace(/_/g,' ')+'. Owner live tracking is OFF or unavailable. You can still follow normal order status.');
  }
  if(pts.length)fit('v9TrackingMap',pts);
  const banner=$('v9TrackingState');
  if(banner)banner.textContent='Order '+id.slice(0,8)+' · '+dest.status.replace(/_/g,' ')+' · No automatic live GPS unless owner explicitly starts sharing.';
 };
 await draw();
 trackingInterval=setInterval(draw,12000);
}
function stopTracking(){if(trackingInterval){clearInterval(trackingInterval);trackingInterval=null}}
function estimateOwnerFee(){
 const roundTripKm=Number($('v9RoundTripKm')?.value),roadExtra=Number($('v9RoadExtra')?.value||0);
 if(!Number.isFinite(roundTripKm)||roundTripKm<=0||roundTripKm>1500||!Number.isFinite(roadExtra)||roadExtra<0||roadExtra>100000){
  info('v9FeeResult','Enter a valid total round-trip distance and an optional nonnegative LKR road-condition surcharge.');return;
 }
 const fee=typeof usemeCalculateFee==='function'?usemeCalculateFee(roundTripKm,roadExtra):Math.round(Math.max(250,(750/22)*roundTripKm+roadExtra));
 const fuelReference=Math.round((200/22)*roundTripKm);
 info('v9FeeResult','Indicative bike delivery fee LKR '+Number(fee).toLocaleString('en-LK')+
 ' · Historic fuel baseline estimate LKR '+fuelReference.toLocaleString('en-LK')+
 '. Based on total round-trip '+roundTripKm.toFixed(1)+' km. Owner must confirm actual road conditions, fuel, pickup stops and final customer quote; this is NOT an automatic charge or net profit.');
}
function showFullscreen(mapId){
 const canvas=$(mapId),container=canvas?.closest('.v9-map-wrap');
 if(!container)return;
 if(container.classList.contains('v9-fullscreen'))return hideFullscreen();
 document.querySelectorAll('.v9-map-wrap.v9-fullscreen').forEach(c=>c.classList.remove('v9-fullscreen'));
 container.classList.add('v9-fullscreen');document.body.classList.add('useme-v9-map-fullscreen');
 const close=action('× Exit Fullscreen Map',hideFullscreen,'v9-map-fullscreen-exit');
 close.id='v9MapExitFull';container.append(close);
 setTimeout(()=>maps[mapId]?.invalidateSize(),150);
}
function hideFullscreen(){
 document.querySelectorAll('.v9-map-wrap.v9-fullscreen').forEach(c=>{c.classList.remove('v9-fullscreen');c.querySelector('.v9-map-fullscreen-exit')?.remove()});
 document.body.classList.remove('useme-v9-map-fullscreen');
 Object.values(maps).forEach(m=>setTimeout(()=>m.invalidateSize(),150));
}
function install(){
 const jump=(id,fn)=>$(id)?.addEventListener('click',fn);
 jump('v9LocateMe',locateManual);jump('v9SavePlace',savePlace);jump('v9RefreshPlaces',loadSavedPlaces);
 jump('v9PublicFullMap',()=>showFullscreen('v9PublicMap'));
 jump('v9OwnerFullMap',()=>showFullscreen('v9OwnerMap'));
 jump('v9TrackFullMap',()=>showFullscreen('v9TrackingMap'));
 jump('v9EstimateFee',estimateOwnerFee);
 jump('v9OwnerRefresh',()=>{if(sharingOrder)return info('v9OwnerStatus','Stop GPS sharing before refreshing orders.');loadDispatch()});
 jump('v9OwnerShowOrder',()=>selectOwnerOrder($('v9OwnerOrderSelect').value));
 jump('v9AddSelectedPickup',()=>{const o=ownerOrders.find(x=>x.id===$('v9OwnerOrderSelect').value);if(o)addShopStop(o)});
 jump('v9AddSelectedCustomer',()=>{const o=ownerOrders.find(x=>x.id===$('v9OwnerOrderSelect').value);if(o)addCustomerStop(o)});
 jump('v9AddStop',manualStop);jump('v9Optimize',optimizeStops);jump('v9RoadPreview',previewRoad);
 jump('v9ClearStops',()=>{stops=[];renderStops();paintOwnerMap();info('v9OwnerStatus','Private route draft cleared. Saved plans were not deleted.')});
 jump('v9PlanSave',savePlan);jump('v9PlansReload',loadPlans);jump('v9PlanOpen',recallPlan);
 jump('v9ShareButton',toggleShare);
 jump('v9TrackingRefresh',fillTrackingOrders);
 $('v9TrackingOrderSelect')?.addEventListener('change',refreshTracking);
 for(const [page,fn] of [['map',()=>{initMap('v9PublicMap',{pick:true,status:'v9PublicStatus'});loadSavedPlaces()}],
   ['ownerMap',()=>{initMap('v9OwnerMap',{pick:true,status:'v9OwnerStatus'});loadDispatch();loadPlans()}],
   ['tracking',()=>{initMap('v9TrackingMap',{status:'v9TrackingInfo'});fillTrackingOrders()}]]){
  const root=$(page);
  if(root)new MutationObserver(()=>{if(root.classList.contains('active'))fn();else watchLeave()}).observe(root,{attributes:true,attributeFilter:['class']});
 }
 document.addEventListener('visibilitychange',watchLeave);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hideFullscreen()});
 window.addEventListener('pagehide',()=>{if(shareHeartbeat!==null){clearInterval(shareHeartbeat);shareHeartbeat=null}if(gpsWatch!==null){navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null}if(sharingOrder){db()?.rpc('useme_v9_stop_owner_location',{p_order_id:sharingOrder}).catch(()=>{});sharingOrder=null}stopTracking()});
 window.addEventListener('popstate',()=>setTimeout(watchLeave,0));
 renderStops();
 if($('map')?.classList.contains('active'))initMap('v9PublicMap',{pick:true,status:'v9PublicStatus'}).then(loadSavedPlaces);
 if($('ownerMap')?.classList.contains('active'))loadDispatch().then(loadPlans);
 if($('tracking')?.classList.contains('active'))fillTrackingOrders();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
window.usemeV9Maps={stopSharing:stopShare,openOwner:()=>typeof go==='function'?go('ownerMap'):location.assign('/owner/map'),
 openCustomer:()=>typeof go==='function'?go('map'):location.assign('/map')};
})();