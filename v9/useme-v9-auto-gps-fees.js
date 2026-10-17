/* USE ME V9: GPS-based round-trip distance and delivery fee estimates.
 * Customer GPS is requested ONLY after a user clicks the existing location control.
 * Owner GPS as quote origin requires separate opt-in; never shown on customer maps.
 * Distance from GPS positions is straight-line (haversine), NOT road distance.
 * No operation modifies final Owner-confirmed fee or previous orders.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const client=()=>typeof usemeDb!=='undefined'?usemeDb:null;
const isUUID=v=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(v||''));
const money=v=>'Rs. '+Number(v||0).toLocaleString('en-LK',{maximumFractionDigits:2});
const label=(id,value)=>{const el=$(id);if(el)el.textContent=value};
const mk=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e};
let ownerWatch=null,ownerSession=null,ownerLastUpdate=0,ownerSubmitBusy=false,ownerPosition=null,feeEstimate=null;
let customerLiveWatch=null,customerOrderId=null,customerLastShare=0,customerShareBusy=false;
async function user(){if(!client())return null;try{return (await client().auth.getUser()).data?.user||null}catch(_){return null}}
async function owner(){if(!await user())return false;const r=await client().rpc('is_owner');return r.data===true&&!r.error}
const gpsError=e=>e?.code===1?'Location permission denied by browser.':e?.code===2?'GPS location is unavailable on this phone.':e?.code===3?'GPS timed out; try again outdoors.':(e?.message||'Location unavailable.');
function activeOwnerMap(){return !!$('ownerMap')?.classList.contains('active')}
function activeOrderScreen(){return !!$('orders')?.classList.contains('active')}
async function ownerQuoteRefresh(){
 if(!await owner())return;
 const r=await client().from('useme_v9_owner_rate_origin').select('updated_at,expires_at,accuracy_m,enabled').eq('id',1).maybeSingle();
 const active=!r.error&&r.data?.enabled&&new Date(r.data.expires_at).getTime()>Date.now()
  &&Date.now()-new Date(r.data.updated_at).getTime()<180000;
 label('v9PriceOriginInfo',active?
  '● Your private GPS price origin is ACTIVE · last location '+new Date(r.data.updated_at).toLocaleTimeString()+
  ' · accuracy ±'+Math.round(r.data.accuracy_m)+' m. It is not shared with customers.':
  '● Pricing GPS OFF / stale. Activate your current location to enable automatic customer distance estimates.');
}
async function publishOrigin(p){
 if(!ownerSession||ownerSubmitBusy)return;
 ownerSubmitBusy=true;
 try{
  const r=await client().rpc('useme_v9_owner_rate_location',{p_lat:p.latitude,p_lng:p.longitude,p_accuracy_m:p.accuracy});
  if(r.error){label('v9PriceOriginInfo','GPS rate-sharing update failed: '+r.error.message);await stopOrigin();return}
  ownerLastUpdate=Date.now();
  label('v9PriceOriginInfo','🟢 Your GPS is active as a PRIVATE DELIVERY FEE ORIGIN · Accuracy ±'+Math.round(p.accuracy)+
  ' m · updated '+new Date().toLocaleTimeString()+'. Customer sees estimated KM/Fee only.');
 }catch(e){label('v9PriceOriginInfo','GPS update error: '+e.message);await stopOrigin()}
 finally{ownerSubmitBusy=false}
}
async function startOrigin(){
 if(ownerSession||!activeOwnerMap())return;
 if(!await owner())return label('v9PriceOriginInfo','Only the verified USE ME Owner can share a private pricing origin.');
 if(!navigator.geolocation||!window.isSecureContext)return label('v9PriceOriginInfo','An HTTPS browser with GPS permission is required.');
 if(!confirm('Allow USE ME to use your LIVE phone GPS as the PRIVATE starting point for customers’ delivery fee estimates? Customers can see the resulting approximate KM and price, not your precise coordinates. Because price depends on your location, its approximate area could be inferred. Sharing stops when you press Stop or leave this page.'))return;
 ownerSession={since:Date.now()};
 const btn=$('v9PriceOriginButton');if(btn)btn.textContent='■ Stop Auto Pricing GPS';
 label('v9PriceOriginInfo','Requesting GPS permission for private automatic fee calculation...');
 ownerWatch=navigator.geolocation.watchPosition(async result=>{
  if(!ownerSession||!activeOwnerMap())return stopOrigin();
  const p={latitude:result.coords.latitude,longitude:result.coords.longitude,accuracy:Math.max(0,Math.min(100000,result.coords.accuracy||0))};
  ownerPosition=p;
  if(Date.now()-ownerLastUpdate>15000)await publishOrigin(p);
 },async e=>{label('v9PriceOriginInfo',gpsError(e));await stopOrigin()},
 {enableHighAccuracy:true,maximumAge:0,timeout:25000});
}
async function stopOrigin(){
 if(ownerWatch!==null&&navigator.geolocation){navigator.geolocation.clearWatch(ownerWatch);ownerWatch=null}
 ownerSession=null;ownerPosition=null;ownerLastUpdate=0;
 const btn=$('v9PriceOriginButton');if(btn)btn.textContent='▶ Enable My GPS Auto Pricing';
 try{
  if(await owner()){const r=await client().rpc('useme_v9_owner_stop_rate_location');
   label('v9PriceOriginInfo',r.error?'GPS stopped on device. Server point expires within 15 minutes if offline. '+r.error.message:'✓ Auto Pricing GPS STOPPED. Server-side owner pricing coordinates deleted.');
  }
 }catch(_){label('v9PriceOriginInfo','Device GPS stopped. Saved rate origin expires within 15 minutes.')}
}
async function customerGps(p){
 if(!p||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lng)))return;
 const status='v9AutoFeeCartStatus';
 const u=await user();
 if(!u){label(status,'📍 GPS received. Sign in to calculate a private distance to USE ME Owner (or enter round-trip KM manually).');return}
 label(status,'📍 Customer GPS ready. Calculating automatic approximate round-trip KM from Owner’s current GPS...');
 const extra=Number($('liveCheckoutRoad')?.value||0);
 const r=await client().rpc('useme_v9_estimate_from_customer_gps',{
  p_lat:p.lat,p_lng:p.lng,p_road_extra_lkr:Number.isFinite(extra)&&extra>=0?extra:0
 });
 if(r.error){label(status,'Automatic GPS fee not available: '+r.error.message+'. Manual KM entry remains available.');return}
 if(r.data?.status!=='estimated'){label(status,r.data?.message||'Owner GPS-based pricing is unavailable. Enter your actual road round-trip KM manually.');return}
 const e=r.data;
 feeEstimate=e;
 const field=$('liveCheckoutKm');
 if(field){field.value=String(e.roundtrip_km);field.dataset.v9GpsFee='approximate';}
 if(typeof renderLiveCart==='function')renderLiveCart();
 label(status,'✓ Automatic GPS ESTIMATE: '+Number(e.roundtrip_km).toFixed(2)+' KM approximate round trip · Delivery '+money(e.delivery_fee_lkr)+
  '. Includes currently entered surcharge. GPS straight-line distance, NOT road KM. Road route may be longer; final price requires Owner confirmation.');
}
async function refreshOrderEstimates(){
 const root=$('v9AutoOrderEstimates');if(!root||!client())return;
 root.replaceChildren();
 const u=await user();if(!u){root.append(mk('p','v9c-muted','Sign in to see GPS-based estimates on your own orders.'));return}
 const q=await client().from('useme_v9_auto_delivery_quotes')
  .select('order_id,roundtrip_km,estimated_delivery_fee_lkr,method,calculated_at')
  .eq('customer_id',u.id).order('calculated_at',{ascending:false}).limit(30);
 if(q.error){root.append(mk('p','v9c-muted','Automatic order estimates are temporarily unavailable.'));return}
 if(!q.data?.length){root.append(mk('p','v9c-muted','When you share your order GPS while Owner pricing GPS is active, your delivery estimate will appear here automatically.'));return}
 for(const item of q.data){
  const card=mk('div','v9-auto-order-row');
  card.append(mk('strong','','Order #'+item.order_id.slice(0,8)+' · '+money(item.estimated_delivery_fee_lkr)),
   mk('small','',Number(item.roundtrip_km).toFixed(2)+' KM estimated two-way straight line · Updated '+new Date(item.calculated_at).toLocaleString()),
   mk('p','','Provisional only. Actual road KM may be longer. Final quote confirmed by USE ME Owner.'));
  root.append(card);
 }
}
async function orderUpdated(orderId){
 if(!isUUID(orderId))return;
 const r=await client().from('useme_v9_auto_delivery_quotes')
 .select('roundtrip_km,estimated_delivery_fee_lkr,calculated_at').eq('order_id',orderId).maybeSingle();
 if(!r.error&&r.data){
  const t='Automatic estimate: '+Number(r.data.roundtrip_km).toFixed(2)+' KM straight-line round trip · '+money(r.data.estimated_delivery_fee_lkr)+' provisional. Final Owner fee may differ.';
  label('v9AutoFeeOrdersStatus',t);
 }else label('v9AutoFeeOrdersStatus','Customer pin updated. Automatic estimate will appear when Owner enables GPS pricing.');
 refreshOrderEstimates();
}
async function estimateSelectedOwnerOrder(){
 if(!await owner())return label('v9OwnerAutoEstimate','Owner login required.');
 const picker=$('v9OwnerOrderSelect');
 const id=picker?.value;
 if(!isUUID(id))return label('v9OwnerAutoEstimate','Select an active order containing a customer GPS pin.');
 const r=await client().rpc('useme_v9_quote_order_location',{p_order_id:id});
 if(r.error)return label('v9OwnerAutoEstimate','Could not estimate: '+r.error.message);
 if(r.data?.status!=='estimated')return label('v9OwnerAutoEstimate',r.data?.message||'GPS estimate unavailable.');
 label('v9OwnerAutoEstimate','📍 Automatic: '+Number(r.data.roundtrip_km).toFixed(2)+' KM approximate round trip · '+money(r.data.delivery_fee_lkr)+' provisional. Confirm actual route and road surcharge before quoting.');
}
function calculateOwnerFee(){
 const km=Number($('v9RoundTripKm')?.value);
 const extra=Number($('v9RoadExtra')?.value||0);
 if(!Number.isFinite(km)||km<=0||km>1000||!Number.isFinite(extra)||extra<0||extra>100000)
  return label('v9FeeResult','Enter a valid total round-trip KM and optional road-condition surcharge.');
 const settings=window.usemePublicSettings;
 const fee=window.usemeCalculateFee?window.usemeCalculateFee(km,extra):Math.round(Math.max(250,km*750/22)+extra);
 const fuel=Math.round(km*200/22);
 label('v9FeeResult',km.toFixed(2)+' KM round trip → Estimated fee '+money(fee)+' (including '+money(extra)+' road surcharge). Historic fuel reference ~'+money(fuel)+'. Owner must confirm actual road distance, extra stops and final price.');
}
async function customerLiveStart(){
 if(customerLiveWatch!==null)return stopCustomerLive();
 const selected=$('v9TrackingOrderSelect')?.value;
 if(!isUUID(selected))return label('v9CustomerLiveGpsStatus','Select your own active order first.');
 const u=await user();if(!u)return label('v9CustomerLiveGpsStatus','Sign in first.');
 const r=await client().from('orders').select('id,status').eq('id',selected).eq('customer_id',u.id).maybeSingle();
 if(r.error||!r.data||['delivered','cancelled'].includes(r.data.status))return label('v9CustomerLiveGpsStatus','An active customer order is required for location updates.');
 if(!navigator.geolocation||!window.isSecureContext)return label('v9CustomerLiveGpsStatus','Browser GPS requires HTTPS and location access.');
 if(!confirm('Start sending your updated phone GPS to YOUR selected USE ME order while this page stays open? USE ME Owner will see your delivery pin. The latest shared pin remains on the order after you Stop until you remove it in My Orders.'))return;
 customerOrderId=selected;customerLastShare=0;
 $('v9CustomerLiveGpsToggle').textContent='■ Stop My GPS Updates';
 label('v9CustomerLiveGpsStatus','Requesting GPS permission. Your order pin will update only while this page is open.');
 customerLiveWatch=navigator.geolocation.watchPosition(async pos=>{
  if(!customerOrderId||$('tracking')?.classList.contains('active')!==true)return stopCustomerLive();
  if(Date.now()-customerLastShare<17000||customerShareBusy)return;
  customerShareBusy=true;
  const p=pos.coords;
  const save=await client().rpc('share_my_order_delivery_location',{p_order_id:customerOrderId,p_lat:p.latitude,p_lng:p.longitude,p_accuracy_m:Math.max(0,Math.min(100000,p.accuracy||0))});
  if(save.error){label('v9CustomerLiveGpsStatus','Location update stopped: '+save.error.message);customerShareBusy=false;await stopCustomerLive();return}
  customerLastShare=Date.now();customerShareBusy=false;
  label('v9CustomerLiveGpsStatus','● Your delivery GPS pin updated at '+new Date().toLocaleTimeString()+' · Owner may see it on this order only.');
  await orderUpdated(customerOrderId);
 },async error=>{label('v9CustomerLiveGpsStatus',gpsError(error));await stopCustomerLive()},
 {enableHighAccuracy:true,maximumAge:0,timeout:25000});
}
async function stopCustomerLive(){
 if(customerLiveWatch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(customerLiveWatch);
 customerLiveWatch=null;customerOrderId=null;customerLastShare=0;customerShareBusy=false;
 if($('v9CustomerLiveGpsToggle'))$('v9CustomerLiveGpsToggle').textContent='▶ Start My Location Updates';
 label('v9CustomerLiveGpsStatus','GPS updates stopped on this phone. Your last intentionally shared order location remains until you remove it from My Orders.');
}
function onVisibility(){
 if(document.hidden||!activeOwnerMap())if(ownerSession)stopOrigin();
 if(document.hidden||!$('tracking')?.classList.contains('active'))if(customerLiveWatch!==null)stopCustomerLive();
}
function init(){
 $('v9PriceOriginButton')?.addEventListener('click',()=>ownerSession?stopOrigin():startOrigin());
 $('v9OwnerEstimateOrder')?.addEventListener('click',estimateSelectedOwnerOrder);
 $('v9EstimateFee')?.addEventListener('click',calculateOwnerFee);
 $('v9CustomerLiveGpsToggle')?.addEventListener('click',customerLiveStart);
 for(const [page,fn] of [['ownerMap',ownerQuoteRefresh],['orders',refreshOrderEstimates]]){
  const e=$(page);if(e)new MutationObserver(()=>{if(e.classList.contains('active'))fn();else onVisibility()})
   .observe(e,{attributes:true,attributeFilter:['class']});
  if(e?.classList.contains('active'))fn();
 }
 const tracking=$('tracking');
 if(tracking)new MutationObserver(()=>{if(!tracking.classList.contains('active'))onVisibility()}).observe(tracking,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',onVisibility);
 window.addEventListener('pagehide',()=>{
  if(ownerWatch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(ownerWatch);
  if(customerLiveWatch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(customerLiveWatch);
  if(ownerSession)client()?.rpc('useme_v9_owner_stop_rate_location').catch(()=>{});
  ownerSession=null;customerLiveWatch=null;
 });
}
window.usemeV9AutoFee={onCustomerGps:customerGps,onOrderLocationUpdated:orderUpdated,refreshOrders:refreshOrderEstimates};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();