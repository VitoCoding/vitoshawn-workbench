const APP_VERSION="FINAL 1.0";
const STATE_KEY="vitoshawn_workbench_final_state";
const SYNC_META_KEY="vitoshawn_workbench_final_sync_meta";
const CLOUD_CONFIG_KEY="vitoshawn_workbench_cloud_config";
const LEGACY_CONFIG_KEYS=["tianpeng_vitoshawn_v4_cloud_config"];
const LEGACY_STATE_KEYS=[
  "tianpeng_vitoshawn_workbench_v4",
  "tianpeng_vitoshawn_workbench_v3",
  "comedy_workbench_product_v2",
  "comedy_visual_workbench_v1"
];

const defaults={
  meta:{view:"today",inboxFilter:"all",standupTab:"bits"},
  today:{date:"",energy:"中",mainTask:"",mainMin:"",mainDone:false,assistTask:"",assistMin:"",assistDone:false,lowTask:"",lowMin:"",lowDone:false,minimum:"",deadline:"",notes:"",dayPush:"",dayBlock:"",dayNext:""},
  history:{},
  inbox:[],
  standup:{bits:[],openmics:[],practice:[],openmicReview:""},
  media:{exposures:[],topics:[]},
  film:{sessions:[]},
  review:{closer:"",block:"",priorities:"",minimum:""}
};
const syncDefaults={dirty:false,localModifiedAt:"",lastCloudUpdatedAt:"",lastSyncAt:"",conflict:false};

let S=loadState();
let SM=loadSyncMeta();
let client=null, session=null, user=null;
let cloudRowExists=null, syncTimer=null, pollTimer=null, inFlight=false, conflictRemote=null;

function clone(x){return JSON.parse(JSON.stringify(x))}
function merge(a,b){
  if(Array.isArray(a))return Array.isArray(b)?b:clone(a);
  if(a&&typeof a==="object"){const o={};Object.keys(a).forEach(k=>o[k]=merge(a[k],b?.[k]));if(b&&typeof b==="object")Object.keys(b).forEach(k=>{if(!(k in o))o[k]=b[k]});return o}
  return b===undefined?a:b;
}
function localDay(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`}
function nowIso(){return new Date().toISOString()}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function attr(s){return esc(s).replace(/'/g,"&#39;")}
function fmtTime(v){if(!v)return "—";try{return new Date(v).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return"—"}}
function isNewer(a,b){if(!a)return false;if(!b)return true;return new Date(a).getTime()>new Date(b).getTime()+250}
function hasData(x=S){return !!(x.today.mainTask||x.today.assistTask||x.today.lowTask||x.today.notes||x.inbox.length||x.standup.bits.length||x.standup.openmics.length||x.standup.practice.length||x.media.exposures.length||x.media.topics.length||x.film.sessions.length)}
function thisWeek(x){if(!x)return false;const d=new Date(x),n=new Date(),w=(n.getDay()+6)%7,s=new Date(n);s.setHours(0,0,0,0);s.setDate(n.getDate()-w);const e=new Date(s);e.setDate(s.getDate()+7);return d>=s&&d<e}

function normalizeLegacy(v){
  if(v?.standup?.practiceLogs&&!v.standup.practice)v.standup.practice=v.standup.practiceLogs;
  if(v?.dashboard&&!v.today){
    v.today={
      ...clone(defaults.today),
      energy:v.dashboard.energy||"中",deadline:v.dashboard.deadline||"",minimum:v.dashboard.minimum||"",
      mainTask:v.dashboard.mainTask||"",mainMin:v.dashboard.mainMin||"",mainDone:!!v.dashboard.mainDone,
      assistTask:v.dashboard.assistTask||"",assistMin:v.dashboard.assistMin||"",assistDone:!!v.dashboard.assistDone,
      lowTask:v.dashboard.lowTask||"",lowDone:!!v.dashboard.lowDone,notes:v.dashboard.notes||"",
      dayPush:v.dashboard.dayPush||"",dayBlock:v.dashboard.dayBlock||"",dayNext:v.dashboard.dayNext||""
    };
  }
  if(v?.standup?.jokes && !Array.isArray(v.standup.bits)){
    v.standup.bits=[{id:crypto.randomUUID(),title:"旧版段子记录",premise:v.standup.jokes,status:"初稿",next:"",createdAt:nowIso()}];
  }
  return v;
}
function loadState(){
  try{
    const cur=localStorage.getItem(STATE_KEY);
    if(cur)return merge(defaults,JSON.parse(cur));
    for(const k of LEGACY_STATE_KEYS){
      const raw=localStorage.getItem(k);
      if(raw){
        const migrated=merge(defaults,normalizeLegacy(JSON.parse(raw)));
        localStorage.setItem(STATE_KEY,JSON.stringify(migrated));
        return migrated;
      }
    }
  }catch(e){console.error("loadState",e)}
  return clone(defaults);
}
function loadSyncMeta(){try{return merge(syncDefaults,JSON.parse(localStorage.getItem(SYNC_META_KEY)||"{}"))}catch{return clone(syncDefaults)}}
function persistLocal(markDirty=true){
  if(markDirty){SM.dirty=true;SM.localModifiedAt=nowIso()}
  localStorage.setItem(STATE_KEY,JSON.stringify(S));
  localStorage.setItem(SYNC_META_KEY,JSON.stringify(SM));
  renderSyncUI();
  if(markDirty)schedulePush();
}
function applyCloud(remote,updatedAt){
  S=merge(defaults,remote||{});
  SM.dirty=false;SM.localModifiedAt=updatedAt||nowIso();SM.lastCloudUpdatedAt=updatedAt||"";SM.lastSyncAt=nowIso();SM.conflict=false;
  conflictRemote=null;
  localStorage.setItem(STATE_KEY,JSON.stringify(S));
  localStorage.setItem(SYNC_META_KEY,JSON.stringify(SM));
  hydrateAll();
  renderSyncUI();
}
function dayRollover(){
  const t=localDay();
  if(!S.today.date){S.today.date=t;persistLocal(false);return}
  if(S.today.date===t)return;
  S.history[S.today.date]=clone(S.today);
  const carry=S.today.dayNext||"";
  S.today={...clone(defaults.today),date:t,energy:S.today.energy||"中",mainTask:carry,mainMin:carry?"先打开相关材料，做 10 分钟":""};
  persistLocal(true);
}

function getConfig(){
  try{
    const current=JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY)||"{}");
    if(current.url&&current.key)return current;
    for(const k of LEGACY_CONFIG_KEYS){
      const x=JSON.parse(localStorage.getItem(k)||"{}");
      if(x.url&&x.key){localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify(x));return x}
    }
  }catch{}
  return {};
}
function saveConfig(){
  const url=supabaseUrl.value.trim().replace(/\/+$/,""),key=supabaseKey.value.trim();
  if(!url||!key){showError("请填写 Project URL 和 Publishable key。");return}
  if(key.startsWith("sb_secret_")){showError("不能使用 Secret key。请改用 Publishable key。");return}
  localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify({url,key}));
  toast("连接配置已保存");
  initCloud(true);
}
async function initCloud(recreate=false){
  clearError();
  const cfg=getConfig();
  supabaseUrl.value=cfg.url||"";supabaseKey.value=cfg.key||"";
  configState.textContent=cfg.url&&cfg.key?"已保存 Project URL + Publishable key":"未配置";
  configState.classList.toggle("ok",!!(cfg.url&&cfg.key));
  if(!cfg.url||!cfg.key||!window.supabase?.createClient){client=null;session=null;user=null;setStatus("idle","仅本地");renderSyncUI();return}
  try{
    if(recreate){client=null;session=null;user=null}
    if(!client)client=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    session=data.session||null;user=session?.user||null;
    renderAccount();
    if(user)await syncAfterLogin();
    else setStatus("idle","未登录");
  }catch(e){showError(e?.message||String(e));setStatus("error","连接失败")}
}
function renderAccount(){
  accountState.textContent=user?`已登录：${user.email}`:"未登录";
  accountState.classList.toggle("ok",!!user);
}
async function signup(){
  clearError();if(!client){showError("先保存 Supabase 连接配置。");return}
  const email=authEmail.value.trim(),password=authPassword.value;
  if(!email||password.length<6){showError("请输入邮箱；密码至少 6 位。");return}
  setStatus("syncing","正在注册");
  const {data,error}=await client.auth.signUp({email,password});
  if(error){showError(error.message);setStatus("error","注册失败");return}
  if(data.session){session=data.session;user=data.user;renderAccount();await syncAfterLogin()}
  else{setStatus("idle","等待邮箱确认");toast("请先确认注册邮件，再回来登录")}
}
async function login(){
  clearError();if(!client){showError("先保存 Supabase 连接配置。");return}
  const email=authEmail.value.trim(),password=authPassword.value;
  if(!email||!password){showError("请输入邮箱和密码。");return}
  setStatus("syncing","正在登录");
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error){showError(error.message);setStatus("error","登录失败");return}
  session=data.session;user=data.user;renderAccount();await syncAfterLogin()
}
async function logout(){
  if(client)await client.auth.signOut();
  session=null;user=null;SM.lastCloudUpdatedAt="";SM.lastSyncAt="";SM.conflict=false;localStorage.setItem(SYNC_META_KEY,JSON.stringify(SM));renderAccount();setStatus("idle","未登录");renderSyncUI()
}
async function fetchCloud(){
  if(!client||!user)return null;
  const {data,error}=await client.from("workbench_state").select("state,updated_at").eq("user_id",user.id).maybeSingle();
  if(error)throw error;
  cloudRowExists=!!data;renderSyncUI();return data;
}
async function upsertCloud(){
  if(!client||!user)throw new Error("未登录");
  const payload=clone(S);
  const {data,error}=await client.from("workbench_state")
    .upsert({user_id:user.id,state:payload},{onConflict:"user_id"})
    .select("updated_at").single();
  if(error)throw error;
  cloudRowExists=true;SM.dirty=false;SM.lastCloudUpdatedAt=data.updated_at;SM.lastSyncAt=nowIso();SM.conflict=false;
  localStorage.setItem(SYNC_META_KEY,JSON.stringify(SM));
  renderSyncUI();return data.updated_at;
}
async function syncAfterLogin(){
  if(inFlight)return;
  inFlight=true;setStatus("syncing","正在同步");clearError();
  try{
    const row=await fetchCloud();
    if(!row){
      await upsertCloud();setStatus("ok","已同步");return;
    }
    // 新设备：没有任何同步历史。空设备直接拉云端；有本机数据时按修改时间判断。
    if(!SM.lastCloudUpdatedAt){
      if(!hasData()){applyCloud(row.state,row.updated_at);setStatus("ok","已同步");return}
      if(SM.localModifiedAt && isNewer(SM.localModifiedAt,row.updated_at)){
        await upsertCloud();setStatus("ok","已同步");return
      }
      applyCloud(row.state,row.updated_at);setStatus("ok","已同步");return
    }
    if(isNewer(row.updated_at,SM.lastCloudUpdatedAt)){
      if(SM.dirty){setConflict(row);return}
      applyCloud(row.state,row.updated_at);setStatus("ok","已同步");return
    }
    if(SM.dirty)await upsertCloud();
    setStatus("ok","已同步");
  }catch(e){showError(e?.message||String(e));setStatus("error","同步失败")}
  finally{inFlight=false;renderSyncUI()}
}
async function pushNow(force=false){
  if(!client||!user){setStatus("idle","未登录");return}
  if(inFlight)return;
  inFlight=true;setStatus("syncing","正在上传");clearError();
  try{
    if(!force&&SM.lastCloudUpdatedAt){
      const row=await fetchCloud();
      if(row&&isNewer(row.updated_at,SM.lastCloudUpdatedAt)){setConflict(row);return}
    }
    await upsertCloud();setStatus("ok","已同步")
  }catch(e){showError(e?.message||String(e));setStatus("error","上传失败")}
  finally{inFlight=false;renderSyncUI()}
}
async function pullNow(force=false){
  if(!client||!user){setStatus("idle","未登录");return}
  if(inFlight)return;
  inFlight=true;setStatus("syncing","正在刷新");clearError();
  try{
    const row=await fetchCloud();
    if(!row){cloudRowExists=false;renderSyncUI();setStatus("idle","云端为空");return}
    if(SM.dirty&&!force&&isNewer(row.updated_at,SM.lastCloudUpdatedAt)){setConflict(row);return}
    applyCloud(row.state,row.updated_at);setStatus("ok","已同步")
  }catch(e){showError(e?.message||String(e));setStatus("error","刷新失败")}
  finally{inFlight=false;renderSyncUI()}
}
function setConflict(row){
  conflictRemote=row;SM.conflict=true;localStorage.setItem(SYNC_META_KEY,JSON.stringify(SM));conflictBox.classList.remove("hidden");setStatus("conflict","等待选择");renderSyncUI()
}
async function useCloud(){if(!conflictRemote)return;applyCloud(conflictRemote.state,conflictRemote.updated_at);conflictBox.classList.add("hidden");setStatus("ok","已同步")}
async function keepLocal(){SM.conflict=false;conflictBox.classList.add("hidden");await pushNow(true)}
function schedulePush(){
  clearTimeout(syncTimer);
  if(!user)return;
  syncTimer=setTimeout(()=>{if(SM.dirty&&!SM.conflict)pushNow(false)},1000);
}
async function backgroundPull(){
  if(!user||SM.dirty||SM.conflict||document.visibilityState!=="visible")return;
  try{
    const row=await fetchCloud();
    if(row&&isNewer(row.updated_at,SM.lastCloudUpdatedAt))applyCloud(row.state,row.updated_at);
    if(row)setStatus("ok","已同步")
  }catch(e){/* background check不打断用户 */}
}
function setStatus(kind,text){syncStatus.className="sync-status "+kind;syncStatus.textContent=text;syncDetailText.textContent=text}
function showError(msg){syncErrorText.textContent=msg;syncErrorBox.classList.remove("hidden")}
function clearError(){syncErrorText.textContent="";syncErrorBox.classList.add("hidden")}
function renderSyncUI(){
  const cfg=getConfig();configState.textContent=cfg.url&&cfg.key?"已保存 Project URL + Publishable key":"未配置";configState.classList.toggle("ok",!!(cfg.url&&cfg.key));
  renderAccount();
  localSaveText.textContent=SM.dirty?"已保存本机 · 等待云端":"已保存";
  cloudRowText.textContent=cloudRowExists===null?"未检查":cloudRowExists?"已存在":"不存在";
  lastSyncText.textContent=fmtTime(SM.lastSyncAt);
  conflictBox.classList.toggle("hidden",!SM.conflict);
}

const pageMeta={
  today:["职业主线","今日","今天只决定下一步。"],inbox:["收集","Inbox","先收，再判断。"],
  standup:["职业主线","脱口秀","写、练、投稿、上台、复盘。"],media:["公开表达","自媒体","先练被看见。"],
  film:["长期能力","影视训练","输入尽量转成小输出。"],review:["每周一次","周复盘","只保留影响下一周行动的信息。"],
  sync:["跨设备","同步与账号","MacBook 和 iPhone 使用同一份数据。"]
};
function showView(v){
  S.meta.view=v;document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+v));document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  [pageEyebrow.textContent,pageTitle.textContent,pageDesc.textContent]=pageMeta[v];persistLocal(false);
  if(v==="sync")renderSyncUI();
}
function bind(id,path,check=false){
  const el=document.getElementById(id),ks=path.split(".");let cur=S;ks.slice(0,-1).forEach(k=>cur=cur[k]);const key=ks.at(-1);
  check?el.checked=!!cur[key]:el.value=cur[key]??"";
  el.addEventListener(check?"change":"input",()=>{cur[key]=check?el.checked:el.value;persistLocal(true)})
}
function renderEnergy(){document.querySelectorAll("[data-energy]").forEach(b=>b.classList.toggle("active",b.dataset.energy===S.today.energy))}
function renderInbox(){
  inboxCount.textContent=S.inbox.length;const f=S.meta.inboxFilter;document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b.dataset.filter===f));
  const a=S.inbox.filter(x=>f==="all"||x.type===f);
  inboxList.innerHTML=a.length?a.map(x=>`<div class="row"><div><strong>${esc(x.text)}</strong><small><span class="tag">${({idea:"想法",bit:"段子",video:"视频",film:"影视"})[x.type]||"想法"}</span>${fmtTime(x.createdAt)}</small></div><div class="actions"><button data-del="${x.id}">删除</button></div></div>`).join(""):`<div class="empty">还没有内容。</div>`;
  inboxList.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{S.inbox=S.inbox.filter(x=>x.id!==b.dataset.del);persistLocal(true);renderInbox()})
}
const statuses=["素材","初稿","待练","待测试","修改中","暂存"];
function renderBits(){
  kanban.innerHTML=statuses.map(s=>{const a=S.standup.bits.filter(x=>x.status===s);return `<div class="col"><div class="col-head"><span>${s}</span><b>${a.length}</b></div>${a.map(x=>`<div class="bit" data-bit="${x.id}"><strong>${esc(x.title||"未命名")}</strong><p>${esc((x.premise||"").slice(0,100))}</p>${x.next?`<p style="color:#aaa0ee">下一步：${esc(x.next)}</p>`:""}<select data-status="${x.id}">${statuses.map(y=>`<option ${y===x.status?"selected":""}>${y}</option>`).join("")}</select></div>`).join("")}</div>`}).join("");
  kanban.querySelectorAll("[data-bit]").forEach(c=>c.ondblclick=e=>{if(e.target.tagName!=="SELECT")openModal("bit",{id:c.dataset.bit})});
  kanban.querySelectorAll("[data-status]").forEach(sel=>sel.onchange=()=>{S.standup.bits.find(x=>x.id===sel.dataset.status).status=sel.value;persistLocal(true);renderBits()})
}
function renderOpenmics(){
  openmicList.innerHTML=S.standup.openmics.length?S.standup.openmics.map(x=>`<div class="row"><div><strong>${esc(x.name)}</strong><small><span class="tag">${esc(x.status)}</span>${esc(x.date||"")} ${x.how?"· "+esc(x.how):""}</small></div><div class="actions"><button data-next="${x.id}">状态</button><button data-omdel="${x.id}">删除</button></div></div>`).join(""):`<div class="empty">还没有开放麦。</div>`;
  const order=["待确认","待投","已投","已通过","未通过","已登台"];
  openmicList.querySelectorAll("[data-next]").forEach(b=>b.onclick=()=>{const x=S.standup.openmics.find(y=>y.id===b.dataset.next);x.status=order[(order.indexOf(x.status)+1)%order.length];persistLocal(true);renderOpenmics()});
  openmicList.querySelectorAll("[data-omdel]").forEach(b=>b.onclick=()=>{S.standup.openmics=S.standup.openmics.filter(x=>x.id!==b.dataset.omdel);persistLocal(true);renderOpenmics()})
}
function renderPractice(){practiceList.innerHTML=S.standup.practice.length?S.standup.practice.map(x=>`<div class="row"><div><strong>${esc(x.what||"练稿")}</strong><small>${fmtTime(x.createdAt)} · 问题：${esc(x.problem||"未记")} · 下次：${esc(x.next||"未记")}</small></div></div>`).join(""):`<div class="empty">还没有练稿记录。</div>`}
function renderMedia(){
  exposureList.innerHTML=S.media.exposures.length?S.media.exposures.map(x=>`<div class="row"><div><strong>${esc(x.what||"表达训练")}</strong><small><span class="tag">等级 ${x.level}</span>${fmtTime(x.createdAt)} ${x.feeling?"· "+esc(x.feeling):""}</small></div></div>`).join(""):`<div class="empty">还没有表达记录。</div>`;
  topicList.innerHTML=S.media.topics.length?S.media.topics.map(x=>`<div class="row"><div><strong>${esc(x.text||"未命名选题")}</strong><small><span class="tag">${esc(x.format||"口播")}</span>${esc(x.line||"")}</small></div></div>`).join(""):`<div class="empty">选题池还是空的。</div>`
}
function renderFilm(){filmList.innerHTML=S.film.sessions.length?S.film.sessions.map(x=>`<div class="row"><div><strong>${esc(x.work||"影视训练")}</strong><small>${fmtTime(x.createdAt)} · 输出：${esc(x.output||"未记录")}</small></div></div>`).join(""):`<div class="empty">还没有影视训练。</div>`}
function renderMetrics(){const m={write:S.standup.bits.filter(x=>["初稿","待练","待测试","修改中"].includes(x.status)).length,practice:S.standup.practice.filter(x=>thisWeek(x.createdAt)).length,stage:S.standup.openmics.filter(x=>["已投","已通过","已登台"].includes(x.status)).length,pub:S.media.exposures.filter(x=>thisWeek(x.createdAt)&&x.level>=3).length,film:S.film.sessions.filter(x=>thisWeek(x.createdAt)).length};mWrite.textContent=m.write;mPractice.textContent=m.practice;mStage.textContent=m.stage;mPublic.textContent=m.pub;mFilm.textContent=m.film}
function showTab(t){S.meta.standupTab=t;document.querySelectorAll("#standupTabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));document.querySelectorAll("#view-standup .subview").forEach(v=>v.classList.toggle("active",v.id==="standup-"+t));addBitBtn.style.display=t==="bits"?"inline-flex":"none";persistLocal(false)}
function openModal(mode,p={}){
  modalWrap.classList.remove("hidden");
  if(mode==="capture"){
    modalTitle.textContent="先记录，不整理";modalBody.innerHTML=`<div class="modal-form"><div class="type-row">${[["idea","想法"],["bit","段子"],["video","视频"],["film","影视"]].map(([k,v],i)=>`<button data-type="${k}" class="${i?"":"active"}">${v}</button>`).join("")}</div><textarea id="capText" rows="6" placeholder="一句话也可以。"></textarea><div class="button-row"><button class="primary-btn" id="capSave">保存到 Inbox</button></div></div>`;let type="idea";modalBody.querySelectorAll("[data-type]").forEach(b=>b.onclick=()=>{type=b.dataset.type;modalBody.querySelectorAll("[data-type]").forEach(x=>x.classList.toggle("active",x===b))});capSave.onclick=()=>{if(!capText.value.trim())return;S.inbox.unshift({id:crypto.randomUUID(),text:capText.value.trim(),type,createdAt:nowIso()});persistLocal(true);renderInbox();closeModalFn()};setTimeout(()=>capText.focus(),30)
  }
  if(mode==="bit"){
    const x=p.id?S.standup.bits.find(y=>y.id===p.id):{title:"",premise:"",status:"素材",next:""};modalTitle.textContent=p.id?"编辑段子":"新增段子";modalBody.innerHTML=`<div class="modal-form"><input id="bTitle" value="${attr(x.title)}" placeholder="一句话标题"><textarea id="bPremise" rows="5" placeholder="Premise / 当前版本">${esc(x.premise)}</textarea><select id="bStatus">${statuses.map(s=>`<option ${s===x.status?"selected":""}>${s}</option>`).join("")}</select><input id="bNext" value="${attr(x.next)}" placeholder="下一次只改什么"><div class="button-row">${p.id?'<button class="secondary-btn" id="bDelete">删除</button>':""}<button class="primary-btn" id="bSave">保存</button></div></div>`;bSave.onclick=()=>{if(p.id)Object.assign(x,{title:bTitle.value||"未命名段子",premise:bPremise.value,status:bStatus.value,next:bNext.value});else S.standup.bits.unshift({id:crypto.randomUUID(),title:bTitle.value||"未命名段子",premise:bPremise.value,status:bStatus.value,next:bNext.value,createdAt:nowIso()});persistLocal(true);renderBits();closeModalFn()};if(p.id)bDelete.onclick=()=>{S.standup.bits=S.standup.bits.filter(y=>y.id!==p.id);persistLocal(true);renderBits();closeModalFn()}
  }
  if(mode==="openmic"){modalTitle.textContent="新增开放麦";modalBody.innerHTML=`<div class="modal-form"><input id="omName" placeholder="场次 / 主办方"><input id="omDate" type="date"><input id="omHow" placeholder="投稿方式"><select id="omStatus"><option>待确认</option><option>待投</option><option>已投</option><option>已通过</option></select><button class="primary-btn" id="omSave">保存</button></div>`;omSave.onclick=()=>{S.standup.openmics.unshift({id:crypto.randomUUID(),name:omName.value||"未命名开放麦",date:omDate.value,how:omHow.value,status:omStatus.value,createdAt:nowIso()});persistLocal(true);renderOpenmics();closeModalFn()}}
  if(mode==="topic"){modalTitle.textContent="新增选题";modalBody.innerHTML=`<div class="modal-form"><textarea id="tText" rows="5" placeholder="我真正想说什么？"></textarea><input id="tLine" placeholder="最想让观众记住的一句"><select id="tFormat"><option>口播</option><option>段子</option><option>短剧情</option><option>其他</option></select><button class="primary-btn" id="tSave">保存</button></div>`;tSave.onclick=()=>{S.media.topics.unshift({id:crypto.randomUUID(),text:tText.value,line:tLine.value,format:tFormat.value,createdAt:nowIso()});persistLocal(true);renderMedia();closeModalFn()}}
  if(mode==="exposure"){modalTitle.textContent="记录一次公开表达";modalBody.innerHTML=`<div class="modal-form"><input id="eWhat" placeholder="讲了什么"><select id="eLevel"><option value="1">等级 1 · 只录 30 秒</option><option value="2">等级 2 · 录完整版本</option><option value="3">等级 3 · 发给一个人</option><option value="4">等级 4 · 公开发布</option><option value="5">等级 5 · 稳定栏目</option></select><input id="eFeel" placeholder="之后最真实的感受"><button class="primary-btn" id="eSave">保存</button></div>`;eSave.onclick=()=>{S.media.exposures.unshift({id:crypto.randomUUID(),what:eWhat.value,level:Number(eLevel.value),feeling:eFeel.value,createdAt:nowIso()});persistLocal(true);renderMedia();closeModalFn()}}
}
function closeModalFn(){modalWrap.classList.add("hidden")}
function toast(t){const e=document.getElementById("toast");e.textContent=t;e.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>e.classList.remove("show"),900)}
function exportData(){const blob=new Blob([JSON.stringify(S,null,2)],{type:"application/json"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=`天蓬-VitoShawn-工作台-${localDay()}.json`;a.click();URL.revokeObjectURL(u)}
async function importData(file){try{S=merge(defaults,normalizeLegacy(JSON.parse(await file.text())));persistLocal(true);hydrateAll();toast("已导入")}catch{showError("导入失败：不是有效的工作台 JSON。")}}

function hydrateAll(){
  dayRollover();
  [["mainTask","today.mainTask"],["mainMin","today.mainMin"],["assistTask","today.assistTask"],["assistMin","today.assistMin"],["lowTask","today.lowTask"],["lowMin","today.lowMin"],["minimum","today.minimum"],["deadline","today.deadline"],["todayNotes","today.notes"],["dayPush","today.dayPush"],["dayBlock","today.dayBlock"],["dayNext","today.dayNext"],["openmicReview","standup.openmicReview"],["reviewCloser","review.closer"],["reviewBlock","review.block"],["reviewPriorities","review.priorities"],["reviewMinimum","review.minimum"]].forEach(([id,path])=>{const ks=path.split(".");let cur=S;ks.slice(0,-1).forEach(k=>cur=cur[k]);document.getElementById(id).value=cur[ks.at(-1)]??""});
  mainDone.checked=!!S.today.mainDone;assistDone.checked=!!S.today.assistDone;lowDone.checked=!!S.today.lowDone;
  renderEnergy();renderInbox();renderBits();renderOpenmics();renderPractice();renderMedia();renderFilm();renderMetrics();renderSyncUI()
}
function init(){
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
  document.querySelectorAll("[data-action=capture]").forEach(b=>b.onclick=()=>openModal("capture"));
  document.querySelectorAll("[data-energy]").forEach(b=>b.onclick=()=>{S.today.energy=b.dataset.energy;renderEnergy();persistLocal(true)});
  document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{S.meta.inboxFilter=b.dataset.filter;persistLocal(false);renderInbox()});
  document.querySelectorAll("#standupTabs button").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  addBitBtn.onclick=()=>openModal("bit");addOpenmicBtn.onclick=()=>openModal("openmic");addTopicBtn.onclick=()=>openModal("topic");addExposureBtn.onclick=()=>openModal("exposure");
  savePracticeBtn.onclick=()=>{if(!practiceWhat.value.trim()&&!practiceProblem.value.trim())return;S.standup.practice.unshift({id:crypto.randomUUID(),what:practiceWhat.value,focus:practiceFocus.value,problem:practiceProblem.value,next:practiceNext.value,createdAt:nowIso()});practiceWhat.value=practiceFocus.value=practiceProblem.value=practiceNext.value="";persistLocal(true);renderPractice()};
  saveFilmBtn.onclick=()=>{if(!filmWork.value.trim()&&!filmOutput.value.trim())return;S.film.sessions.unshift({id:crypto.randomUUID(),work:filmWork.value,why:filmWhy.value,shots:filmShots.value,output:filmOutput.value,createdAt:nowIso()});filmWork.value=filmWhy.value=filmShots.value=filmOutput.value="";persistLocal(true);renderFilm()};
  [["mainTask","today.mainTask"],["mainMin","today.mainMin"],["assistTask","today.assistTask"],["assistMin","today.assistMin"],["lowTask","today.lowTask"],["lowMin","today.lowMin"],["minimum","today.minimum"],["deadline","today.deadline"],["todayNotes","today.notes"],["dayPush","today.dayPush"],["dayBlock","today.dayBlock"],["dayNext","today.dayNext"],["openmicReview","standup.openmicReview"],["reviewCloser","review.closer"],["reviewBlock","review.block"],["reviewPriorities","review.priorities"],["reviewMinimum","review.minimum"]].forEach(([id,path])=>bind(id,path));
  bind("mainDone","today.mainDone",true);bind("assistDone","today.assistDone",true);bind("lowDone","today.lowDone",true);
  saveConfigBtn.onclick=saveConfig;signupBtn.onclick=signup;loginBtn.onclick=login;logoutBtn.onclick=logout;syncNowBtn.onclick=()=>pushNow(false);pullBtn.onclick=()=>pullNow(false);useCloudBtn.onclick=useCloud;keepLocalBtn.onclick=keepLocal;
  exportBtn.onclick=exportData;importFile.onchange=e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value=""};
  closeModal.onclick=closeModalFn;modalWrap.onclick=e=>{if(e.target===modalWrap)closeModalFn()};
  document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openModal("capture")}if(e.key==="Escape")closeModalFn()});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")backgroundPull()});
  window.addEventListener("focus",backgroundPull);window.addEventListener("online",()=>{if(user){if(SM.dirty)schedulePush();else backgroundPull()}});
  hydrateAll();showTab(S.meta.standupTab||"bits");
  const q=new URLSearchParams(location.search);showView(q.get("view")&&pageMeta[q.get("view")]?q.get("view"):S.meta.view||"today");if(q.get("action")==="capture")setTimeout(()=>openModal("capture"),100);
  const cfg=getConfig();supabaseUrl.value=cfg.url||"";supabaseKey.value=cfg.key||"";
  initCloud(false);
  clearInterval(pollTimer);pollTimer=setInterval(backgroundPull,15000);
  if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost")){
    navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).then(r=>r.update()).catch(console.warn)
  }
}
document.addEventListener("DOMContentLoaded",init);
