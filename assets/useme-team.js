/* USE ME limited staff area. No customer orders, no GPS, no owner settings. */
(function(){
'use strict';
const $=id=>document.getElementById(id),db=()=>typeof usemeDb!=='undefined'?usemeDb:null;
const el=(tag,cls,value)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(value!==undefined)x.textContent=String(value);return x};
let permission={announcements:false,catalogue:false};
const status=m=>{if($('teamWorkStatus'))$('teamWorkStatus').textContent=m};
async function checkPermission(){
 const r=await db().auth.getUser(),user=r.data?.user;
 if(!user)return{announcements:false,catalogue:false};
 const [role,grant]=await Promise.all([
  db().rpc('my_useme_role'),
  db().from('useme_staff_permissions').select('can_manage_announcements,can_review_catalogue').eq('user_id',user.id).maybeSingle()
 ]);
 const isOwner=!role.error&&role.data==='owner';
 return {announcements:isOwner||!!grant.data?.can_manage_announcements,catalogue:isOwner||!!grant.data?.can_review_catalogue};
}
async function products(){
 const list=$('teamProducts');if(!list||!permission.catalogue)return;
 const {data,error}=await db().from('products').select('id,name,price_lkr,stock,active').order('created_at',{ascending:false}).limit(120);
 list.replaceChildren();
 if(error){list.textContent=error.message;return}
 if(!data?.length){list.textContent='No product listings yet.';return}
 for(const p of data){
  const row=el('article','owner-record'),description=el('div','owner-record-body');
  description.append(el('h3','',p.name),el('p','','LKR '+p.price_lkr+' · Stock '+p.stock+' · '+(p.active?'Published':'Unpublished')));
  const button=el('button',p.active?'owner-btn danger':'owner-btn primary',p.active?'Unpublish':'Approve listing');
  button.onclick=async()=>{
   if(!confirm((p.active?'Unpublish ':'Publish ')+p.name+'?'))return;
   button.disabled=true;
   const {error:e}=await db().rpc('useme_review_catalogue_item',{p_product:p.id,p_active:!p.active});
   if(e){status(e.message);button.disabled=false}else{status('Product review saved.');await products()}
  };
  row.append(description,button);list.append(row);
 }
}
async function announcements(){
 const list=$('teamAnnouncementList');if(!list||!permission.announcements)return;
 const {data,error}=await db().from('useme_announcements').select('id,title,body,active').order('created_at',{ascending:false}).limit(50);
 list.replaceChildren();
 if(error){list.textContent=error.message;return}
 if(!data?.length){list.textContent='No announcements yet.';return}
 for(const a of data){
  const card=el('article','owner-record'),text=el('div','owner-record-body');
  text.append(el('h3','',a.title),el('p','',a.body),el('small','owner-muted',a.active?'Published':'Draft'));
  const edit=el('button','owner-btn soft','Edit');
  edit.onclick=()=>{
   $('teamAnnouncementId').value=a.id;$('teamAnnouncementTitle').value=a.title;
   $('teamAnnouncementText').value=a.body;$('teamAnnouncementPublished').checked=a.active;
   $('teamAnnouncementTitle').focus();
  };
  card.append(text,edit);list.append(card);
 }
}
window.usemeTeamPublish=async()=>{
 if(!permission.announcements){status('No announcement permission.');return}
 const title=$('teamAnnouncementTitle').value.trim(),body=$('teamAnnouncementText').value.trim();
 const id=$('teamAnnouncementId').value;
 if(title.length<3||body.length<5){status('Title or message is too short.');return}
 const {error}=await db().rpc('useme_save_announcement',{
  p_id:/^[a-f0-9-]{36}$/i.test(id)?id:null,
  p_title:title,p_body:body,p_active:$('teamAnnouncementPublished').checked
 });
 if(error){status(error.message);return}
 status('Announcement saved.');$('teamAnnouncementId').value='';
 $('teamAnnouncementTitle').value='';$('teamAnnouncementText').value='';
 $('teamAnnouncementPublished').checked=false;
 await announcements();await window.usemeLoadPublicExperience?.();
};
window.usemeOpenTeam=async()=>{
 const gate=$('teamAccessGate'),panel=$('teamControlPanel');if(!gate||!panel||!db())return;
 permission=await checkPermission();
 const allowed=permission.announcements||permission.catalogue;
 panel.classList.toggle('hidden',!allowed);gate.classList.toggle('hidden',allowed);
 if(!allowed)return;
 $('teamAnnouncementsPanel').classList.toggle('hidden',!permission.announcements);
 $('teamProductsPanel').classList.toggle('hidden',!permission.catalogue);
 await Promise.allSettled([announcements(),products()]);
};
async function refresh(){
 if(!db())return;
 permission=await checkPermission();
 $('teamAccountAccess')?.classList.toggle('hidden',!(permission.announcements||permission.catalogue));
 if(location.pathname==='/team')window.usemeOpenTeam();
}
async function init(){
 await refresh();
 db()?.auth.onAuthStateChange(()=>setTimeout(()=>refresh().catch(()=>{}),0));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(()=>{}));
else init().catch(()=>{});
})();