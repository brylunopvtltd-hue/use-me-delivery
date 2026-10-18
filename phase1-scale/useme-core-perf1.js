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
function productImageUrl(path,qaPhotoUrl){
 if(typeof qaPhotoUrl==='string'&&((/^https:\/\/m\.media-amazon\.com\/images\//.test(qaPhotoUrl)||/^https:\/\/images-na\.ssl-images-amazon\.com\/images\//.test(qaPhotoUrl))||/^https:\/\/picsum\.photos\/seed\/useme-[A-Z0-9]{10}\/400\/400$/.test(qaPhotoUrl)))return qaPhotoUrl;
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
    .select('id,shop_id,name,price_lkr,stock,active,category,description,image_path,qa_photo_url')
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
  const src=productImageUrl(p.image_path,p.qa_photo_url);
  if(src){const photo=document.createElement('img');photo.src=src;photo.alt=p.name;photo.loading='lazy';img.append(photo)}
  else img.textContent='📷';
  const body=document.createElement('div');body.className='v3-seller-details';
  const title=document.createElement('h4');title.textContent=p.name;
  const category=document.createElement('p');category.className='muted';category.textContent=(p.category||'General')+' · '+(p.active?'LIVE':'UNPUBLISHED');
  const fields=document.createElement('div');fields.className='v3-seller-edit-fields';
  const price=document.createElement('input');price.type='number';price.min='1';price.step='.01';price.value=p.price_lkr;price.setAttribute('aria-label','Price in LKR for '+p.name);
  const stock=document.createElement('input');stock.type='number';stock.min='0';stock.step='1';stock.value=p.stock;stock.setAttribute('aria-label','Stock for '+p.name);
  fields.append(price,stock);
  const detail=document.createElement('textarea');detail.className='v3-seller-description-editor';detail.rows=3;detail.maxLength=1500;detail.value=p.description||'';detail.setAttribute('aria-label','Product description for '+p.name);
  const actions=document.createElement('div');actions.className='v3-seller-actions';
  const save=document.createElement('button');save.className='btn soft';save.textContent='Save details / price / stock';
  save.onclick=async()=>{
   const amount=Number(price.value),quantity=Number(stock.value);
   if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(quantity)||quantity<0){alert('Enter a valid price and stock.');return}
   save.disabled=true;const {error}=await usemeDb.from('products').update({price_lkr:amount,stock:quantity,description:detail.value.trim()}).eq('id',p.id).eq('shop_id',p.shop_id);
   if(error){alert(error.message);save.disabled=false}else{await loadSellerProducts();await loadLiveProducts()}
  };
  const publication=document.createElement('button');publication.className='btn';publication.textContent=p.active?'Unpublish':'Publish';
  publication.onclick=async()=>{
   if(!p.active&&(!(p.image_path||p.qa_photo_url)||Number(p.stock)<=0)){alert('Save positive stock first, then publish. A real photo and approved shop pickup address are required.');return}
   publication.disabled=true;
   const {error}=await usemeDb.from('products').update({active:!p.active}).eq('id',p.id).eq('shop_id',p.shop_id);
   if(error){alert(error.message);publication.disabled=false}else{await loadSellerProducts();await loadLiveProducts()}
  };
  const replace=document.createElement('input');replace.type='file';replace.accept='image/jpeg,image/png,image/webp';replace.setAttribute('aria-label','Replace photo for '+p.name);
  const swap=document.createElement('button');swap.className='btn soft';swap.textContent='Update photo';
  swap.onclick=async()=>{
   if(!replace.files?.length){alert('Select a replacement photo first.');return}
   swap.disabled=true;let newPath=null,committed=false;
   try{
    newPath=await uploadProductPhoto(p.shop_id,replace.files[0]);
    const {error}=await usemeDb.from('products').update({image_path:newPath}).eq('id',p.id).eq('shop_id',p.shop_id);
    if(error)throw error;
    committed=true;
    // Once DB points to the new image, NEVER delete it because old-image
    // cleanup or UI refresh failed. Remove the old photo only as best effort.
    if(p.image_path&&p.image_path!==newPath){
     try{const clean=await usemeDb.storage.from(USEME_PHOTO_BUCKET).remove([p.image_path]);
       if(clean.error)console.warn('Old photo cleanup postponed:',clean.error.message);
     }catch(cleanError){console.warn('Old photo cleanup postponed',cleanError)}
    }
    await Promise.allSettled([loadSellerProducts(),loadLiveProducts()]);
    alert('Product photo updated successfully.');
   }catch(e){
    if(newPath&&!committed){
     try{await usemeDb.storage.from(USEME_PHOTO_BUCKET).remove([newPath])}catch(cleanError){}
    }
    alert('Could not update photo: '+(e.message||String(e)));
   }finally{swap.disabled=false}
  };
  actions.append(save,publication,replace,swap);
  body.append(title,category,detail,fields,actions);
  card.append(img,body);list.append(card);
 }
}
async function addSellerProduct(){
 const out=document.getElementById('sellerProductStatus'),button=document.getElementById('sellerProductSaveButton');
 const shop_id=document.getElementById('sellerProductShop').value;
 const name=document.getElementById('sellerProductName').value.trim(),category=document.getElementById('sellerProductCategory').value;
 const description=document.getElementById('sellerProductDescription').value.trim();
 const price_lkr=Number(document.getElementById('sellerProductPrice').value);
 const stock=Number(document.getElementById('sellerProductStock').value);
 const photoInput=document.getElementById('sellerProductPhoto'),file=photoInput.files?.[0];
 if(!shop_id||name.length<2||name.length>120||description.length>1500||!Number.isFinite(price_lkr)||price_lkr<=0||!Number.isInteger(stock)||stock<0||!file){
  out.textContent='Enter name, category, price, stock and a real product photo.';return;
 }
 button.disabled=true;out.textContent='Uploading photo securely...';
 let image_path=null;
 try{
  image_path=await uploadProductPhoto(shop_id,file);
  out.textContent='Photo uploaded. Saving product...';
  const {error}=await usemeDb.from('products').insert({shop_id,name,category,description,price_lkr,stock,image_path,active:false});
  if(error)throw error;
  document.getElementById('sellerProductName').value='';
  document.getElementById('sellerProductPrice').value='';
  document.getElementById('sellerProductStock').value='1';
  document.getElementById('sellerProductDescription').value='';
  photoInput.value='';previewSellerPhoto(photoInput);
  out.textContent='Product saved as unpublished. Use Publish below when ready.';
  await loadSellerProducts();
 }catch(e){
  if(image_path)await usemeDb.storage.from(USEME_PHOTO_BUCKET).remove([image_path]);
  out.textContent='Product not saved: '+(e.message||String(e));
 }finally{button.disabled=false}
}

let liveCart=[];
try{
 const raw=JSON.parse(localStorage.getItem('useme_live_cart')||'[]');
 if(Array.isArray(raw)){
  liveCart=raw.filter(x=>x&&/^[0-9a-f-]{36}$/i.test(x.id)&&/^[0-9a-f-]{36}$/i.test(x.shop_id)&&Number.isFinite(Number(x.price))&&Number(x.price)>0&&Number.isInteger(Number(x.qty))&&Number(x.qty)>0)
   .slice(0,50).map(x=>({...x,qty:Math.min(100,Number(x.qty)),stock:Math.max(0,Number(x.stock)||0),price:Number(x.price)}));
  if(liveCart.length)liveCart=liveCart.filter(x=>x.shop_id===liveCart[0].shop_id);
 }
}catch(e){liveCart=[]}
function updateLiveCartBadge(){
 const count=liveCart.reduce((n,x)=>n+x.qty,0);
 const badge=document.getElementById('cartCount');
 if(badge)badge.textContent=String(count);
 const heading=document.getElementById('cartTitleCount');
 if(heading)heading.textContent=String(count);
}
function saveLiveCart(){
 try{localStorage.setItem('useme_live_cart',JSON.stringify(liveCart))}catch(e){console.warn('Cart storage unavailable',e)}
 updateLiveCartBadge();renderLiveCart();
}
function addLiveCart(p){
 if(liveCart.length&&liveCart[0].shop_id!==p.shop_id){
  alert('Only one approved shop per order. Please complete or clear your existing cart first.');return;
 }
 const item=liveCart.find(x=>x.id===p.id);
 if(item){
  if(item.qty>=Math.min(100,Number(p.stock))){alert('Requested quantity exceeds current stock.');return}
  item.qty++;
  item.stock=Number(p.stock);
  item.price=Number(p.price_lkr);
  item.image_path=p.image_path;item.qa_photo_url=p.qa_photo_url||null;
 }else{
  liveCart.push({
   id:p.id,shop_id:p.shop_id,name:p.name,price:Number(p.price_lkr),
   stock:Number(p.stock),qty:1,image_path:p.image_path||null,qa_photo_url:p.qa_photo_url||null,shop_name:p.shop_name||'USE ME Partner'
  });
 }
 saveLiveCart();go('cart');
}
function changeLiveQty(id,delta){
 const item=liveCart.find(x=>x.id===id);
 if(!item)return;
 item.qty=Math.max(0,Math.min(100,item.stock,item.qty+delta));
 liveCart=liveCart.filter(x=>x.qty>0);
 saveLiveCart();
}
function removeLiveCartItem(id){
 liveCart=liveCart.filter(x=>x.id!==id);saveLiveCart();
}
function clearLiveCart(){
 if(liveCart.length&&!confirm('Clear all items in this shop cart?'))return;
 liveCart=[];saveLiveCart();
}
async function revalidateLiveCart(){
 if(!usemeDb||!liveCart.length){updateLiveCartBadge();return}
 const ids=[...new Set(liveCart.map(x=>x.id))];
 try{
  const {data,error}=await usemeDb.from('products')
   .select('id,shop_id,name,price_lkr,stock,active,image_path,qa_photo_url')
   .in('id',ids).eq('active',true).gt('stock',0);
  if(error)throw error;
  const valid=new Map((data||[]).map(p=>[p.id,p]));
  let changed=false;
  liveCart=liveCart.filter(x=>{
   const fresh=valid.get(x.id);
   if(!fresh||fresh.shop_id!==x.shop_id){changed=true;return false}
   const qty=Math.min(100,Math.max(0,Number(fresh.stock)||0),x.qty);
   if(!qty){changed=true;return false}
   if(x.qty!==qty||x.price!==Number(fresh.price_lkr)||x.name!==fresh.name||x.image_path!==fresh.image_path)changed=true;
   Object.assign(x,{qty,stock:Number(fresh.stock),price:Number(fresh.price_lkr),name:fresh.name,image_path:fresh.image_path,qa_photo_url:fresh.qa_photo_url});
   return true;
  });
  if(changed)saveLiveCart();else{updateLiveCartBadge();renderLiveCart()}
  const out=document.getElementById('liveCheckoutStatus');
  if(changed&&out)out.textContent='Cart refreshed with current merchant prices, stock and availability.';
 }catch(e){
  const out=document.getElementById('liveCheckoutStatus');
  if(out)out.textContent='Could not refresh your cart. Please check your connection before checkout.';
 }
}
function renderLiveCart(){
 const box=document.getElementById('liveCartItems');
 if(!box)return;
 box.replaceChildren();
 if(!liveCart.length){
  const empty=document.createElement('div');empty.className='v3-cart-empty';
  const img=document.createElement('span');img.textContent='🛍️';img.setAttribute('aria-hidden','true');
  const title=document.createElement('h3');title.textContent='Your cart is empty';
  const p=document.createElement('p');p.textContent='Explore verified USE ME merchants and add products you love.';
  const button=document.createElement('button');button.className='btn';button.textContent='Explore Shop →';button.onclick=()=>go('buy');
  empty.append(img,title,p,button);box.append(empty);
 }else{
  const top=document.createElement('div');top.className='v3-cart-top';
  const info=document.createElement('b');info.textContent='1 approved shop · '+liveCart.reduce((n,x)=>n+x.qty,0)+' item(s)';
  const clear=document.createElement('button');clear.className='btn soft';clear.textContent='Clear cart';clear.onclick=clearLiveCart;
  top.append(info,clear);box.append(top);
 }
 for(const p of liveCart){
  const row=document.createElement('div');row.className='v3-cart-row';
  const photo=document.createElement('div');photo.className='v3-cart-photo';
  const url=productImageUrl(p.image_path,p.qa_photo_url);
  if(url){const img=document.createElement('img');img.src=url;img.alt=p.name;img.loading='lazy';photo.append(img)}else photo.textContent='🛍️';
  const detail=document.createElement('div');detail.className='v3-cart-detail';
  const name=document.createElement('h3');name.textContent=p.name;
  const shop=document.createElement('small');shop.textContent=p.shop_name||'Verified merchant';
  const price=document.createElement('strong');price.textContent='LKR '+p.price.toLocaleString('en-LK')+' × '+p.qty;
  const qty=document.createElement('div');qty.className='v3-cart-controls';
  const minus=document.createElement('button');minus.textContent='−';minus.setAttribute('aria-label','Remove one '+p.name);minus.onclick=()=>changeLiveQty(p.id,-1);
  const current=document.createElement('b');current.textContent=String(p.qty);
  const plus=document.createElement('button');plus.textContent='+';plus.setAttribute('aria-label','Add one '+p.name);plus.disabled=p.qty>=Math.min(100,p.stock);plus.onclick=()=>changeLiveQty(p.id,1);
  const remove=document.createElement('button');remove.className='v3-cart-remove';remove.textContent='Remove';remove.onclick=()=>removeLiveCartItem(p.id);
  qty.append(minus,current,plus,remove);detail.append(name,shop,price,qty);row.append(photo,detail);box.append(row);
 }
 const sum=liveCart.reduce((n,p)=>n+p.price*p.qty,0);
 const km=Number(document.getElementById('liveCheckoutKm')?.value??22);
 const extra=Number(document.getElementById('liveCheckoutRoad')?.value||0);
 const fee=window.usemeCalculateFee?window.usemeCalculateFee(km,extra):Math.round(Math.max(250,Math.max(0,km)*750/22)+Math.max(0,extra));
 const summary=document.getElementById('liveCartSummary');
 if(summary)summary.textContent=liveCart.length?'Items LKR '+sum.toLocaleString('en-LK')+' + indicative delivery LKR '+fee.toLocaleString('en-LK')+' = LKR '+(sum+fee).toLocaleString('en-LK')+' · Final price and delivery are confirmed by USE ME.':'Your cart is empty · Items LKR 0 · Delivery LKR 0 · Total LKR 0. Add a product to see an estimated delivery fee.';
 const checkout=document.getElementById('liveCheckoutButton');
 if(checkout)checkout.disabled=!liveCart.length||window.usemePublicSettings?.marketplace_enabled===false;
 updateLiveCartBadge();
}

function showOwnerWhatsAppAction(targetId,message){
 const box=document.getElementById(targetId);
 if(!box)return;
 box.replaceChildren();box.classList.remove('hidden');
 const title=document.createElement('strong');title.textContent='✓ Website order saved. Notify USE ME on WhatsApp';
 const label=document.createElement('p');
 label.textContent='To send these order details to USE ME WhatsApp, open the message and tap Send. This is optional while automatic Business API alerts are being set up.';
 const a=document.createElement('a');
 a.href='https://wa.me/'+(window.usemePublicSettings?.owner_whatsapp||'94752351751')+'?text='+encodeURIComponent(message);
 a.target='_blank';a.rel='noopener noreferrer';a.className='btn dark';
 a.textContent='💬 Open WhatsApp order message →';
 box.append(title,label,a);
}
/* Phase 5: preserve a request UUID across retries and reconnects in this tab.
   Fingerprint is SHA-256: customer name, phone and address are not saved in sessionStorage. */
const usemeRequestFallback=new Map();
async function usemeCheckoutRequestId(kind,payload){
 const data=new TextEncoder().encode(JSON.stringify(payload));
 let hash,canPersist=!!crypto.subtle;
 if(canPersist){
  const digest=await crypto.subtle.digest('SHA-256',data);
  hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 }else{
  // Older browsers must never persist unhashed phone/address details.
  hash=JSON.stringify(payload);
 }
 const key='useme-phase5-request-'+kind;
 let stored=null;
 if(canPersist)try{stored=JSON.parse(sessionStorage.getItem(key)||'null')}catch(e){}
 stored=stored||usemeRequestFallback.get(key);
 if(stored?.hash===hash&&/^[0-9a-f-]{36}$/i.test(stored.id))return stored.id;
 const id=crypto.randomUUID(),record={id,hash};
 if(canPersist)try{sessionStorage.setItem(key,JSON.stringify(record))}catch(e){usemeRequestFallback.set(key,record)}
 else usemeRequestFallback.set(key,record);
 return id;
}
function usemeClearCheckoutRequest(kind){
 const key='useme-phase5-request-'+kind;
 try{sessionStorage.removeItem(key)}catch(e){}
 usemeRequestFallback.delete(key);
}

async function submitLiveCheckout(){const out=document.getElementById('liveCheckoutStatus'),btn=document.getElementById('liveCheckoutButton');if(window.usemePublicSettings?.marketplace_enabled===false){out.textContent='New shop orders are temporarily paused by USE ME Owner.';return}if(!usemeDb||!await currentUsemeUser()){out.textContent='Sign in under Account before checkout.';return}const name=document.getElementById('liveCheckoutName').value.trim(),phone=document.getElementById('liveCheckoutPhone').value.trim(),address=document.getElementById('liveCheckoutAddress').value.trim(),km=Number(document.getElementById('liveCheckoutKm').value),road=Number(document.getElementById('liveCheckoutRoad').value);if(!liveCart.length||name.length<2||phone.length<7||address.length<5||!Number.isFinite(km)||km<0||km>10000||!Number.isFinite(road)||road<0){out.textContent='Check name, phone, address and distance.';return}btn.disabled=true;out.textContent='Submitting order...';try{const orderedItems=liveCart.map(x=>({...x}));
 const requestId=await usemeCheckoutRequestId('marketplace',{
  shop:liveCart[0].shop_id,cart:liveCart.map(x=>[x.id,x.qty]).sort((a,b)=>a[0].localeCompare(b[0])),
  name,phone,address,km,road
 });
 const {data,error}=await usemeDb.rpc('place_marketplace_order_once',{
  p_shop_id:liveCart[0].shop_id,p_recipient_name:name,p_recipient_phone:phone,
  p_delivery_address:address,p_distance_km:km,p_road_surcharge:road,
  p_items:liveCart.map(x=>({product_id:x.id,quantity:x.qty})),p_request_id:requestId
 });
 if(error)throw error;
 let locationNote='';
 try{
  if(typeof window.usemeSaveOrderLocationFromDraft==='function'){
   const locResult=await window.usemeSaveOrderLocationFromDraft(data,'cart');
   if(locResult.saved)locationNote=' Your GPS delivery pin was saved.';
  }
 }catch(locErr){locationNote=' Order was saved, but GPS was not saved. You can share it from My Orders.'}
 liveCart=[];saveLiveCart();
 out.textContent='Order placed! Reference '+data+'. Pending USE ME Owner confirmation. We purchase the items at the shop and deliver them. No online payment taken.'+locationNote;
 showOwnerWhatsAppAction('waOrderNotice',[
 '🛍️ USE ME · NEW SHOP ORDER',
 'Order Ref: '+data,
 'Shop: '+(orderedItems[0]?.shop_name||'Approved USE ME partner shop'),
 ...orderedItems.map(x=>'• '+x.name+' × '+x.qty+' (LKR '+x.price+')'),
 'Customer: '+name,
 'Phone: '+phone,
 'Delivery: '+address,
 'Estimated round-trip distance: '+km+' km',
 'Please review this order in your USE ME Owner Dashboard.'
 ].join('\n'));
 usemeClearCheckoutRequest('marketplace');
 await Promise.allSettled([window.loadMyOrders?.(),window.loadNotifications?.(),loadLiveProducts()]);
 }catch(e){out.textContent='Order confirmation unavailable: '+(e.message||'Network error')+'. If submission succeeded, retrying this request will return the same order reference without creating a duplicate.'}
 finally{btn.disabled=!liveCart.length}}
async function loadLiveProducts(){
 const box=document.getElementById('liveProducts');
 if(!box)return;
 if(!usemeDb){box.textContent='The marketplace is temporarily unavailable. Please refresh.';return}
 box.textContent='Checking approved USE ME shops...';
 try{
  const shopsResult=await usemeDb.from('shops').select('id,name').eq('status','approved').order('name').limit(200);
  if(shopsResult.error)throw shopsResult.error;
  const shops=shopsResult.data||[];
  const shopMap=new Map(shops.map(s=>[s.id,s.name]));
  if(!shops.length){box.textContent='No approved shops available yet. Check back soon.';return}

  const selectedCategory=new URLSearchParams(location.search).get('category');
  const sort=document.getElementById('sortProducts')?.value||'featured';
  const pageSize=40;let offset=0,requesting=false;
  box.replaceChildren();
  async function loadNextPage(){
   if(requesting)return;requesting=true;
   try{
    let q=usemeDb.from('products')
      .select('id,shop_id,name,price_lkr,stock,active,category,description,image_path,qa_photo_url')
      .in('shop_id',shops.map(s=>s.id)).eq('active',true);
    if(selectedCategory&&selectedCategory!=='All')q=q.ilike('category',selectedCategory);
    if(sort==='low'||sort==='high')q=q.order('price_lkr',{ascending:sort==='low'});
    else q=q.order('created_at',{ascending:false});
    const {data,error}=await q.order('id',{ascending:true}).range(offset,offset+pageSize-1);
    if(error)throw error;
    const raw=data||[];
    let products=raw.filter(p=>shopMap.has(p.shop_id));
    offset+=raw.length;
    products.sort((a,b)=>(Number(b.stock)>0?1:0)-(Number(a.stock)>0?1:0));
    const countEl=document.getElementById('v7-product-count');
    if(countEl)countEl.textContent=(box.querySelectorAll('.v3-product-card').length+products.length)+' products loaded';
    if(!offset){
    if(true){
   const message=document.createElement('div');message.className='v3-empty-market';
   const title=document.createElement('h3');title.textContent=selectedCategory&&selectedCategory!=='All'?'No '+selectedCategory+' listings yet':'Verified merchant products coming soon';
   const p=document.createElement('p');p.textContent='Approved shops appear here when they publish genuine in-stock products. No demo items are sold.';
   const back=document.createElement('button');back.className='btn';back.textContent='Browse all categories';back.onclick=()=>category('All');
   message.append(title,p,back);box.append(message);return;
  }

    }
  for(const p of products){
   const card=document.createElement('article');card.className='v3-product-card';card.dataset.productId=p.id;
   card.dataset.search=[p.name,p.category,p.description,shopMap.get(p.shop_id)].join(' ').toLowerCase();
   const media=document.createElement('div');media.className='v3-product-media';
   const src=productImageUrl(p.image_path,p.qa_photo_url);
   if(src){const img=document.createElement('img');img.loading='lazy';img.alt=p.name;img.src=src;img.onerror=()=>{img.remove();media.textContent='🛍️';media.classList.add('v3-product-photo-missing')};media.append(img)}
   else{media.textContent='🛍️';media.classList.add('v3-product-photo-missing')}
   const body=document.createElement('div');body.className='v3-product-body';
   const label=document.createElement('small');label.className='v3-product-category';label.textContent=p.category||'General';
   const merchant=document.createElement('small');merchant.className='v7-shop-name';merchant.textContent='🏬 '+(shopMap.get(p.shop_id)||'USE ME approved shop');
   const title=document.createElement('h3');title.textContent=p.name;
   const desc=document.createElement('p');desc.className='v3-product-description';desc.textContent=p.description||'Available from an approved local merchant.';
   const price=document.createElement('div');price.className='v3-product-price';price.textContent='LKR '+Number(p.price_lkr).toLocaleString('en-LK');
   const available=Number(p.stock)>0;
   const stock=document.createElement('small');stock.className='v3-stock-badge';stock.textContent=available?'✓ '+Number(p.stock)+' available':'Out of stock';
   card.classList.toggle('v5-unavailable-product',!available);
   const button=document.createElement('button');button.className='v3-add-cart';
   button.textContent=available?'＋ Add to Cart':'Currently unavailable';button.setAttribute('aria-label',(available?'Add ':'Unavailable: ')+p.name+(available?' to cart':''));
   button.disabled=!available;button.setAttribute('aria-disabled',String(!available));
   button.onclick=()=>{if(available)addLiveCart({...p,shop_name:shopMap.get(p.shop_id)})};
   body.append(label,merchant,title,desc,price,stock,button);
   card.append(media,body);box.append(card);
  }
  filterCategories();
    if(raw.length===pageSize){
     const more=document.createElement('button');more.type='button';more.className='btn';
     more.textContent='Load more products';
     more.onclick=()=>{more.remove();loadNextPage()};
     box.append(more);
    }
   }catch(err){
     const retry=document.createElement('button');retry.type='button';retry.className='btn';
     retry.textContent='Retry loading products';retry.onclick=()=>{retry.remove();loadNextPage()};
     box.append(retry);
     if(!box.querySelector('.v3-product-card'))box.prepend(document.createTextNode('Unable to load product listings. '));
   }finally{requesting=false}
  }
  await loadNextPage();
 }catch(e){
  box.textContent='Could not load approved merchant products. Please try Refresh. '+(e.message||'');
 }
}
async function loadShopApprovals(){const panel=document.getElementById('shopApprovalPanel'),box=document.getElementById('shopApprovalList');if(!usemeDb||usemeRole!=='owner'){panel.classList.add('hidden');return}panel.classList.remove('hidden');box.textContent='Loading shops...';const {data,error}=await usemeDb.from('shops').select('id,name,status,created_at').order('created_at',{ascending:false}).limit(100);box.replaceChildren();if(error){box.textContent='Unable to load shops: '+error.message;return}if(!data.length){box.textContent='No shop applications yet.';return}for(const shop of data){const row=document.createElement('div');row.className='card';const label=document.createElement('p');label.textContent=shop.name+' · '+shop.status;row.append(label);for(const state of ['approved','suspended']){if(state===shop.status)continue;const btn=document.createElement('button');btn.className='btn soft';btn.textContent=state==='approved'?'Approve':'Suspend';btn.onclick=async()=>{if(!confirm('Change '+shop.name+' to '+state+'?'))return;btn.disabled=true;const {error}=await usemeDb.rpc('set_shop_approval',{p_shop_id:shop.id,p_status:state});if(error){alert(error.message);btn.disabled=false}else loadShopApprovals()};row.append(btn)}box.append(row)}} async function loadManagedOrders(){const panel=document.getElementById('managementPanel'),box=document.getElementById('managedOrders');if(!usemeDb||!await currentUsemeUser())return;const roleResult=await usemeDb.rpc('my_useme_role');usemeRole=roleResult.data||'guest';if(!['owner','seller'].includes(usemeRole)){panel.classList.add('hidden');return}panel.classList.remove('hidden');loadShopApprovals();document.getElementById('managementRoleNote').textContent=usemeRole==='owner'?'Owner dashboard · all incoming USE ME orders':'Shop dashboard · orders assigned to your approved shops';const {data,error}=await usemeDb.from('orders').select('id,service_type,status,recipient_name,recipient_phone,delivery_address,order_notes,created_at,delivery_fee_lkr,items_subtotal_lkr').order('created_at',{ascending:false}).limit(60);box.replaceChildren();if(error){box.textContent='Could not load orders: '+error.message;return}document.getElementById('ownerSummary').textContent='Orders: '+data.length+' · Active: '+data.filter(o=>!['delivered','cancelled'].includes(o.status)).length+' · Delivered: '+data.filter(o=>o.status==='delivered').length+' · Quoted delivery fees: LKR '+data.reduce((v,o)=>v+Number(o.delivery_fee_lkr||0),0).toLocaleString();if(!data.length){box.textContent='No orders received yet.';return}for(const o of data){const card=document.createElement('article');card.className='card';const title=document.createElement('h3');title.textContent=(o.service_type||'marketplace').replaceAll('_',' ')+' · '+o.id.slice(0,8);const info=document.createElement('p');info.textContent='Customer: '+o.recipient_name+' · '+o.recipient_phone+' · '+o.delivery_address;const detail=document.createElement('p');detail.textContent='Notes: '+(o.order_notes||'None')+' · Est. delivery: LKR '+o.delivery_fee_lkr+' · Items: LKR '+o.items_subtotal_lkr;const status=document.createElement('strong');status.textContent='Status: '+o.status;const select=document.createElement('select');select.setAttribute('aria-label','Next order status');for(const value of ['accepted','preparing','ready','out_for_delivery','delivered','cancelled']){const opt=document.createElement('option');opt.value=value;opt.textContent=value.replaceAll('_',' ');select.append(opt)}const btn=document.createElement('button');btn.className='btn';btn.textContent='Update status';btn.onclick=async()=>{btn.disabled=true;const {error:e}=await usemeDb.rpc('set_order_status',{p_order_id:o.id,p_new_status:select.value});if(e)alert(e.message);else{await window.loadManagedOrders?.();await window.loadNotifications?.()}btn.disabled=false};card.append(title,info,detail,status,document.createElement('br'),select,btn);box.append(card)}}async function usemeMagicLink(){const status=document.getElementById('googleAuthStatus'),button=document.getElementById('magicButton'),email=document.getElementById('magicEmail').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status.textContent='Enter a valid email address.';return}if(!usemeDb){status.textContent='Connection unavailable. Please retry.';return}button.disabled=true;status.textContent='Requesting secure login link...';try{const {error}=await usemeDb.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin+window.location.pathname+'#account',shouldCreateUser:true}});if(error)throw error;status.textContent='Check your Gmail Inbox or Spam for a USE ME login link. Open it on this phone to sign in.'}catch(e){status.textContent='Could not send login link: '+(e.message||'Please try again.')}finally{button.disabled=false}}function authMessage(m){document.getElementById('authStatus').textContent=m}async function currentUsemeUser(){if(!usemeDb)return null;let {data,error}=await usemeDb.auth.getUser();return error?null:data.user}async function refreshSellerPortal(){
 const notice=document.getElementById('sellerVisitorNotice'),user=await currentUsemeUser();
 if(notice)notice.classList.toggle('hidden',!!user);
 if(user){
  await Promise.allSettled([loadShopPickupDetails(),loadSellerProducts(),window.loadManagedOrders?.()]);
 }else{
  for(const id of ['shopPickupPanel','sellerProductPanel','managementPanel'])document.getElementById(id)?.classList.add('hidden');
 }
}
async function refreshUsemeAuth(){let user=await currentUsemeUser();document.getElementById('authForms').classList.toggle('hidden',!!user);document.getElementById('googleAuth').classList.toggle('hidden',!!user);document.getElementById('signoutButton').classList.toggle('hidden',!user);if(user)authMessage('Signed in as '+user.email);else if(!document.getElementById('registerResult').textContent)authMessage('Sign in or create an account to place orders.');if(user){window.loadMyOrders?.();window.loadNotifications?.();window.loadManagedOrders?.();loadMyShopApplications();loadSellerProducts()}else{document.getElementById("managementPanel").classList.add("hidden")}}async function usemeSignIn(){if(!usemeDb){authMessage('Database connection unavailable. Try again later.');return}let email=document.getElementById('loginEmail').value.trim(),password=document.getElementById('loginPassword').value;let {error}=await usemeDb.auth.signInWithPassword({email,password});authMessage(error?error.message:'Signed in.');if(!error)refreshUsemeAuth()}async function usemeSignUp(){const status=document.getElementById('registerResult'),button=document.getElementById('registerButton');const say=m=>{status.textContent=m;authMessage(m)};if(!usemeDb){say('Cannot connect to USE ME database. Check your internet and refresh.');return}const email=document.getElementById('registerEmail').value.trim(),password=document.getElementById('registerPassword').value,name=document.getElementById('registerName').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){say('Please enter a valid email address.');return}if(password.length<8||name.length<2){say('Enter a name and a password of at least 8 characters.');return}button.disabled=true;say('Creating account...');try{const {data,error}=await usemeDb.auth.signUp({email,password,options:{data:{display_name:name}}});if(error)throw error;if(data.session){say('Registration successful. You are signed in.');await refreshUsemeAuth()}else{say('Registration request received. Check your Gmail inbox and Spam folder for a Supabase verification email. After confirming, use Sign in. If you already registered, use Sign in instead.')}}catch(e){say('Registration failed: '+(e.message||'Network problem. Please retry.'))}finally{button.disabled=false}}async function resendUsemeConfirmation(){const email=(document.getElementById('registerEmail').value||document.getElementById('loginEmail').value).trim();const status=document.getElementById('registerResult');if(!usemeDb||!email){status.textContent='Enter your email in the Register field first.';return}try{const {error}=await usemeDb.auth.resend({type:'signup',email});status.textContent=error?'Unable to resend: '+error.message:'If confirmation is required, a verification email has been requested. Check Inbox and Spam.'}catch(e){status.textContent='Could not send confirmation email: '+e.message}}async function usemeSignOut(){if(usemeDb)await usemeDb.auth.signOut();refreshUsemeAuth();document.getElementById('myOrders').textContent='Sign in to view orders.';document.getElementById('myNotifications').textContent='Sign in to view notifications.'}function updateServiceFee(){let km=Math.max(0,Number(document.getElementById('orderKm').value)||0);const fee=window.usemeCalculateFee?window.usemeCalculateFee(km):Math.round(Math.max(250,km*750/22));document.getElementById('orderFee').textContent='LKR '+fee.toLocaleString('en-LK');const btn=document.getElementById('placeOrderButton');if(btn)btn.disabled=window.usemePublicSettings?.service_orders_enabled===false;}async function submitServiceOrder(){let status=document.getElementById('orderSubmitStatus'),btn=document.getElementById('placeOrderButton');if(window.usemePublicSettings?.service_orders_enabled===false){status.textContent='New delivery requests are temporarily paused by USE ME Owner.';return}if(!usemeDb){status.textContent='Database unavailable. Please try later.';return}let user=await currentUsemeUser();if(!user){status.textContent='Please sign in first.';go('account');return}let name=document.getElementById('orderName').value.trim(),phone=document.getElementById('orderPhone').value.trim(),address=document.getElementById('orderAddress').value.trim(),km=Number(document.getElementById('orderKm').value),notes=document.getElementById('orderNotes').value.trim(),service=document.getElementById('serviceOrderType').value;if(name.length<2||phone.length<7||address.length<5||!Number.isFinite(km)||km<0||km>10000){status.textContent='Enter valid name, phone, address and round-trip km.';return}btn.disabled=true;status.textContent='Saving your order securely...';try{const requestId=await usemeCheckoutRequestId('service',{service,name,phone,address,km,notes});
 let {data,error}=await usemeDb.rpc('place_service_order_once',{
  p_service_type:service,p_recipient_name:name,p_recipient_phone:phone,
  p_delivery_address:address,p_distance_km:km,p_order_notes:notes,p_request_id:requestId
 });if(error)throw error;let gpsNote='';try{if(typeof window.usemeSaveOrderLocationFromDraft==='function'){let gps=await window.usemeSaveOrderLocationFromDraft(data,'service');if(gps.saved)gpsNote=' GPS delivery pin saved.'}}catch(locErr){gpsNote=' GPS could not be saved; use My Orders to share again.'}status.textContent='Order saved! Reference: '+data+'. Pending USE ME confirmation.'+gpsNote;showOwnerWhatsAppAction('waServiceNotice',[
 '📦 USE ME · NEW SERVICE ORDER',
 'Order Ref: '+data,'Service: '+service,
 'Customer: '+name,'Phone: '+phone,'Delivery: '+address,
 'Round-trip km: '+km,'Products / Notes: '+notes,
 'Please review in your USE ME Owner Dashboard.'
 ].join('\n'));
 usemeClearCheckoutRequest('service');
 await Promise.allSettled([window.loadMyOrders?.(),window.loadNotifications?.()]);
 }catch(e){status.textContent='Order confirmation unavailable: '+(e.message||'Network error')+'. You can retry safely without creating a duplicate order.'}
 finally{btn.disabled=false}}async function loadMyOrders(){let box=document.getElementById('myOrders');if(!usemeDb||!await currentUsemeUser()){box.textContent='Sign in to view orders.';return}let {data,error}=await usemeDb.from('orders').select('id,service_type,status,created_at,delivery_fee_lkr,items_subtotal_lkr').order('created_at',{ascending:false}).limit(30);box.replaceChildren();if(error){box.textContent='Unable to load orders: '+error.message;return}if(!data.length){box.textContent='No orders yet.';return}data.forEach(o=>{let c=document.createElement('article');c.className='card';let h=document.createElement('h3');h.textContent=(o.service_type||'marketplace').replaceAll('_',' ')+' · '+o.id.slice(0,8);let p=document.createElement('p');const delivery=Number(o.delivery_fee_lkr||0),subtotal=Number(o.items_subtotal_lkr||0);p.textContent='Items: LKR '+subtotal.toLocaleString('en-LK')+' · Delivery: LKR '+delivery.toLocaleString('en-LK')+' · Total: LKR '+(subtotal+delivery).toLocaleString('en-LK')+' · '+new Date(o.created_at).toLocaleString();let st=document.createElement('span');st.className='order-status';st.textContent=o.status;c.append(h,p,st);box.append(c)})}async function loadNotifications(){let box=document.getElementById('myNotifications'),count=document.getElementById('notificationCount');if(!usemeDb||!await currentUsemeUser()){box.textContent='Sign in to view notifications.';count.textContent='0';return}let {data,error}=await usemeDb.from('notifications').select('id,title,body,created_at,read_at').order('created_at',{ascending:false}).limit(30);box.replaceChildren();if(error){box.textContent='Unable to load notifications.';return}count.textContent=data.filter(x=>!x.read_at).length;if(!data.length){box.textContent='No notifications yet.';return}data.forEach(n=>{let c=document.createElement('div');c.className='card';let h=document.createElement('h3');h.textContent=(n.read_at?'':'🔔 ')+n.title;let p=document.createElement('p');p.textContent=n.body+' · '+new Date(n.created_at).toLocaleString();c.append(h,p);if(!n.read_at){let b=document.createElement('button');b.className='btn soft';b.textContent='Mark read';b.onclick=async()=>{await usemeDb.rpc('mark_notification_read',{p_notification_id:n.id});loadNotifications()};c.append(b)}box.append(c)})}let usemeNotificationTimer=null;let usemeRefreshInProgress=false;async function usemeBackgroundRefresh(){if(usemeRefreshInProgress||document.visibilityState==='hidden'||!usemeDb)return;usemeRefreshInProgress=true;try{const user=await currentUsemeUser();if(user){await window.loadNotifications?.();if(document.getElementById('account').classList.contains('active')){await window.loadMyOrders?.();if(usemeRole==='owner')await window.loadManagedOrders?.()}}}finally{usemeRefreshInProgress=false}}function startUsemeNotifications(){if(usemeNotificationTimer)clearInterval(usemeNotificationTimer);usemeNotificationTimer=setInterval(usemeBackgroundRefresh,30000)}if(usemeDb){usemeDb.auth.onAuthStateChange(()=>setTimeout(()=>{refreshUsemeAuth();usemeBackgroundRefresh()},0));refreshUsemeAuth();startUsemeNotifications();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')usemeBackgroundRefresh()})} function contactUseMe(message){window.open('https://wa.me/94752351751?text='+encodeURIComponent(message),'_blank','noopener,noreferrer')}function realFee(){let km=Math.max(0,Number(document.getElementById('realKm').value)||0),extra=Math.max(0,Number(document.getElementById('realRoad').value)||0);return Math.round(Math.max(250,km*750/22)+extra)}function calcRealFare(){document.getElementById('realFare').textContent='LKR '+realFee().toLocaleString('en-LK')}function requestRealDeliveryQuote(){let km=Number(document.getElementById('realKm').value)||0,road=Number(document.getElementById('realRoad').value)||0;contactUseMe('Hello USE ME! Please confirm a delivery quote for '+km+' km round trip, road surcharge LKR '+road+'. Indicative website estimate: LKR '+realFee()+'. Please confirm final fee and availability.')} 

const USEME_ROUTE_PATHS={searchV9:'/search',productDetails:'/products',shopDetails:'/shops',help:'/help',ownerSupport:'/owner/support',map:'/map',ownerMap:'/owner/map',tracking:'/tracking',team:'/team',owner:'/owner',seller:'/seller',home:'/',buy:'/shop',offers:'/offers',ride:'/ride',send:'/send',orders:'/orders',saved:'/saved',account:'/profile',profile:'/profile/overview',cart:'/cart',messages:'/messages',activity:'/activity',b2b:'/wholesale',placeorder:'/order/new',product:'/product',notifications:'/notifications'};
const USEME_ROUTE_TITLES={searchV9:'Search & Compare',productDetails:'Product Details',shopDetails:'Verified Shop',help:'Help & Support',ownerSupport:'Private Support Desk',map:'Interactive Maps',ownerMap:'Owner Dispatch Maps',tracking:'Live Delivery Tracking',team:'Limited Staff Workspace',owner:'Private Owner Control',seller:'Seller & Owner Control',home:'Home',buy:'Shop',offers:'Offers',ride:'Ride',send:'Send',orders:'My Orders',saved:'Saved',account:'Profile',profile:'My USE ME',cart:'Cart',messages:'Messages',activity:'Activity',b2b:'Wholesale',placeorder:'Place an Order',product:'Product',notifications:'Notifications'};
const USEME_ROUTE_LOOKUP=Object.fromEntries(Object.entries(USEME_ROUTE_PATHS).map(([page,path])=>[path,page]));
function routeFromLocation(){
 const path=decodeURI(location.pathname).replace(/\/+$/,'')||'/';
 if(path==='/ride/bike'||path==='/ride/threewheeler')return 'ride';
 if(/^\/products\/[0-9a-f-]{36}$/i.test(path))return 'productDetails';
 if(/^\/shops\/[0-9a-f-]{36}$/i.test(path))return 'shopDetails';
 if(/^\/help\/ticket\/[0-9a-f-]{36}$/i.test(path))return 'help';
 if(/^\/(tracking|delivery\/track)\/[0-9a-f-]{36}$/i.test(path))return 'tracking';
 return USEME_ROUTE_LOOKUP[path]||'home';
}
function go(page,opts={}){
 window.usemeHideServicesMenu?.();
 if(!document.getElementById(page))page='home';
 document.querySelectorAll('.page').forEach(e=>e.classList.toggle('active',e.id===page));
 const navPage=['ride','send','b2b','placeorder','map'].includes(page)?'services':['saved','profile','seller','owner','ownerMap','ownerSupport','team','notifications','help'].includes(page)?'account':page==='tracking'?'orders':['cart','offers','product','productDetails','shopDetails','searchV9'].includes(page)?'buy':page;
 document.querySelectorAll('.bottom [data-page]').forEach(e=>{
  const active=e.dataset.page===navPage;
  e.classList.toggle('active',active);
  if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');
 });
 if(!opts.preserveScroll)window.scrollTo(0,0);
 const path=opts.url||USEME_ROUTE_PATHS[page]||'/';
 if(!opts.noUrl){
  const method=opts.replace?'replaceState':'pushState';
  if(location.pathname+location.search!==path)history[method]({useme:page},'',path);
 }
 document.title=(USEME_ROUTE_TITLES[page]||'USE ME')+' | USE ME Sri Lanka';
 if(page==='activity')renderHistory();
 if(page==='cart'){renderLiveCart();revalidateLiveCart()}
 if(page==='buy')loadLiveProducts();
 if(page==='orders')window.loadMyOrders?.();
 if(page==='notifications')window.loadNotifications?.();
 if(page==='account'&&usemeDb){refreshUsemeAuth();usemeBackgroundRefresh()}
 if(page==='seller')refreshSellerPortal();
 if(page==='owner'&&window.usemeOwnerOpen)window.usemeOwnerOpen();
 if(page==='team'&&window.usemeOpenTeam)window.usemeOpenTeam();
 if(page==='placeorder')updateServiceFee();
 return page;
}
function goRide(kind,opts={}){
 const type=kind==='threewheeler'?'threewheeler':'bike';
 go('ride',{...opts,url:'/ride/'+type});
 const radios=[...document.querySelectorAll('input[name="vehicle"]')];
 if(radios[type==='threewheeler'?1:0])radios[type==='threewheeler'?1:0].checked=true;
}
function applyCategoryFilter(c,b){
 const tiles=[...document.querySelectorAll('#categoryGrid article')];
 const supported=c==='All'||[...document.querySelectorAll('#categories button')].some(e=>e.dataset.category===c)||tiles.some(e=>e.dataset.category===c);
 tiles.forEach(e=>e.classList.toggle('hidden',supported&&c!=='All'&&e.dataset.category!==c));
 const tabs=[...document.querySelectorAll('#categories button')];
 const selected=tabs.find(e=>e.dataset.category===c)||tabs[0];
 tabs.forEach(e=>e.classList.toggle('selected',e===(b||selected)));
 const note=document.getElementById('categoryNotice');
 if(note){note.textContent=supported?'':c+' shops are joining USE ME. Browse currently available partner categories below.';note.classList.toggle('hidden',supported)}
 const search=document.getElementById('search');if(search)search.value='';
}
function category(c,b){
 const url='/shop'+(c==='All'?'':'?category='+encodeURIComponent(c));
 go('buy',{url});
 applyCategoryFilter(c,b);
}
function openMyOrders(){go('orders')}
function navigateToUrl(){
 const page=routeFromLocation();
 if(location.pathname==='/ride/bike'||location.pathname==='/ride/threewheeler')goRide(location.pathname.endsWith('threewheeler')?'threewheeler':'bike',{noUrl:true});
 else go(page,{noUrl:true});
 if(page==='buy'){
  const c=new URLSearchParams(location.search).get('category');
  if(c)applyCategoryFilter(c);
 }
}
window.addEventListener('popstate',navigateToUrl);

function filterCategories(){
 const q=(document.getElementById('search')?.value||'').trim().toLowerCase();
 const chosenCategory=new URLSearchParams(location.search).get('category');
 const tiles=[...document.querySelectorAll('#categoryGrid article')];
 const supportsCategory=!!chosenCategory&&tiles.some(e=>e.dataset.category===chosenCategory);
 for(const tile of tiles){
  const wrongCategory=supportsCategory&&tile.dataset.category!==chosenCategory;
  const wrongSearch=!!q&&!tile.textContent.toLowerCase().includes(q);
  tile.classList.toggle('hidden',wrongCategory||wrongSearch);
 }
 const cards=[...document.querySelectorAll('#liveProducts .v3-product-card')];
 let count=0;
 for(const card of cards){
  const visible=!q||(card.dataset.search||'').includes(q);
  card.classList.toggle('hidden',!visible);
  if(visible)count++;
 }
 const old=document.getElementById('liveProductSearchEmpty');
 if(old)old.remove();
 const countEl=document.getElementById('v7-product-count');if(countEl)countEl.textContent=count+' '+(count===1?'product':'products');
 if(q&&cards.length&&!count){
  const notice=document.createElement('p');notice.className='v3-empty-market';notice.id='liveProductSearchEmpty';
  notice.textContent='No verified products match "'+q+'". Try another search.';
  document.getElementById('liveProducts').append(notice);
 }
}
function calcFare(){let km=Math.max(0,Number(document.getElementById('km').value)||0),extra=Math.max(0,Number(document.getElementById('road').value)||0);const fee=window.usemeCalculateFee?window.usemeCalculateFee(km,extra):Math.round(Math.max(250,km*750/22)+extra);document.getElementById('fare').textContent='LKR '+fee.toLocaleString('en-LK')}
function saveDraft(){let fields=['sender','pickup','receiver','dropoff','parcel'];if(fields.some(id=>!document.getElementById(id).value.trim())){alert('Please complete sender, receiver, locations and parcel description.');return}let data={id:Date.now(),created:new Date().toLocaleString(),sender:document.getElementById('sender').value.trim(),pickup:document.getElementById('pickup').value.trim(),receiver:document.getElementById('receiver').value.trim(),dropoff:document.getElementById('dropoff').value.trim(),parcel:document.getElementById('parcel').value.trim(),size:document.getElementById('size').value,estimate:document.getElementById('fare').textContent};try{let list=JSON.parse(localStorage.getItem('useme_drafts')||'[]');list.unshift(data);localStorage.setItem('useme_drafts',JSON.stringify(list.slice(0,30)));alert('Draft saved only on this device. It has NOT been submitted to USE ME.');go('activity')}catch(e){alert('This browser cannot save local drafts. No request was submitted.')}}
function renderHistory(){let el=document.getElementById('history');let list=[];try{list=JSON.parse(localStorage.getItem('useme_drafts')||'[]')}catch(e){}el.replaceChildren();if(!list.length){el.innerHTML='<div class="card"><h2>📭 No activity yet</h2><p class="muted">Parcel request drafts you save will appear here. No real bookings are active.</p><button class="btn" onclick="go(\'send\')">Create parcel draft</button></div>';return}list.forEach(d=>{let card=document.createElement('article');card.className='card history';let h=document.createElement('h3');h.textContent='📦 '+d.pickup+' → '+d.dropoff;let p=document.createElement('p');p.textContent=d.parcel+' · '+d.estimate;let small=document.createElement('small');small.className='muted';small.textContent='LOCAL DRAFT · NOT SUBMITTED · '+d.created;card.append(h,p,small);el.append(card)})}
function renderProducts(){const box=document.getElementById('products');if(box)box.replaceChildren();}
const wholesaleDemo=[{name:'Apparel & Textiles',photo:'useme-b2b-apparel',moq:'MOQ 100 pcs',description:'Fabric, clothing and accessories'},{name:'Electronics Accessories',photo:'useme-b2b-electronics',moq:'MOQ 50 pcs',description:'Cables, cases and peripherals'},{name:'Beauty & Personal Care',photo:'useme-b2b-beauty',moq:'MOQ 24 pcs',description:'Cosmetics and personal care goods'},{name:'Food & Packaging',photo:'useme-b2b-packaging',moq:'MOQ 20 cartons',description:'Food-grade packaging and supplies'}];function renderWholesale(){let box=document.getElementById('wholesaleProducts');if(!box)return;box.replaceChildren();wholesaleDemo.forEach(x=>{let a=document.createElement('article');a.className='card rfq-card';let im=document.createElement('div');im.className='useme-category-art';im.setAttribute('role','img');im.setAttribute('aria-label',x.name+' wholesale category');im.textContent=({'Apparel & Textiles':'👕','Electronics Accessories':'🔌','Beauty & Personal Care':'🧴','Food & Packaging':'📦'})[x.name]||'🏭';let body=document.createElement('div');body.className='body';let title=document.createElement('b');title.textContent=x.name;let p=document.createElement('p');p.className='muted';p.textContent=x.description+' · '+x.moq;let button=document.createElement('button');button.className='btn';button.textContent='Create RFQ →';button.onclick=()=>{document.getElementById('rfqItem').value=x.name;document.getElementById('rfqForm').scrollIntoView({behavior:'smooth'})};body.append(title,p,button);a.append(im,body);box.append(a)})}function getRfq(){try{let x=JSON.parse(localStorage.getItem('useme_rfq_drafts')||'[]');return Array.isArray(x)?x:[]}catch{return []}}function renderRfqs(){let box=document.getElementById('rfqHistory');if(!box)return;box.replaceChildren();let items=getRfq();if(!items.length){box.innerHTML='<div class="card"><p class="muted">No saved RFQ drafts yet.</p></div>';return}items.forEach((x,i)=>{let c=document.createElement('div');c.className='card';let title=document.createElement('h3');title.textContent=x.item;let p=document.createElement('p');p.className='muted';p.textContent=x.qty+' '+x.unit+' · '+x.destination+' · Draft only';let notes=document.createElement('p');notes.textContent=x.notes;let del=document.createElement('button');del.className='btn soft';del.textContent='Delete draft';del.onclick=()=>{let arr=getRfq();arr.splice(i,1);localStorage.setItem('useme_rfq_drafts',JSON.stringify(arr));renderRfqs()};c.append(title,p,notes,del);box.append(c)})}function saveRfq(){let item=document.getElementById('rfqItem').value.trim(),qty=Number(document.getElementById('rfqQty').value),unit=document.getElementById('rfqUnit').value,destination=document.getElementById('rfqDestination').value.trim(),notes=document.getElementById('rfqNotes').value.trim(),feedback=document.getElementById('rfqFeedback');if(!item||!destination||!Number.isInteger(qty)||qty<1||qty>1000000){feedback.textContent='Please enter a product, valid quantity and destination.';return}let list=getRfq();list.unshift({item,qty,unit,destination,notes});localStorage.setItem('useme_rfq_drafts',JSON.stringify(list.slice(0,30)));feedback.textContent='RFQ draft saved on this device. Not submitted to a supplier.';renderRfqs()}renderWholesale();renderRfqs();renderProducts();updateLiveCartBadge();if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});if(location.hash){const legacy=location.hash.slice(1);if(USEME_ROUTE_PATHS[legacy]){history.replaceState(null,'',USEME_ROUTE_PATHS[legacy]);}}navigateToUrl();
