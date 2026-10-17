const USEME_DB_URL='https://woytuayeuyfvucttvosw.supabase.co',USEME_PUBLIC_KEY='sb_publishable_NG-tEBNafW-8tZwOvW2njA_WYzXCq8C';let usemeDb=null;try{if(window.supabase)usemeDb=window.supabase.createClient(USEME_DB_URL,USEME_PUBLIC_KEY)}catch(e){console.error('Database client unavailable',e)}let usemeRole='guest';async function applyUsemeShop(){
 const out=document.getElementById('shopApplyStatus');
 const btn=out?.previousElementSibling;
 const user=await currentUsemeUser();
 if(!user){out.textContent='Please sign in first.';return}
 const name=document.getElementById('shopApplyName').value.trim();
 const address=document.getElementById('shopApplyAddress').value.trim();
 const phone=document.getElementById('shopApplyPhone').value.trim();
 const notes=document.getElementById('shopApplyNotes').value.trim();
 if(name.length<3||address.length<8||phone.length<7){out.textContent='Enter your shop name, complete pickup address and contact number.';return}
 if(btn)btn.disabled=true;
 out.textContent='Submitting your shop application and pickup information...';
 const {data,error}=await usemeDb.rpc('register_useme_shop',{p_name:name,p_address:address,p_contact_phone:phone,p_notes:notes});
 out.textContent=error?'Application not submitted: '+error.message:'Application submitted. USE ME Owner will review and approve your shop.';
 if(!error){
  try{
   if(typeof window.usemeSaveShopLocationFromDraft==='function')await window.usemeSaveShopLocationFromDraft(data,'register');
  }catch(locationError){out.textContent+=' The shop is registered, but GPS could not be saved: '+locationError.message}

  for(const id of ['shopApplyName','shopApplyAddress','shopApplyPhone','shopApplyNotes'])document.getElementById(id).value='';
  await loadMyShopApplications();
  if(typeof loadShopPickupDetails==='function')await loadShopPickupDetails();
 }
 if(btn)btn.disabled=false;
}async function loadMyShopApplications(){const box=document.getElementById('myShopApplications');if(!box||!usemeDb)return;const user=await currentUsemeUser();if(!user){box.textContent='';return}const {data,error}=await usemeDb.from('shops').select('name,status,created_at').eq('owner_id',user.id).order('created_at',{ascending:false}).limit(10);box.textContent=error?'Unable to load shop applications.':(data.length?'Your applications: '+data.map(x=>x.name+' ('+x.status+')').join(' · '):'No shop applications yet.')} 

async function loadShopPickupDetails(){
 const panel=document.getElementById('shopPickupPanel'),select=document.getElementById('pickupShopSelect'),status=document.getElementById('pickupShopStatus');
 if(!panel||!usemeDb)return;
 const user=await currentUsemeUser();
 if(!user){panel.classList.add('hidden');return}
 const {data:role}=await usemeDb.rpc('my_useme_role');
 let query=usemeDb.from('shops').select('id,name,status');
 if(role!=='owner')query=query.eq('owner_id',user.id);
 const {data:shops,error}=await query.order('created_at',{ascending:false}).limit(100);
 if(error||!shops?.length){panel.classList.add('hidden');return}
 panel.classList.remove('hidden');
 const selected=select.value;
 if(select.options.length!==shops.length||!shops.every(x=>[...select.options].some(y=>y.value===x.id))){
  select.replaceChildren();
  for(const shop of shops){const opt=document.createElement('option');opt.value=shop.id;opt.textContent=shop.name+' · '+shop.status;select.append(opt)}
  if(shops.some(x=>x.id===selected))select.value=selected;
 }
 const shopId=select.value;
 const {data,error:detailsError}=await usemeDb.from('shop_pickup_details')
 .select('pickup_address,contact_phone,pickup_notes,map_url,latitude,longitude,location_accuracy_m,location_shared_at').eq('shop_id',shopId).maybeSingle();
 if(detailsError){status.textContent='Could not load pickup details: '+detailsError.message;return}
 document.getElementById('pickupShopAddress').value=data?.pickup_address||'';
 document.getElementById('pickupShopPhone').value=data?.contact_phone||'';
 if(!data?.contact_phone){
  try{const profile=await usemeDb.from('profiles').select('phone').eq('id',user.id).maybeSingle();
   if(!profile.error&&profile.data?.phone)document.getElementById('pickupShopPhone').value=profile.data.phone;
  }catch(_e){}
 }
 document.getElementById('pickupShopNotes').value=data?.pickup_notes||'';
 document.getElementById('pickupShopMap').value=data?.map_url||'';
 if(typeof window.usemeShopSavedLocation==='function')window.usemeShopSavedLocation(data);
 status.textContent=data?'Pickup location saved. USE ME Owner can see these details.':'Shop contact number can be prefilled from your account. Enter the exact shop pickup address and save; Owner approval and verified stock/photos are still needed before publishing.';
}
async function saveShopPickupDetails(){
 const id=document.getElementById('pickupShopSelect')?.value;
 const address=document.getElementById('pickupShopAddress')?.value.trim()||'';
 const phone=document.getElementById('pickupShopPhone')?.value.trim()||'';
 const notes=document.getElementById('pickupShopNotes')?.value.trim()||'';
 const map=document.getElementById('pickupShopMap')?.value.trim()||'';
 const out=document.getElementById('pickupShopStatus');
 if(!id||address.length<8||phone.length<7){out.textContent='Enter valid shop pickup address and phone.';return}
 const btn=document.getElementById('pickupShopSaveButton');btn.disabled=true;out.textContent='Saving shop pickup location...';
 try{
  const {error}=await usemeDb.rpc('update_useme_shop_pickup',{
   p_shop_id:id,p_address:address,p_contact_phone:phone,p_notes:notes,p_map_url:map||null
  });
  if(error)throw error;
  out.textContent='Shop pickup address and phone saved. USE ME Owner can collect products from your shop.';
  try{if(typeof window.usemeSaveShopLocationFromDraft==='function')await window.usemeSaveShopLocationFromDraft(id,'pickup')}
  catch(locationError){out.textContent+=' GPS location was not saved: '+locationError.message}
  await loadShopPickupDetails();
 }catch(e){out.textContent='Unable to save pickup details: '+e.message}
 finally{btn.disabled=false}
}

const USEME_PHOTO_BUCKET='product-images',USEME_MAX_PHOTO=12*1024*1024;
let sellerPreviewBlob=null;
function productImageUrl(path){
 if(!usemeDb||typeof path!=='string'||!/^[0-9a-f-]{36}\/[0-9a-f-]+\.(jpe?g|png|webp)$/i.test(path))return null;
 const data=usemeDb.storage.from(USEME_PHOTO_BUCKET).getPublicUrl(path);
 return data?.data?.publicUrl||null;
}
function previewSellerPhoto(input){
 const preview=document.getElementById('sellerProductPhotoPreview');
 if(sellerPreviewBlob){URL.revokeObjectURL(sellerPreviewBlob);sellerPreviewBlob=null}
 const file=input?.files?.[0];
 if(!file){preview.classList.add('hidden');preview.removeAttribute('src');return}
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>USEME_MAX_PHOTO||file.size===0){
  document.getElementById('sellerProductStatus').textContent='Choose a JPEG, PNG or WebP photo up to 12 MB.';
  input.value='';preview.classList.add('hidden');return;
 }
 sellerPreviewBlob=URL.createObjectURL(file);preview.src=sellerPreviewBlob;preview.classList.remove('hidden');
 document.getElementById('sellerProductStatus').textContent='Photo selected: '+file.name;
}
async function optimizeSellerPhoto(file){
 try{
  if(file.size<180000 && file.type==='image/webp')return file;
  if(typeof createImageBitmap!=='function')return file;
  const bitmap=await createImageBitmap(file);
  const size=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*size));canvas.height=Math.max(1,Math.round(bitmap.height*size));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  if(bitmap.close)bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.8));
  return blob&&blob.size>0&&blob.size<file.size?blob:file;
 }catch(_){return file}
}
async function uploadProductPhoto(shopId,file){
 if(!usemeDb)throw Error('Database connection unavailable');
 if(!/^[0-9a-f-]{36}$/i.test(shopId))throw Error('Invalid shop');
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>USEME_MAX_PHOTO||file.size<1)
  throw Error('Choose a real JPEG, PNG or WebP photo up to 12 MB.');
 const optimized=await optimizeSellerPhoto(file);
 const extension=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[optimized.type];
 const path=shopId+'/'+crypto.randomUUID()+'.'+extension;
 const {error}=await usemeDb.storage.from(USEME_PHOTO_BUCKET).upload(path,optimized,{upsert:false,contentType:optimized.type,cacheControl:'3600'});
 if(error)throw error;
 return path;
}
async function loadSellerProducts(){
 const panel=document.getElementById('sellerProductPanel'),select=document.getElementById('sellerProductShop'),list=document.getElementById('sellerProductList');
 if(!usemeDb||!panel||!select||!list)return;
 const user=await currentUsemeUser();
 if(!user){panel.classList.add('hidden');return}
 const role=await usemeDb.rpc('my_useme_role');
 const canManageAll=!role.error&&role.data==='owner';
 let query=usemeDb.from('shops').select('id,name,status');
 if(!canManageAll)query=query.eq('owner_id',user.id);
 const {data:shops,error}=await query.order('name',{ascending:true}).limit(100);
 if(error||!shops?.length){panel.classList.add('hidden');return}
 panel.classList.remove('hidden');
 const lastSelected=select.value;
 select.replaceChildren();
 for(const shop of shops){
  const option=document.createElement('option');option.value=shop.id;option.textContent=shop.name;select.append(option);
 }
 if(shops.some(x=>x.id===lastSelected))select.value=lastSelected;
 const pageSize=40;
 let offset=0,seen=[],loading=false,shopId=select.value,seq=0;
 async function loadPage(){
  if(loading||!shopId)return;loading=true;
  const wantedShop=shopId,requestedSeq=seq;
  try{
   const {data,error:itemsError}=await usemeDb.from('products')
    .select('id,shop_id,name,price_lkr,stock,active,category,description,image_path')
    .eq('shop_id',wantedShop).order('created_at',{ascending:false}).range(offset,offset+pageSize-1);
   if(wantedShop!==shopId||requestedSeq!==seq)return;
   if(itemsError){list.textContent='Products unavailable: '+itemsError.message;return}
   const part=data||[];seen=seen.concat(part);offset+=part.length;
   renderSellerProductRows(seen,shopId);
   if(part.length===pageSize){
    const more=document.createElement('button');more.type='button';more.className='btn';more.textContent='Load more products';
    more.onclick=()=>loadPage();list.append(more);
   }
  }finally{if(requestedSeq===seq)loading=false}
 }
 select.onchange=()=>{seq++;loading=false;shopId=select.value;offset=0;seen=[];list.replaceChildren();loadPage()};
 await loadPage();
}
function renderSellerProductRows(items,shopId){
 const list=document.getElementById('sellerProductList');
 if(!list)return;
 list.replaceChildren();
 const visible=items.filter(p=>p.shop_id===shopId);
 if(!visible.length){const note=document.createElement('p');note.className='muted';note.textContent='No products yet. Upload a product photo above to create your first listing.';list.append(note);return}
 for(const p of visible){
  const card=document.createElement('article');card.className='v3-seller-row';
  const img=document.createElement('div');img.className='v3-seller-photo';
  const src=productImageUrl(p.image_path);
  if(src){const photo=document.createElement('img');photo.src=src;photo.alt=p.name;photo.loading='lazy';img.append(photo)}
  else img.textContent='📷';
  const body=document.createElement('div');body.className='v3-seller-details';
  const title=document.createElement('h4');title.textContent=p.name;
  const category=document.createElement('p');category.class --- TRUNCATED --- 62,827 chars