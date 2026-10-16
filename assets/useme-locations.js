/* USE ME V3 — Consent-based location snapshots & private owner navigation map.
 * Geolocation is NEVER requested on page load; only from an explicit user click.
 * Customer/shop GPS snapshots stay in owner- and subject-scoped Supabase tables.
 * Owner's watchPosition runs only while the private map dialog remains open.
 */
(function(){
'use strict';
const scopes=new Set(['register','pickup','cart','service']);
const drafts=new Map();
let savedShopPosition=null;
let leafletPromise=null,activeModal=null,activeMap=null,ownerWatchId=null,ownerPin=null;
const $=id=>document.getElementById(id);
const txt=(id,t)=>{const e=$(id);if(e)e.textContent=t};
const pos=(p)=>!!p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180;
const round=n=>Math.round(Number(n)*1e6)/1e6;
const clean=p=>({lat:round(p.lat),lng:round(p.lng),accuracy:Math.max(0,Math.min(100000,Math.round(Number(p.accuracy)||0)))});
const keys={register:'registerLocationStatus',pickup:'pickupLocationStatus',cart:'cartLocationStatus',service:'serviceLocationStatus'};
const db=()=>typeof usemeDb==='undefined'?null:usemeDb;
const help=()=>!('geolocation' in navigator)?'This browser does not support GPS location. You may enter an address instead.':!window.isSecureContext?'GPS requires a secure HTTPS browser connection.':'';
const errMessage=e=>e?.code===1?'Location permission declined. Please type the address instead, or enable location in browser settings.':e?.code===2?'Your device could not determine its location. Turn on GPS and try again.':e?.code===3?'GPS request timed out. Try outdoors or enter the address.':'GPS unavailable. '+(e?.message||'');
const coordsFromBrowser=()=>new Promise((resolve,reject)=>{
 const problem=help();if(problem){reject(Error(problem));return}
 navigator.geolocation.getCurrentPosition(
  result=>resolve(clean({lat:result.coords.latitude,lng:result.coords.longitude,accuracy:result.coords.accuracy})),
  reject,{enableHighAccuracy:true,timeout:20000,maximumAge:0}
 );
});
function latLngText(p){return round(p.lat)+', '+round(p.lng)+' · GPS accuracy ±'+Math.round(p.accuracy||0)+' m'}
function openMap(url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.click()}
window.usemeCaptureLocation=async function(scope){
 if(!scopes.has(scope))return;
 txt(keys[scope],'Requesting your phone location (one-time snapshot)...');
 try{
  const p=await coordsFromBrowser();
  drafts.set(scope,p);
  txt(keys[scope],'✓ Location ready: '+latLngText(p)+'. It will only be stored when you save/submit.');
  const preview=$('previewLocation_'+scope);if(preview)preview.disabled=false;
 }catch(e){txt(keys[scope],errMessage(e))}
};
window.usemeForgetDraftLocation=function(scope){
 drafts.delete(scope);txt(keys[scope],'Location not selected. You can still enter the address manually.');
 const preview=$('previewLocation_'+scope);if(preview)preview.disabled=true;
};
window.usemeShopSavedLocation=function(row){
 if(row&&row.latitude!=null&&row.longitude!=null){
  savedShopPosition=clean({lat:row.latitude,lng:row.longitude,accuracy:row.location_accuracy_m});
  txt('savedShopGpsStatus','✓ Shop GPS location already saved. Last shared: '+new Date(row.location_shared_at).toLocaleString('en-LK')+'.');
  const preview=$('previewLocation_pickup');if(preview)preview.disabled=false;
 }else{savedShopPosition=null;txt('savedShopGpsStatus','No shop GPS coordinates saved. Entered pickup address remains available.');const preview=$('previewLocation_pickup');if(preview&&!drafts.has('pickup'))preview.disabled=true;}
};
window.usemeSaveShopLocationFromDraft=async function(shopId,scope){
 const p=drafts.get(scope);if(!p)return {saved:false,skipped:true};
 const client=db();if(!client)throw Error('Sign in and reconnect before saving');
 const {error}=await client.rpc('set_shop_pickup_coordinates',{p_shop_id:shopId,p_lat:p.lat,p_lng:p.lng,p_accuracy_m:p.accuracy});
 if(error)throw error;
 drafts.delete(scope);savedShopPosition=p;
 txt(keys[scope],'✓ Location saved privately for USE ME collection: '+latLngText(p));
 txt('savedShopGpsStatus','✓ GPS location saved. Only your shop and USE ME Owner can access this.');
 return {saved:true};
};
window.usemeSaveOrderLocationFromDraft=async function(orderId,scope){
 const p=drafts.get(scope);if(!p)return {saved:false,skipped:true};
 const client=db();if(!client)throw Error('Location not saved: offline');
 const {error}=await client.rpc('share_my_order_delivery_location',{p_order_id:orderId,p_lat:p.lat,p_lng:p.lng,p_accuracy_m:p.accuracy});
 if(error)throw error;
 drafts.delete(scope);
 txt(keys[scope],'✓ One-time GPS location securely attached to your order.');
 return {saved:true};
};
window.usemeShareExistingOrderLocation=async function(orderId,button){
 if(button)button.disabled=true;
 try{
  const p=await coordsFromBrowser();
  const {error}=await db().rpc('share_my_order_delivery_location',{p_order_id:orderId,p_lat:p.lat,p_lng:p.lng,p_accuracy_m:p.accuracy});
  if(error)throw error;
  alert('✓ Location saved to your order. USE ME Owner can now see the delivery pin.');
  if(typeof window.loadMyOrders==='function')await window.loadMyOrders();
 }catch(e){alert(errMessage(e))}
 finally{if(button&&button.isConnected)button.disabled=false}
};
window.usemeRemoveExistingOrderLocation=async function(orderId,button){
 if(!confirm('Remove GPS coordinates from this order? Your written delivery address remains saved.'))return;
 if(button)button.disabled=true;
 const {error}=await db().rpc('clear_my_order_delivery_location',{p_order_id:orderId});
 if(error){alert(error.message);if(button)button.disabled=false}
 else if(typeof window.loadMyOrders==='function')await window.loadMyOrders();
};
window.usemeClearSavedShopLocation=async function(){
 const id=$('pickupShopSelect')?.value;
 if(!id||!confirm('Delete the saved shop GPS pin? The typed pickup address will remain.'))return;
 const {error}=await db().rpc('clear_shop_pickup_coordinates',{p_shop_id:id});
 if(error){alert('Location not cleared: '+error.message);return}
 drafts.delete('pickup');savedShopPosition=null;
 txt('pickupLocationStatus','Shop GPS location cleared. Typed pickup address remains.');
 if(typeof loadShopPickupDetails==='function')await loadShopPickupDetails();
};
function addressNavigation(value,mode){
 if(!value)return null;
 return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(value)+'&travelmode='+encodeURIComponent(mode||'driving');
}
function directCoordinate(p){return pos(p)?round(p.lat)+','+round(p.lng):null}
function pin(name,p,kind){return {name,p,kind}}
function ensureLeaflet(){
 if(window.L)return Promise.resolve(window.L);
 if(leafletPromise)return leafletPromise;
 leafletPromise=new Promise((resolve,reject)=>{
  if(!document.getElementById('usemeLeafletCss')){
   const css=document.createElement('link');css.id='usemeLeafletCss';css.rel='stylesheet';
   css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
   document.head.append(css);
  }
  const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.async=true;script.crossOrigin='anonymous';
  script.onload=()=>window.L?resolve(window.L):reject(Error('Map library did not load'));
  script.onerror=()=>reject(Error('Map tiles/library unavailable. Use the Google Maps links below.'));
  document.head.append(script);
 }).catch(err=>{leafletPromise=null;throw err});
 return leafletPromise;
}
function closeModal(){
 if(ownerWatchId!==null&&navigator.geolocation){navigator.geolocation.clearWatch(ownerWatchId);ownerWatchId=null}
 ownerPin=null;
 if(activeMap){activeMap.remove();activeMap=null}
 if(activeModal){activeModal.remove();activeModal=null}
 document.body.classList.remove('useme-map-open');
}
function createModal(title){
 closeModal();
 const dlg=document.createElement('div');dlg.className='useme-map-overlay';dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-label',title);
 const surface=document.createElement('div');surface.className='useme-map-dialog';
 const header=document.createElement('div');header.className='useme-map-dialog-top';
 const heading=document.createElement('div');heading.className='useme-map-dialog-title';heading.textContent=title;
 const close=document.createElement('button');close.className='useme-map-close';close.textContent='✕ Close';close.setAttribute('aria-label','Close map and stop live owner GPS');close.onclick=closeModal;
 header.append(heading,close);
 const main=document.createElement('div');main.className='useme-map-main';
 const map=document.createElement('div');map.className='useme-map-canvas';map.id='usemeActiveMap';
 const controls=document.createElement('div');controls.className='useme-map-actions';
 const status=document.createElement('p');status.className='useme-map-status';status.textContent='Loading interactive map…';
 surface.append(header,main);main.append(map,controls,status);dlg.append(surface);
 dlg.addEventListener('click',event=>{if(event.target===dlg)closeModal()});
 document.addEventListener('keydown',function escapeOnce(event){if(event.key==='Escape'&&activeModal===dlg)closeModal();if(!activeModal)document.removeEventListener('keydown',escapeOnce)});
 document.body.append(dlg);activeModal=dlg;document.body.classList.add('useme-map-open');
 close.focus();
 return {dlg,map,controls,status};
}
function button(container,title,callback,external=false){
 const b=document.createElement('button');b.className='useme-map-button';b.textContent=title;
 b.onclick=callback;container.append(b);return b;
}
async function showMap(pins,view){
 const {map,controls,status}=view;
 const points=pins.filter(x=>pos(x.p));
 if(!points.length){map.classList.add('useme-map-no-coords');map.textContent='📍 No GPS coordinates shared yet. Use the address links below or ask the customer/shop to share their current location.';status.textContent='A current GPS pin needs permission from its owner.';return}
 try{
  const L=await ensureLeaflet();
  if(!activeModal||!map.isConnected)return;
  activeMap=L.map(map,{scrollWheelZoom:false,zoomControl:true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).addTo(activeMap);
  const colors={shop:'#0775d0',customer:'#f0a700',owner:'#159766',preview:'#2863c5'};
  const icons={shop:'🏪',customer:'🏠',owner:'🛵',preview:'📍'};
  for(const item of points){
   const icon=L.divIcon({className:'useme-map-pin',html:'<span style="background:'+colors[item.kind]+'">'+icons[item.kind]+'</span>',iconSize:[38,38],iconAnchor:[19,38]});
   const marker=L.marker([item.p.lat,item.p.lng],{icon}).addTo(activeMap);
   const label=document.createElement('div');label.textContent=item.name;marker.bindPopup(label);if(item.kind==='owner')ownerPin=marker;
  }
  if(points.length>1)L.polyline(points.map(x=>[x.p.lat,x.p.lng]),{color:'#188bc1',weight:3,opacity:.7,dashArray:'7 9'}).addTo(activeMap);
  activeMap.fitBounds(L.latLngBounds(points.map(x=>[x.p.lat,x.p.lng])).pad(.28),{maxZoom:16});
  status.textContent='● Interactive OpenStreetMap · Dotted lines show approximate direction, NOT road routing. Use the navigation buttons for actual driving directions.';
  setTimeout(()=>activeMap?.invalidateSize(),150);
 }catch(e){map.textContent='Map could not load. '+e.message;status.textContent='Navigation links below remain available.'}
}
window.usemePreviewLocation=function(scope){
 const p=drafts.get(scope)||(scope==='pickup'?savedShopPosition:null);
 if(!pos(p)){alert('Tap “Use my current location” first.');return}
 const view=createModal('📍 Location preview · '+latLngText(p));
 button(view.controls,'Google Maps navigation ↗',()=>openMap(addressNavigation(directCoordinate(p))));
 showMap([pin('Your selected location',p,'preview')],view);
};
window.usemeOpenOwnerRouteMap=function(order,shop,pickup){
 if(typeof usemeRole==='undefined'||usemeRole!=='owner')return;
 const customer=order?.delivery_latitude!=null&&order?.delivery_longitude!=null
  ?clean({lat:order.delivery_latitude,lng:order.delivery_longitude,accuracy:order.delivery_location_accuracy_m}):null;
 const seller=pickup?.latitude!=null&&pickup?.longitude!=null
  ?clean({lat:pickup.latitude,lng:pickup.longitude,accuracy:pickup.location_accuracy_m}):null;
 const view=createModal('🗺️ USE ME · Shop pickup → Customer delivery');
 const notes=document.createElement('div');notes.className='useme-map-details';
 notes.textContent='Shop: '+(shop?.name||'Direct service')+' · Pickup: '+(pickup?.pickup_address||'Not saved')+
  ' · Customer: '+(order?.delivery_address||'No delivery address');
 view.controls.append(notes);
 const shopTarget=directCoordinate(seller)||pickup?.pickup_address;
 const customerTarget=directCoordinate(customer)||order?.delivery_address;
 if(shopTarget)button(view.controls,'🏪 Navigate to shop ↗',()=>openMap(addressNavigation(shopTarget)));
 if(customerTarget)button(view.controls,'🏠 Navigate to customer ↗',()=>openMap(addressNavigation(customerTarget)));
 if(seller&&customer)button(view.controls,'🚗 Shop → Customer road directions ↗',
   ()=>openMap('https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(directCoordinate(seller))+
    '&destination='+encodeURIComponent(directCoordinate(customer))+'&travelmode=driving'));
 const live=button(view.controls,'🛵 Start my live position on this map',()=>{
  if(ownerWatchId!==null){navigator.geolocation.clearWatch(ownerWatchId);ownerWatchId=null;
   if(ownerPin&&activeMap){activeMap.removeLayer(ownerPin);ownerPin=null}
   live.textContent='🛵 Start my live position on this map';return}
  if(!navigator.geolocation||!window.isSecureContext){alert(help()||'GPS unavailable');return}
  live.disabled=true;view.status.textContent='Requesting owner GPS permission. No owner location is uploaded or stored.';
  ownerWatchId=navigator.geolocation.watchPosition(result=>{
   const p=clean({lat:result.coords.latitude,lng:result.coords.longitude,accuracy:result.coords.accuracy});
   if(activeMap&&window.L){
    if(ownerPin)ownerPin.setLatLng([p.lat,p.lng]);
    else{ownerPin=window.L.marker([p.lat,p.lng]).addTo(activeMap).bindPopup('🛵 Your current live position (only on this screen)')}
   }
   live.disabled=false;live.textContent='■ Stop my live position';
   view.status.textContent='Owner GPS is updating while this map stays open. Location is NOT sent to USE ME servers. Navigation buttons open road directions.';
  },e=>{live.disabled=false;view.status.textContent=errMessage(e);if(ownerWatchId!==null){navigator.geolocation.clearWatch(ownerWatchId);ownerWatchId=null}},
  {enableHighAccuracy:true,maximumAge:3000,timeout:22000});
 });
 showMap([pin('Shop pickup: '+(shop?.name||'Partner shop'),seller,'shop'),
          pin('Customer delivery',customer,'customer')],view);
};
window.addEventListener('pagehide',closeModal);
})();