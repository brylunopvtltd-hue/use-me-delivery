/* USE ME V9 — ONE-TIME SITE-WIDE DELIVERY LOCATION
 * Explicit user selection; not continuous live tracking.
 * Browser permission is granted/revoked by the browser, never overridden by USE ME.
 * Signed-in saved locations are protected by Supabase RLS, guests by this device only.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const db=()=>typeof usemeDb==='undefined'?null:usemeDb;
const KEY='useme_v9_location_current_';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let active=null,principal='guest',isOwner=false,loading=false,chooser=null,leafletMap=null,leafletMarker=null;
let pending=null,savedPlaces=[],ownerBase=null,initComplete=false,applySignature='',savePending=false;
const text=(id,v)=>{const x=$(id);if(x)x.textContent=String(v)};
const node=(tag,cls,str)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(str!==undefined)x.textContent=String(str);return x};
const btn=(str,action,cls)=>{const x=node('button',cls||'useme-loc-btn',str);x.type='button';x.addEventListener('click',action);return x};
const valid=p=>p&&p.lat!==null&&p.lat!==undefined&&p.lng!==null&&p.lng!==undefined&&p.lat!==''&&p.lng!==''&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180;
const round=x=>Math.round(Number(x)*1000000)/1000000;
function normalize(p){
 if(!valid(p))return null;
 return {lat:round(p.lat),lng:round(p.lng),accuracy:Math.max(0,Math.min(100000,Number(p.accuracy??p.accuracy_m)||0)),
  label:String(p.label||'My Location').trim().slice(0,70)||'My Location',
  address:String(p.address||p.address_text||'').trim().slice(0,300),
  source:['gps','map','saved_place'].includes(p.source||p.location_source)?(p.source||p.location_source):'map',
  selectedAt:new Date().toISOString()};
}
function localKey(id){return KEY+(id||'guest')}
function readLocal(id){try{const val=JSON.parse(localStorage.getItem(localKey(id))||'null');return normalize(val)}catch{return null}}
function writeLocal(id,pos){try{if(pos)localStorage.setItem(localKey(id),JSON.stringify(pos));else localStorage.removeItem(localKey(id))}catch{}}
function locationDisplay(p){return p?(p.label+(p.address?' · '+p.address:'')):'Choose location'}
function render(){
 const label=$('usemeLocSummary'),button=$('usemeLocTopButton'),badge=$('usemeLocBadge');
 if(label)label.textContent=active?locationDisplay(active):'Location not selected';
 if(button){button.textContent=active?'Change Location':'Set My Location';button.setAttribute('aria-label',active?'Change saved delivery location':'Choose your one-time delivery location')}
 if(badge)badge.textContent=active?'✓ Saved location':'GPS permission optional';
 text('usemeLocCurrent',active?locationDisplay(active)+' · '+active.lat.toFixed(5)+', '+active.lng.toFixed(5)+' · '+(active.source==='gps'?'GPS':'Selected map pin'):'Not selected. Choose once, then reuse on all USE ME pages.');
 const clear=$('usemeLocClear');if(clear)clear.disabled=!active;
 const baseButton=$('usemeLocSetOwnerBase');if(baseButton)baseButton.hidden=!isOwner;
 const clearBase=$('usemeLocRemoveOwnerBase');if(clearBase)clearBase.hidden=!isOwner;
 const baseNote=$('usemeLocOwnerBaseStatus');if(baseNote&&isOwner)baseNote.textContent=ownerBase?'✓ Owner dispatch base saved. It stays fixed until you change or remove it. This is NOT your live GPS.':'No owner dispatch base saved. Select your USE ME dispatch base once for automatic road quotes.';
 const status=$('usemeLocGlobalStatus');
 if(status&&initComplete)status.textContent=active?'Selected for USE ME Shop, Cart, Orders, Delivery and Maps. Change it whenever you need.':'Choose a location to use it across USE ME.';
}
function inform(msg){
 text('usemeLocDialogStatus',msg);
 if(!chooser||chooser.hidden)text('usemeLocGlobalStatus',msg);
}
function notifyCurrent(){
 window.dispatchEvent(new CustomEvent('useme:preferred-location-changed',{detail:{location:active?{...active}:null}}));
 applyToPage(true);
 render();
}
async function user(){
 if(!db())return null;
 try{return (await db().auth.getUser()).data?.user||null}catch{return null}
}
async function loadOwner(){
 isOwner=false;ownerBase=null;
 if(principal==='guest'||!db())return;
 try{
  const r=await db().rpc('is_owner');
  isOwner=r.data===true&&!r.error;
  if(isOwner){
   const o=await db().from('useme_v9_owner_dispatch_base').select('label,latitude,longitude,updated_at').eq('id',1).maybeSingle();
   if(!o.error&&o.data)ownerBase=o.data;
  }
 }catch{}
}
async function loadAccount(){
 if(loading)return;
 loading=true;
 try{
  const u=await user(),next=u?.id||'guest';
  const change=next!==principal;
  principal=next;
  const cached=readLocal(next);
  let selected=cached;
  if(u&&db()){
   const resp=await db().from('useme_v9_preferred_locations')
     .select('latitude,longitude,accuracy_m,label,address_text,location_source,updated_at')
     .eq('user_id',u.id).maybeSingle();
   if(!resp.error&&resp.data){
    selected=normalize({lat:resp.data.latitude,lng:resp.data.longitude,accuracy:resp.data.accuracy_m,
      label:resp.data.label,address:resp.data.address_text,source:resp.data.location_source});
   }else if(!resp.error&&!resp.data&&!cached){
    // A guest pin chosen before sign-in belongs to this same browser. Adopt it only for
    // the first account with no existing preference, rather than asking GPS again.
    const guest=readLocal('guest');
    if(guest)selected=guest;
   }
   if(selected&&!resp.error&&!resp.data){
    await db().from('useme_v9_preferred_locations').upsert({
     user_id:u.id,label:selected.label,address_text:selected.address,latitude:selected.lat,longitude:selected.lng,
     accuracy_m:selected.accuracy,location_source:selected.source,updated_at:new Date().toISOString()
    },{onConflict:'user_id'});
   }
  }
  if(change||!initComplete)active=selected;
  else if(selected&&!active)active=selected;
  if(active)writeLocal(principal,active);
  if(u)writeLocal('guest',null);
  await loadOwner();
  initComplete=true;
  applySignature='';
  notifyCurrent();
 }finally{loading=false}
}
async function persistLocation(raw){
 if(savePending)return;
 const p=normalize(raw);if(!p){inform('Select a valid GPS location or tap the map first.');return}
 savePending=true;
 try{
  active=p;
  writeLocal(principal,p);
  notifyCurrent();
  let cloudSaved=false;
  if(principal!=='guest'&&db()){
   const result=await db().from('useme_v9_preferred_locations').upsert({
    user_id:principal,label:p.label,address_text:p.address,latitude:p.lat,longitude:p.lng,
    accuracy_m:p.accuracy,location_source:p.source,updated_at:new Date().toISOString()
   },{onConflict:'user_id'});
   cloudSaved=!result.error;
  }
  pending=null;
  render();
  inform('✓ '+p.label+' saved for all USE ME pages'+(principal==='guest'?' on this device.':cloudSaved?' and your signed-in account.':' on this device. Cloud sync unavailable.')+' Change whenever required.');
  if(chooser)closeChooser();
 }finally{savePending=false}
}
function clearLocation(){
 if(!active)return;
 if(!confirm('Clear your saved USE ME delivery location? Your existing orders will not be changed.'))return;
 active=null;pending=null;
 writeLocal(principal,null);
 if(principal!=='guest'&&db())db().from('useme_v9_preferred_locations').delete().eq('user_id',principal).then(r=>{
  if(r.error)inform('Device location cleared, but cloud removal failed. Reconnect to clear your account preference.');
 }).catch(()=>{});
 notifyCurrent();
 if(chooser)closeChooser();
}
function fillForms(){
 if(!active)return;
 const pref=active;
 const scopes=['service','cart'];
 for(const scope of scopes){
  window.usemeSetDeliveryDraftFromLiveGPS?.(scope,{lat:pref.lat,lng:pref.lng,accuracy:pref.accuracy});
 }
 const fields=[['orderAddress','service'],['liveCheckoutAddress','cart']];
 for(const [id] of fields){
  const el=$(id);
  if(el&&pref.address.length>=5&&(!el.value||el.dataset.usemeLocAuto==='true')){
    el.value=pref.address;el.dataset.usemeLocAuto='true';
  }
 }
 if($('v9PlaceAddress')&&pref.address&&!$('v9PlaceAddress').value)$('v9PlaceAddress').value=pref.address;
}
function applyToPage(force=false){
 if(!active)return;
 fillForms();
 const page=document.querySelector('.page.active')?.id||'home';
 const scope=page==='cart'?'cart':page==='placeorder'?'service':null;
 if(!scope)return;
 const signature=scope+':'+active.lat+':'+active.lng+':'+active.selectedAt;
 if(!force&&signature===applySignature)return;
 applySignature=signature;
 window.dispatchEvent(new CustomEvent('useme:location-captured',{detail:{
  scope,lat:active.lat,lng:active.lng,accuracy:active.accuracy,source:'preferred',reused:true
 }}));
}
function fromGlobal(scope){
 if(!active)return null;
 if(!['register','pickup','service','cart','map','order'].includes(scope))return null;
 return {...active,accuracy:active.accuracy,capturedAt:Date.now()};
}
function requestGps(){
 if(!window.isSecureContext||!navigator.geolocation){inform('GPS requires an HTTPS connection. You can instead choose your delivery pin on the map.');return}
 inform('Requesting location permission once. USE ME will remember your selected point after you approve.');
 navigator.geolocation.getCurrentPosition(async pos=>{
  const p=normalize({lat:pos.coords.latitude,lng:pos.coords.longitude,
   accuracy:pos.coords.accuracy,label:($('usemeLocLabel')?.value||'My Location'),
   address:($('usemeLocAddress')?.value||''),source:'gps'});
  if(!p)return inform('Unable to read valid GPS coordinates.');
  await persistLocation(p);
 },error=>inform(error.code===1?'Location permission denied. Choose a point on the map, or enable Location in browser settings.':error.code===3?'GPS timed out. Try outdoors, or select a map pin.':'GPS not available. Choose a point on the map.'),{enableHighAccuracy:true,timeout:25000,maximumAge:0});
}
async function savedPlacesList(){
 const root=$('usemeLocSavedPlaces');
 if(!root)return;
 root.replaceChildren();
 if(principal==='guest'||!db()){root.append(node('p','useme-loc-hint','Sign in to see your saved Home/Work places. Your selected location still works on this device.'));return}
 const result=await db().from('useme_v9_saved_places')
 .select('id,label,address_text,latitude,longitude').eq('user_id',principal).order('created_at',{ascending:false}).limit(25);
 if(result.error){root.append(node('p','useme-loc-hint','Saved places temporarily unavailable.'));return}
 if(!result.data?.length){root.append(node('p','useme-loc-hint','No named places saved yet. Select a GPS or map pin first.'));return}
 savedPlaces=result.data;
 for(const place of savedPlaces){
  if(!valid({lat:place.latitude,lng:place.longitude}))continue;
  const row=node('div','useme-loc-saved-row');
  const details=node('div','useme-loc-saved-text');
  details.append(node('strong','',place.label),node('small','',place.address_text||'Saved map pin'));
  const choose=btn('Use',()=>persistLocation({lat:place.latitude,lng:place.longitude,label:place.label,address:place.address_text,accuracy:0,source:'saved_place'}),'useme-loc-small');
  row.append(details,choose);root.append(row);
 }
}
function pendingCoordinates(p){
 const n=normalize({...p,label:$('usemeLocLabel')?.value||'My Location',address:$('usemeLocAddress')?.value||'',source:'map'});
 if(!n)return;
 pending=n;
 const la=$('usemeLocLat'),lo=$('usemeLocLng');
 if(la)la.value=n.lat;
 if(lo)lo.value=n.lng;
 const save=$('usemeLocConfirmPin');if(save)save.disabled=false;
 text('usemeLocCandidate',n.lat.toFixed(6)+', '+n.lng.toFixed(6)+' — tap Save this Pin to use everywhere.');
 if(leafletMap&&window.L){
  const L=window.L;
  if(!leafletMarker)leafletMarker=L.marker([n.lat,n.lng],{draggable:true}).addTo(leafletMap).on('dragend',e=>pendingCoordinates({lat:e.target.getLatLng().lat,lng:e.target.getLatLng().lng}));
  else leafletMarker.setLatLng([n.lat,n.lng]);
 }
}
async function ensureMap(){
 const wrap=$('usemeLocPickerMap'),mapBox=$('usemeLocMapCanvas');
 if(!wrap||!mapBox)return;
 wrap.hidden=false;
 if(leafletMap){setTimeout(()=>leafletMap.invalidateSize(),70);return}
 try{
  if(!window.L){
   if(!document.getElementById('usemeLocLeafletCSS')){
    const css=node('link');css.id='usemeLocLeafletCSS';css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(css);
   }
   await new Promise((resolve,reject)=>{
    const script=node('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.async=true;
    script.onload=resolve;script.onerror=()=>reject(Error('Leaflet not available'));document.head.append(script);
   });
  }
  const L=window.L;
  if(!L||!mapBox.isConnected)throw Error('Map could not initialize');
  leafletMap=L.map(mapBox,{scrollWheelZoom:false}).setView(active?[active.lat,active.lng]:[7.8731,80.7718],active?15:7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,
   attribution:'© OpenStreetMap contributors'}).addTo(leafletMap);
  leafletMap.on('click',e=>pendingCoordinates({lat:e.latlng.lat,lng:e.latlng.lng}));
  const p=pending||active;if(p)pendingCoordinates(p);
  setTimeout(()=>leafletMap?.invalidateSize(),110);
 }catch(e){inform('Map tiles may be unavailable: '+(e.message||String(e))+'. You can enter Latitude/Longitude below instead.')}
}
function closeChooser(){
 if(!chooser)return;
 chooser.hidden=true;
 if(leafletMap){leafletMap.remove();leafletMap=null;leafletMarker=null}
 pending=null;
 document.body.classList.remove('useme-loc-open');
 $('usemeLocTopButton')?.focus();
}
async function openChooser(){
 if(!chooser)makeChooser();
 chooser.hidden=false;document.body.classList.add('useme-loc-open');
 if($('usemeLocLabel'))$('usemeLocLabel').value=active?.label||'My Location';
 if($('usemeLocAddress'))$('usemeLocAddress').value=active?.address||'';
 const map=$('usemeLocPickerMap');if(map)map.hidden=true;
 pending=null;
 render();
 inform(active?'Your saved location is in use. No GPS request is necessary unless you choose a different position.':'Choose GPS once or select a pin. Your location will be saved for future USE ME visits.');
 savedPlacesList();
 $('usemeLocClose')?.focus();
}
function makeChooser(){
 chooser=node('div','useme-loc-overlay');chooser.id='usemeLocChooser';chooser.hidden=true;
 chooser.setAttribute('role','dialog');chooser.setAttribute('aria-modal','true');chooser.setAttribute('aria-labelledby','usemeLocTitle');
 const panel=node('section','useme-loc-dialog');
 const top=node('div','useme-loc-dialog-top');
 const heading=node('h2','','📍 USE ME — My Location');heading.id='usemeLocTitle';
 const close=btn('✕','', 'useme-loc-close');
 close.id='usemeLocClose';close.onclick=closeChooser;top.append(heading,close);
 const current=node('p','useme-loc-current');current.id='usemeLocCurrent';
 const explanation=node('p','useme-loc-hint','Select once. Home, Shop, Cart, Delivery, Orders and Maps will reuse this pin until you change it. No automatic live GPS tracking.');
 const label=node('label','useme-loc-label','Location name (Home, Work, Shop)');
 const labelField=node('input');labelField.id='usemeLocLabel';labelField.maxLength=70;labelField.value='My Location';label.append(labelField);
 const addressLabel=node('label','useme-loc-label','Address / landmark (optional, useful for checkout)');
 const address=node('input');address.id='usemeLocAddress';address.maxLength=300;address.placeholder='Street, town, landmark';addressLabel.append(address);
 const acts=node('div','useme-loc-button-grid');
 acts.append(btn('⌖ Use my GPS & save',requestGps,'useme-loc-primary'),btn('🗺️ Choose on map',ensureMap,'useme-loc-secondary'),btn('Clear saved location',clearLocation,'useme-loc-muted'));
 const mp=node('section','useme-loc-map-picker');mp.id='usemeLocPickerMap';mp.hidden=true;
 mp.append(node('p','useme-loc-hint','Tap anywhere on the map or drag the pin. This is NOT your live GPS until you explicitly choose it.'));
 const map=node('div','useme-loc-map');map.id='usemeLocMapCanvas';mp.append(map);
 const coordInputs=node('div','useme-loc-coordinate-row');
 for(const [id,name,min,max] of [['usemeLocLat','Latitude',-90,90],['usemeLocLng','Longitude',-180,180]]){
  const lbl=node('label','useme-loc-label',name);const inp=node('input');inp.id=id;inp.type='number';inp.step='any';inp.min=String(min);inp.max=String(max);
  inp.inputMode='decimal';lbl.append(inp);coordInputs.append(lbl);
 }
 const useCoord=btn('Preview coordinates',()=>{
  const p={lat:Number($('usemeLocLat')?.value),lng:Number($('usemeLocLng')?.value)};
  if(!$('usemeLocLat')?.value||!$('usemeLocLng')?.value||!valid(p))return inform('Enter valid Latitude and Longitude.');
  pendingCoordinates(p);if(leafletMap)leafletMap.setView([p.lat,p.lng],16);
 },'useme-loc-secondary');
 const confirm=btn('✓ Save this pin for all USE ME pages',()=>{
  if(!pending)return inform('First choose a position on the map.');
  persistLocation({...pending,label:$('usemeLocLabel')?.value||'My Location',address:$('usemeLocAddress')?.value||''});
 },'useme-loc-primary');confirm.id='usemeLocConfirmPin';confirm.disabled=true;
 const candidate=node('p','useme-loc-hint','Select a point first.');candidate.id='usemeLocCandidate';
 mp.append(coordInputs,useCoord,candidate,confirm);
 const places=node('div','useme-loc-saved-places');places.id='usemeLocSavedPlaces';
 const placesTitle=node('h3','','My Saved Places');
 const ownerTitle=node('h3','','🔒 Owner Dispatch Base (fixed, not live)');
 const ownerArea=node('div','useme-loc-owner');
 const baseStatus=node('p','useme-loc-hint');baseStatus.id='usemeLocOwnerBaseStatus';
 const setBase=btn('Use my saved location as dispatch base',saveOwnerBase,'useme-loc-primary');setBase.id='usemeLocSetOwnerBase';setBase.hidden=true;
 const clearBase=btn('Remove dispatch base',removeOwnerBase,'useme-loc-muted');clearBase.id='usemeLocRemoveOwnerBase';clearBase.hidden=true;
 ownerArea.append(baseStatus,setBase,clearBase);
 const status=node('p','useme-loc-dialog-status','');status.id='usemeLocDialogStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 panel.append(top,current,explanation,label,addressLabel,acts,mp,placesTitle,places,ownerTitle,ownerArea,status);
 chooser.append(panel);
 chooser.addEventListener('click',e=>{if(e.target===chooser)closeChooser()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&chooser&&!chooser.hidden)closeChooser()});
 document.body.append(chooser);
 render();
}
async function saveOwnerBase(){
 if(!active){inform('Choose your dispatch location first.');return}
 if(!isOwner||principal==='guest'||!db())return inform('Verified Owner access required.');
 if(!confirm('Set '+active.label+' as the fixed USE ME dispatch base for route pricing? This does NOT turn on live tracking. Update the base when your dispatch point changes.'))return;
 const r=await db().rpc('useme_v9_owner_set_dispatch_base',{p_lat:active.lat,p_lng:active.lng,
  p_accuracy_m:active.accuracy,p_label:active.label,p_source:active.source});
 if(r.error){inform('Could not save Owner base: '+r.error.message);return}
 ownerBase={label:active.label,latitude:active.lat,longitude:active.lng,updated_at:new Date().toISOString()};
 render();
 inform('✓ Fixed Owner dispatch base saved. Customers can now get accurate ROAD estimates without you re-enabling GPS every time.');
}
async function removeOwnerBase(){
 if(!isOwner||!db())return;
 if(!confirm('Remove the saved Owner dispatch base? Automatic quotes will require fresh Owner pricing GPS.'))return;
 const r=await db().rpc('useme_v9_owner_clear_dispatch_base');
 if(r.error){inform('Unable to clear base: '+r.error.message);return}
 ownerBase=null;render();inform('Owner dispatch base removed. Manual quotes are still available.');
}
function expose(){
 window.usemePreferredLocationCurrent=()=>active?{...active}:null;
 window.usemePreferredLocationOpen=openChooser;
 window.usemePreferredLocationSave=async raw=>persistLocation(raw);
 window.usemePreferredLocationApply=()=>applyToPage(true);
 window.usemePreferredLocationForScope=fromGlobal;
 window.usemePreferredOwnerBaseSave=saveOwnerBase;
 window.usemePreferredOwnerBaseClear=removeOwnerBase;
}
function init(){
 expose();
 const bar=$('usemeGlobalLocationBar');
 if(bar){
  const badge=node('span','useme-loc-badge');badge.id='usemeLocBadge';
  const summary=node('span','useme-loc-summary');summary.id='usemeLocSummary';
  const open=btn('Set My Location',openChooser,'useme-loc-top-btn');open.id='usemeLocTopButton';
  const label=node('div','useme-loc-bar-summary');
  label.append(badge,summary);bar.append(label,open);
 }
 loadAccount().catch(()=>{initComplete=true;render()});
 if(db()){
  db().auth.onAuthStateChange((event,session)=>{
   setTimeout(()=>{
    if(event==='SIGNED_OUT'){
     const was=principal;
     principal='guest';active=null;pending=null;ownerBase=null;isOwner=false;applySignature='';
     // Keep account's saved preference in RLS-protected DB, not visible after sign-out.
     writeLocal('guest',null);
     notifyCurrent();
     if(chooser&&!chooser.hidden)closeChooser();
    }else if(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='USER_UPDATED'){
     if(session?.user?.id&&session.user.id!==principal)loadAccount().catch(()=>{});
    }
   },0);
  });
 }
 const observer=new MutationObserver(()=>{if(active)applyToPage()});
 document.querySelectorAll('.page').forEach(x=>observer.observe(x,{attributes:true,attributeFilter:['class']}));
 window.addEventListener('popstate',()=>{if(active)applyToPage()});
 window.addEventListener('storage',e=>{
  if(e.key===localKey(principal)){
   active=readLocal(principal);applySignature='';notifyCurrent();
  }
 });
 document.addEventListener('input',e=>{
  if(e.target?.id==='orderAddress'||e.target?.id==='liveCheckoutAddress')e.target.dataset.usemeLocAuto='false';
 });
 render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
