async function usemeRealProductApi(request,event){
 const u=new URL(request.url);
 const pageRaw=Number(u.searchParams.get('page')||1);
 const page=Number.isInteger(pageRaw)?Math.max(1,Math.min(8,pageRaw)):1;
 const headers={'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff','cache-control':'public, max-age=900, s-maxage=21600'};
 const endpoint=new URL('https://world.openfoodfacts.org/api/v2/search');
 endpoint.searchParams.set('page',String(page));
 endpoint.searchParams.set('page_size','500');
 endpoint.searchParams.set('sort_by','scans_n');
 endpoint.searchParams.set('fields','code,product_name,product_name_en,brands,quantity,image_front_small_url,image_front_url,main_category_en,categories');
 const cacheKey=new Request(new URL('/api/real-products?page='+page,request.url).toString(),{method:'GET'});
 let cache=null;
 try{cache=caches.default;const cached=await cache.match(cacheKey);if(cached)return cached}catch(_){}
 try{
  const original=await fetch(endpoint.toString(),{headers:{'Accept':'application/json','User-Agent':'USEME-Product-Discovery/1.0 (https://use-me-superapp-web.bryluno-zunora.workers.dev/real-products)'}});
  if(!original.ok)return new Response(JSON.stringify({error:'Open Food Facts temporarily unavailable',status:original.status,products:[]}),{status:503,headers:{...headers,'cache-control':'no-store'}});
  const parsed=await original.json();
  if(!Array.isArray(parsed.products))throw Error('Invalid product feed');
  const products=parsed.products.map(p=>({
   code:typeof p.code==='string'?p.code:'',
   product_name:typeof p.product_name==='string'?p.product_name:'',
   product_name_en:typeof p.product_name_en==='string'?p.product_name_en:'',
   brands:typeof p.brands==='string'?p.brands:'',
   quantity:typeof p.quantity==='string'?p.quantity:'',
   categories:typeof p.categories==='string'?p.categories:'',
   main_category_en:typeof p.main_category_en==='string'?p.main_category_en:'',
   image_front_url:typeof p.image_front_url==='string'?p.image_front_url:'',
   image_front_small_url:typeof p.image_front_small_url==='string'?p.image_front_small_url:''
  }));
  const reply=new Response(JSON.stringify({source:'Open Food Facts',license:'ODbL',page,page_size:500,source_count:Number(parsed.count)||0,products}),{status:200,headers});
  if(cache)event.waitUntil(cache.put(cacheKey,reply.clone()).catch(()=>{}));
  return reply;
 }catch(e){return new Response(JSON.stringify({error:'Open product feed temporarily unavailable',products:[]}),{status:503,headers:{...headers,'cache-control':'no-store'}})}
}