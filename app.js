'use strict';
/* Landfill Waste Weighing v1.2.1 — role-based Firebase Auth, offline-first audited weighings. */
const VERSION = '1.2.1';
const DB_NAME = 'landfill-waste-weighing-v1';
const STORES = ['entries', 'trucks', 'drivers', 'outbox', 'requests'];
const state = {entries:[],trucks:[],drivers:[],outbox:[],requests:[],editId:null,tab:'overview',logPage:0,duplicateReview:null};
const cloud = {configured:false,ready:false,connecting:false,db:null,fs:null,auth:null,authFns:null,user:null,role:null,unsubs:[],membershipUnsub:null,busy:false,error:'',members:[],firebaseApp:null,appFns:null,userCreateBusy:false};
const ROLES = ['admin','viewer','encoder'];
const hasRole = (...roles) => !!cloud.user && roles.includes(cloud.role);
const isAdmin = () => hasRole('admin');
const canWrite = () => hasRole('admin','encoder');
const canCorrect = e => isAdmin() || (hasRole('encoder') && e.createdBy===cloud.user.uid);
const allowedStore = store => store==='entries' ? canWrite() : store==='requests' ? canWrite() : isAdmin();
function requireRole(...roles){ if(!hasRole(...roles)){toast('Your account cannot perform this action.',true);return false;}return true; }
const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('en-PH',{maximumFractionDigits:2}).format(Number(n)||0);
const kg = n => `${fmt(n)} kg`;
const escapeHTML = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => globalThis.crypto?.randomUUID?.() || ('id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const num = v => Number(v);
const isNum = v => typeof v==='number' && Number.isFinite(v);
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const validTime = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const byDateDesc = (a,b) => (b.date+'T'+b.time).localeCompare(a.date+'T'+a.time) || b.createdAt-a.createdAt || b.id.localeCompare(a.id);
function phNow(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};}
function shift(d,days){const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+days);return t.toISOString().slice(0,10);}
function weekStart(d){const dow=new Date(d+'T00:00:00Z').getUTCDay();return shift(d,-((dow+6)%7));}
function thisMonthEnd(){const first=phNow().date.slice(0,7)+'-01';return shift(shift(first,35).slice(0,7)+'-01',-1);}
function bounds(p){const today=phNow().date;if(p==='today')return [today,today];if(p==='week')return [weekStart(today),shift(weekStart(today),6)];if(p==='month')return [today.slice(0,7)+'-01',thisMonthEnd()];if(p==='custom')return [ $('dashFrom').value,$('dashTo').value];return ['', ''];}
function inRange(e,from,to){return (!from||e.date>=from)&&(!to||e.date<=to);}
function toast(message,isError=false){const el=$('toast');el.textContent=message;el.classList.toggle('error',!!isError);el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4300);}
function safeError(err){return (err&&err.message)||String(err);}
let database;
function openDatabase(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,2);req.onupgradeneeded=()=>{for(const name of STORES)if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbOp(store,mode,work){return new Promise((resolve,reject)=>{const tx=database.transaction(store,mode),object=tx.objectStore(store);let req,result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage transaction aborted'));try{req=work(object);}catch(e){tx.abort();reject(e);return;}if(req){req.onsuccess=()=>{result=req.result;};req.onerror=()=>reject(req.error);}});}
const localAll=store=>dbOp(store,'readonly',o=>o.getAll());
const localGet=(store,id)=>dbOp(store,'readonly',o=>o.get(id));
const localPut=(store,data)=>dbOp(store,'readwrite',o=>o.put(data));
const localDelete=(store,id)=>dbOp(store,'readwrite',o=>o.delete(id));
async function reload(){const [entries,trucks,drivers,outbox,requests]=await Promise.all(STORES.map(localAll));Object.assign(state,{entries,trucks,drivers,outbox,requests});renderAll();}
async function enqueue(store,record){const task={id:store+':'+record.id,store,recordId:record.id,at:Date.now()};await localPut('outbox',task);}
async function saveRecord(store,record,send=true){if(!allowedStore(store))throw Error('Role not permitted to edit '+store);await localPut(store,record);if(send)await enqueue(store,record);await reload();if(send)void flushOutbox();}
function headsAndConflicts(){const groups=new Map();for(const e of state.entries){const root=e.rootId||e.id;if(!groups.has(root))groups.set(root,[]);groups.get(root).push(e);}const active=[], conflicts=[];for(const [root,events] of groups){const superseded=new Set(events.map(e=>e.supersedesId).filter(Boolean));const leaves=events.filter(e=>!superseded.has(e.id));if(leaves.length>1)conflicts.push(root);const top=[...leaves].sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id))[0];if(top?.kind==='measurement')active.push(top);}return {active:active.sort(byDateDesc),conflicts};}
const currentEntries=()=>headsAndConflicts().active;
const total=arr=>arr.reduce((sum,x)=>sum+x.netKg,0);
const split=arr=>({bio:total(arr.filter(e=>e.category==='bio')),nonbio:total(arr.filter(e=>e.category==='nonbio'))});
function sortName(a,b,key){return String(a[key]).localeCompare(String(b[key]));}
function activeTrucks(){return [...state.trucks].filter(t=>t.active).sort((a,b)=>sortName(a,b,'code'));}
function activeDrivers(){return [...state.drivers].filter(d=>d.active).sort((a,b)=>sortName(a,b,'name'));}
function selectOptions(select,items,label,anyLabel,selected){select.innerHTML=`<option value="${anyLabel==='All trucks'?'all':''}">${escapeHTML(anyLabel)}</option>`+items.map(it=>`<option value="${escapeHTML(it.id)}">${escapeHTML(it[label])}</option>`).join('');if(selected!=null)select.value=selected;}
function refreshSelectors(){const values={truck:$('entryTruck').value,driver:$('entryDriver').value,log:$('logTruck').value,report:$('reportTruck').value};selectOptions($('entryTruck'),activeTrucks(),'code','Choose truck',values.truck);selectOptions($('entryDriver'),activeDrivers(),'name','Choose driver',values.driver);selectOptions($('logTruck'),[...state.trucks].sort((a,b)=>sortName(a,b,'code')),'code','All trucks',values.log);selectOptions($('reportTruck'),[...state.trucks].sort((a,b)=>sortName(a,b,'code')),'code','All trucks',values.report);}
function showTab(tab){if(!cloud.role)return; if(!['overview','entry','logbook','reports','analytics','fleet','settings','users','requests'].includes(tab))return;if(['fleet','users','requests'].includes(tab)&&!isAdmin())return toast('Admin access required.',true);if(tab==='entry'&&!canWrite())return toast('Read-only access for Viewer.',true);state.tab=tab;document.querySelectorAll('.tab-page').forEach(el=>el.classList.toggle('active',el.id==='page-'+tab));document.querySelectorAll('[data-tab]').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));const titles={overview:'Dashboard Overview',entry:'New Weighing Entry',logbook:'Delivery Logbook',reports:'Reports & Exports',analytics:'AI Analytics',fleet:'Fleet & Drivers',settings:'Settings & Sync',users:'User & Role Management',requests:'Void Requests'};$('pageTitle').textContent=titles[tab];window.scrollTo({top:0,behavior:'instant'});if(tab==='reports')renderReport();if(tab==='analytics')renderAnalytics();if(tab==='users')renderUsers();if(tab==='requests')renderRequests();}
function renderAll(){refreshSelectors();renderOverview();renderLogbook();renderReport();renderAnalytics();renderFleet();renderStorage();renderUsers();renderRequests();renderPermissions();updateStatuses();}
function renderOverview(){let period=$('period').value,[from,to]=bounds(period);$('dashboardCustom').hidden=period!=='custom';let list=currentEntries().filter(e=>inRange(e,from,to));let sums=split(list);$('kTotal').textContent=kg(sums.bio+sums.nonbio);$('kBio').textContent=kg(sums.bio);$('kNonbio').textContent=kg(sums.nonbio);$('kLoads').textContent=fmt(list.length);$('kPeriod').textContent=from?`${from} to ${to}`:'All recorded loads';$('kBioShare').textContent=(total(list)?Math.round(sums.bio/total(list)*100):0)+'% of waste';$('kNonShare').textContent=(total(list)?Math.round(sums.nonbio/total(list)*100):0)+'% of waste';$('kAvg').textContent=kg(list.length?total(list)/list.length:0)+' average/load';const groups=new Map();for(const e of list){const g=groups.get(e.truckCode)||{code:e.truckCode,count:0,net:0};g.count++;g.net+=e.netKg;groups.set(e.truckCode,g);}let trucks=[...groups.values()].sort((a,b)=>b.net-a.net);$('truckBreakdown').innerHTML=trucks.length?trucks.map(g=>`<tr><td>${escapeHTML(g.code)}</td><td class="number">${fmt(g.count)}</td><td class="number"><strong>${fmt(g.net)}</strong></td></tr>`).join(''):'<tr><td colspan="3" class="empty-row">No deliveries for this period.</td></tr>';$('recentRows').innerHTML=list.length?list.slice(0,6).map(e=>`<tr><td>${escapeHTML(e.date)} ${escapeHTML(e.time)}</td><td>${escapeHTML(e.truckCode)}</td><td>${escapeHTML(e.driverName)}</td><td><span class="pill ${e.category}">${e.category==='bio'?'Bio':'Non-Bio'}</span></td><td class="number"><strong>${fmt(e.netKg)} kg</strong></td></tr>`).join(''):'<tr><td colspan="5" class="empty-row">No deliveries yet. Record your first load.</td></tr>';drawChart(list);}
function drawChart(entries){const byDay=new Map();for(const e of entries){const g=byDay.get(e.date)||{date:e.date,bio:0,nonbio:0};g[e.category]+=e.netKg;byDay.set(e.date,g);}let days=[...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-15);const svg=$('dailyChart');if(!days.length){svg.innerHTML='<text x="360" y="130" text-anchor="middle" fill="#8a9ba7" font-size="16">No weighing data for the selected period</text>';return;}const w=720,h=250,base=220,left=52,right=20,max=Math.max(...days.map(e=>e.bio+e.nonbio),1)*1.18;let parts=[];for(let i=0;i<=4;i++){const y=base-(i/4)*190;parts.push(`<line x1="${left}" x2="${w-right}" y1="${y}" y2="${y}" stroke="#e6edf2"/><text x="${left-9}" y="${y+4}" text-anchor="end" fill="#8293a2" font-size="11">${fmt(max*i/4).replace(/\.\d+/,'')}</text>`);}const step=(w-left-right)/days.length;days.forEach((d,i)=>{const x=left+i*step+step*.16,bw=step*.68,blue=(d.nonbio/max)*190,green=(d.bio/max)*190;parts.push(`<rect x="${x}" y="${base-blue}" width="${bw}" height="${blue}" fill="#367fc5" rx="2"><title>${d.date}: Non-Bio ${fmt(d.nonbio)} kg</title></rect>`);parts.push(`<rect x="${x}" y="${base-blue-green}" width="${bw}" height="${green}" fill="#249982" rx="2"><title>${d.date}: Bio ${fmt(d.bio)} kg</title></rect>`);parts.push(`<text x="${x+bw/2}" y="${base+17}" text-anchor="middle" fill="#8293a2" font-size="${days.length>10?10:12}">${d.date.slice(5)}</text>`);});svg.innerHTML=parts.join('')+`<title>Stacked waste kg by date; showing last ${days.length} active days in selected range</title>`;}
function entryNet(){const tare=$('entryTare').value,gross=$('entryGross').value;const valid=tare!==''&&gross!==''&&Number(tare)>=0&&Number(gross)>=0;const net=valid?Number(gross)-Number(tare):0;$('entryNet').textContent=valid&&net>=0?kg(net):'—';$('weightError').textContent=valid&&net<0?'Gross weight cannot be lower than empty truck weight.':'';return valid&&net>=0?net:null;}
function resetEntry(){state.editId=null;$('entryForm').reset();const now=phNow();$('entryDate').value=now.date;$('entryTime').value=now.time;$('entryHeading').textContent='Record a truck weighing';$('editIndicator').textContent='New weighing record';$('saveEntry').textContent='Save weighing entry';entryNet();}
function editEntry(id){const entry=currentEntries().find(e=>e.id===id);if(!entry)return toast('Entry not found.',true);if(!canCorrect(entry))return toast('You may correct only your own weighings; Admin can correct any.',true);state.editId=id;showTab('entry');const truck=state.trucks.find(t=>t.id===entry.truckId),driver=state.drivers.find(d=>d.id===entry.driverId);if(truck&&!truck.active){$('entryTruck').insertAdjacentHTML('beforeend',`<option value="${escapeHTML(truck.id)}">${escapeHTML(truck.code)} (inactive)</option>`);}if(driver&&!driver.active){$('entryDriver').insertAdjacentHTML('beforeend',`<option value="${escapeHTML(driver.id)}">${escapeHTML(driver.name)} (inactive)</option>`);}Object.entries({entryDate:entry.date,entryTime:entry.time,entryTruck:entry.truckId,entryDriver:entry.driverId,entryType:entry.category,entryTare:entry.tareKg,entryGross:entry.grossKg,entryNotes:entry.notes||''}).forEach(([k,v])=>$(k).value=v);$('entryHeading').textContent='Correct a weighing record';$('editIndicator').textContent='Correction: original preserved';$('saveEntry').textContent='Save correction';entryNet();}
async function submitEntry(event){event.preventDefault();if(!requireRole('admin','encoder'))return;const truck=state.trucks.find(t=>t.id===$('entryTruck').value),driver=state.drivers.find(d=>d.id===$('entryDriver').value),net=entryNet(),date=$('entryDate').value,time=$('entryTime').value,tare=num($('entryTare').value),gross=num($('entryGross').value);if(!truck||!driver)return toast('Choose a registered truck and driver.',true);if(!validDate(date)||!validTime(time)||net===null||!isNum(tare)||!isNum(gross))return toast('Check the date, time and scale readings.',true);if(net===0&&!confirm('The calculated waste weight is 0 kg. Save anyway?'))return;const prev=state.editId?currentEntries().find(e=>e.id===state.editId):null;if(state.editId&&!prev)return toast('The original record has changed. Reopen it from Logbook.',true);if(prev&&!canCorrect(prev))return toast('You cannot correct this record.',true);const id=uid();const rec={id,kind:'measurement',rootId:prev?(prev.rootId||prev.id):id,supersedesId:prev?.id||'',truckId:truck.id,truckCode:truck.code,driverId:driver.id,driverName:driver.name,date,time,category:$('entryType').value,tareKg:tare,grossKg:gross,netKg:net,notes:$('entryNotes').value.trim(),createdAt:Date.now(),createdBy:cloud.user.uid,deviceId:deviceId()};try{await saveRecord('entries',rec);resetEntry();toast(prev?'Correction saved with original history preserved.':'Weighing saved on this device.');showTab('logbook');}catch(e){toast('Could not save entry: '+safeError(e),true);}}
async function voidEntry(id){
  const entry=currentEntries().find(e=>e.id===id);
  if(!entry||!requireRole('admin','encoder'))return;
  const reason=prompt(`Reason for voiding ${entry.truckCode} on ${entry.date} at ${entry.time}?\nOriginal record remains in the audit trail.`);
  if(reason===null)return;if(!reason.trim())return toast('A reason is required.',true);
  if(!isAdmin()){
    if(state.requests.some(r=>r.entryId===entry.id&&r.status==='pending'))return toast('A void request for this weighing is already pending.',true);
    const request={id:uid(),entryId:entry.id,rootId:entry.rootId||entry.id,reason:reason.trim().slice(0,900),createdBy:cloud.user.uid,createdAt:Date.now(),status:'pending',reviewedBy:'',reviewedAt:0,decisionNote:'',resolutionEventId:''};
    try{await saveRecord('requests',request);toast('Void request submitted for Admin review. The weighing remains active.');}catch(e){toast(safeError(e),true);}
    return;
  }
  const rec={...entry,id:uid(),rootId:entry.rootId||entry.id,supersedesId:entry.id,kind:'void',notes:'VOID REASON: '+reason.trim().slice(0,900),createdAt:Date.now(),createdBy:cloud.user.uid,deviceId:deviceId()};
  try{await saveRecord('entries',rec);toast('Entry voided. Original audit event preserved.');}catch(e){toast(safeError(e),true);}
}
function filteredLog(reviewIds=null){
  const q=$('logSearch').value.trim().toLowerCase(),type=$('logType').value,truckId=$('logTruck').value;
  return currentEntries().filter(e=>(!reviewIds||reviewIds.has(e.id))&&(type==='all'||e.category===type)&&(truckId==='all'||e.truckId===truckId)&&(!q||[e.date,e.time,e.truckCode,e.driverName,e.notes].some(s=>String(s).toLowerCase().includes(q))));
}
function renderLogbook(){
  const review=state.duplicateReview;
  const matches=review?findPossibleDuplicates(currentEntries().filter(e=>inRange(e,review.from,review.to))):null;
  const banner=$('logDuplicateReview');
  banner.hidden=!review;
  if(review){
    $('logDuplicateSummary').textContent=matches.count
      ? `${fmt(matches.count)} possible extra weighing(s) in ${fmt(matches.groups.length)} matching group(s). Showing ${fmt(matches.ids.size)} linked records from ${review.period}. Compare original weighbridge tickets before correcting or voiding. Matches can be legitimate deliveries.`
      : `No possible duplicates remain for ${review.period}. You can clear the review to view all records.`;
  }
  const entries=filteredLog(matches?.ids||null),per=25;
  state.logPage=Math.min(state.logPage,Math.max(0,Math.ceil(entries.length/per)-1));
  const page=entries.slice(state.logPage*per,(state.logPage+1)*per);
  $('logCount').textContent=review
    ? `${fmt(entries.length)} matching records displayed • ${fmt(state.entries.length)} total audit events`
    : `${fmt(entries.length)} active weighing entries • ${fmt(state.entries.length)} total audit events`;
  $('logRows').innerHTML=page.length?page.map(e=>`<tr class="${review?'duplicate-row':''}"><td>${escapeHTML(e.date)} ${escapeHTML(e.time)}</td><td><strong>${escapeHTML(e.truckCode)}</strong>${review&&matches.labels.has(e.id)?`<span class="duplicate-group">Match group ${matches.labels.get(e.id)}</span>`:''}</td><td>${escapeHTML(e.driverName)}</td><td><span class="pill ${e.category}">${e.category==='bio'?'Bio':'Non-Bio'}</span></td><td class="number">${fmt(e.tareKg)}</td><td class="number">${fmt(e.grossKg)}</td><td class="number"><strong>${fmt(e.netKg)}</strong></td><td><div class="row-actions">${canCorrect(e)?`<button class="action-link" data-edit="${escapeHTML(e.id)}">Correct</button>`:''}${canWrite()?`<button class="action-link warn" data-void="${escapeHTML(e.id)}">${isAdmin()?'Void':'Request void'}</button>`:'Read only'}</div></td></tr>`).join(''):'<tr><td colspan="8" class="empty-row">No matching deliveries.</td></tr>';
  $('logPageLabel').textContent=`Page ${state.logPage+1} of ${Math.max(1,Math.ceil(entries.length/per))}`;
  $('logPrev').disabled=state.logPage===0;
  $('logNext').disabled=(state.logPage+1)*per>=entries.length;
}
function reportData(){const from=$('reportFrom').value,to=$('reportTo').value,truck=$('reportTruck').value,type=$('reportType').value;return currentEntries().filter(e=>inRange(e,from,to)&&(truck==='all'||e.truckId===truck)&&(type==='all'||e.category===type)).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));}
function renderReport(){const entries=reportData(),sums=split(entries),bioGross=entries.filter(e=>e.category==='bio').reduce((n,e)=>n+e.grossKg,0),nonGross=entries.filter(e=>e.category==='nonbio').reduce((n,e)=>n+e.grossKg,0);const truck=$('reportTruck').value,truckName=truck==='all'?'ALL GARBAGE TRUCKS':(state.trucks.find(t=>t.id===truck)?.code||'SELECTED TRUCK');$('reportSubtitle').textContent=`${truckName} • ${$('reportFrom').value||'Beginning'} to ${$('reportTo').value||'Present'}`;$('reportRows').innerHTML=entries.length?entries.map(e=>`<tr><td>${escapeHTML(e.date)}</td><td>${escapeHTML(e.time)}</td><td>${escapeHTML(e.truckCode)}</td><td class="number">${fmt(e.tareKg)}</td><td class="number">${e.category==='nonbio'?fmt(e.grossKg):''}</td><td class="number">${e.category==='bio'?fmt(e.grossKg):''}</td><td class="number">${e.category==='nonbio'?fmt(e.netKg):''}</td><td class="number">${e.category==='bio'?fmt(e.netKg):''}</td><td>${escapeHTML(e.driverName)}</td></tr>`).join(''):'<tr><td colspan="9" class="empty-row">No weighings match this report.</td></tr>';$('reportFooter').innerHTML=`<tr><td colspan="4">TOTAL • ${fmt(entries.length)} LOADS</td><td class="number">${fmt(nonGross)}</td><td class="number">${fmt(bioGross)}</td><td class="number">${fmt(sums.nonbio)}</td><td class="number">${fmt(sums.bio)}</td><td></td></tr>`;$('reportSummary').textContent=`GRAND TOTAL NET WASTE: ${kg(sums.bio+sums.nonbio)}  |  Bio: ${kg(sums.bio)}  |  Non-Bio: ${kg(sums.nonbio)}`;}
function csvCell(v){let s=String(v??'');if(/^[\s]*[=+@-]/.test(s)&&!/^\d{4}-\d{2}-\d{2}$/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function makeCSV(rows){return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');}
function downloadText(filename,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function exportCSV(entries,filename){const rows=[['Date','Time','Truck code','Driver name','Classification','Empty truck kg','Truck and waste kg','Net waste kg','Remarks','Audit root ID'],...entries.map(e=>[e.date,e.time,e.truckCode,e.driverName,e.category==='bio'?'Bio':'Non-Bio',e.tareKg,e.grossKg,e.netKg,e.notes,e.rootId])];downloadText(filename,makeCSV(rows),'text/csv;charset=utf-8');}
function renderAnalytics(){const p=$('aiPeriod').value,all=currentEntries(),[from,to]=p==='all'?['','']:bounds(p);const list=all.filter(e=>inRange(e,from,to)),s=split(list),dates=[...new Set(list.map(e=>e.date))],avg=list.length?total(list)/list.length:0;const stats=[['Delivered loads',fmt(list.length)],['Total net waste',kg(total(list))],['Average load weight',kg(avg)],['Active delivery dates',fmt(dates.length)],['Bio proportion',total(list)?(s.bio/total(list)*100).toFixed(1)+'%':'0%'],['Non-Bio proportion',total(list)?(s.nonbio/total(list)*100).toFixed(1)+'%':'0%']];$('analysisStats').innerHTML=stats.map(([name,val])=>`<div class="stat-line"><span>${name}</span><strong>${val}</strong></div>`).join('');const quality=[],alerts=[];const {conflicts}=headsAndConflicts();if(conflicts.length)quality.push(`${conflicts.length} record series have simultaneous correction branches and require manual reconciliation. Dashboard uses the most recent branch by local timestamp.`);const tareVariation=list.filter(e=>{const t=state.trucks.find(t=>t.id===e.truckId);return t&&t.tareKg>0&&Math.abs(t.tareKg-e.tareKg)/t.tareKg>.1;});if(tareVariation.length)quality.push(`${tareVariation.length} load(s) have measured tare weights differing by over 10% from the truck's standard tare. Verify the weighbridge tickets.`);const duplicateReport=findPossibleDuplicates(list),duplicates=duplicateReport.count;const duplicateWarning=duplicates?`${duplicates} possible duplicate weighings have identical truck, time, category and net weight.`:'';if(duplicates)quality.push(duplicateWarning);const extreme=list.filter(e=>avg>0&&list.length>4&&e.netKg>avg*2.5);if(extreme.length)quality.push(`${extreme.length} delivery load(s) exceed 2.5× the period average. Check for transcription issues or heavy consignments.`);const voids=state.entries.filter(e=>e.kind==='void'&&(!from||e.date>=from)&&(!to||e.date<=to));if(voids.length)quality.push(`${voids.length} void action(s) are retained in the immutable weighing audit history.`);if(!quality.length)quality.push('No issues detected by basic weight, duplicate or correction-conflict checks for this period.');$('analysisQuality').innerHTML=quality.map(msg=>msg===duplicateWarning?`<div class="stat-line quality-flag"><button type="button" class="quality-review-button" data-review-duplicates aria-label="Review ${duplicates} possible duplicate weighing records in Logbook"><span>${escapeHTML(msg)}</span><strong class="quality-review-action">Review ${fmt(duplicateReport.ids.size)} matching records →</strong></button></div>`:`<div class="stat-line"><span>${escapeHTML(msg)}</span></div>`).join('');if(!list.length){alerts.push(['No records in range','Record loads or choose a broader date range for useful insights.','important']);}else{alerts.push(['Total net waste',`${kg(total(list))} across ${fmt(list.length)} deliveries over ${fmt(dates.length)} active day(s).`,'good']);const truckCounts=new Map();for(const e of list){const v=truckCounts.get(e.truckCode)||{kg:0,loads:0};v.kg+=e.netKg;v.loads++;truckCounts.set(e.truckCode,v);}const top=[...truckCounts.entries()].sort((a,b)=>b[1].kg-a[1].kg)[0];if(top)alerts.push(['Highest-volume truck',`${top[0]} accounts for ${kg(top[1].kg)} over ${top[1].loads} deliveries (${(top[1].kg/total(list)*100).toFixed(1)}% of waste).`,'good']);const bioRate=s.bio/total(list)*100;alerts.push(['Waste composition',`${bioRate.toFixed(1)}% biodegradable and ${(100-bioRate).toFixed(1)}% non-biodegradable by recorded net weight.`,'good']);const byDay=new Map();for(const e of list)byDay.set(e.date,(byDay.get(e.date)||0)+e.netKg);const peak=[...byDay.entries()].sort((a,b)=>b[1]-a[1])[0];if(peak)alerts.push(['Peak delivery day',`${peak[0]} recorded ${kg(peak[1])}; review staffing and disposal traffic if this was unusually busy.`,'good']);if(quality.length&&quality[0]&&!quality[0].startsWith('No issues'))alerts.push(['Check flagged tickets','Review the Data quality checks below before finalizing official monthly totals.','important']);else alerts.push(['Data checks', 'No basic data-quality flags detected for the selected period.','good']);}const icons=['◈','▣','♻','◫','⚠'];$('insights').innerHTML=alerts.map(([heading,body,kind],i)=>`<div class="insight ${kind}"><div class="insight-heading"><span>${icons[i%icons.length]}</span>${escapeHTML(heading)}</div><p>${escapeHTML(body)}</p></div>`).join('');}
function renderFleet(){$('trucksCount').textContent=state.trucks.length+' registered';$('driversCount').textContent=state.drivers.length+' registered';$('truckRows').innerHTML=state.trucks.length?[...state.trucks].sort((a,b)=>sortName(a,b,'code')).map(t=>`<tr><td><strong>${escapeHTML(t.code)}</strong></td><td class="number">${fmt(t.tareKg)}</td><td><button class="action-link" data-truck-edit="${escapeHTML(t.id)}">Edit</button><button class="action-link ${t.active?'warn':''}" data-truck-toggle="${escapeHTML(t.id)}">${t.active?'Deactivate':'Activate'}</button></td></tr>`).join(''):'<tr><td colspan="3" class="empty-row">Add your first truck code.</td></tr>';$('driverRows').innerHTML=state.drivers.length?[...state.drivers].sort((a,b)=>sortName(a,b,'name')).map(d=>`<tr><td><strong>${escapeHTML(d.name)}</strong></td><td><button class="action-link" data-driver-edit="${escapeHTML(d.id)}">Edit</button><button class="action-link ${d.active?'warn':''}" data-driver-toggle="${escapeHTML(d.id)}">${d.active?'Deactivate':'Activate'}</button></td></tr>`).join(''):'<tr><td colspan="2" class="empty-row">Add your first driver.</td></tr>';}
async function addTruck(ev){ev.preventDefault();if(!requireRole('admin'))return;const code=$('truckCode').value.trim().toUpperCase(),tare=Number($('truckTare').value);if(!code||!isNum(tare)||tare<0)return toast('Provide a valid truck code and nonnegative standard tare.',true);if(state.trucks.some(t=>t.code.toUpperCase()===code))return toast('This truck code already exists. Edit it instead.',true);await saveRecord('trucks',{id:uid(),code,tareKg:tare,active:true,updatedAt:Date.now()});$('truckForm').reset();toast('Truck registered.');}
async function addDriver(ev){ev.preventDefault();if(!requireRole('admin'))return;const name=$('driverName').value.trim();if(!name)return;if(state.drivers.some(d=>d.name.toLowerCase()===name.toLowerCase()))return toast('Driver already exists.',true);await saveRecord('drivers',{id:uid(),name,active:true,updatedAt:Date.now()});$('driverForm').reset();toast('Driver registered.');}
async function fleetAction(kind,id,action){if(!requireRole('admin'))return;const store=kind==='truck'?'trucks':'drivers',obj=state[store].find(x=>x.id===id);if(!obj)return;if(action==='toggle'){const label=obj.active?'deactivate':'reactivate';if(!confirm(`Do you want to ${label} ${kind==='truck'?obj.code:obj.name}?`))return;await saveRecord(store,{...obj,active:!obj.active,updatedAt:Date.now()});return;}if(kind==='truck'){const code=prompt('Truck code:',obj.code);if(code===null)return;const val=code.trim().toUpperCase();if(!val)return toast('Truck code cannot be blank.',true);if(state.trucks.some(t=>t.id!==id&&t.code.toUpperCase()===val))return toast('Truck code is already used.',true);const answer=prompt('Standard empty truck weight (kg):',String(obj.tareKg));if(answer===null)return;const tare=Number(answer);if(!answer.trim()||!isNum(tare)||tare<0)return toast('Invalid weight.',true);await saveRecord(store,{...obj,code:val,tareKg:tare,updatedAt:Date.now()});}else{const name=prompt("Driver's full name:",obj.name);if(name===null)return;const val=name.trim();if(!val)return toast('Driver name cannot be blank.',true);await saveRecord(store,{...obj,name:val,updatedAt:Date.now()});}toast('Directory updated. Existing load history remains unchanged.');}
function deviceId(){let id=localStorage.getItem('landfill-device-id');if(!id){id=uid();localStorage.setItem('landfill-device-id',id);}return id;}
function renderStorage(){$('localCounts').textContent=`${fmt(currentEntries().length)} active loads, ${fmt(state.entries.length)} audit events, ${fmt(state.trucks.length)} trucks, ${fmt(state.drivers.length)} drivers. ${fmt(state.outbox.length)} operations awaiting cloud sync.`;}
async function exportBackup(){if(!requireRole('admin'))return;const data={format:'landfill-weighing-backup',schema:1,appVersion:VERSION,exportedAt:new Date().toISOString(),timezone:'Asia/Manila',entries:state.entries,trucks:state.trucks,drivers:state.drivers};downloadText(`landfill-weighing-backup-${phNow().date}.json`,JSON.stringify(data,null,2),'application/json;charset=utf-8');toast('JSON backup downloaded.');}
function validateImportEntry(e){return e&&typeof e.id==='string'&&e.id.length<150&&['measurement','void'].includes(e.kind)&&typeof e.rootId==='string'&&typeof e.supersedesId==='string'&&['bio','nonbio'].includes(e.category)&&validDate(e.date)&&validTime(e.time)&&isNum(e.tareKg)&&isNum(e.grossKg)&&isNum(e.netKg)&&e.tareKg>=0&&e.grossKg>=e.tareKg&&Math.abs(e.netKg-(e.grossKg-e.tareKg))<.00001&&isNum(e.createdAt)&&typeof e.truckId==='string'&&typeof e.truckCode==='string'&&typeof e.driverId==='string'&&typeof e.driverName==='string';}
async function importBackup(ev){if(!requireRole('admin'))return;const file=ev.target.files?.[0];ev.target.value='';if(!file)return;try{if(file.size>25*1024*1024)throw Error('Backup file exceeds 25 MB.');const data=JSON.parse(await file.text());if(data.format!=='landfill-weighing-backup'||data.schema!==1||!Array.isArray(data.entries)||!Array.isArray(data.trucks)||!Array.isArray(data.drivers))throw Error('Not a compatible backup format.');if(!data.entries.every(validateImportEntry))throw Error('Some weighing events are invalid or have inconsistent net weights.');if(!data.trucks.every(t=>typeof t.id==='string'&&typeof t.code==='string'&&isNum(t.tareKg)&&t.tareKg>=0&&typeof t.active==='boolean')||!data.drivers.every(d=>typeof d.id==='string'&&typeof d.name==='string'&&typeof d.active==='boolean'))throw Error('Invalid truck or driver records.');if(!confirm(`Import ${data.entries.length} audit events, ${data.trucks.length} trucks and ${data.drivers.length} drivers? Existing records are never overwritten; new entries queue for cloud sync.`))return;let count=0;for(const store of ['trucks','drivers','entries']){for(const incoming of data[store]){if(await localGet(store,incoming.id))continue;const clean=store==='entries'?{id:incoming.id,kind:incoming.kind,rootId:incoming.rootId,supersedesId:incoming.supersedesId,truckId:incoming.truckId,truckCode:incoming.truckCode,driverId:incoming.driverId,driverName:incoming.driverName,date:incoming.date,time:incoming.time,category:incoming.category,tareKg:incoming.tareKg,grossKg:incoming.grossKg,netKg:incoming.netKg,notes:String(incoming.notes||'').slice(0,1000),createdAt:incoming.createdAt,createdBy:String(incoming.createdBy||''),deviceId:String(incoming.deviceId||'')}:store==='trucks'?{id:incoming.id,code:incoming.code,tareKg:incoming.tareKg,active:incoming.active,updatedAt:incoming.updatedAt||Date.now()}:{id:incoming.id,name:incoming.name,active:incoming.active,updatedAt:incoming.updatedAt||Date.now()};await localPut(store,clean);await enqueue(store,clean);count++;}}await reload();toast(`Imported ${count} new records. ${count?'Sync queued when online.':'Everything was already present.'}`);void flushOutbox();}catch(e){toast('Import failed: '+safeError(e),true);}}
function configReady(){const c=window.LANDFILL_FIREBASE_CONFIG||{};return !!(c.apiKey&&c.projectId&&c.appId&&!String(c.apiKey).includes('PASTE')&&!String(c.projectId).includes('YOUR_')&&!String(c.appId).includes('PASTE'));}
function updateStatuses(){
  const online=navigator.onLine;
  $('connectionStatus').textContent=online?'● Device online':'● Offline • local storage';
  $('connectionStatus').className='status-chip'+(online?'':' offline');
  const label=cloud.error?'Sync issue':!online?`${state.outbox.length} pending • offline`:!configReady()?'Firebase needs setup':cloud.connecting?'Connecting…':!cloud.user?'Sign in required':!cloud.role?'Awaiting approval':cloud.busy?'Syncing…':`${state.outbox.length} pending • ${roleLabel(cloud.role)}`;
  $('syncStatus').textContent=label;
  $('syncStatus').title=cloud.error;
  $('syncStatus').className='status-chip secondary'+(cloud.error?' error':'');
}
const roleLabel=r=>({admin:'Admin',viewer:'Viewer',encoder:'Encoder'}[r]||'Not approved');
function showGate(message){$('authGate').hidden=false;$('appShell').hidden=true;$('authMessage').textContent=message;$('authLoginFields').hidden=!!cloud.user;$('waitingAccount').hidden=!cloud.user;if(cloud.user)$('waitingEmail').textContent=cloud.user.email||cloud.user.uid;}
function grantAccess(role,offline=false){
  if(cloud.role!==role){for(const fn of cloud.unsubs.splice(0)){try{fn();}catch{}}cloud.members=[];}
  cloud.role=role;cloud.ready=true;
  $('authGate').hidden=true;$('appShell').hidden=false;
  $('accountLabel').textContent=`${cloud.user.email||'User'} • ${roleLabel(role)}${offline?' (offline)':''}`;
  $('firebaseMessage').textContent=offline?'Offline authenticated session: local data available, sync deferred until internet returns.':'Role-secured Firebase connection. All cloud requests are checked by Firestore Security Rules.';
  renderPermissions();renderAll();showTab(['users','requests','fleet','entry'].includes(state.tab)&&!isAdmin()?(state.tab==='entry'&&canWrite()?'entry':'overview'):state.tab);
  if(navigator.onLine){if(!cloud.unsubs.length)listenToCloud();void flushOutbox();}
}
function lockAccess(message){
  for(const fn of cloud.unsubs.splice(0)){try{fn();}catch{}}
  cloud.role=null;cloud.ready=false;
  showGate(message);updateStatuses();
}
function renderPermissions(){
  document.querySelectorAll('[data-role-nav="admin"]').forEach(x=>x.hidden=!isAdmin());
  document.querySelectorAll('[data-role-nav="write"]').forEach(x=>x.hidden=!canWrite());
  document.querySelectorAll('[data-role-admin]').forEach(x=>x.hidden=!isAdmin());
  $('quickAdd').hidden=!canWrite();
  $('roleDescription').textContent=isAdmin()?'Admin: full operations, fleet, user roles and approvals.':hasRole('encoder')?'Encoder: create loads, correct your own loads, request voids.':'Viewer: read-only dashboard, audit, analytics and reports.';
  if(!isAdmin()&&['fleet','users','requests'].includes(state.tab))state.tab='overview';
}
function roleCacheKey(uid){return 'landfill-rbac-role:'+uid;}
function offlineRole(user){try{const v=JSON.parse(localStorage.getItem(roleCacheKey(user.uid))||'null');return v&&v.role&&ROLES.includes(v.role)&&v.active===true&&Date.now()-v.verifiedAt<7*86400000?v.role:null;}catch{return null;}}
async function authorizeUser(user){
  if(cloud.membershipUnsub){cloud.membershipUnsub();cloud.membershipUnsub=null;}
  if(!user){cloud.user=null;lockAccess('Sign in using your authorized Firebase account.');return;}
  cloud.user=user;
  showGate('Checking account approval and role…');
  try{
    let doc;
    if(navigator.onLine){doc=await cloud.fs.getDocFromServer(cloud.fs.doc(cloud.db,'members',user.uid));}
    else {const cached=offlineRole(user);if(cached){grantAccess(cached,true);return;}lockAccess('Offline access requires a previously approved session on this device (within 7 days). Connect to the internet.');return;}
    if(cloud.user!==user)return;
    const m=doc.exists()?doc.data():null;
    if(!m||m.active!==true||!ROLES.includes(m.role)){
      localStorage.removeItem(roleCacheKey(user.uid));lockAccess('Account not approved or has been disabled. Contact your system Admin.');return;
    }
    localStorage.setItem(roleCacheKey(user.uid),JSON.stringify({role:m.role,active:true,verifiedAt:Date.now()}));
    grantAccess(m.role);
    if(cloud.membershipUnsub){cloud.membershipUnsub();cloud.membershipUnsub=null;}
    cloud.membershipUnsub=cloud.fs.onSnapshot(cloud.fs.doc(cloud.db,'members',user.uid),snap=>{
      if(!snap.metadata.fromCache){const v=snap.exists()?snap.data():null;
        if(!v||v.active!==true||!ROLES.includes(v.role)){localStorage.removeItem(roleCacheKey(user.uid));lockAccess('Your account is no longer approved. Contact the Admin.');return;}
        localStorage.setItem(roleCacheKey(user.uid),JSON.stringify({role:v.role,active:true,verifiedAt:Date.now()}));
        if(v.role!==cloud.role)grantAccess(v.role);
      }
    },e=>{cloud.error='Role authorization: '+safeError(e);lockAccess('Unable to verify your role. '+safeError(e));});
  }catch(e){
    if(!navigator.onLine){const cached=offlineRole(user);if(cached){grantAccess(cached,true);return;}}
    cloud.error=safeError(e);lockAccess('Could not verify permission. Check Firebase Rules and internet connection. '+safeError(e));
  }
}
async function connectFirebase(){
  if(cloud.connecting||cloud.auth)return;
  if(!configReady()){showGate('Firebase configuration missing. The included project configuration must be deployed.');updateStatuses();return;}
  cloud.connecting=true;cloud.error='';updateStatuses();
  try{
    const base='https://www.gstatic.com/firebasejs/12.19.0/';
    const [am,fm,au]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-firestore.js'),import(base+'firebase-auth.js')]);
    const app=am.initializeApp(window.LANDFILL_FIREBASE_CONFIG);
    cloud.firebaseApp=app;cloud.appFns=am;cloud.fs=fm;cloud.authFns=au;cloud.auth=au.getAuth(app);
    try{cloud.db=fm.initializeFirestore(app,{localCache:fm.memoryLocalCache()});}catch{cloud.db=fm.getFirestore(app);}
    au.onAuthStateChanged(cloud.auth,user=>{void authorizeUser(user);},e=>{cloud.error=safeError(e);lockAccess('Authentication error: '+safeError(e));});
  }catch(e){cloud.error=safeError(e);showGate('Could not load Firebase authentication. Connect online once to cache the app and Firebase modules. '+cloud.error);}
  finally{cloud.connecting=false;updateStatuses();}
}
async function submitLogin(ev){ev.preventDefault();if(!cloud.auth)return toast('Firebase not initialized. Connect to the internet.',true);if(!navigator.onLine)return toast('First sign-in requires internet.',true);
  $('loginSubmit').disabled=true;$('authMessage').textContent='Signing in…';
  try{await cloud.authFns.setPersistence(cloud.auth,cloud.authFns.browserLocalPersistence);await cloud.authFns.signInWithEmailAndPassword(cloud.auth,$('loginEmail').value.trim(),$('loginPassword').value);$('loginPassword').value='';}
  catch(e){$('authMessage').textContent='Sign-in failed: '+safeError(e);}
  finally{$('loginSubmit').disabled=false;}
}
async function signOut(){
  if(state.outbox.length&&!confirm(`${state.outbox.length} local changes are awaiting sync. Sign out anyway? Data stays on this device but cannot sync until an authorized account returns.`))return;
  if(cloud.membershipUnsub){cloud.membershipUnsub();cloud.membershipUnsub=null;}
  if(cloud.auth){await cloud.authFns.signOut(cloud.auth);}
  cloud.user=null;lockAccess('Signed out. Sign in with an approved account.');
}
function listenToCloud(){
  if(!cloud.user||!cloud.role||cloud.unsubs.length)return;
  for(const store of ['entries','trucks','drivers','requests']){
    const unsub=cloud.fs.onSnapshot(cloud.fs.collection(cloud.db,store),snapshot=>{void (async()=>{
      const pending=new Set((await localAll('outbox')).filter(x=>x.store===store).map(x=>x.recordId));let changed=false;
      for(const docSnap of snapshot.docs){const record=docSnap.data();if(!record||record.id!==docSnap.id||pending.has(docSnap.id))continue;
        const existing=await localGet(store,docSnap.id);
        if(store==='entries'&&existing)continue;
        if(!existing||JSON.stringify(existing)!==JSON.stringify(record)){await localPut(store,record);changed=true;}
      }
      if(changed)await reload();
    })().catch(e=>{cloud.error='Cloud download: '+safeError(e);updateStatuses();});},e=>{
      cloud.error='Firestore '+store+': '+safeError(e);updateStatuses();
      if(e.code==='permission-denied')void authorizeUser(cloud.user);
    });cloud.unsubs.push(unsub);
  }
  if(isAdmin()){
    cloud.unsubs.push(cloud.fs.onSnapshot(cloud.fs.collection(cloud.db,'members'),snapshot=>{
      cloud.members=snapshot.docs.map(d=>({uid:d.id,...d.data()}));renderUsers();
    },e=>{cloud.error='Members: '+safeError(e);updateStatuses();}));
  }
}
async function flushOutbox(){
  if(cloud.busy||!cloud.ready||!cloud.user||!cloud.role||!navigator.onLine)return;
  cloud.busy=true;cloud.error='';updateStatuses();
  try{
    const tasks=(await localAll('outbox')).sort((a,b)=>a.at-b.at);
    for(const item of tasks){
      if(!navigator.onLine)break;
      const record=await localGet(item.store,item.recordId);
      if(!record){await localDelete('outbox',item.id);continue;}
      // No write attempt from a Viewer. Historic pre-RBAC events may be uploaded by Admin only.
      if(!allowedStore(item.store)||(!isAdmin()&&item.store==='entries'&&record.createdBy!==cloud.user.uid)){
        cloud.error='Pending records need an Admin or original Encoder account. Export a JSON backup before migrating.';break;
      }
      if(!isAdmin()&&item.store==='requests'&&record.createdBy!==cloud.user.uid){cloud.error='Request belongs to another Encoder; Admin must resolve.';break;}
      const ref=cloud.fs.doc(cloud.db,item.store,record.id);
      try{
        if(item.store==='entries'||item.store==='requests'){
          const snap=await cloud.fs.getDocFromServer(ref);
          if(snap.exists()){
            if(JSON.stringify(snap.data())===JSON.stringify(record)||Object.keys(record).every(k=>JSON.stringify(snap.data()[k])===JSON.stringify(record[k]))&&Object.keys(snap.data()).length===Object.keys(record).length){await localDelete('outbox',item.id);continue;}
            cloud.error='Cloud ID already exists with different data: '+record.id+'. Review backup.';break;
          }
        }
        await cloud.fs.setDoc(ref,record);
        await localDelete('outbox',item.id);
      }catch(e){cloud.error=`${item.store}: ${safeError(e)}`;break;}
    }
  }catch(e){cloud.error=safeError(e);}
  finally{cloud.busy=false;await reload();}
}
function renderUsers(){
  if(!isAdmin())return;
  $('userRows').innerHTML=cloud.members.length?[...cloud.members].sort((a,b)=>(a.email||'').localeCompare(b.email||'')).map(m=>`<tr><td>${escapeHTML(m.email||'')}</td><td>${escapeHTML(m.name||'')}</td><td><code>${escapeHTML(m.uid)}</code></td><td>${escapeHTML(roleLabel(m.role))}</td><td>${m.active?'Active':'Disabled'}</td><td>${m.uid===cloud.user.uid?'Current admin':`<div class="row-actions"><button type="button" class="action-link" data-user-edit="${escapeHTML(m.uid)}">Edit</button><button type="button" class="action-link" data-user-reset="${escapeHTML(m.uid)}">Reset password</button></div>`}</td></tr>`).join(''):'<tr><td colspan="6">No user profiles yet. Create the first Admin in Firebase Console, then add other users here.</td></tr>';
}
function generateTemporaryPassword(){
  if(!crypto?.getRandomValues)return toast('Secure password generation unavailable. Use HTTPS.',true);
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const random=new Uint32Array(20);crypto.getRandomValues(random);
  $('memberPassword').value=Array.from(random,n=>chars[n%chars.length]).join('');
  $('memberPassword').type='text';$('showMemberPassword').checked=true;
}
async function addMember(ev){
  ev.preventDefault();
  if(!requireRole('admin')||!navigator.onLine)return toast('Admin must be online to create accounts.',true);
  if(!cloud.appFns||!cloud.authFns||!cloud.firebaseApp)return toast('Firebase authentication is not ready.',true);
  if(cloud.userCreateBusy)return;
  const email=$('memberEmail').value.trim().toLowerCase(),name=$('memberName').value.trim(),role=$('memberRole').value,password=$('memberPassword').value;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||name.length>100||!ROLES.includes(role)||password.length<12||password.length>128)
    return toast('Enter a valid email and name, one of the three roles, and a 12–128 character password.',true);
  if(cloud.members.some(m=>m.email?.toLowerCase()===email))return toast('This email already has a user profile. Use Edit.',true);
  if(!confirm(`Create a NEW ${roleLabel(role)} login for ${email}? The temporary password must be shared privately.`))return;
  const submit=$('createMemberSubmit'),status=$('memberCreateStatus');cloud.userCreateBusy=true;submit.disabled=true;submit.textContent='Creating account…';status.textContent='Creating Firebase login and role…';
  let secondaryApp=null,secondaryAuth=null,created=null,memberSaved=false;
  try{
    // A named secondary Firebase app prevents sign-up from replacing the logged-in Admin session.
    secondaryApp=cloud.appFns.initializeApp(window.LANDFILL_FIREBASE_CONFIG,'landfill-provision-'+uid());
    secondaryAuth=cloud.authFns.getAuth(secondaryApp);
    await cloud.authFns.setPersistence(secondaryAuth,cloud.authFns.inMemoryPersistence);
    const credential=await cloud.authFns.createUserWithEmailAndPassword(secondaryAuth,email,password);
    created=credential.user;
    if(cloud.auth.currentUser?.uid!==cloud.user?.uid||!isAdmin())throw Error('Administrator session changed during creation; user registration cancelled.');
    await cloud.fs.setDoc(cloud.fs.doc(cloud.db,'members',created.uid),{
      uid:created.uid,email,name,role,active:true,createdAt:Date.now(),updatedAt:Date.now()
    });
    memberSaved=true;
    $('memberForm').reset();$('memberRole').value='encoder';$('memberPassword').type='password';$('showMemberPassword').checked=false;
    status.textContent=`Created ${email} as ${roleLabel(role)}. Share the temporary password privately and have the user reset it after first sign-in.`;
    toast('Login and role created. Admin session retained.');
  }catch(e){
    let rollbackNote='';
    if(created&&!memberSaved){
      try{await cloud.authFns.deleteUser(created);rollbackNote=' The incomplete new login was removed.';}
      catch(rollbackError){rollbackNote=` The Auth login may still exist (UID ${created.uid}), but it has no granted role. Contact the system owner to reconcile it securely.`;}
    }
    status.textContent='Account creation failed: '+safeError(e)+rollbackNote;
    toast('Could not create account. See the message under the form.',true);
  }finally{
    if(secondaryAuth){try{await cloud.authFns.signOut(secondaryAuth);}catch{}}
    if(secondaryApp){try{await cloud.appFns.deleteApp(secondaryApp);}catch{}}
    cloud.userCreateBusy=false;submit.disabled=false;submit.textContent='Create user & assign role';
  }
}
function editMember(uidValue){
  if(!requireRole('admin')||!navigator.onLine)return toast('Admin online access required.',true);
  const m=cloud.members.find(x=>x.uid===uidValue);if(!m||m.uid===cloud.user.uid)return toast('Your own Admin access cannot be changed here.',true);
  $('editMemberUid').value=m.uid;$('editMemberDescription').textContent=m.email+' — '+m.name;
  $('editMemberRole').value=ROLES.includes(m.role)?m.role:'viewer';$('editMemberActive').checked=m.active===true;
  const dlg=$('editUserDialog');dlg.hidden=false;if(dlg.showModal)dlg.showModal();
}
async function saveMemberEdit(ev){
  ev.preventDefault();if(!requireRole('admin')||!navigator.onLine)return toast('Online Admin access is required.',true);
  const uidValue=$('editMemberUid').value,role=$('editMemberRole').value,active=$('editMemberActive').checked;
  const m=cloud.members.find(x=>x.uid===uidValue);
  if(!m||m.uid===cloud.user.uid||!ROLES.includes(role))return toast('Invalid user or role.',true);
  const btn=$('saveMemberEdit');btn.disabled=true;
  try{
    await cloud.fs.updateDoc(cloud.fs.doc(cloud.db,'members',uidValue),{role,active,updatedAt:Date.now()});
    $('editUserDialog').close?.();$('editUserDialog').hidden=true;
    toast('Role/status updated. Access rules take effect for cloud operations.');
  }catch(e){toast('Could not update user: '+safeError(e),true);}
  finally{btn.disabled=false;}
}
async function sendMemberReset(uidValue){
  if(!requireRole('admin')||!navigator.onLine)return toast('Online Admin access is required.',true);
  const m=cloud.members.find(x=>x.uid===uidValue);if(!m||!m.email)return toast('User not found.',true);
  if(!confirm(`Send a Firebase password reset email to ${m.email}?`))return;
  try{await cloud.authFns.sendPasswordResetEmail(cloud.auth,m.email);toast('Password-reset email requested. Ask user to check their inbox/spam.');}
  catch(e){toast('Reset email failed: '+safeError(e),true);}
}
function renderRequests(){
  if(!isAdmin())return;
  const rows=[...state.requests].sort((a,b)=>b.createdAt-a.createdAt);
  $('requestRows').innerHTML=rows.length?rows.map(r=>{const e=state.entries.find(x=>x.id===r.entryId);return `<tr><td>${escapeHTML(new Date(r.createdAt).toLocaleString('en-PH'))}</td><td>${escapeHTML(e?.truckCode||r.entryId)}</td><td>${escapeHTML(r.reason)}</td><td>${escapeHTML(r.createdBy)}</td><td>${escapeHTML(r.status)}</td><td>${r.status==='pending'?`<button class="action-link" data-request-approve="${escapeHTML(r.id)}">Approve void</button> <button class="action-link warn" data-request-reject="${escapeHTML(r.id)}">Reject</button>`:escapeHTML(r.decisionNote||'—')}</td></tr>`;}).join(''):'<tr><td colspan="6">No void requests yet.</td></tr>';
}
async function decideRequest(id,approve){
  if(!requireRole('admin')||!navigator.onLine||!cloud.ready)return toast('Online Admin access is required to decide requests.',true);
  const request=state.requests.find(r=>r.id===id);if(!request||request.status!=='pending')return toast('Request is no longer pending.',true);
  const reason=prompt(approve?'Admin approval note (optional):':'Reason for rejecting this request (required):','');if(reason===null)return;
  if(!approve&&!reason.trim())return toast('A rejection reason is required.',true);
  const entry=currentEntries().find(e=>e.id===request.entryId);if(approve&&!entry)return toast('The referenced entry is no longer active. Reject or investigate.',true);
  const resolution=approve?{...entry,id:uid(),rootId:entry.rootId||entry.id,supersedesId:entry.id,kind:'void',notes:('VOID REASON: '+request.reason+' | ADMIN: '+reason).slice(0,1000),createdAt:Date.now(),createdBy:cloud.user.uid,deviceId:deviceId()}:null;
  const updated={...request,status:approve?'approved':'rejected',reviewedBy:cloud.user.uid,reviewedAt:Date.now(),decisionNote:reason.trim().slice(0,600),resolutionEventId:resolution?.id||''};
  try{
    const batch=cloud.fs.writeBatch(cloud.db);
    if(resolution)batch.set(cloud.fs.doc(cloud.db,'entries',resolution.id),resolution);
    batch.update(cloud.fs.doc(cloud.db,'requests',id),updated);
    await batch.commit();
    if(resolution)await localPut('entries',resolution);
    await localPut('requests',updated);await reload();toast(approve?'Void approved and applied.':'Request rejected.');
  }catch(e){toast('Decision not saved: '+safeError(e),true);}
}

async function checkUpdates(){if(!navigator.onLine)return toast('Internet is required to check for updates.',true);try{const resp=await fetch('./version.json?check='+Date.now(),{cache:'no-store'});if(!resp.ok)throw Error('Version file is not available');const data=await resp.json();if(data.version&&data.version!==VERSION){if(confirm(`Published version ${data.version} differs from installed ${VERSION}. Reload to get the latest app? Ensure local data is backed up first.`)){const reg=await navigator.serviceWorker?.getRegistration();if(reg){await reg.update();reg.waiting?.postMessage('SKIP_WAITING');}const url=new URL(location.href);url.searchParams.set('app-update',data.version);location.replace(url.href);}}else toast('You are using the latest published version ('+VERSION+').');}catch(e){toast('Unable to check updates: '+safeError(e),true);}}
function bindUI(){document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.go)));$('quickAdd').addEventListener('click',()=>{resetEntry();showTab('entry');});for(const id of ['period','dashFrom','dashTo'])$(id).addEventListener('change',renderOverview);for(const id of ['logSearch','logType','logTruck'])$(id).addEventListener(id==='logSearch'?'input':'change',()=>{state.logPage=0;renderLogbook();});$('logPrev').onclick=()=>{state.logPage--;renderLogbook();};$('logNext').onclick=()=>{state.logPage++;renderLogbook();};$('entryTruck').onchange=()=>{if(state.editId)return;const t=state.trucks.find(x=>x.id===$('entryTruck').value);if(t)$('entryTare').value=t.tareKg;entryNet();};for(const id of ['entryTare','entryGross'])$(id).addEventListener('input',entryNet);$('entryForm').addEventListener('submit',ev=>void submitEntry(ev));$('resetEntry').addEventListener('click',resetEntry);$('addFromEntry').onclick=()=>isAdmin()?showTab('fleet'):toast('Ask the Admin to register trucks or drivers.',true);$('analysisQuality').addEventListener('click',ev=>{if(ev.target.closest('[data-review-duplicates]'))reviewDuplicates();});$('clearDuplicateReview').addEventListener('click',clearDuplicateReview);$('logRows').addEventListener('click',ev=>{const b=ev.target.closest('button');if(b?.dataset.edit)editEntry(b.dataset.edit);if(b?.dataset.void)void voidEntry(b.dataset.void);});for(const id of ['reportFrom','reportTo','reportTruck','reportType'])$(id).addEventListener('change',renderReport);$('buildReport').onclick=renderReport;$('printReport').onclick=()=>{renderReport();window.print();};$('exportReport').onclick=()=>exportCSV(reportData(),`landfill-report-${$('reportFrom').value||'all'}-${$('reportTo').value||'all'}.csv`);$('aiPeriod').onchange=renderAnalytics;$('refreshAI').onclick=renderAnalytics;$('truckForm').addEventListener('submit',ev=>void addTruck(ev));$('driverForm').addEventListener('submit',ev=>void addDriver(ev));$('truckRows').onclick=ev=>{const b=ev.target.closest('button');if(b?.dataset.truckEdit)void fleetAction('truck',b.dataset.truckEdit,'edit');if(b?.dataset.truckToggle)void fleetAction('truck',b.dataset.truckToggle,'toggle');};$('driverRows').onclick=ev=>{const b=ev.target.closest('button');if(b?.dataset.driverEdit)void fleetAction('driver',b.dataset.driverEdit,'edit');if(b?.dataset.driverToggle)void fleetAction('driver',b.dataset.driverToggle,'toggle');};$('exportBackup').onclick=()=>void exportBackup();$('importBackup').addEventListener('change',ev=>void importBackup(ev));$('exportAllCSV').onclick=()=>exportCSV(currentEntries().sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)),`landfill-all-records-${phNow().date}.csv`);$('checkUpdates').onclick=()=>void checkUpdates();$('syncNow').onclick=()=>{if(!cloud.user||!cloud.role)return toast('Sign in first.',true);if(!cloud.ready)void connectFirebase();else void flushOutbox();};window.addEventListener('online',()=>{updateStatuses();if(cloud.auth&&cloud.user)void authorizeUser(cloud.user);else if(!cloud.auth)void connectFirebase();});window.addEventListener('offline',updateStatuses);$('loginForm').addEventListener('submit',ev=>void submitLogin(ev));$('signOutTop').onclick=()=>void signOut();$('signOutSettings').onclick=()=>void signOut();$('signOutGate').onclick=()=>void signOut();$('memberForm').addEventListener('submit',ev=>void addMember(ev));$('generateMemberPassword').onclick=generateTemporaryPassword;$('showMemberPassword').onchange=ev=>{$('memberPassword').type=ev.target.checked?'text':'password';};$('editMemberForm').addEventListener('submit',ev=>void saveMemberEdit(ev));$('cancelMemberEdit').onclick=()=>{$('editUserDialog').close?.();$('editUserDialog').hidden=true;};$('userRows').addEventListener('click',ev=>{const e=ev.target.closest('[data-user-edit]'),r=ev.target.closest('[data-user-reset]');if(e)editMember(e.dataset.userEdit);if(r)void sendMemberReset(r.dataset.userReset);});$('requestRows').addEventListener('click',ev=>{const a=ev.target.closest('[data-request-approve]'),r=ev.target.closest('[data-request-reject]');if(a)void decideRequest(a.dataset.requestApprove,true);if(r)void decideRequest(r.dataset.requestReject,false);});}
async function initialize(){try{document.querySelectorAll('[data-app-version]').forEach(el=>el.textContent=VERSION);database=await openDatabase();const now=phNow();for(const id of ['entryDate','reportTo','dashTo'])$(id).value=now.date;for(const id of ['reportFrom','dashFrom'])$(id).value=now.date.slice(0,7)+'-01';$('entryTime').value=now.time;bindUI();await reload();showGate('Checking Firebase authentication…');if('serviceWorker' in navigator&&location.protocol.startsWith('http')){navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline worker registration failed:',e));}void connectFirebase();}catch(e){$('authMessage').textContent='Local storage unavailable. IndexedDB is required for offline weighing. '+safeError(e);document.querySelector('.content').innerHTML=`<div class="panel"><h2>Local storage unavailable</h2><p>IndexedDB is required to save weighing entries. Enable storage or leave private browsing, then reload.</p><p class="danger-text">${escapeHTML(safeError(e))}</p></div>`;}}
initialize();
