const KEY="tianpeng_vitoshawn_workbench_v4";
const V3="tianpeng_vitoshawn_workbench_v3";
const V2="comedy_workbench_product_v2";
const CLOUD_CONFIG_KEY="tianpeng_vitoshawn_v4_cloud_config";
const defaults={
 meta:{view:"today",inboxFilter:"all",standupTab:"bits",localUpdatedAt:"",cloudUpdatedAt:""},
 today:{date:"",energy:"中",mainTask:"",mainMin:"",mainDone:false,assistTask:"",assistMin:"",assistDone:false,lowTask:"",lowMin:"",lowDone:false,minimum:"",deadline:"",notes:"",dayPush:"",dayBlock:"",dayNext:""},
 history:{},
 inbox:[],
 standup:{bits:[],openmics:[],practice:[],openmicReview:""},
 media:{exposures:[],topics:[]},
 film:{sessions:[]},
 review:{closer:"",block:"",priorities:"",minimum:""}
};
let S=load();

function clone(x){return JSON.parse(JSON.stringify(x))}
function merge(a,b){
 if(Array.isArray(a)) return Array.isArray(b)?b:clone(a);
 if(a&&typeof a==="object"){let o={};Object.keys(a).forEach(k=>o[k]=merge(a[k],b?.[k]));if(b&&typeof b==="object")Object.keys(b).forEach(k=>{if(!(k in o))o[k]=b[k]});return o}
 return b===undefined?a:b;
}
function load(){
 try{
  const x=localStorage.getItem(KEY); if(x)return merge(defaults,JSON.parse(x));
  const v3raw=localStorage.getItem(V3); if(v3raw){
   const m=merge(defaults,JSON.parse(v3raw));
   localStorage.setItem(KEY,JSON.stringify(m));
   return m;
  }
  const old=localStorage.getItem(V2); if(old){
   const v=JSON.parse(old),m=clone(defaults);
   if(v.today)Object.assign(m.today,v.today);
   m.inbox=(v.inbox||[]).map(x=>({...x,id:x.id||crypto.randomUUID()}));
   if(v.standup){m.standup.bits=v.standup.bits||[];m.standup.openmics=v.standup.openmics||[];m.standup.practice=v.standup.practiceLogs||[];m.standup.openmicReview=v.standup.openmicReview||""}
   if(v.media){m.media.exposures=v.media.exposures||[];m.media.topics=v.media.topics||[]}
   if(v.film)m.film.sessions=v.film.sessions||[];
   if(v.review)Object.assign(m.review,v.review);
   localStorage.setItem(KEY,JSON.stringify(m)); return m;
  }
 }catch(e){console.warn(e)}
 return clone(defaults);
}
let cloudClient=null, cloudSession=null, cloudChannel=null, cloudPushTimer=null;
let applyingRemote=false, cloudDirty=false, cloudBusy=false;

function save(t=false){
 if(!applyingRemote){
   S.meta.localUpdatedAt=new Date().toISOString();
   cloudDirty=true;
 }
 localStorage.setItem(KEY,JSON.stringify(S));
 renderCounts();renderMetrics();
 if(t)toast("已保存");
 if(!applyingRemote) scheduleCloudPush();
}
function toast(t){const e=document.getElementById("toast");e.textContent=t;e.classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>e.classList.remove("show"),850)}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function attr(s){return esc(s).replace(/'/g,"&#39;")}
function isoDay(d=new Date()){return d.toISOString().slice(0,10)}
function localDay(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`}
function dt(x){try{return new Date(x).toLocaleDateString("zh-CN",{month:"short",day:"numeric"})}catch{return""}}
function thisWeek(x){if(!x)return false;const d=new Date(x),n=new Date(),w=(n.getDay()+6)%7,s=new Date(n);s.setHours(0,0,0,0);s.setDate(n.getDate()-w);const e=new Date(s);e.setDate(s.getDate()+7);return d>=s&&d<e}

function dayRollover(){
 const today=localDay();
 if(!S.today.date){S.today.date=today;save();return}
 if(S.today.date===today)return;
 S.history[S.today.date]=clone(S.today);
 const carry=S.today.dayNext||"";
 S.today={...clone(defaults.today),date:today,energy:S.today.energy||"中",mainTask:carry,mainMin:carry?"先打开相关材料，做 10 分钟":""};
 save();
}

const meta={
 today:["职业主线","今日","今天只决定下一步。"],inbox:["收集","Inbox","先收，再判断。"],
 standup:["职业主线","脱口秀","写、练、投稿、上台、复盘。"],media:["公开表达","自媒体","先练被看见。"],
 film:["长期能力","影视训练","输入尽量转成小输出。"],review:["每周一次","周复盘","只保留影响下一周行动的信息。"],
 install:["个人 App","安装与数据","让工作台真正出现在 iPhone 和 MacBook 上。"]
};
function showView(v){
 S.meta.view=v;document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+v));
 document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
 [pageEyebrow.textContent,pageTitle.textContent,pageDesc.textContent]=meta[v];save();
}
function bind(id,path,check=false){
 const el=document.getElementById(id),ks=path.split(".");let cur=S;ks.slice(0,-1).forEach(k=>cur=cur[k]);const k=ks.at(-1);
 check?el.checked=!!cur[k]:el.value=cur[k]??"";
 el.addEventListener(check?"change":"input",()=>{cur[k]=check?el.checked:el.value;save()});
}
function renderEnergy(){document.querySelectorAll("[data-energy]").forEach(b=>b.classList.toggle("active",b.dataset.energy===S.today.energy))}
function renderWeek(){
 const now=new Date(),w=(now.getDay()+6)%7,start=new Date(now);start.setHours(12,0,0,0);start.setDate(now.getDate()-w);
 const days=["一","二","三","四","五","六","日"];
 weekStrip.innerHTML=days.map((name,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);const key=localDay(d),rec=key===S.today.date?S.today:S.history[key];const done=rec&&(rec.mainDone||rec.assistDone||rec.lowDone);return `<div class="day-chip ${key===localDay()?"today":""} ${done?"done":""}"><b>周${name}</b><span>${d.getMonth()+1}/${d.getDate()}</span></div>`}).join("");
}
function renderCounts(){navInboxCount.textContent=S.inbox.length;bitsActive.textContent=S.standup.bits.filter(x=>x.status!=="暂存").length;bitsPractice.textContent=S.standup.bits.filter(x=>x.status==="待练").length;bitsTest.textContent=S.standup.bits.filter(x=>x.status==="待测试").length;openmicCount.textContent=S.standup.openmics.filter(x=>x.status!=="未通过").length}
function renderInbox(){
 const f=S.meta.inboxFilter;document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b.dataset.filter===f));
 const a=S.inbox.filter(x=>f==="all"||x.type===f);inboxList.innerHTML=a.length?a.map(x=>`<div class="row"><div><strong>${esc(x.text)}</strong><small><span class="tag">${({idea:"想法",bit:"段子",video:"视频",film:"影视"})[x.type]||"想法"}</span>${dt(x.createdAt)}</small></div><div class="actions"><button data-del="${x.id}">删除</button></div></div>`).join(""):`<div class="empty">还没有内容。</div>`;
 inboxList.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{S.inbox=S.inbox.filter(x=>x.id!==b.dataset.del);save(true);renderInbox()})
}
const statuses=["素材","初稿","待练","待测试","修改中","暂存"];
function renderBits(){
 kanban.innerHTML=statuses.map(s=>{const a=S.standup.bits.filter(x=>x.status===s);return `<div class="col"><div class="col-head"><span>${s}</span><b>${a.length}</b></div>${a.map(x=>`<div class="bit" data-bit="${x.id}"><strong>${esc(x.title||"未命名")}</strong><p>${esc((x.premise||"").slice(0,100))}</p>${x.next?`<p style="color:#aaa0ee">下一步：${esc(x.next)}</p>`:""}<select data-status="${x.id}">${statuses.map(y=>`<option ${y===x.status?"selected":""}>${y}</option>`).join("")}</select></div>`).join("")}</div>`}).join("");
 kanban.querySelectorAll("[data-bit]").forEach(c=>c.ondblclick=e=>{if(e.target.tagName!=="SELECT")modal("bit",{id:c.dataset.bit})});
 kanban.querySelectorAll("[data-status]").forEach(s=>s.onchange=()=>{S.standup.bits.find(x=>x.id===s.dataset.status).status=s.value;save(true);renderBits()})
}
function renderOpenmics(){
 openmicList.innerHTML=S.standup.openmics.length?S.standup.openmics.map(x=>`<div class="row"><div><strong>${esc(x.name)}</strong><small><span class="tag">${esc(x.status)}</span>${esc(x.date||"")} ${x.how?"· "+esc(x.how):""}</small></div><div class="actions"><button data-next="${x.id}">状态</button><button data-omdel="${x.id}">删除</button></div></div>`).join(""):`<div class="empty">还没有开放麦。</div>`;
 const order=["待确认","待投","已投","已通过","未通过","已登台"];
 openmicList.querySelectorAll("[data-next]").forEach(b=>b.onclick=()=>{const x=S.standup.openmics.find(y=>y.id===b.dataset.next);x.status=order[(order.indexOf(x.status)+1)%order.length];save(true);renderOpenmics()});
 openmicList.querySelectorAll("[data-omdel]").forEach(b=>b.onclick=()=>{S.standup.openmics=S.standup.openmics.filter(x=>x.id!==b.dataset.omdel);save(true);renderOpenmics()})
}
function renderPractice(){practiceList.innerHTML=S.standup.practice.length?S.standup.practice.map(x=>`<div class="row"><div><strong>${esc(x.what||"练稿")}</strong><small>${dt(x.createdAt)} · 问题：${esc(x.problem||"未记")} · 下次：${esc(x.next||"未记")}</small></div></div>`).join(""):`<div class="empty">还没有练稿记录。</div>`}
function renderMedia(){
 exposureList.innerHTML=S.media.exposures.length?S.media.exposures.slice(0,8).map(x=>`<div class="row"><div><strong>${esc(x.what||"表达训练")}</strong><small><span class="tag">等级 ${x.level}</span>${dt(x.createdAt)} ${x.feeling?"· "+esc(x.feeling):""}</small></div></div>`).join(""):`<div class="empty">还没有表达记录。</div>`;
 topicList.innerHTML=S.media.topics.length?S.media.topics.map(x=>`<div class="row"><div><strong>${esc(x.text||"未命名选题")}</strong><small><span class="tag">${esc(x.format||"口播")}</span>${esc(x.line||"")}</small></div></div>`).join(""):`<div class="empty">选题池还是空的。</div>`
}
function renderFilm(){filmList.innerHTML=S.film.sessions.length?S.film.sessions.map(x=>`<div class="row"><div><strong>${esc(x.work||"影视训练")}</strong><small>${dt(x.createdAt)} · 输出：${esc(x.output||"未记录")}</small></div></div>`).join(""):`<div class="empty">还没有影视训练。</div>`}
function metrics(){return{write:S.standup.bits.filter(x=>["初稿","待练","待测试","修改中"].includes(x.status)).length,practice:S.standup.practice.filter(x=>thisWeek(x.createdAt)).length,stage:S.standup.openmics.filter(x=>["已投","已通过","已登台"].includes(x.status)).length,pub:S.media.exposures.filter(x=>thisWeek(x.createdAt)&&x.level>=3).length,film:S.film.sessions.filter(x=>thisWeek(x.createdAt)).length}}
function renderMetrics(){const m=metrics();mWrite.textContent=m.write;mPractice.textContent=m.practice;mStage.textContent=m.stage;mPublic.textContent=m.pub;mFilm.textContent=m.film}
function showTab(t){S.meta.standupTab=t;document.querySelectorAll("#standupTabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));document.querySelectorAll("#view-standup .subview").forEach(v=>v.classList.toggle("active",v.id==="standup-"+t));standupAddBtn.style.display=t==="bits"?"inline-flex":"none";save()}

function modal(mode,p={}){
 modalWrap.classList.remove("hidden");modalBody.innerHTML="";
 if(mode==="capture"){
  modalTitle.textContent="先记录，不整理";modalBody.innerHTML=`<div class="modal-form"><div class="type-row">${[["idea","想法"],["bit","段子"],["video","视频"],["film","影视"]].map(([k,v],i)=>`<button data-type="${k}" class="${i?"":"active"}">${v}</button>`).join("")}</div><textarea id="capText" rows="6" placeholder="一句话也可以。"></textarea><div class="modal-actions"><button class="primary-btn" id="capSave">保存到 Inbox</button></div></div>`;let type="idea";modalBody.querySelectorAll("[data-type]").forEach(b=>b.onclick=()=>{type=b.dataset.type;modalBody.querySelectorAll("[data-type]").forEach(x=>x.classList.toggle("active",x===b))});capSave.onclick=()=>{if(!capText.value.trim())return;S.inbox.unshift({id:crypto.randomUUID(),text:capText.value.trim(),type,createdAt:new Date().toISOString()});save(true);renderInbox();close();};setTimeout(()=>capText.focus(),50)
 }
 if(mode==="bit"){
  const x=p.id?S.standup.bits.find(y=>y.id===p.id):{title:"",premise:"",status:"素材",next:""};modalTitle.textContent=p.id?"编辑段子":"新增段子";modalBody.innerHTML=`<div class="modal-form"><input id="bTitle" value="${attr(x.title)}" placeholder="一句话标题"><textarea id="bPremise" rows="5" placeholder="Premise / 当前版本">${esc(x.premise)}</textarea><select id="bStatus">${statuses.map(s=>`<option ${s===x.status?"selected":""}>${s}</option>`).join("")}</select><input id="bNext" value="${attr(x.next)}" placeholder="下一次只改什么"><div class="modal-actions">${p.id?'<button class="secondary-btn" id="bDelete">删除</button>':""}<button class="primary-btn" id="bSave">保存</button></div></div>`;bSave.onclick=()=>{if(p.id)Object.assign(x,{title:bTitle.value||"未命名段子",premise:bPremise.value,status:bStatus.value,next:bNext.value});else S.standup.bits.unshift({id:crypto.randomUUID(),title:bTitle.value||"未命名段子",premise:bPremise.value,status:bStatus.value,next:bNext.value,createdAt:new Date().toISOString()});save(true);renderBits();close()};if(p.id)bDelete.onclick=()=>{S.standup.bits=S.standup.bits.filter(y=>y.id!==p.id);save(true);renderBits();close()}
 }
 if(mode==="openmic"){modalTitle.textContent="新增开放麦";modalBody.innerHTML=`<div class="modal-form"><input id="omName" placeholder="场次 / 主办方"><input id="omDate" type="date"><input id="omHow" placeholder="投稿方式 / 联系人"><select id="omStatus">${["待确认","待投","已投","已通过"].map(s=>`<option>${s}</option>`).join("")}</select><div class="modal-actions"><button class="primary-btn" id="omSave">保存</button></div></div>`;omSave.onclick=()=>{S.standup.openmics.unshift({id:crypto.randomUUID(),name:omName.value||"未命名开放麦",date:omDate.value,how:omHow.value,status:omStatus.value,createdAt:new Date().toISOString()});save(true);renderOpenmics();close()}}
 if(mode==="topic"){modalTitle.textContent="新增选题";modalBody.innerHTML=`<div class="modal-form"><textarea id="tText" rows="5" placeholder="我真正想说什么？"></textarea><input id="tLine" placeholder="最想让观众记住的一句"><select id="tFormat"><option>口播</option><option>段子</option><option>短剧情</option><option>其他</option></select><div class="modal-actions"><button class="primary-btn" id="tSave">保存</button></div></div>`;tSave.onclick=()=>{S.media.topics.unshift({id:crypto.randomUUID(),text:tText.value,line:tLine.value,format:tFormat.value,createdAt:new Date().toISOString()});save(true);renderMedia();close()}}
 if(mode==="exposure"){modalTitle.textContent="记录一次公开表达";modalBody.innerHTML=`<div class="modal-form"><input id="eWhat" placeholder="讲了什么"><select id="eLevel"><option value="1">等级 1 · 只录 30 秒</option><option value="2">等级 2 · 录完整版本</option><option value="3">等级 3 · 发给一个人</option><option value="4">等级 4 · 公开发布</option><option value="5">等级 5 · 稳定栏目</option></select><input id="eFeel" placeholder="之后最真实的感受"><div class="modal-actions"><button class="primary-btn" id="eSave">保存</button></div></div>`;eSave.onclick=()=>{S.media.exposures.unshift({id:crypto.randomUUID(),what:eWhat.value,level:Number(eLevel.value),feeling:eFeel.value,createdAt:new Date().toISOString()});save(true);renderMedia();close()}}
}

function openMoreMenu(){
  modalWrap.classList.remove("hidden");
  modalTitle.textContent="更多";
  modalBody.innerHTML=`
    <div class="mobile-more-grid">
      <button data-more-view="media">
        <strong>自媒体</strong>
        <span>公开表达与选题</span>
      </button>
      <button data-more-view="film">
        <strong>影视训练</strong>
        <span>拉片与编剧练习</span>
      </button>
      <button data-more-view="review">
        <strong>周复盘</strong>
        <span>看本周推进</span>
      </button>
      <button data-more-view="install" class="cloud-entry">
        <strong>安装与数据</strong>
        <span>云同步、登录、备份</span>
      </button>
    </div>`;
  modalBody.querySelectorAll("[data-more-view]").forEach(btn=>{
    btn.onclick=()=>{
      close();
      showView(btn.dataset.moreView);
    };
  });
}

function renderMobileCloudBanner(){
  if(typeof mobileCloudBanner==="undefined"||!mobileCloudBanner)return;
  const cfg=getCloudConfig();
  const needsConfig=!(cfg.url&&cfg.key&&cloudSession?.user);
  mobileCloudBanner.classList.toggle("show",needsConfig);
}

function close(){modalWrap.classList.add("hidden")}


function getCloudConfig(){
  try{return JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY)||"{}")}catch{return{}}
}
function setSyncUI(kind,text){
  if(typeof syncPill!=="undefined"&&syncPill){
    syncPill.className="sync-pill "+kind;
    syncPill.textContent=text;
  }
  if(typeof syncStateText!=="undefined"&&syncStateText) syncStateText.textContent=text;
}
function formatSyncTime(v){
  if(!v)return "—";
  try{return new Date(v).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return "—"}
}
function renderCloudUI(){
  const cfg=getCloudConfig();
  if(typeof supabaseUrl!=="undefined"&&supabaseUrl) supabaseUrl.value=cfg.url||"";
  if(typeof supabaseKey!=="undefined"&&supabaseKey) supabaseKey.value=cfg.key||"";
  if(typeof configState!=="undefined"&&configState){
    configState.textContent=cfg.url&&cfg.key?"已保存 Project URL + Publishable key":"尚未配置";
    configState.classList.toggle("ok",!!(cfg.url&&cfg.key));
  }
  if(typeof accountState!=="undefined"&&accountState){
    if(cloudSession?.user){
      accountState.textContent="已登录："+cloudSession.user.email;
      accountState.classList.add("ok");
    }else{
      accountState.textContent="未登录";
      accountState.classList.remove("ok");
    }
  }
  if(typeof lastSyncText!=="undefined"&&lastSyncText) lastSyncText.textContent=formatSyncTime(S.meta.cloudUpdatedAt);
  if(typeof localStateText!=="undefined"&&localStateText) localStateText.textContent=cloudDirty?"等待上传":"已保存";
  renderMobileCloudBanner();
}
async function initCloud(){
  renderCloudUI();
  const cfg=getCloudConfig();
  if(!cfg.url||!cfg.key){setSyncUI("offline","云同步未配置");return}
  if(!window.supabase?.createClient){setSyncUI("error","同步 SDK 未加载");return}
  try{
    cloudClient=window.supabase.createClient(cfg.url,cfg.key,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    const {data:{session},error}=await cloudClient.auth.getSession();
    if(error)throw error;
    cloudSession=session;
    cloudClient.auth.onAuthStateChange(async (_event,session)=>{
      cloudSession=session;
      renderCloudUI();
      if(session){
        setSyncUI("syncing","正在连接云端");
        await initialCloudSync();
        subscribeCloud();
      }else{
        setSyncUI("offline","未登录");
        if(cloudChannel){cloudClient.removeChannel(cloudChannel);cloudChannel=null}
      }
    });
    if(session){
      setSyncUI("syncing","正在同步");
      await initialCloudSync();
      subscribeCloud();
    }else setSyncUI("offline","未登录");
    renderCloudUI();
  }catch(err){
    console.error("initCloud",err);
    setSyncUI("error","云同步配置有误");
  }
}
function hasMeaningfulLocalData(){
  return !!(
    S.today.mainTask||S.today.assistTask||S.today.lowTask||S.today.notes||
    S.inbox.length||S.standup.bits.length||S.standup.openmics.length||
    S.standup.practice.length||S.media.exposures.length||S.media.topics.length||
    S.film.sessions.length
  );
}
async function fetchCloudRow(){
  if(!cloudClient||!cloudSession?.user)return null;
  const {data,error}=await cloudClient
    .from("workbench_state")
    .select("state,updated_at")
    .eq("user_id",cloudSession.user.id)
    .maybeSingle();
  if(error)throw error;
  return data;
}
async function initialCloudSync(){
  if(!cloudClient||!cloudSession?.user)return;
  if(cloudBusy)return;
  cloudBusy=true;
  try{
    setSyncUI("syncing","正在同步");
    const row=await fetchCloudRow();
    if(!row){
      await pushCloud(true);
      return;
    }
    const neverSynced=!S.meta.cloudUpdatedAt;
    if(neverSynced && hasMeaningfulLocalData()){
      // First device with existing local V3/V4 data: make this the initial cloud copy.
      await pushCloud(true);
      return;
    }
    applyCloudState(row.state,row.updated_at);
    setSyncUI("synced","已同步");
  }catch(err){
    console.error("initialCloudSync",err);
    setSyncUI(navigator.onLine?"error":"offline",navigator.onLine?"同步失败":"离线");
  }finally{
    cloudBusy=false;
    renderCloudUI();
  }
}
function applyCloudState(remote,updatedAt){
  if(!remote)return;
  applyingRemote=true;
  const preservedView=S.meta.view;
  S=merge(defaults,remote);
  S.meta.view=preservedView||S.meta.view;
  S.meta.cloudUpdatedAt=updatedAt||S.meta.cloudUpdatedAt;
  S.meta.localUpdatedAt=updatedAt||S.meta.localUpdatedAt;
  cloudDirty=false;
  localStorage.setItem(KEY,JSON.stringify(S));
  applyingRemote=false;
  hydrate();
  renderCloudUI();
}
async function pushCloud(force=false){
  if(!cloudClient||!cloudSession?.user||(!force&&!cloudDirty)||cloudBusy)return;
  if(!navigator.onLine){setSyncUI("offline","离线 · 等待同步");return}
  cloudBusy=true;
  try{
    setSyncUI("syncing","正在同步");
    const payload=clone(S);
    const {data,error}=await cloudClient
      .from("workbench_state")
      .upsert({user_id:cloudSession.user.id,state:payload},{onConflict:"user_id"})
      .select("updated_at")
      .single();
    if(error)throw error;
    S.meta.cloudUpdatedAt=data.updated_at;
    S.meta.localUpdatedAt=data.updated_at;
    cloudDirty=false;
    applyingRemote=true;
    localStorage.setItem(KEY,JSON.stringify(S));
    applyingRemote=false;
    setSyncUI("synced","已同步");
    renderCloudUI();
  }catch(err){
    console.error("pushCloud",err);
    setSyncUI(navigator.onLine?"error":"offline",navigator.onLine?"同步失败":"离线 · 等待同步");
  }finally{
    cloudBusy=false;
  }
}
function scheduleCloudPush(){
  if(!cloudSession?.user)return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer=setTimeout(()=>pushCloud(false),900);
  renderCloudUI();
}
async function pullCloud(force=false){
  if(!cloudClient||!cloudSession?.user)return;
  if(cloudDirty&&!force){
    await pushCloud(false);
    if(cloudDirty)return;
  }
  try{
    setSyncUI("syncing","正在刷新");
    const row=await fetchCloudRow();
    if(row)applyCloudState(row.state,row.updated_at);
    setSyncUI("synced","已同步");
  }catch(err){
    console.error("pullCloud",err);
    setSyncUI(navigator.onLine?"error":"offline",navigator.onLine?"刷新失败":"离线");
  }
}
function subscribeCloud(){
  if(!cloudClient||!cloudSession?.user)return;
  if(cloudChannel) cloudClient.removeChannel(cloudChannel);
  cloudChannel=cloudClient
    .channel("workbench-sync-"+cloudSession.user.id)
    .on("postgres_changes",{
      event:"*",schema:"public",table:"workbench_state",
      filter:"user_id=eq."+cloudSession.user.id
    },payload=>{
      const row=payload.new;
      if(!row?.state)return;
      if(row.updated_at===S.meta.cloudUpdatedAt)return;
      if(cloudDirty){
        // If this device is actively editing, its pending local write will be the last write.
        scheduleCloudPush();
        return;
      }
      applyCloudState(row.state,row.updated_at);
      setSyncUI("synced","另一台设备已更新");
      toast("已收到另一台设备的更新");
    })
    .subscribe(status=>{
      if(status==="SUBSCRIBED"&&!cloudDirty)setSyncUI("synced","已同步");
    });
}
async function saveCloudConfiguration(){
  const url=(supabaseUrl.value||"").trim().replace(/\/+$/,"");
  const key=(supabaseKey.value||"").trim();
  if(!url||!key){alert("请填写 Supabase Project URL 和 Publishable key。");return}
  if(!key.startsWith("sb_publishable_") && !key.startsWith("ey")){
    if(!confirm("这个 key 看起来不像 Publishable / legacy anon key。绝对不要把 Secret 或 service_role key 放进前端。仍要保存吗？"))return;
  }
  localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify({url,key}));
  toast("云同步配置已保存");
  if(cloudClient?.auth) try{await cloudClient.auth.signOut()}catch{}
  cloudClient=null;cloudSession=null;
  await initCloud();
}
async function cloudSignup(){
  if(!cloudClient){alert("先保存 Supabase 配置。");return}
  const email=authEmail.value.trim(),password=authPassword.value;
  if(!email||password.length<6){alert("请输入邮箱；密码至少 6 位。");return}
  setSyncUI("syncing","正在注册");
  const {data,error}=await cloudClient.auth.signUp({email,password});
  if(error){setSyncUI("error","注册失败");alert(error.message);return}
  if(data.session){
    cloudSession=data.session;
    await initialCloudSync();
    subscribeCloud();
    renderCloudUI();
  }else{
    setSyncUI("offline","等待邮箱确认");
    alert("注册已提交。若 Supabase 开启邮箱确认，请先到邮箱点击确认链接，再回来登录。");
  }
}
async function cloudLogin(){
  if(!cloudClient){alert("先保存 Supabase 配置。");return}
  const email=authEmail.value.trim(),password=authPassword.value;
  if(!email||!password){alert("请输入邮箱和密码。");return}
  setSyncUI("syncing","正在登录");
  const {data,error}=await cloudClient.auth.signInWithPassword({email,password});
  if(error){setSyncUI("error","登录失败");alert(error.message);return}
  cloudSession=data.session;
  renderCloudUI();
  await initialCloudSync();
  subscribeCloud();
}
async function cloudLogout(){
  if(cloudClient)await cloudClient.auth.signOut();
  cloudSession=null;cloudDirty=false;renderCloudUI();setSyncUI("offline","未登录");
}

function exportData(){const blob=new Blob([JSON.stringify(S,null,2)],{type:"application/json"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=`天蓬-VitoShawn-工作台-${localDay()}.json`;a.click();URL.revokeObjectURL(u)}
async function importData(f){try{const x=JSON.parse(await f.text());S=merge(defaults,x);save(true);hydrate()}catch{alert("导入失败，请确认 JSON 文件来自本工作台。")}}

function hydrate(){
 dayRollover();renderEnergy();renderWeek();renderInbox();renderBits();renderOpenmics();renderPractice();renderMedia();renderFilm();renderCounts();renderMetrics();
 [["mainTask","today.mainTask"],["mainMin","today.mainMin"],["assistTask","today.assistTask"],["assistMin","today.assistMin"],["lowTask","today.lowTask"],["lowMin","today.lowMin"],["minimum","today.minimum"],["deadline","today.deadline"],["todayNotes","today.notes"],["dayPush","today.dayPush"],["dayBlock","today.dayBlock"],["dayNext","today.dayNext"],["openmicReview","standup.openmicReview"],["reviewCloser","review.closer"],["reviewBlock","review.block"],["reviewPriorities","review.priorities"],["reviewMinimum","review.minimum"]].forEach(([id,path])=>{let cur=S;const ks=path.split(".");ks.slice(0,-1).forEach(k=>cur=cur[k]);document.getElementById(id).value=cur[ks.at(-1)]??""});
 mainDone.checked=!!S.today.mainDone;assistDone.checked=!!S.today.assistDone;lowDone.checked=!!S.today.lowDone;
}

function init(){
 datePill.textContent=new Date().toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric",weekday:"short"});
 const standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;appMode.textContent=standalone?"App 模式":"浏览器模式";
 document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
 document.querySelectorAll("[data-action=capture]").forEach(b=>b.onclick=()=>modal("capture"));
 document.querySelectorAll("[data-action=more]").forEach(b=>b.onclick=openMoreMenu);
 document.querySelectorAll("[data-energy]").forEach(b=>b.onclick=()=>{S.today.energy=b.dataset.energy;renderEnergy();save(true)});
 document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{S.meta.inboxFilter=b.dataset.filter;save();renderInbox()});
 document.querySelectorAll("#standupTabs button").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
 standupAddBtn.onclick=()=>modal("bit");addOpenmic.onclick=()=>modal("openmic");addTopic.onclick=()=>modal("topic");addExposure.onclick=()=>modal("exposure");
 savePractice.onclick=()=>{if(!practiceWhat.value.trim()&&!practiceProblem.value.trim())return;S.standup.practice.unshift({id:crypto.randomUUID(),what:practiceWhat.value,focus:practiceFocus.value,problem:practiceProblem.value,next:practiceNext.value,createdAt:new Date().toISOString()});practiceWhat.value=practiceFocus.value=practiceProblem.value=practiceNext.value="";save(true);renderPractice()};
 saveFilm.onclick=()=>{if(!filmWork.value.trim()&&!filmOutput.value.trim())return;S.film.sessions.unshift({id:crypto.randomUUID(),work:filmWork.value,why:filmWhy.value,shots:filmShots.value,output:filmOutput.value,createdAt:new Date().toISOString()});filmWork.value=filmWhy.value=filmShots.value=filmOutput.value="";save(true);renderFilm()};
 [["mainTask","today.mainTask"],["mainMin","today.mainMin"],["assistTask","today.assistTask"],["assistMin","today.assistMin"],["lowTask","today.lowTask"],["lowMin","today.lowMin"],["minimum","today.minimum"],["deadline","today.deadline"],["todayNotes","today.notes"],["dayPush","today.dayPush"],["dayBlock","today.dayBlock"],["dayNext","today.dayNext"],["openmicReview","standup.openmicReview"],["reviewCloser","review.closer"],["reviewBlock","review.block"],["reviewPriorities","review.priorities"],["reviewMinimum","review.minimum"]].forEach(([id,path])=>bind(id,path));
 bind("mainDone","today.mainDone",true);bind("assistDone","today.assistDone",true);bind("lowDone","today.lowDone",true);
 exportBtn.onclick=exportData;importFile.onchange=e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value=""};
 closeModal.onclick=close;modalWrap.onclick=e=>{if(e.target===modalWrap)close()};
 document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();modal("capture")}if(e.key==="Escape")close()});


 if(typeof mobileCloudSetupBtn!=="undefined"&&mobileCloudSetupBtn){
   mobileCloudSetupBtn.onclick=()=>showView("install");
 }

 if(typeof saveCloudConfig!=="undefined") saveCloudConfig.onclick=saveCloudConfiguration;
 if(typeof signupBtn!=="undefined") signupBtn.onclick=cloudSignup;
 if(typeof loginBtn!=="undefined") loginBtn.onclick=cloudLogin;
 if(typeof logoutBtn!=="undefined") logoutBtn.onclick=cloudLogout;
 if(typeof syncNowBtn!=="undefined") syncNowBtn.onclick=()=>pushCloud(true);
 if(typeof pullCloudBtn!=="undefined") pullCloudBtn.onclick=()=>pullCloud(true);
 window.addEventListener("online",()=>{setSyncUI("syncing","网络已恢复");if(cloudSession?.user)pushCloud(false)});
 window.addEventListener("offline",()=>setSyncUI("offline","离线 · 本地保存"));
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&cloudSession?.user&&!cloudDirty)pullCloud(false)});
 window.addEventListener("focus",()=>{if(cloudSession?.user&&!cloudDirty)pullCloud(false)});

 hydrate();renderMobileCloudBanner();showTab(S.meta.standupTab||"bits");
 const q=new URLSearchParams(location.search);if(q.get("view")&&meta[q.get("view")])showView(q.get("view"));else showView(S.meta.view||"today");if(q.get("action")==="capture")setTimeout(()=>modal("capture"),150);
 if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost"))navigator.serviceWorker.register("./sw.js").catch(console.warn);
 renderCloudUI();
 setTimeout(()=>initCloud(),50);
 if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
}
document.addEventListener("DOMContentLoaded",init);
