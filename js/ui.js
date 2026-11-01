// Navegação por abas de vidro + contagem animada dos KPIs
const VIEWS=['home','tx','stats','budget','wealth'];let curView=0;
function placePill(){const d=document.getElementById('dock'),bs=d.querySelectorAll('button'),p=d.querySelector('.pill');
  bs.forEach((x,i)=>x.classList.toggle('on',i===curView));const b=bs[curView];
  p.style.width=b.offsetWidth+'px';p.style.transform=`translateX(${b.offsetLeft-6}px)`;}
function showView(i){const old=curView;curView=i;
  VIEWS.forEach((v,k)=>{const el=document.getElementById('view-'+v);el.classList.remove('active','from-left');
    if(k===i){void el.offsetWidth;el.classList.add('active');if(i<old)el.classList.add('from-left');}});
  placePill();window.scrollTo({top:0,behavior:'smooth'});
  setTimeout(()=>{[categoryChartInstance,annualChartInstance,wealthChartInstance].forEach(c=>c&&c.resize())},60);}
window.addEventListener('resize',placePill);
// Count-up: observa mudanças de texto nos KPIs
const _fmt=s=>parseFloat(s.replace(/[^\d,-]/g,'').replace(',','.'))||0;
function animateKpi(el){if(el._busy)return;if(typeof PRIV!=='undefined'&&PRIV)return;const to=_fmt(el.textContent),from=el._last??0;if(from===to){el._last=to;return}
  el._busy=1;const t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/700),e=1-Math.pow(1-k,3),v=from+(to-from)*e;
    el.textContent=formatBRL(v);if(k<1)requestAnimationFrame(f);else{el.textContent=formatBRL(to);el._last=to;setTimeout(()=>el._busy=0)}})(t0);}
['kpi-income','kpi-expenses','kpi-balance'].forEach(id=>{const el=document.getElementById(id);
  new MutationObserver(()=>{if(!el._busy)animateKpi(el)}).observe(el,{childList:true});});
document.fonts.ready.then(()=>{showView(0)});

// ===== Gráficos redesenhados (sobrescreve renderCharts do app.js) =====
const PAL=['#22d3ee','#a78bfa','#f472b6','#34d399','#fbbf24','#60a5fa','#fb7185','#2dd4bf','#f97316','#c084fc','#84cc16','#38bdf8','#e879f9','#facc15'];
const short=v=>Math.abs(v)>=1000?(v/1000).toFixed(v%1000?1:0)+'k':String(Math.round(v));
const centerPlugin={id:'ct',afterDraw(c){if(c.config.type!=='doughnut'||!c.$tot)return;const{ctx,chartArea:a}=c,x=(a.left+a.right)/2,y=(a.top+a.bottom)/2;
  ctx.save();ctx.textAlign='center';ctx.fillStyle='#8b97b8';ctx.font='600 10px Inter';ctx.fillText('TOTAL DO MÊS',x,y-12);
  ctx.fillStyle='#fff';ctx.font='800 17px Inter';ctx.fillText(formatBRL(c.$tot),x,y+10);ctx.restore();}};
const tip={backgroundColor:'rgba(6,9,24,.92)',borderColor:'rgba(255,255,255,.14)',borderWidth:1,padding:12,cornerRadius:14,titleColor:'#fff',bodyColor:'#cbd5e1',displayColors:true,boxPadding:4,callbacks:{label:c=>` ${c.dataset.label?c.dataset.label+': ':''}${formatBRL(c.parsed.y??c.parsed)}`}};
function grad(c,a,b){const A=c.chart.chartArea;if(!A)return a;const g=c.chart.ctx.createLinearGradient(0,A.bottom,0,A.top);g.addColorStop(0,b);g.addColorStop(1,a);return g}
function renderCharts(outflows){
  const mk=getMonthKey(currentYear,currentMonth),mTxs=state.transactions.filter(t=>t.monthKey===mk);
  const income=mTxs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0)+(state.salariesP1[mk]||0)+(state.salariesP2[mk]||0);
  const exp=outflows.filter(t=>t.type!=='investment'),totalExp=exp.reduce((s,t)=>s+t.amount,0);
  // Categorias
  const g={};outflows.forEach(t=>g[t.category]=(g[t.category]||0)+t.amount);
  const ent=Object.entries(g).sort((a,b)=>b[1]-a[1]),tot=ent.reduce((s,e)=>s+e[1],0);
  if(categoryChartInstance)categoryChartInstance.destroy();
  categoryChartInstance=new Chart(document.getElementById('categoryChart').getContext('2d'),{type:'doughnut',plugins:[centerPlugin],
    data:{labels:ent.length?ent.map(e=>e[0]):['Sem gastos'],datasets:[{data:ent.length?ent.map(e=>e[1]):[1],backgroundColor:ent.length?ent.map((e,i)=>catColor(e[0])):['rgba(255,255,255,.08)'],borderWidth:0,spacing:3,borderRadius:8,hoverOffset:8}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'76%',plugins:{legend:{display:false},tooltip:{...tip,callbacks:{label:c=>` ${formatBRL(c.parsed)}`}}},animation:{duration:900}}});
  categoryChartInstance.$tot=tot;categoryChartInstance.update('none');
  const mx=ent[0]?ent[0][1]:1;
  document.getElementById('cat-rank').innerHTML=ent.length?ent.slice(0,6).map((e,i)=>`<div class="rk"><i style="background:${catColor(e[0])};box-shadow:0 0 10px ${catColor(e[0])}"></i><span class="text-slate-200">${escapeHtml(catLabel(e[0]))}</span><strong>${formatBRL(e[1])}<em>${(e[1]/tot*100).toFixed(0)}%</em></strong><div class="bar"><u style="width:${e[1]/mx*100}%;background:linear-gradient(90deg,${catColor(e[0])},${catColor(e[0])}55)"></u></div></div>`).join(''):'<p class="text-xs text-slate-500 text-center">Sem gastos neste mês.</p>';
  // Insights
  const big=[...exp].sort((a,b)=>b.amount-a.amount)[0],now=new Date(),isNow=now.getFullYear()===currentYear&&now.getMonth()===currentMonth;
  const days=isNow?now.getDate():new Date(currentYear,currentMonth+1,0).getDate(),save=income>0?(income-totalExp)/income*100:0;
  const chip=(l,v,sub,c)=>`<div class="ins"><small>${l}</small><b style="color:${c}">${v}</b><span>${sub}</span></div>`;
  document.getElementById('insights').innerHTML=
    chip('Maior categoria',ent[0]?escapeHtml(catLabel(ent[0][0]).split(/[ ,&]/)[0]):'—',ent[0]?formatBRL(ent[0][1]):'sem dados','#22d3ee')+
    chip('Maior gasto',big?formatBRL(big.amount):'—',big?escapeHtml(big.desc):'sem dados','#f472b6')+
    chip('Média por dia',formatBRL(totalExp/days),`em ${days} dias`,'#a78bfa')+
    chip('Taxa de poupança',income>0?save.toFixed(0)+'%':'—',save>=20?'acima da meta de 20%':'meta: 20% da renda',save>=20?'#34d399':'#fbbf24');
  // Anual: barras em gradiente + linha de saldo
  const inc=[],out=[],net=[];
  for(let m=0;m<12;m++){const M=monthMetrics(currentYear,m);inc.push(M.income);out.push(M.exp+M.inv);net.push(M.total);}
  if(annualChartInstance)annualChartInstance.destroy();
  const dim=(c,a,b)=>c.dataIndex===currentMonth?grad(c,a,b):grad(c,a+'88',b+'22');
  annualChartInstance=new Chart(document.getElementById('annualChart').getContext('2d'),{data:{labels:MONTH_SHORT,datasets:[
    {type:'line',label:'Saldo acumulado',data:net,borderColor:'#22d3ee',backgroundColor:'#22d3ee',tension:.4,borderWidth:2.5,pointRadius:3,pointHoverRadius:6,order:0},
    {type:'bar',label:'Renda',data:inc,backgroundColor:c=>dim(c,'#34d399','#0e7490'),borderRadius:8,borderSkipped:false,barPercentage:.7,order:1},
    {type:'bar',label:'Saídas + aportes',data:out,backgroundColor:c=>dim(c,'#f472b6','#6d28d9'),borderRadius:8,borderSkipped:false,barPercentage:.7,order:1}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      scales:{x:{ticks:{color:'#8b97b8',font:{size:10}},grid:{display:false},border:{display:false}},y:{ticks:{color:'#64748b',font:{size:10},callback:short},grid:{color:'rgba(255,255,255,.05)'},border:{display:false}}},
      plugins:{legend:{labels:{color:'#cbd5e1',font:{size:10},boxWidth:8,usePointStyle:true}},tooltip:tip},animation:{duration:900}}});
}
