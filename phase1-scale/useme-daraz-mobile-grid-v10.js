(()=>{'use strict';
const KEY='useme-shop-grid-columns-v10';
function mount(){
 const section=document.getElementById('buy');
 const grid=document.getElementById('liveProducts');
 const heading=document.querySelector('#buy .v7-live-heading');
 if(!section||!grid||!heading||document.getElementById('usemeGridDensity'))return;
 const wrap=document.createElement('div');wrap.id='usemeGridDensity';wrap.className='useme-grid-density';
 const left=document.createElement('span');left.textContent='PRODUCT VIEW';
 const controls=document.createElement('div');controls.className='useme-grid-density-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Products per row');
 const buttons=[3,4].map(num=>{
  const btn=document.createElement('button');btn.type='button';btn.textContent='▦ '+num;btn.dataset.cols=String(num);btn.setAttribute('aria-label',num+' products per row');btn.setAttribute('aria-pressed','false');return btn;
 });
 buttons.forEach(b=>controls.append(b));wrap.append(left,controls);heading.insertAdjacentElement('afterend',wrap);
 let chosen=null;
 try{const saved=localStorage.getItem(KEY);if(saved==='3'||saved==='4')chosen=Number(saved)}catch(e){}
 const defaultColumns=()=>window.innerWidth>=480?4:3;
 function apply(n){
  section.classList.toggle('useme-grid-four',n===4);
  section.classList.toggle('useme-grid-three',n===3);
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.cols)===n)));
 }
 apply(chosen||defaultColumns());
 buttons.forEach(btn=>btn.addEventListener('click',()=>{
  chosen=Number(btn.dataset.cols);apply(chosen);try{localStorage.setItem(KEY,String(chosen))}catch(e){}
 }));
 window.addEventListener('resize',()=>{if(!chosen)apply(defaultColumns())},{passive:true});
 // Product pictures double as tappable details links; the existing Quick view,
 // Add to Cart, favorite and detail handlers are left untouched.
 grid.addEventListener('click',event=>{
  if(event.target.closest('button,a'))return;
  const photo=event.target.closest('.v3-product-media');
  if(!photo||!grid.contains(photo))return;
  const card=photo.closest('.v3-product-card');
  const view=card?.querySelector('.useme-quick-view');
  const detail=card?.querySelector('.v9c-more');
  if(view)view.click();else if(detail)detail.click();
 });
 grid.addEventListener('keydown',event=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  if(event.target?.classList?.contains('v3-product-media')){
   event.preventDefault();event.target.click();
  }
 });
 const makePhotosFocusable=()=>{
  grid.querySelectorAll('.v3-product-media:not([data-useme-grid-photo-ready])').forEach(p=>{
   p.dataset.usemeGridPhotoReady='1';p.setAttribute('role','button');p.setAttribute('tabindex','0');
   p.setAttribute('aria-label','View product details');
  });
 };
 makePhotosFocusable();
 const observer=new MutationObserver(makePhotosFocusable);
 observer.observe(grid,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();