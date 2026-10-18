import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync('phase1-scale/useme-v9-commerce-support.js','utf8');
const start=script.indexOf('let usemeSearchGeneration=0;');
const end=script.indexOf('\nfunction fillSearchCategories(){',start);
assert(start>=0&&end>start,'Could not find current staged search function');
const searchSource=script.slice(start,end);
const shopA='11111111-1111-4111-8111-111111111111';
const shopB='22222222-2222-4222-8222-222222222222';
const shopC='33333333-3333-4333-8333-333333333333';
const shops=[
 {id:shopA,name:'Colombo Fashion'},
 {id:shopB,name:'Irakkamam Grocery'}
];
const products=Array.from({length:370},(_,i)=>({
 id:'product-'+String(i).padStart(4,'0'),
 shop_id:i<325?shopA:i<350?shopB:shopC,
 name:i%5===0?'Dress '+i:'Item '+i,
 description:'Local item',
 category:i%2===0?'Fashion':'Beauty',
 price_lkr:(i%100)+25,
 stock:i%13===0?0:5
}));
function makeNode(tag,cls='',txt=''){
 const node={
  tag,cls,textContent:txt,children:[],dataset:{},parent:null,
  append(...items){for(const item of items){item.parent=this;this.children.push(item)}},
  replaceChildren(...items){this.children=[];this.append(...items)},
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)},
  querySelector(selector){
   if(selector==='[data-useme-search-more]')return this.children.find(x=>x.dataset.usemeSearchMore);
   return null;
  }
 };
 return node;
}
function createQuery(rows){
 const filters=[],sort=[];
 return {
  select(){return this},
  eq(field,value){filters.push(p=>p[field]===value);return this},
  in(field,values){filters.push(p=>values.includes(p[field]));return this},
  lte(field,value){filters.push(p=>Number(p[field])<=value);return this},
  or(condition){
   const term=(condition.match(/name\.ilike\.%([^%]+)%/)||[])[1]?.toLowerCase()||'';
   const ids=(condition.match(/shop_id\.in\.\(([^)]+)\)/)||[])[1]?.split(',')||[];
   filters.push(p=>
    [p.name,p.description,p.category].some(v=>v.toLowerCase().includes(term))||ids.includes(p.shop_id));
   return this;
  },
  order(field,{ascending=true}={}){sort.push([field,ascending]);return this},
  range(start,end){
   let items=rows.filter(p=>filters.every(f=>f(p)));
   items=items.sort((a,b)=>{
    for(const [field,ascending] of sort){
     const va=a[field],vb=b[field],n=(typeof va==='number'&&typeof vb==='number')?va-vb:String(va).localeCompare(String(vb));
     if(n!==0)return ascending?n:-n;
    }
    return 0;
   });
   return Promise.resolve({data:items.slice(start,end+1),count:items.length,error:null});
  }
 };
}
function harness(){
 const root=makeNode('root');
 const controls={
  v9SearchResults:root,
  v9SearchInput:{value:''},
  v9SearchCategory:{value:'All'},
  v9SearchMaxPrice:{value:''},
  v9SearchSort:{value:'popular'}
 };
 const statuses={};
 const ctx=vm.createContext({
  shops,shopById:new Map(shops.map(s=>[s.id,s.name])),
  catalog:[],compareSet:new Set(),
  $:id=>controls[id]||null,
  elem:makeNode,
  button:(text,callback,cls)=>{const node=makeNode('button',cls,text);node.onclick=callback;return node},
  card:p=>makeNode('product','',p.id),
  fillSearchCategories:()=>{},
  safeStatus:(id,msg)=>{statuses[id]=msg},
  db:()=>({from:table=>{assert.equal(table,'products');return createQuery(products)}}),
  URLSearchParams,location:{search:''},
  Number,Set,String
 });
 vm.runInContext(searchSource,ctx);
 return {ctx,root,controls,statuses};
}
async function loadAll(h){
 await vm.runInContext('renderSearch()',h.ctx);
 let pages=1,btn;
 while((btn=h.root.querySelector('[data-useme-search-more]'))){
  assert(pages<20,'Possible pagination loop');
  await btn.onclick();pages++;
 }
 return {pages,ids:h.root.children[0].children.map(n=>n.textContent)};
}
test('Loads 350 approved-shop products over 9 pages; no extra or repeated items',async()=>{
 const h=harness(),result=await loadAll(h);
 assert.equal(result.pages,9,JSON.stringify(h.statuses));
 assert.equal(result.ids.length,350);
 assert.equal(new Set(result.ids).size,350);
 assert(!result.ids.some(v=>v.includes('0350')));
 assert.match(h.statuses.v9SearchStatus,/350 of 350/);
});
test('Searches product names across all 350 approved products instead of first 400 cap',async()=>{
 const h=harness();h.controls.v9SearchInput.value='Dress';
 const result=await loadAll(h);
 assert.equal(result.ids.length,70,JSON.stringify(h.statuses));
 assert.equal(new Set(result.ids).size,70);
});
test('Shop name matching is performed server-side and paginated',async()=>{
 const h=harness();h.controls.v9SearchInput.value='Irakkamam Grocery';
 const result=await loadAll(h);
 assert.equal(result.ids.length,25,JSON.stringify(h.statuses));
 assert.equal(result.pages,1);
});
test('Category, price and sorting filters are forwarded to the query',async()=>{
 const h=harness();
 h.controls.v9SearchCategory.value='Fashion';
 h.controls.v9SearchMaxPrice.value='40';
 h.controls.v9SearchSort.value='low';
 const result=await loadAll(h);
 assert(result.ids.length>0,JSON.stringify(h.statuses));
 for(const id of result.ids){
  const p=products.find(x=>x.id===id);
  assert.equal(p.category,'Fashion');assert(p.price_lkr<=40);assert.notEqual(p.shop_id,shopC);
 }
});
test('Image optimizer falls back safely without browser canvas APIs',async()=>{
 const core=fs.readFileSync('phase1-scale/useme-core-perf1.js','utf8');
 const a=core.indexOf('async function optimizeSellerPhoto(file){'),b=core.indexOf('async function uploadProductPhoto(shopId,file){',a);
 assert(a>=0&&b>a);
 const context=vm.createContext({});
 vm.runInContext(core.slice(a,b),context);
 const photo={type:'image/png',size:450000};
 const result=await vm.runInContext('optimizeSellerPhoto',context)(photo);
 assert.equal(result,photo);
});
