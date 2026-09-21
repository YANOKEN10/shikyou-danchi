// Run before deploying any release snapshot: node scripts/verify-usage.cjs [release-directory]
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(process.argv[2]||__dirname);
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function handler(file,dependencies){const box={module:{exports:{}},require:n=>dependencies[n]||require(n),process:{env:{STATS_READ_KEY:'test-only-key'}},Response,Buffer,URL,Date};vm.runInNewContext(read(file),box);return box.module.exports;}
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.code=c;return this},json(d){this.data=d;return this},end(){return this}}}
(async()=>{
 assert.match(read('index.html'),/<script\b[^>]*src=["']\/usage-tracker\.js["'][^>]*data-game=["']shikyou["']/);
 for(const f of ['usage-settings.html','usage-settings.js','usage-settings.css'])assert(read(f).length>0);
 const id='日本語テスト',account=digest('shikyou:'+id),alias=digest('shikyou:'+Buffer.from(id,'utf8').toString('latin1'));
 let reads=0;
 const summary=handler('api/usage-summary.js',{'@vercel/blob':{list:async()=>({blobs:[{pathname:'shikyou/u/'+'a'.repeat(64)+'.json'}],hasMore:false}),get:async()=>{reads++;return {statusCode:200,stream:JSON.stringify({id,display:'表示名テスト'})}}}});
 let res=response();await summary({method:'GET',url:'/?people=1',headers:{}},res);assert.equal(res.code,401);assert.equal(reads,0);
 res=response();await summary({method:'GET',url:'/?people=1',headers:{authorization:'Bearer test-only-key'}},res);assert.equal(res.code,200);assert.equal(res.data.users[0].key,account);assert.equal(res.data.users[0].name,'表示名テスト');assert(res.data.users[0].aliases.includes(alias));
 const identity=handler('api/usage-identity.js',{'./_lib':{bearer:r=>r.headers.authorization,readToken:t=>t==='valid'?{id}:null,readUser:async()=>({id,display:'表示名テスト'})}});
 res=response();await identity({method:'GET',headers:{}},res);assert.equal(res.code,401);res=response();await identity({method:'GET',headers:{authorization:'valid'}},res);assert.equal(res.data.id,id);assert.equal(res.data.displayName,'表示名テスト');
 async function tracker(excludeAtStart,excludeDuring){let excluded=excludeAtStart,calls=[],timers=[];const storage=new Map([['shikyou:token','valid']]);const box={document:{currentScript:{dataset:{game:'shikyou'}},hidden:false,hasFocus:()=>true},localStorage:{getItem:k=>k==='yg-usage-excluded'?(excluded?'1':null):storage.get(k),setItem:(k,v)=>storage.set(k,v)},crypto:crypto.webcrypto,TextEncoder,Date,performance:{now:()=>0},AbortSignal,setTimeout:f=>timers.push(f),setInterval:()=>{},addEventListener:()=>{},fetch:async(url,options)=>{calls.push({url,options});if(url==='/api/usage-identity'){if(excludeDuring)excluded=true;return {ok:true,json:async()=>({id,displayName:'表示名テスト'})}}return {ok:true}}};vm.runInNewContext(read('usage-tracker.js'),box);for(const f of timers)await f();const sends=calls.filter(c=>c.options?.method==='POST');if(excludeAtStart){assert.equal(calls.length,0)}else if(excludeDuring){assert.equal(sends.length,0)}else{assert.equal(sends.length,1);const b=JSON.parse(sends[0].options.body);assert.equal(b.account,account);assert.equal(b.displayName,'表示名テスト');assert.equal(b.identityKnown,true)}}
 await tracker(false,false);await tracker(true,false);await tracker(false,true);
 console.log('PASS: Japanese names, legacy aliases, identity authentication, tracker loading and device exclusion');
})().catch(e=>{console.error('Usage release check failed:',e.message);process.exitCode=1});
