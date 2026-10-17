/* USE ME V9 Road Fee — accurate road km, privacy preserving private Owner origin.
 * Customer GPS: only captured by explicit location action / pin selection.
 * Customer never receives exact Owner GPS. No fabricated straight-line road fees.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const db=()=>typeof usemeDb!=='undefined'?usemeDb:null;
const fmt=n=>'LKR '+Number(n).toLocaleString('en-LK',{maximumFractionDigits:0});
const limit=(s,n=180)=>String(s||'').slice(0,n);
const flag=(id,t)=>{const e=$(id);if(e)e.textContent=t};
const uuid=x=>/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(x||''));
const ok=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180;
const GPS_NOTICE='After you permit location, your selected GPS pin is securely submitted for road-distance pricing. USE ME never shares the Owner’s private position with you. Road-routing service receives route locations. Actual quotation needs Owner approval.';
const state={service:{pin:null,last:null},cart:{pin:null,last:null},map:{pin:null,last:null}};
let watch=null,watchScope=null,lastRequote=0,ownerWatch=null,ownerRefreshTimer=null,lastOwnerSync=0,ownerActive=false;
let quoteBusy=false,ownerSyncBusy=false,navLocation=null;
function boxText(scope,t){flag('usemeRoadStatus_'+scope,t)}
async function currentUser(){
 const d=db();if(!d)return null;
 try{return(await d.auth.getUser()).data?.user||null}catch{return null}
}
function showLinkToLogin(scope){boxText(scope,'🔒 Sign in to use your private route estimate. The owner’s precise GPS is never public.');}
function showQuote(scope,q){
 const box=$('usemeRoadResult_'+scope);if(!box)return;
 box.replaceChildren();
 const strong=document.createElement('strong');strong.className='useme-road-price';strong.textContent=fmt(q.delivery_fee_lkr);
 const head=document.createElement('div');head.className='useme-road-result-title';
 head.append(document.createTextNode('🛵 Automatic road-based delivery fee'),strong);
 const route=document.createElement('div');route.className='useme-road-km';
 route.textContent=q.one_way_road_km!=null?'Owner → Customer: '+Number(q.one_way_road_km).toFixed(2)+' road KM':'Via '+Number(q.pickup_count||0)+' verified shop pickup(s)';
 const total=document.createElement('div');total.className='useme-road-km';total.textContent='Complete road route / return: '+Number(q.roundtrip_road_km).toFixed(2)+' KM';
 const detail=document.createElement('div');detail.className='useme-road-small';
 detail.textContent='Minimum '+fmt(q.minimum_fee_lkr)+' · Reference '+q.reference_roundtrip_km+' KM = '+fmt(q.reference_delivery_lkr)+' · Surcharge '+fmt(q.surcharge_lkr)+' · Route ETA ~'+q.route_minutes+' min (no traffic data).';
 const disclaimer=document.createElement('p');disclaimer.className='useme-road-disclaimer';
 disclaimer.textContent='⚠️ Road-distance ESTIMATE. Owner confirms final route, product pickups and extra road charges before payment. Petrol is an Owner expense, not a customer fee.';
 box.append(head,route,total,detail,disclaimer);
 box.hidden=false;
}
function resetQuote(scope,message,clearPin=false){
 if(!state[scope])return;
 state[scope].last=null;
 if(clearPin)state[scope].pin=null;
 const area=$('usemeRoadResult_'+scope);if(area){area.hidden=true;area.replaceChildren()}
 boxText(scope,message||'Choose your delivery pin for an automatic road-distance quote.');
}
function shopIds(){
 try{
  const arr=JSON.parse(localStorage.getItem('useme_live_cart')||'[]');
  if(!Array.isArray(arr))return[];
  return [...new Set(arr.filter(x=>uuid(x.shop_id)).map(x=>x.shop_id))].slice(0,7);
 }catch{return[]}
}
function manualFields(scope,q){
 const id=scope==='service'?'orderKm':scope==='cart'?'liveCheckoutKm':null;
 if(id&&$(id)){
  $(id).value=Number(q.roundtrip_road_km).toFixed(2);
  $(id).dataset.usemeRoadComputed='yes';
 }
 if(scope==='service'&&typeof updateServiceFee==='function')updateServiceFee();
 if(scope==='cart'){
  if($('liveCheckoutRoad'))$('liveCheckoutRoad').value='0';
  if(typeof renderLiveCart==='function')renderLiveCart();
 }
}
async function requestQuote(scope,pin){
 if(!state[scope]||!ok(pin))return;
 const user=await currentUser();
 if(!user)return showLinkToLogin(scope);
 if(quoteBusy){boxText(scope,'Please wait for the current route calculation.');return}
 const tick=Date.now();if(lastRequote&&tick-lastRequote<12500){boxText(scope,'Road calculator is updating too quickly. Wait about 12 seconds.');return}
 const mode=scope==='cart'?'marketplace':scope==='service'&&$('serviceOrderType')?.value!=='parcel'?'direct':'direct';
 if(scope==='cart'&&!shopIds().length){boxText(scope,'Add an approved shop product before estimating the complete pickup route.');return}
 quoteBusy=true;lastRequote=tick;
 boxText(scope,'🛣️ Checking actual roads between USE ME Owner, pickup points and your pin. Please wait...');
 const trigger=$('usemeRoadRecalc_'+scope);if(trigger)trigger.disabled=true;
 try{
  const d=db();if(!d)throw Error('Database client unavailable');
  const {data:session}=await d.auth.getSession();
  const access=session.session?.access_token;
  if(!access)throw Error('Sign in to USE ME first');
  const api='https://woytuayeuyfvucttvosw.supabase.co/functions/v1/useme-v9-road-quote';
  const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),23000);
  let response;
  try{response=await fetch(api,{method:'POST',signal:ctrl.signal,
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+access,'apikey':USEME_PUBLIC_KEY},
   body:JSON.stringify({lat:Number(pin.lat),lng:Number(pin.lng),accuracy_m:Math.max(0,Math.round(Number(pin.accuracy)||0)),mode,shop_ids:mode==='marketplace'?shopIds():undefined})});
  }finally{clearTimeout(timeout)}
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.status!=='estimated')throw Error(limit(data?.message||data?.status||'Road fee unavailable'));
  if(!state[scope].pin||state[scope].pin.capturedAt!==pin.capturedAt){boxText(scope,'Location changed; tap Calculate again.');return}
  state[scope].last=data;showQuote(scope,data);manualFields(scope,data);
  boxText(scope,'✓ Actual road distance calculated. Owner will confirm final fee. Your selected location was used only for this request.');
 }catch(e){
  resetQuote(scope,'⚠️ '+limit(e.message||'Routing is unavailable')+' · Use manual Owner quote if GPS or route service is unavailable.');
 }finally{quoteBusy=false;if(trigger)trigger.disabled=false}
}
function setPin(scope,raw,recalc=true){
 if(!state[scope]||!ok(raw))return;
 const pin={lat:Number(raw.lat),lng:Number(raw.lng),accuracy:Math.max(0,Number(raw.accuracy)||0),capturedAt:Date.now()};
 state[scope].pin=pin;
 resetQuote(scope,'✓ Customer pin chosen (±'+Math.round(pin.accuracy)+'m). Getting current road KM...');
 if(recalc)requestQuote(scope,pin);
}
function currentPin(scope){return state[scope]?.pin}
function forget(scope){
 resetQuote(scope,'Location cleared. Automatic route price is no longer associated with your pin.',true);
 if(watchScope===scope)stopWatching(false);
}
function getGPS(){
 return new Promise((resolve,reject)=>{
  if(!('geolocation'in navigator)||!window.isSecureContext)return reject(Error('GPS requires a secure HTTPS browser with location enabled.'));
  navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),reject,{enableHighAccuracy:true,timeout:23000,maximumAge:0});
 });
}
async function capture(scope){
 boxText(scope,'Requesting GPS permission — your location will be used for pricing only after you allow it.');
 if(scope!=='map'&&typeof window.usemeCaptureLocation==='function'){
  await window.usemeCaptureLocation(scope); // Existing order checkout GPS draft is updated too.
  return;
 }
 try{setPin(scope,await getGPS())}
 catch(e){resetQuote(scope,e?.code===1?'Location permission denied. You may choose a destination on the map or request a manual quote.':limit(e.message||'GPS unavailable'))}
}
function stopWatching(message=true){
 if(watch!==null&&'geolocation'in navigator){navigator.geolocation.clearWatch(watch);watch=null}
 if(watchScope&&message)boxText(watchScope,'✓ Live pin updates stopped. Last estimate is indicative; use Refresh for new GPS.');
 watchScope=null;
 document.querySelectorAll('[data-road-watch]').forEach(e=>{e.textContent='▶ Update GPS while page open';e.setAttribute('aria-pressed','false')});
}
async function toggleWatch(scope){
 if(watchScope===scope){stopWatching();return}
 stopWatching(false);
 if(!navigator.geolocation||!window.isSecureContext)return boxText(scope,'GPS unavailable. HTTPS and browser permission required.');
 watchScope=scope;
 const b=$('usemeRoadWatch_'+scope);if(b){b.textContent='■ Stop Live GPS Updates';b.setAttribute('aria-pressed','true')}
 boxText(scope,'Updating GPS only while this page is open. Tap Stop anytime.');
 watch=navigator.geolocation.watchPosition(raw=>{
  if(watchScope!==scope)return;
  const fresh={lat:raw.coords.latitude,lng:raw.coords.longitude,accuracy:raw.coords.accuracy};
  const last=currentPin(scope);
  // Avoid sending extra position updates for tiny GPS drift or repeated fixes.
  if(last&&Math.abs(fresh.lat-last.lat)<.00045&&Math.abs(fresh.lng-last.lng)<.00045)return;
  if(scope!=='map'&&typeof window.usemeSetDeliveryDraftFromLiveGPS==='function')window.usemeSetDeliveryDraftFromLiveGPS(scope,fresh);
  setPin(scope,fresh,Date.now()-lastRequote>=12500);
 },err=>{stopWatching(false);boxText(scope,err.code===1?'GPS permission denied; live updates stopped.':'GPS temporarily unavailable; live updates stopped.')},{enableHighAccuracy:true,maximumAge:0,timeout:23000});
}
async function quoteOwnerStart(){
 const d=db();if(!d)return;
 const user=await currentUser();if(!user)return flag('usemeOwnerRateStatus','Sign in to USE ME Owner account.');
 const role=await d.rpc('is_owner');if(role.error||role.data!==true)return flag('usemeOwnerRateStatus','Verified Owner only.');
 if(!navigator.geolocation||!window.isSecureContext)return flag('usemeOwnerRateStatus','GPS unavailable. Use HTTPS with location permission.');
 ownerActive=true;
 flag('usemeOwnerRateStatus','🟢 Owner GPS capture starting. Only a private rate origin will be uploaded; not public tracking.');
 // GPS watch callbacks may pause when Owner stands still. Explicitly refresh while this page remains open.
 ownerRefreshTimer=setInterval(async()=>{
  if(!ownerActive||document.hidden||ownerSyncBusy||Date.now()-lastOwnerSync<85000)return;
  ownerSyncBusy=true;
  try{
   const gps=await getGPS();
   if(!ownerActive||document.hidden)return;
   const result=await d.rpc('useme_v9_owner_rate_location',{p_lat:gps.lat,p_lng:gps.lng,p_accuracy_m:Math.round(gps.accuracy||0)});
   if(result.error)throw result.error;
   lastOwnerSync=Date.now();
   flag('usemeOwnerRateStatus','● Owner pricing GPS ACTIVE · refreshed '+new Date().toLocaleTimeString()+' · ±'+Math.round(gps.accuracy)+'m · visible only to private server.');
  }catch(e){flag('usemeOwnerRateStatus','Owner pricing GPS refresh delayed: '+limit(e.message||'GPS unavailable')+'. Customer may need a manual quote.')}
  finally{ownerSyncBusy=false}
 },45000);
 ownerWatch=navigator.geolocation.watchPosition(async raw=>{
  if(!ownerActive||ownerSyncBusy||Date.now()-lastOwnerSync<45000)return;
  ownerSyncBusy=true;
  try{
   const result=await d.rpc('useme_v9_owner_rate_location',{p_lat:raw.coords.latitude,p_lng:raw.coords.longitude,p_accuracy_m:Math.round(raw.coords.accuracy||0)});
   if(result.error)throw result.error;
   lastOwnerSync=Date.now();
   flag('usemeOwnerRateStatus','● Owner pricing GPS ACTIVE · accuracy ±'+Math.round(raw.coords.accuracy)+'m · snapshot refreshed at '+new Date().toLocaleTimeString()+'. Auto quotes require an update within 3 minutes; GPS is private.');
  }catch(e){flag('usemeOwnerRateStatus','Could not save private GPS: '+limit(e.message))}
  finally{ownerSyncBusy=false}
 },err=>{flag('usemeOwnerRateStatus',err.code===1?'Owner GPS permission denied.':'Owner GPS unavailable: '+limit(err.message));stopOwnerOrigin()},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
 const b=$('usemeOwnerRateStart');if(b)b.disabled=true;
 const s=$('usemeOwnerRateStop');if(s)s.disabled=false;
}
async function stopOwnerOrigin(){
 ownerActive=false;
 if(ownerRefreshTimer!==null){clearInterval(ownerRefreshTimer);ownerRefreshTimer=null}
 if(ownerWatch!==null&&navigator.geolocation){navigator.geolocation.clearWatch(ownerWatch);ownerWatch=null}
 const b=$('usemeOwnerRateStart');if(b)b.disabled=false;
 const stop=$('usemeOwnerRateStop');if(stop)stop.disabled=true;
 try{
  if(db())await db().rpc('useme_v9_owner_stop_rate_location');
  flag('usemeOwnerRateStatus','Owner pricing GPS OFF. Saved rate origin removed; automatic customer quotes paused.');
 }catch{flag('usemeOwnerRateStatus','GPS stopped locally; saved owner origin expires automatically.');}
}
function routeLife(){
 const ownerPage=$('ownerMap'),active=ownerPage?.classList.contains('active');
 if(ownerActive&&!active)stopOwnerOrigin();
 const allowed=Array.from(document.querySelectorAll('.page.active')).some(e=>['cart','placeorder','map'].includes(e.id));
 if(watch!==null&&!allowed)stopWatching(false);
}
function manualChanged(e){
 if(!e.isTrusted)return;
 const scope=e.currentTarget.id==='orderKm'?'service':'cart';
 if(!state[scope].last)return;
 resetQuote(scope,'Manual KM or surcharge edited. Previous GPS road estimate is no longer applied; Owner must confirm the final fee.');
 e.currentTarget.dataset.usemeRoadComputed='no';
}
function start(){
 window.addEventListener('useme:location-captured',event=>{
  const d=event.detail||{},scope=d.scope==='service'?'service':d.scope==='cart'?'cart':null;
  if(scope)setPin(scope,d);
 });
 window.addEventListener('useme:location-forgotten',event=>{const scope=event.detail?.scope;if(scope==='service'||scope==='cart')forget(scope)});
 window.addEventListener('useme:v9-pin-selected',event=>{const p=event.detail;if(ok(p)){state.map.pin={...p,accuracy:0,capturedAt:Date.now()};resetQuote('map','Selected destination pin on the USE ME map. Tap Calculate to request a road quote.')}});
 for(const scope of ['service','cart','map']){
  $('usemeRoadCapture_'+scope)?.addEventListener('click',()=>capture(scope));
  $('usemeRoadRecalc_'+scope)?.addEventListener('click',()=>currentPin(scope)?requestQuote(scope,currentPin(scope)):capture(scope));
  $('usemeRoadWatch_'+scope)?.addEventListener('click',()=>toggleWatch(scope));
  $('usemeRoadForget_'+scope)?.addEventListener('click',()=>{
   if(scope!=='map'&&typeof window.usemeForgetDraftLocation==='function')window.usemeForgetDraftLocation(scope);
   else forget(scope);
  });
 }
 $('usemeOwnerRateStart')?.addEventListener('click',quoteOwnerStart);
 $('usemeOwnerRateStop')?.addEventListener('click',stopOwnerOrigin);
 for(const id of ['orderKm','liveCheckoutKm','liveCheckoutRoad'])$(id)?.addEventListener('input',manualChanged);
 $('serviceOrderType')?.addEventListener('change',()=>{if(state.service.last)resetQuote('service','Service changed. Refresh the delivery quote; item pickup costs may affect final pricing.')});
 window.addEventListener('popstate',routeLife);
 const observer=new MutationObserver(()=>routeLife());
 document.querySelectorAll('.page').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class']}));
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopWatching(false);if(ownerActive)stopOwnerOrigin()}});
 window.addEventListener('pagehide',()=>{stopWatching(false);if(ownerActive)stopOwnerOrigin()});
 if(db())db().auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){stopWatching(false);if(ownerActive)stopOwnerOrigin();for(const s of Object.keys(state))forget(s)}});
 for(const scope of ['service','cart','map'])boxText(scope,'No automatic road quote yet. Enable GPS or choose a delivery pin. Estimated fee needs Owner confirmation.');
 flag('usemeOwnerRateStatus','Owner pricing GPS OFF. Tap Start while you are available for route quotes.');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.usemeRoadQuoteRefresh=scope=>state[scope]?.pin?requestQuote(scope,state[scope].pin):capture(scope);
window.usemeOwnerPricingStop=stopOwnerOrigin;
})();
