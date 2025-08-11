/* Budget Buddy v7 - Multi-page app modeled after Excel template */
(() => {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
  // storage keys
  const TX_KEY = "bb.v7.transactions";           // [{id,date,type,amount,category,description,paymethod,paid}]
  const GLOBAL_BUDGET = "bb.v7.globalBudget";    // {periodType,amount,anchor?}
  const MONTH_BUDGET = "bb.v7.monthBudget";      // map {'YYYY-MM': {periodType, amount}}
  const MONTH_CAT_BUDGETS = "bb.v7.catBudgets";  // map {'YYYY-MM': {cat: amount, ...}}
  const MONTH_CARD_BAL = "bb.v7.cardBalances";   // map {'YYYY-MM': {card: amount, ...}}
  const THEME = "bb.theme";
  // nav state
  const page = document.body.dataset.page;

  const state = {
    items: load(TX_KEY, []),
    theme: localStorage.getItem(THEME) || "dark",
    month: (new Date()).toISOString().slice(0,7) // YYYY-MM
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (state.theme === "light") document.documentElement.classList.add("light");
    // header month control
    const gm = $('#global-month'); if (gm){ gm.value = state.month; gm.addEventListener('input', (e)=>{ state.month = e.target.value || state.month; routeRefresh(); }); }
    // nav active
    document.querySelectorAll('.nav a').forEach(a => { if (a.dataset.nav === page) a.classList.add('active'); });

    // header controls
    $('#toggle-theme')?.addEventListener('click', () => {
      document.documentElement.classList.toggle('light');
      const isLight = document.documentElement.classList.contains('light');
      localStorage.setItem(THEME, isLight ? 'light' : 'dark');
    });
    $('#export-csv')?.addEventListener('click', exportCSVAll);

    // page routers
    if (page === 'dashboard') initDashboard();
    if (page === 'transactions') initTransactions();
    if (page === 'budgets') initBudgets();
    if (page === 'cards') initCards();
    if (page === 'reports') initReports();
  });

  function routeRefresh(){ // lightweight page reload
    if (page === 'dashboard') renderDashboard();
    if (page === 'transactions') renderTransactions();
    if (page === 'budgets') renderBudgets();
    if (page === 'cards') renderCards();
    if (page === 'reports') renderReports();
  }

  // ---------- Storage helpers ----------
  function load(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch{ return fallback; } }
  function save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

  // ---------- Common helpers ----------
  function fmt(n){ return (n||0).toLocaleString(undefined,{style:'currency',currency:'USD'}); }
  function toYMD(d){ const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${m}-${day}`; }
  function toMDY(d){ const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${m}/${day}/${d.getFullYear()}`; }
  function parseUserDate(s){ const m=s.match(/^\s*(\d{1,2})[\/](\d{1,2})[\/](\d{4})\s*$/); if(!m) return null; const d=new Date(+m[3], +m[1]-1, +m[2]); if(d.getFullYear()!=+m[3]||d.getMonth()!=+m[1]-1||d.getDate()!=+m[2]) return null; return d; }
  function csvEsc(s){ const t=String(s).replace(/"/g,'""'); return /[",\n]/.test(t)?`"${t}"`:t; }
  function percentPair(used, budget){ const usedPct = budget>0? Math.min(100, (used/budget)*100) : 0; const leftPct = budget>0? Math.max(0, 100 - (used/budget)*100) : 0; return [usedPct, leftPct]; }

  // ---------- Dashboard ----------
  function initDashboard(){
    // quick add
    $('input[name="date"]').value = toYMD(new Date());
    $('#category-select').addEventListener('change', ()=>{
      const v = $('#category-select').value, c=$('#category-custom');
      if (v==='__custom__'){ c.style.display='block'; c.focus(); } else { c.style.display='none'; c.value=''; }
    });
    $('#tx-form').addEventListener('submit', (e)=>{
      e.preventDefault();
      const f=e.target;
      const item = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(16).slice(2),
        date: f.date.value,
        type: f.type.value,
        amount: (f.type.value==='expense' ? -Math.abs(parseFloat(f.amount.value)) : Math.abs(parseFloat(f.amount.value))),
        category: (f.category.value==='__custom__' ? $('#category-custom').value : f.category.value).trim(),
        description: f.description.value.trim(),
        paymethod: f.paymethod.value,
        paid: f.paid.value === 'yes'
      };
      if (!item.date || !item.category || !isFinite(item.amount)) return;
      state.items.push(item); save(TX_KEY, state.items);
      f.reset(); $('input[name="date"]').value = toYMD(new Date());
      renderDashboard();
      alert('Saved!');
    });

    // global budget modal
    $('#set-global-budget').addEventListener('click', ()=> toggleGlobalOverlay(true));
    $('#global-cancel').addEventListener('click', ()=> toggleGlobalOverlay(false));
    $('#global-period').addEventListener('change', ()=> $('#global-anchor-wrap').style.display = ($('#global-period').value==='biweekly') ? 'block' : 'none');
    $('#global-save').addEventListener('click', ()=>{
      const type=$('#global-period').value; const amount=parseFloat($('#global-amount').value); let anchor=$('#global-anchor').value.trim();
      if (!isFinite(amount)||amount<=0) return;
      if (type==='biweekly'){ const d=parseUserDate(anchor); if(!d){ alert('Invalid date. Use MM/DD/YYYY.'); return; } anchor = toYMD(d); } else anchor=null;
      save(GLOBAL_BUDGET, {periodType:type, amount, anchor}); toggleGlobalOverlay(false); renderDashboard();
    });

    renderDashboard();
  }

  function toggleGlobalOverlay(show){
    const ov=$('#overlay-global');
    if (show){
      const b = load(GLOBAL_BUDGET, null) || {periodType:'monthly',amount:'',anchor:null};
      $('#global-period').value=b.periodType||'monthly'; $('#global-amount').value=b.amount||''; $('#global-anchor').value=b.anchor?toMDY(new Date(b.anchor)):'';
      $('#global-anchor-wrap').style.display = ($('#global-period').value==='biweekly') ? 'block' : 'none';
      ov.removeAttribute('hidden');
    } else ov.setAttribute('hidden','');
  }

  function renderDashboard(){
    // summary for selected month
    const rows = state.items.filter(it => it.date.startsWith(state.month));
    const income = rows.filter(x=>x.amount>0).reduce((a,b)=>a+b.amount,0);
    const expenses = rows.filter(x=>x.amount<0).reduce((a,b)=>a+Math.abs(b.amount),0);
    $('#sum-income').textContent = fmt(income);
    $('#sum-expense').textContent = fmt(expenses);
    $('#sum-net').textContent = fmt(income - expenses);
    const [usedPct, leftPct] = percentPair(expenses, Math.max(income, 1)); // relative to income
    $('#pct-used-left').textContent = `${usedPct.toFixed(0)}%`;
    $('#pct-left-right').textContent = `${leftPct.toFixed(0)}%`;
    const bar = $('#pct-bar'); bar.className='progress'+(usedPct<60?'':usedPct<90?' warn':' bad'); bar.querySelector('.bar').style.width = `${usedPct.toFixed(0)}%`;

    // period card
    renderPeriodCard();
  }

  function renderPeriodCard(){
    const card = $('#period-card'); card.innerHTML='';
    const b = load(GLOBAL_BUDGET, null);
    const btn = document.createElement('button'); btn.id='set-global-budget'; btn.className='ghost small'; btn.textContent='Set Budget';
    btn.addEventListener('click', ()=> toggleGlobalOverlay(true));
    if (!b){ card.appendChild(btn); return; }

    const range = getPeriodRange(b.periodType, new Date(), b.anchor);
    const spent = sumExpensesBetween(toYMD(range.start), toYMD(range.end));
    const [usedPct,leftPct] = percentPair(spent, b.amount);
    const left = Math.max(0, b.amount - spent);

    const row=document.createElement('div'); row.className='row'; row.style.justifyContent='space-between';
    row.innerHTML = `<div class="muted">Used ${fmt(spent)} • Left ${fmt(left)}</div><div class="percent-row"><span>${usedPct.toFixed(0)}%</span><span class="muted">${leftPct.toFixed(0)}%</span></div>`;
    const pb=document.createElement('div'); pb.className='progress'+(usedPct<60?'':usedPct<90?' warn':' bad'); pb.innerHTML=`<div class="bar" style="width:${usedPct.toFixed(0)}%"></div>`;
    const meta=document.createElement('div'); meta.className='muted'; meta.textContent = `${fmt(b.amount)} • ${label(b.periodType)} ${toMDY(range.start)}–${toMDY(range.end)}`;

    card.appendChild(row); card.appendChild(pb); card.appendChild(meta); card.appendChild(btn);
  }

  function label(p){ if (p==='weekly') return 'Weekly'; if (p==='biweekly') return 'Bi-weekly'; if (p==='semimonthly') return 'Semi-monthly'; return 'Monthly'; }
  function getPeriodRange(type, today, anchorYmd){
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (type==='weekly'){ const day=d.getDay(); const start=new Date(d); start.setDate(d.getDate()-day); const end=new Date(start); end.setDate(start.getDate()+6); return {start,end}; }
    if (type==='biweekly'){
      const anchor=anchorYmd?new Date(anchorYmd):d; const ms=86400000; let start=new Date(anchor);
      if (d<start){ while(d<start){ start=new Date(start.getTime()-14*ms);} } else { while(new Date(start.getTime()+14*ms)<=d){ start=new Date(start.getTime()+14*ms);} }
      const end=new Date(start.getTime()+13*ms); return {start,end};
    }
    if (type==='semimonthly'){ const day=d.getDate(); if (day<=15) return {start:new Date(d.getFullYear(),d.getMonth(),1), end:new Date(d.getFullYear(),d.getMonth(),15)};
      return {start:new Date(d.getFullYear(),d.getMonth(),16), end:new Date(d.getFullYear(),d.getMonth()+1,0)}; }
    return {start:new Date(d.getFullYear(),d.getMonth(),1), end:new Date(d.getFullYear(),d.getMonth()+1,0)};
  }
  function sumExpensesBetween(sY,eY){ return state.items.filter(it=>it.amount<0 && it.date>=sY && it.date<=eY).reduce((a,b)=>a+Math.abs(b.amount),0); }

  // ---------- Transactions ----------
  function initTransactions(){ renderTransactions(); }
  function renderTransactions(){
    $('#month-label').textContent = state.month;
    const tbody = $('#tx-table tbody'); tbody.innerHTML='';
    const rows = state.items.filter(it => it.date.startsWith(state.month)).sort((a,b)=> a.date<b.date?1:-1);
    rows.forEach(it => {
      const tr=document.createElement('tr'); tr.dataset.id=it.id;
      tr.innerHTML = `<td>${it.date}</td><td><span class="badge">${it.type}</span></td><td>${escape(it.paymethod||'')}</td><td>${escape(it.category)}</td><td>${escape(it.description||'')}</td><td class="right">${fmt(Math.abs(it.amount))}</td><td>${it.paid?'Yes':'No'}</td><td><button data-act="edit">Edit</button><button data-act="del" class="danger">Delete</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-act="del"]').forEach(btn => btn.addEventListener('click', e => {
      const id = e.target.closest('tr').dataset.id; state.items = state.items.filter(x=>x.id!==id); save(TX_KEY, state.items); renderTransactions(); }));
    tbody.querySelectorAll('button[data-act="edit"]').forEach(btn => btn.addEventListener('click', e => {
      const tr = e.target.closest('tr'); const id = tr.dataset.id; const it = state.items.find(x=>x.id===id);
      tr.innerHTML = `<td><input type="date" value="${it.date}" data-f="date" /></td>
        <td><select data-f="type"><option value="income" ${it.amount>0?'selected':''}>Income</option><option value="expense" ${it.amount<0?'selected':''}>Expense</option></select></td>
        <td><input type="text" value="${escape(it.paymethod||'')}" data-f="pay" /></td>
        <td><input type="text" value="${escape(it.category)}" data-f="cat" /></td>
        <td><input type="text" value="${escape(it.description||'')}" data-f="desc" /></td>
        <td class="right"><input type="number" step="0.01" value="${Math.abs(it.amount)}" data-f="amt" /></td>
        <td><select data-f="paid"><option value="yes" ${it.paid?'selected':''}>Yes</option><option value="no" ${!it.paid?'selected':''}>No</option></select></td>
        <td><button data-act="save" class="primary">Save</button><button data-act="cancel">Cancel</button></td>`;
      tr.querySelector('button[data-act="save"]').addEventListener('click', ()=>{
        const d=tr.querySelector('[data-f="date"]').value; const ty=tr.querySelector('[data-f="type"]').value;
        const pay=tr.querySelector('[data-f="pay"]').value.trim(); const cat=tr.querySelector('[data-f="cat"]').value.trim();
        const ds=tr.querySelector('[data-f="desc"]').value.trim(); const amt=parseFloat(tr.querySelector('[data-f="amt"]').value);
        const paid=tr.querySelector('[data-f="paid"]').value==='yes';
        if (!d.startsWith(state.month) || !d || !cat || !isFinite(amt)) return;
        const idx=state.items.findIndex(x=>x.id===id);
        state.items[idx] = { id, date:d, type:ty, amount: ty==='expense' ? -Math.abs(amt) : Math.abs(amt), category:cat, description:ds, paymethod:pay, paid };
        save(TX_KEY, state.items); renderTransactions();
      });
      tr.querySelector('button[data-act="cancel"]').addEventListener('click', renderTransactions);
    }));
  }

  // ---------- Budgets ----------
  function initBudgets(){
    $('#budget-form').addEventListener('submit', (e)=>{
      e.preventDefault();
      const map = load(MONTH_CAT_BUDGETS, {});
      map[state.month] = map[state.month] || {};
      document.querySelectorAll('[data-bc]').forEach(inp => {
        const k = inp.getAttribute('data-bc');
        const v = parseFloat(inp.value); map[state.month][k] = isFinite(v)? v : 0;
      });
      save(MONTH_CAT_BUDGETS, map);
      renderBudgets();
      alert('Category budgets saved.');
    });
    renderBudgets();
  }

  function renderBudgets(){
    $('#month-label').textContent = state.month;
    const map = load(MONTH_CAT_BUDGETS, {});
    const catBudget = map[state.month] || {};
    // hydrate inputs
    document.querySelectorAll('[data-bc]')?.forEach(inp => { const k=inp.getAttribute('data-bc'); inp.value = catBudget[k] ?? ''; });

    const groups = [
      { el: '#group1', cats: ['Gas','Entertainment','Amazon','Others'] },
      { el: '#group2', cats: ['Supermarket','Target','Walmart'] },
      { el: '#group3', cats: ['Personal'] },
    ];
    let totalBudget = 0, totalSpent = 0;

    groups.forEach(g => {
      const container = $(g.el); container.innerHTML='';
      const tbl=document.createElement('table'); const tb=document.createElement('tbody');
      g.cats.forEach(c => {
        const spent = sumSpentInMonthByCategory(state.month, c);
        const budget = catBudget[c] || 0;
        totalSpent += spent; totalBudget += budget;
        const left = Math.max(0, budget - spent);
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${escape(c)}</td><td class="right">${fmt(spent)}</td><td class="right">${fmt(budget)}</td><td class="right">${fmt(left)}</td>`;
        tb.appendChild(tr);
      });
      tbl.innerHTML = '<thead><tr><th>Category</th><th class="right">Spent</th><th class="right">Budget</th><th class="right">Left</th></tr></thead>';
      tbl.appendChild(tb); container.appendChild(tbl);
      // group total row
      const tr=document.createElement('tr'); tr.innerHTML=`<td><b>Total</b></td><td class="right" colspan="3">${fmt(g.cats.reduce((a,c)=>a+sumSpentInMonthByCategory(state.month,c),0))}</td>`;
      tb.appendChild(tr);
    });

    const [usedPct, leftPct] = percentPair(totalSpent, totalBudget);
    $('#split-used-left').textContent = `${usedPct.toFixed(0)}%`; $('#split-left-right').textContent = `${leftPct.toFixed(0)}%`;
    const bar = $('#split-bar'); bar.className='progress'+(usedPct<60?'':usedPct<90?' warn':' bad'); bar.querySelector('.bar').style.width = `${usedPct.toFixed(0)}%`;
    $('#split-used').textContent = fmt(totalSpent); $('#split-left').textContent = fmt(Math.max(0, totalBudget-totalSpent)); $('#split-budget').textContent = fmt(totalBudget);
  }
  function sumSpentInMonthByCategory(month, cat){
    return state.items.filter(it => it.date.startsWith(month) && it.amount<0 && it.category===cat).reduce((a,b)=>a+Math.abs(b.amount),0);
  }

  // ---------- Cards ----------
  function initCards(){
    $('#card-form').addEventListener('submit', (e)=>{
      e.preventDefault();
      const data = load(MONTH_CARD_BAL, {});
      data[state.month] = data[state.month] || {};
      document.querySelectorAll('[data-card]').forEach(inp => {
        const k=inp.getAttribute('data-card'); const v=parseFloat(inp.value);
        data[state.month][k] = isFinite(v) ? v : 0;
      });
      save(MONTH_CARD_BAL, data);
      renderCards();
      alert('Card balances saved.');
    });
    renderCards();
  }
  function renderCards(){
    $('#month-label').textContent = state.month;
    const data = load(MONTH_CARD_BAL, {}); const m = data[state.month] || {};
    const cards = ['Unpaid','Amex Plat','Amex Gold','Amex Blue','Amex Hilton','CSP','CFF','CFU'];
    // populate inputs
    document.querySelectorAll('[data-card]')?.forEach(inp => { const k=inp.getAttribute('data-card'); inp.value = m[k] ?? ''; });
    const div = $('#card-balances'); div.innerHTML='';
    const tbl=document.createElement('table'); const tb=document.createElement('tbody');
    let total=0;
    cards.forEach(c => { const v=m[c]||0; total+=v; const tr=document.createElement('tr'); tr.innerHTML=`<td>${escape(c)}</td><td class="right">${fmt(v)}</td>`; tb.appendChild(tr); });
    const tr=document.createElement('tr'); tr.innerHTML=`<td><b>Total</b></td><td class="right"><b>${fmt(total)}</b></td>`; tb.appendChild(tr);
    tbl.innerHTML = '<thead><tr><th>Card</th><th class="right">Amount</th></tr></thead>'; tbl.appendChild(tb); div.appendChild(tbl);
  }

  // ---------- Reports ----------
  function initReports(){
    $('#open-month').addEventListener('click', (e)=>{ e.preventDefault(); const v=$('#month-pick').value; if(!v) return; state.month=v; renderReports(); });
    $('#open-current').addEventListener('click', (e)=>{ e.preventDefault(); const m=(new Date()).toISOString().slice(0,7); state.month=m; renderReports(); });
    renderReports();
  }
  function renderReports(){
    $('#month-pick').value = state.month;
    $('#report-title').textContent = `Summary for ${state.month}`;
    const rows = state.items.filter(it => it.date.startsWith(state.month));
    const income = rows.filter(x=>x.amount>0).reduce((a,b)=>a+b.amount,0);
    const expense = rows.filter(x=>x.amount<0).reduce((a,b)=>a+Math.abs(b.amount),0);
    $('#r-income').textContent = fmt(income); $('#r-expense').textContent = fmt(expense); $('#r-net').textContent = fmt(income-expense);

    // month budget
    const map = load(MONTH_BUDGET, {}); const b = map[state.month] || {periodType:'monthly', amount: 0};
    $('#r-label').textContent = (b.periodType? ({weekly:'Weekly',biweekly:'Bi-weekly',semimonthly:'Semi-monthly'}[b.periodType] || 'Monthly') : 'Monthly');
    $('#r-budget').textContent = fmt(b.amount||0);
    const [usedPct, leftPct] = percentPair(expense, b.amount||0);
    $('#r-used-left').textContent = `${usedPct.toFixed(0)}%`; $('#r-left-right').textContent = `${leftPct.toFixed(0)}%`;
    const bar=$('#r-bar'); bar.className='progress'+(usedPct<60?'':usedPct<90?' warn':' bad'); bar.querySelector('.bar').style.width = `${usedPct.toFixed(0)}%`;
    $('#r-used').textContent = fmt(expense); $('#r-left').textContent = fmt(Math.max(0, (b.amount||0) - expense));

    // category totals
    const catMap = {};
    rows.filter(x=>x.amount<0).forEach(x => { catMap[x.category] = (catMap[x.category]||0) + Math.abs(x.amount); });
    const tb = $('#r-cats tbody'); tb.innerHTML = '';
    Object.keys(catMap).sort((a,b)=> a.localeCompare(b)).forEach(k => {
      const tr=document.createElement('tr'); tr.innerHTML=`<td>${escape(k)}</td><td class="right">${fmt(catMap[k])}</td>`; tb.appendChild(tr);
    });
  }

  // ---------- CSV ----------
  function exportCSVAll(){
    const headers = ['Date','Type','Payment','Category','Description','Paid','Amount'];
    const rows = [...state.items].sort((a,b)=> a.date<b.date?1:-1).map(it => [
      it.date, it.amount>0?'income':'expense', csvEsc(it.paymethod||''), csvEsc(it.category), csvEsc(it.description||''), it.paid?'yes':'no', (it.amount/1).toFixed(2)
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download='budget.csv'; a.click(); URL.revokeObjectURL(url);
  }

  // ---------- Utils ----------
  function escape(s){ return String(s).replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[m]); }
})();