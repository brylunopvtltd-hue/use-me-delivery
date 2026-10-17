import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowed = "https://use-me-superapp-web.bryluno-zunora.workers.dev";
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const coord=(lat:unknown,lng:unknown)=>({lat:Number(lat),lng:Number(lng)});
const valid=(p:{lat:number,lng:number})=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
const number=(v:unknown,f:number)=>v===null||v===undefined?f:(Number.isFinite(Number(v))?Number(v):f);
function cors(origin:string|null){return {
  "Access-Control-Allow-Origin":origin===allowed?allowed:"null",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age":"3600","Vary":"Origin"}}
function json(http:number,data:Record<string,unknown>,origin:string|null){
  return new Response(JSON.stringify(data),{status:http,headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"private, no-store"}})
}
async function route(stops:{lat:number,lng:number}[]){
 const points=stops.map(p=>p.lng.toFixed(6)+","+p.lat.toFixed(6)).join(";");
 const url="https://router.project-osrm.org/route/v1/driving/"+points+"?overview=false&steps=false&alternatives=false";
 const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),12000);
 let response:Response;
 try{response=await fetch(url,{signal:ctrl.signal,headers:{"Accept":"application/json"}})}
 finally{clearTimeout(timeout)}
 if(!response.ok)throw Error("Road routing provider unavailable");
 const body=await response.json();
 const r=body.routes?.[0];
 if(body.code!=="Ok"||!r||!(r.distance>0)||!Number.isFinite(r.duration))throw Error("No road route");
 return {
  km:Math.round(r.distance/10)/100,
  oneWay:stops.length===3&&r.legs?.[0]?.distance>0?Math.round(r.legs[0].distance/10)/100:null,
  minutes:Math.ceil(r.duration/60)
 };
}
Deno.serve(async req=>{
 const origin=req.headers.get("Origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return json(405,{status:"method_not_allowed"},origin);
 if(origin&&origin!==allowed)return json(403,{status:"origin_not_allowed"},origin);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return json(503,{status:"server_unconfigured"},origin);
 const header=req.headers.get("Authorization")||"";
 const token=header.startsWith("Bearer ")?header.slice(7):"";
 if(!token||token.length>8192)return json(401,{status:"sign_in_required",message:"Sign in to USE ME first."},origin);
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await admin.auth.getUser(token);
 const userId=auth.data.user?.id;
 if(auth.error||!userId)return json(401,{status:"sign_in_required",message:"Session expired. Sign in again."},origin);
 let p:Record<string,unknown>;
 try{
  const raw=await req.text();
  if(raw.length>3000)throw Error("Long request");
  p=JSON.parse(raw);
  if(!p||typeof p!=="object"||Array.isArray(p))throw Error("Invalid JSON");
 }catch{return json(400,{status:"invalid_request"},origin)}
 let target=coord(p.lat,p.lng);
 let accuracy=number(p.accuracy_m,0);
 let order:null|Record<string,unknown>=null;
 const orderId=typeof p.order_id==="string"?p.order_id:null;
 if(orderId){
  if(!uuid.test(orderId))return json(400,{status:"invalid_order_id"},origin);
  const result=await admin.from("orders").select("id,customer_id,shop_id,status,delivery_latitude,delivery_longitude,delivery_location_accuracy_m,quote_confirmed_at").eq("id",orderId).maybeSingle();
  if(result.error||!result.data||result.data.customer_id!==userId)return json(403,{status:"order_unavailable"},origin);
  order=result.data;
  if(["delivered","cancelled"].includes(String(order.status))||order.quote_confirmed_at)
   return json(409,{status:"order_locked",message:"Already confirmed or closed orders cannot be repriced."},origin);
  if(order.delivery_latitude==null||order.delivery_longitude==null)return json(422,{status:"customer_gps_missing",message:"Share the customer destination pin first."},origin);
  target=coord(order.delivery_latitude,order.delivery_longitude);
  accuracy=number(order.delivery_location_accuracy_m,0);
 }
 if(!valid(target)||accuracy<0||accuracy>1500)return json(422,{status:"gps_invalid_or_inaccurate",message:"Choose an accurate customer pin and retry."},origin);
 // Owner's private GPS never appears in the response.
 const [originRes,baseRes,settingsRes]=await Promise.all([
  admin.from("useme_v9_owner_rate_origin").select("latitude,longitude,accuracy_m,enabled,updated_at,expires_at").eq("id",1).maybeSingle(),
  admin.from("useme_v9_owner_dispatch_base").select("latitude,longitude,accuracy_m,location_source,updated_at").eq("id",1).maybeSingle(),
  admin.from("useme_owner_settings").select("min_delivery_lkr,reference_roundtrip_km,reference_delivery_lkr").eq("id",1).single()
 ]);
 if(originRes.error||baseRes.error||settingsRes.error)return json(503,{status:"settings_unavailable"},origin);
 const live=originRes.data;
 const freshLive=live?.enabled&&new Date(live.expires_at).getTime()>Date.now()&&
   Date.now()-new Date(live.updated_at).getTime()<180000&&number(live.accuracy_m,1e6)<=1500;
 // A saved dispatch base is a fixed owner-selected business origin, never implied LIVE GPS.
 const sourceType=freshLive?"private_live_origin":baseRes.data?"owner_saved_dispatch_base":null;
 const o=freshLive?live:baseRes.data;
 if(!sourceType||!o)return json(409,{status:"owner_location_not_configured",
   message:"USE ME Owner must select a dispatch base ONCE, or temporarily enable live pricing GPS. Request a manual quote meanwhile."},origin);
 const start=coord(o.latitude,o.longitude);
 if(!valid(start))return json(409,{status:"owner_location_invalid"},origin);
 const throttle=await admin.from("useme_v9_road_quote_rate_limits").select("last_requested_at").eq("user_id",userId).maybeSingle();
 if(throttle.data&&Date.now()-new Date(throttle.data.last_requested_at).getTime()<12000)
   return json(429,{status:"cooldown",message:"Please wait 12 seconds between requests."},origin);
 const mark=await admin.from("useme_v9_road_quote_rate_limits").upsert({user_id:userId,last_requested_at:new Date().toISOString()},{onConflict:"user_id"});
 if(mark.error)return json(503,{status:"rate_limit_unavailable"},origin);
 let mode=p.mode==="marketplace"?"marketplace":"direct";
 let shopIds:string[]=[];
 if(order){
  const r=await admin.from("order_items").select("product_id").eq("order_id",orderId).limit(80);
  const productIds=(r.data||[]).map(x=>x.product_id).filter((x):x is string=>typeof x==="string"&&uuid.test(x));
  if(productIds.length){
   const products=await admin.from("products").select("shop_id").in("id",productIds);
   if(products.error)return json(503,{status:"shops_unavailable"},origin);
   shopIds=(products.data||[]).map(x=>x.shop_id).filter((x):x is string=>typeof x==="string"&&uuid.test(x));
  }
  if(typeof order.shop_id==="string"&&uuid.test(order.shop_id))shopIds.push(order.shop_id);
  if(shopIds.length)mode="marketplace";
 }else if(mode==="marketplace"){
  if(!Array.isArray(p.shop_ids)||!p.shop_ids.length||p.shop_ids.length>7||
   p.shop_ids.some(x=>typeof x!=="string"||!uuid.test(x)))return json(422,{status:"shop_pickup_required",message:"Verified shop pickup locations are needed to price marketplace orders."},origin);
  shopIds=p.shop_ids;
 }
 const pickups:{lat:number,lng:number}[]=[];
 if(mode==="marketplace"){
  const distinct=[...new Set(shopIds)];
  if(!distinct.length||distinct.length>7)return json(422,{status:"shop_pickup_required"},origin);
  const [sr,pr]=await Promise.all([
    admin.from("shops").select("id,status").in("id",distinct),
    admin.from("shop_pickup_details").select("shop_id,latitude,longitude").in("shop_id",distinct)
  ]);
  if(sr.error||pr.error)return json(503,{status:"shops_unavailable"},origin);
  const approved=new Set((sr.data||[]).filter(x=>x.status==="approved").map(x=>x.id));
  const pins=new Map((pr.data||[]).map(x=>[x.shop_id,x]));
  for(const id of distinct){
   const pin=pins.get(id);
   if(!approved.has(id)||!pin||pin.latitude==null||pin.longitude==null||!valid(coord(pin.latitude,pin.longitude)))
    return json(422,{status:"shop_pickup_required",message:"Shop pickup GPS is missing. Request Owner manual quotation; we will not guess the distance."},origin);
   pickups.push(coord(pin.latitude,pin.longitude));
  }
 }
 let road;
 try{road=await route([start,...pickups,target,start]);}
 catch{return json(503,{status:"road_route_unavailable",message:"Actual road KM unavailable. No artificial fee calculated; please ask USE ME Owner."},origin)}
 const cfg=settingsRes.data;
 const min=Math.max(0,number(cfg.min_delivery_lkr,250));
 const refKm=Math.max(.1,number(cfg.reference_roundtrip_km,22));
 const refLkr=Math.max(0,number(cfg.reference_delivery_lkr,750));
 const base=Math.max(min,road.km*refLkr/refKm);
 const fee=Math.round(base); // +0 surcharge; ONLY Owner may override road difficulty
 if(!Number.isFinite(fee)||fee<min)return json(503,{status:"calculation_unavailable"},origin);
 const method=mode==="marketplace"?"road_route_multistop":"road_route_roundtrip";
 if(orderId){
  const result=await admin.from("useme_v9_auto_delivery_quotes").upsert({
   order_id:orderId,customer_id:userId,one_way_road_km:road.oneWay,
   roundtrip_km:road.km,road_duration_minutes:road.minutes,
   estimated_delivery_fee_lkr:fee,customer_gps_accuracy_m:accuracy,method,
   calculated_at:new Date().toISOString(),owner_origin_updated_at:o.updated_at,
   note:"Unconfirmed real road-route estimate. Owner's final quote and road-condition adjustment may differ."
  },{onConflict:"order_id"});
  if(result.error)return json(503,{status:"quote_save_failed",message:"Road route was found, but the order quote could not be saved."},origin);
 }
 return json(200,{
  status:"estimated",confirmed:false,method,route_kind:mode,
  one_way_road_km:road.oneWay,roundtrip_road_km:road.km,
  pickup_count:pickups.length,route_minutes:road.minutes,
  delivery_fee_lkr:fee,minimum_fee_lkr:min,
  reference_roundtrip_km:refKm,reference_delivery_lkr:refLkr,
  surcharge_lkr:0,accuracy_m:accuracy,quote_time:new Date().toISOString(),
  origin_kind:sourceType,owner_location_age_seconds:freshLive?Math.floor((Date.now()-new Date(o.updated_at).getTime())/1000):null,
  message:sourceType==="owner_saved_dispatch_base"
   ?"Road quote from the Owner's previously selected dispatch BASE, not the Owner's live GPS. USE ME Owner confirms final fee, road conditions and availability."
   :"Real road-route estimate from fresh private Owner GPS. USE ME Owner confirms final fee, road conditions and availability."
 },origin);
});
