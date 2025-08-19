    // ===== Utilities =====
    const $ = (sel, root=document) => root.querySelector(sel);
    const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
    function el(tag, props={}) { const node = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'dataset' && v && typeof v === 'object') { for (const [dk, dv] of Object.entries(v)) node.setAttribute('data-' + dk.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), dv);} else if (k === 'style' && typeof v === 'string') { node.setAttribute('style', v);} else if (k in node) { try { node[k] = v; } catch { node.setAttribute(k, v); } } else { node.setAttribute(k, v);} } return node; }
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));


    const app = angular.module('rsSim', []);

    app.constant('ALL_SKILLS', [
      'Attack', 'Hitpoints', 'Mining', 'Strength', 'Agility', 'Smithing', 'Defence', 'Herblore', 'Fishing','Ranged','Thieving','Cooking','Prayer','Crafting','Firemaking','Magic','Fletching','Woodcutting','Runecraft','Slayer','Farming','Construction','Hunter'
    ]);

    app.constant('SKILL_ICONS', {
      Attack:'⚔️', Defence:'🛡️', Strength:'💪', Hitpoints:'❤️', Ranged:'🏹', Prayer:'🙏', Magic:'✨',
      Cooking:'🍳', Woodcutting:'🪓', Fletching:'🏹', Fishing:'🐟', Firemaking:'🔥', Crafting:'🧵', Smithing:'⚒️', Mining:'⛏️',
      Herblore:'🌿', Agility:'🌀', Thieving:'🕵️', Slayer:'😈', Farming:'🌾', Runecraft:'🧙', Hunter:'🐾', Construction:'🏠'
    });

    const MAX_LEVEL = 99; const XP_TABLE = (()=>{ const a=[0]; let p=0; for(let l=1;l<=MAX_LEVEL;l++){ p += Math.floor(l + 300*Math.pow(2, l/7)); a[l]=Math.floor(p/4);} return a; })();
    function levelForXp(x){ for(let l=1;l<=MAX_LEVEL;l++){ if (x < XP_TABLE[l]) return l-1; } return MAX_LEVEL; }

    app.factory('State', function($window, $rootScope, ALL_SKILLS){
      const KEY='rs-bot-sim';
      const DEFAULT = { version:6, wallpaper:0, accounts:[], archivedAccounts:[], activeAccountId:null, lastAccountCreatedAt:0, notes:'',
        scriptsOwned:{},
        game:{ realStartedAt: Date.now(), speed:1 },
        economy:{ rune: 5000, spent:0, earned:0, transactions:[] },
        totals:{ baselineLevels:0, botsStarted:0 }
      };
      function load(){
        try{
          const raw=$window.localStorage.getItem(KEY); if(!raw) return DEFAULT;
          const parsed=JSON.parse(raw);
          if(!parsed.version || parsed.version<6){ parsed.version=6; if(!parsed.accounts) parsed.accounts=[]; if(!parsed.archivedAccounts) parsed.archivedAccounts=[]; if(!parsed.game) parsed.game={ realStartedAt: Date.now(), speed:1 }; if(!parsed.economy) parsed.economy={ rune:5000, spent:0, earned:0, transactions:[] }; if(!parsed.economy.transactions) parsed.economy.transactions=[]; if(!parsed.totals) parsed.totals={ baselineLevels:0, botsStarted:0 }; if(!parsed.scriptsOwned) parsed.scriptsOwned={}; }
          if(!parsed.scriptsOwned) parsed.scriptsOwned={};
          parsed.accounts.forEach(acc=>{ if(!acc.skills){ acc.skills={}; } ALL_SKILLS.forEach(s=>{ if(typeof acc.skills[s]!== 'number') acc.skills[s]=0; }); if(!Array.isArray(acc.sessions)) acc.sessions=[]; if(!acc.bot) acc.bot=null; if(acc.risk==null) acc.risk=0; if(acc.banned==null) acc.banned=false; if(acc.sold==null) acc.sold=false; if(acc.fav==null) acc.fav=false; if(acc.gold==null) acc.gold=0; if(!acc.botUsage) acc.botUsage={}; if(acc.baselineLevel==null){ acc.baselineLevel = ALL_SKILLS.reduce((t,k)=> t + levelForXp(acc.skills[k]||0), 0); } acc.sessions.forEach(s=>{ if(!s.sid) s.sid=(crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); }); });
          return Object.assign({}, DEFAULT, parsed);
        } catch(e){ console.warn('Failed to load state', e); return DEFAULT; }
      }
      const STATE = load();
      function save(){ $window.localStorage.setItem(KEY, JSON.stringify(STATE)); }
      function canCreateAccount(){ return (Date.now() - STATE.lastAccountCreatedAt) >= 5*60*1000; }
      function uniqueName(name){ return !STATE.accounts.some(a=>a.name.toLowerCase()===name.toLowerCase()); }
      function createAccount(name){ if(!canCreateAccount()) return null; if(!name) return null; if(!uniqueName(name)) return null; const acc = { id: (crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)), name, createdAt: Date.now(), skills:{}, sessions:[], bot:null, risk:0, gold:0, banned:false, sold:false, fav:false, botUsage:{}, baselineLevel:0 }; ALL_SKILLS.forEach(s=>acc.skills[s]=0); acc.baselineLevel = ALL_SKILLS.reduce((t,k)=> t + levelForXp(acc.skills[k]||0), 0); STATE.accounts.push(acc); STATE.activeAccountId = STATE.activeAccountId || acc.id; STATE.lastAccountCreatedAt = Date.now(); save(); $rootScope.$broadcast('state:changed'); return acc; }
      function hoursBottedTotal(acc){ let total=0; const now=Date.now(); (acc.sessions||[]).forEach(s=>{ const end = s.endedAt || now; total += Math.max(0, end - s.startedAt); }); return total/3600000; }
      function hoursBotted24h(acc){ const now=Date.now(), start24 = now-24*3600000; let total=0; (acc.sessions||[]).forEach(s=>{ const a=Math.max(s.startedAt, start24); const b=Math.min(s.endedAt||now, now); if(b>a) total += (b-a); }); return total/3600000; }
      function totalLevel(acc){ return ALL_SKILLS.reduce((sum,s)=> sum + levelForXp(acc.skills[s]||0), 0); }
      function accountStatus(acc){ if(acc.banned) return 'Banned'; if(acc.sold) return 'Sold'; if(acc.bot && acc.bot.running) return 'Active (Botting)'; return 'Active'; }
      function startBot(acc, scriptKey, script){ if(acc.banned || acc.sold) return false; if(acc.bot && acc.bot.running) return false; if(script.goldPerHour<0 && (acc.gold||0) + script.goldPerHour/60 < 0) return false; const sid=(crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)); acc.bot = { scriptKey, startedAt: Date.now(), xpPerMin: script.xpPerMin, skill: script.skill, costRunePerMin: script.costRunePerMin||2, goldPerHour: script.goldPerHour||0, running: true, sid }; acc.sessions.push({ sid, scriptKey, startedAt: Date.now(), endedAt: null, costPerMin: (script.costRunePerMin||2) }); acc.botUsage[scriptKey] = (acc.botUsage[scriptKey]||0)+1; STATE.totals.botsStarted += 1; save(); $rootScope.$broadcast('state:changed'); return true; }
      function upsertSessionTxn(acc, session, finalized){ if(!session||!acc) return; const elapsedMins = ((session.endedAt||Date.now()) - session.startedAt)/60000; const amount = - (session.costPerMin||0) * elapsedMins; let t = STATE.economy.transactions.find(x=>x.sessionId===session.sid && x.kind==='session'); if(!t){ t = { ts: Date.now(), type:'out', amount: +amount.toFixed(4), accountId: acc.id, accountName: acc.name, scriptKey: session.scriptKey, scriptName: (window.Scripts && window.Scripts[session.scriptKey] && window.Scripts[session.scriptKey].name) || session.scriptKey, durationMins: elapsedMins, sessionId: session.sid, kind:'session', finalized: !!finalized }; STATE.economy.transactions.push(t); } else { t.ts = Date.now(); t.amount = +amount.toFixed(4); t.durationMins = elapsedMins; t.finalized = !!finalized; }
        save(); }
      function stopBot(acc){ if(!acc || !acc.bot || !acc.bot.running) return false; const sess=[...acc.sessions].reverse().find(s=>!s.endedAt); if(sess){ sess.endedAt=Date.now(); upsertSessionTxn(acc, sess, true); } acc.bot.running=false; save(); $rootScope.$broadcast('state:changed'); return true; }
      function overall(){
        const liveLevels = STATE.accounts.reduce((sum,a)=> sum + (totalLevel(a) - (a.baselineLevel||0)), 0);
        const archivedLevels = STATE.archivedAccounts.reduce((sum,a)=> sum + ((a.finalLevel||0) - (a.baselineLevel||0)), 0);
        const levelsGained = liveLevels + archivedLevels;
        const botsUsed = STATE.totals.botsStarted;
        return { levelsGained, botsUsed, spent: STATE.economy.spent, earned: STATE.economy.earned, rune: STATE.economy.rune };
      }
      return { data: STATE, save, canCreateAccount, createAccount, uniqueName, startBot, stopBot, hoursBottedTotal, hoursBotted24h, totalLevel, levelForXp, XP_TABLE, ALL_SKILLS, overall, accountStatus, upsertSessionTxn };
    });

    // Scripts catalog (with RuneCoin costs)
    const Scripts = {
      woodcutting_basic:{ name:'Willow Chopper', skill:'Woodcutting', xpPerMin:30*60, risk:8, icon:'🌳', costRunePerMin:2, goldPerHour:3000, fav:false, free:true },
      fishing_basic:{ name:'Fly Fisher', skill:'Fishing', xpPerMin:28*60, risk:7, icon:'🐟', costRunePerMin:1.5, goldPerHour:2500, fav:false, free:true },
      mining_basic:{ name:'Iron Miner', skill:'Mining', xpPerMin:25*60, risk:9, icon:'⛏️', costRunePerMin:2.5, goldPerHour:2000, fav:false, free:true },
      cooking_basic:{ name:'Power Cooker', skill:'Cooking', xpPerMin:35*60, risk:6, icon:'🍳', costRunePerMin:1.2, goldPerHour:-1000, fav:false, free:true },
      smithing_premium:{ name:'Steel Smelter', skill:'Smithing', xpPerMin:40*60, risk:12, icon:'⚒️', costRunePerMin:3, goldPerHour:-5000, permCost:1000, tempCost:200, tempDuration:3600000, requirements:{Smithing:30}, fav:false },
      slayer_elite:{ name:'Dragon Slayer', skill:'Slayer', xpPerMin:80*60, risk:20, icon:'🐉', costRunePerMin:5, goldPerHour:15000, permCost:2000, requirements:{Slayer:50,Attack:40}, fav:false },
      herblore_trial:{ name:'Potion Mixer', skill:'Herblore', xpPerMin:60*60, risk:10, icon:'🌿', costRunePerMin:2, goldPerHour:8000, tempCost:150, tempDuration:1800000, requirements:{Herblore:20}, fav:false }
    };
    window.Scripts = Scripts;

    // Bot Manager component with status filters, favorites, aligned columns
    app.component('botManager', {
      templateUrl: 'bot.html',
      controller: function($scope, State){
        $scope.state = State; $scope.scripts = Scripts; $scope.selected = {};
        $scope.status = { Active:true, ActiveBotting:true, Banned:false, Sold:false };
        $scope.sort = { key:'name', dir:'asc', options:[
          {label:'Name', value:'name'}, {label:'Total Level', value:'totalLevel'}, {label:'Risk', value:'risk'}, {label:'Hours (24h)', value:'h24'}, {label:'Hours (Total)', value:'hall'}
        ]};
        $scope.toggleDir = ()=> $scope.sort.dir = ($scope.sort.dir==='asc'?'desc':'asc');
        $scope.accountStatus = (a)=> State.accountStatus(a);
        $scope.filteredAndSortedAccounts = ()=>{
          const arr = State.data.accounts.filter(a=>{
            const st = State.accountStatus(a);
            return (st==='Active' && $scope.status.Active) || (st==='Active (Botting)' && $scope.status.ActiveBotting) || (st==='Banned' && $scope.status.Banned) || (st==='Sold' && $scope.status.Sold);
          });
          const key=$scope.sort.key, dir=$scope.sort.dir==='asc'?1:-1;
          const get = (a)=> key==='name'? a.name.toLowerCase() : key==='totalLevel'? State.totalLevel(a) : key==='risk'? a.risk : key==='h24'? State.hoursBotted24h(a) : State.hoursBottedTotal(a);
          return arr.sort((a,b)=> ((b.fav?1:0)-(a.fav?1:0)) || ((get(a)>get(b)?1:-1)*dir));
        };
        $scope.toggleFav = (acc)=>{ acc.fav = !acc.fav; State.save(); };
        function isUnlocked(key){
          const s = Scripts[key]; if(s.free) return true;
          const o = State.data.scriptsOwned[key];
          if(!o) return false;
          if(o.permanent) return true;
          if(o.expiresAt && o.expiresAt > Date.now()) return true;
          if(o.expiresAt && o.expiresAt <= Date.now()) delete State.data.scriptsOwned[key];
          return false;
        }
        function computePairs(){ return Object.keys(Scripts).filter(isUnlocked).map(k=>({ key:k, s: Scripts[k] })).sort(function(a,b){ return ((b.s.fav?1:0)-(a.s.fav?1:0)) || a.s.name.localeCompare(b.s.name); }); }
        $scope.scriptPairs = computePairs();
        $scope.refreshScripts = function(){ $scope.scriptPairs = computePairs(); };
        $scope.toggleScriptFav = function(key){ Scripts[key].fav = !Scripts[key].fav; $scope.refreshScripts(); State.save(); };
        $scope.canCreate = ()=> State.canCreateAccount();
        $scope.cooldownMins = ()=> Math.ceil(Math.max(0, (State.data.lastAccountCreatedAt + 5*60*1000) - Date.now())/60000);
        function meetsReq(a,s){ const req=s.requirements||{}; return Object.entries(req).every(([sk,l])=> State.levelForXp(a.skills[sk]||0) >= l); }
        $scope.getSelectableAccounts = (s)=> State.data.accounts.filter(a=> !a.banned && !a.sold && !(a.bot && a.bot.running) && meetsReq(a,s));
        function isSelectable(a,s){ return a && !a.banned && !a.sold && !(a.bot && a.bot.running) && meetsReq(a,s); }
        $scope.newAccount = ()=>{
          let name = prompt('Enter a unique account name (leave blank to randomize):','')||''; name = name.trim(); if(!name) name = randomName(); if(!State.uniqueName || !State.uniqueName(name)){ alert('That name is taken.'); return; } const acc = State.createAccount(name); if(!acc){ alert('On cooldown or invalid name.'); }
        };
        $scope.start = (key)=>{
          const s = Scripts[key]; const id = $scope.selected[key]; const acc = State.data.accounts.find(a=>a.id===id);
          if(!acc){ alert('Select an account'); return; }
          if(!isSelectable(acc,s)){ alert('Choose an account that meets requirements and is idle.'); $scope.selected[key]=null; return; }
          const need = s.costRunePerMin*1; if(State.data.economy.rune < need){ alert('Not enough RuneCoin to start this bot.'); return; }
          if(!State.startBot(acc, key, s)) { alert('Account cannot afford to run this script.'); return; }
        };
        $scope.stop = (acc)=> State.stopBot(acc);
        $scope.$on('state:changed', ()=> { Object.keys($scope.selected).forEach(k=>{ const id=$scope.selected[k]; const acc=State.data.accounts.find(a=>a.id===id); if(!isSelectable(acc, Scripts[k])) $scope.selected[k]=null; }); $scope.refreshScripts(); $scope.$evalAsync(); });
      }
    });
    // Account Manager — status column, filters, favorites, 3-col viewer + per-account session log + sold toggle
    app.component('accountManager', {
      templateUrl: "accounts.html",
      controller: function($scope, State, ALL_SKILLS, SKILL_ICONS){
        $scope.state = State; $scope.scripts = Scripts; $scope.sel = null; $scope.ALL_SKILLS = ALL_SKILLS; $scope.skillIcons = SKILL_ICONS;
        $scope.levelForXp = State.levelForXp; $scope.XP_TABLE = State.XP_TABLE; $scope.totalLevel = State.totalLevel; $scope.hours24 = State.hoursBotted24h; $scope.hoursAll = State.hoursBottedTotal; $scope.accountStatus = (a)=> State.accountStatus(a);
        $scope.progress = function(xp){ const lvl = State.levelForXp(xp); const prev = State.XP_TABLE[lvl]; const next = State.XP_TABLE[lvl+1]||prev; return Math.max(0, Math.min(1, (xp-prev)/Math.max(1, next-prev))); };
        $scope.botCount = (acc)=> Object.values(acc.botUsage||{}).reduce((a,b)=>a+b,0);
        $scope.overall = State.overall();
        $scope.status = { Active:true, ActiveBotting:true, Banned:true, Sold:true };
        $scope.sort = { key:'name', dir:'asc' };
        $scope.setSort = (k)=>{ $scope.sort.dir = ($scope.sort.key===k && $scope.sort.dir==='asc') ? 'desc' : 'asc'; $scope.sort.key=k; };
        $scope.sortedAccounts = ()=>{
          const arr = State.data.accounts.filter(a=>{
            const st = State.accountStatus(a);
            return (st==='Active' && $scope.status.Active) || (st==='Active (Botting)' && $scope.status.ActiveBotting) || (st==='Banned' && $scope.status.Banned) || (st==='Sold' && $scope.status.Sold);
          });
          const dir=$scope.sort.dir==='asc'?1:-1; const key=$scope.sort.key;
          const getStatus = (a)=> State.accountStatus(a);
          const get = (a)=>
            key==='name'? a.name.toLowerCase() :
            key==='totalLevel'? State.totalLevel(a) :
            key==='gold'? (a.gold||0) :
            key==='h24'? State.hoursBotted24h(a) :
            key==='hall'? State.hoursBottedTotal(a) :
            getStatus(a);
          return arr.sort((a,b)=> ((b.fav?1:0)-(a.fav?1:0)) || ((get(a)>get(b)?1:-1)*dir));
        };
        $scope.toggleFav = (acc)=>{ acc.fav = !acc.fav; State.save(); };
        $scope.select = (acc)=>{ $scope.sel = acc; };
        $scope.toggleSold = (acc)=>{ acc.sold = !acc.sold; if(acc.sold && acc.bot && acc.bot.running){ State.stopBot(acc); } State.save(); };
        $scope.$on('state:changed', ()=> { $scope.overall = State.overall(); $scope.$evalAsync(); });
      }
    });

    // Script Market app for purchasing scripts
    app.component('scriptMarket', {
      templateUrl: 'market.html',
      controller: function($scope, State){
        $scope.state = State; $scope.scripts = Scripts;
        const owned = State.data.scriptsOwned;
        function isOwned(key){
          const o = owned[key];
          if(!o) return false;
          if(o.permanent) return true;
          if(o.expiresAt && o.expiresAt > Date.now()) return true;
          if(o.expiresAt && o.expiresAt <= Date.now()) delete owned[key];
          return false;
        }
        $scope.owned = isOwned;
        $scope.ownedTemp = (key)=>{ const o=owned[key]; return o && o.expiresAt ? o.expiresAt : null; };
        function spend(cost){
          if(State.data.economy.rune < cost){ alert('Not enough RuneCoin'); return false; }
          State.data.economy.rune -= cost; State.data.economy.spent += cost; return true;
        }
        $scope.buyPerm = function(key){ const s=Scripts[key]; if(!s||!s.permCost) return; if(!spend(s.permCost)) return; owned[key]={permanent:true}; State.save(); $scope.$evalAsync(); };
        $scope.buyTemp = function(key){ const s=Scripts[key]; if(!s||!s.tempCost) return; if(!spend(s.tempCost)) return; owned[key]={expiresAt: Date.now() + (s.tempDuration||3600000)}; State.save(); $scope.$evalAsync(); };
        $scope.$on('state:changed', ()=> $scope.$evalAsync());
      }
    });

    // Wallet app with transaction log and filter (autosnapshot updates per session entry)
    app.component('walletApp', {
      templateUrl: 'pouch.html',
      controller: function($scope, State){
        $scope.state = State; $scope.filter = 'all';
        $scope.filtered = function(){ const arr = (State.data.economy.transactions||[]).slice().sort((a,b)=>b.ts-a.ts); if($scope.filter==='all') return arr; return arr.filter(t=>t.type===$scope.filter); };
        $scope.$on('state:changed', ()=> $scope.$evalAsync());
      }
    });

    // Economy + game loop extras (deduct RuneCoin, stop on empty, autosnapshot transactions)
    app.run(function($rootScope, $interval, State){
      function fmtHMS(ms){ ms=Math.max(0,Math.floor(ms/1000)); const h=Math.floor(ms/3600), m=Math.floor((ms%3600)/60), s=ms%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
      function updateClock(){ const now=Date.now(); const realElapsed = now - State.data.game.realStartedAt; const gameElapsed = realElapsed * (State.data.game.speed||1); $rootScope.clockText = fmtHMS(gameElapsed); $rootScope.clockTitle = `Real time elapsed: ${fmtHMS(realElapsed)}`; }
      updateClock(); $interval(updateClock, 1000);
      function computeRisk(acc){ const base = acc.bot && acc.bot.running ? (Scripts[acc.bot.scriptKey] && Scripts[acc.bot.scriptKey].risk || 0) : 0; const target=Math.max(0,Math.min(100,base)); acc.risk = Math.max(0, Math.min(100, acc.risk + (target-acc.risk)*0.15)); }
      function tick(){
        State.data.accounts.forEach(acc=>{
          if(acc.banned) return;
          if(acc.bot && acc.bot.running){
            const perSec = (acc.bot.xpPerMin/60);
            acc.skills[acc.bot.skill] = Math.round((acc.skills[acc.bot.skill]||0) + perSec);
            const goldSec = (acc.bot.goldPerHour||0)/3600;
            if(goldSec!==0){
              const newGold = (acc.gold||0) + goldSec;
              if(newGold < 0){ acc.gold=0; State.stopBot(acc); toast(`Account ${acc.name} ran out of gold.`); }
              else acc.gold = newGold;
            }
          }
          computeRisk(acc);
          const danger=Math.max(0, acc.risk-60);
          if(danger>0 && Math.random() < (danger/700)){
            acc.banned=true;
            $('#ban-msg').innerHTML = `Account <b>${acc.name}</b> has been banned.`;
            $('#ban-overlay').style.display='flex';
            const sess=[...acc.sessions].reverse().find(s=>!s.endedAt);
            if(sess){ sess.endedAt=Date.now(); acc.bot && (acc.bot.running=false); State.upsertSessionTxn(acc, sess, true); }
          }
        });
        State.save();
        $rootScope.$broadcast('state:changed');
      }
      $interval(tick, 1000);
      function economyTick(){ let anyRunning=false; let totalCostPerSec=0; State.data.accounts.forEach(acc=>{ if(acc.bot && acc.bot.running){ anyRunning=true; totalCostPerSec += (acc.bot.costRunePerMin||0)/60; } }); if(anyRunning){ const cost = totalCostPerSec; if(State.data.economy.rune <= 0){ State.data.accounts.forEach(a=>{ if(a.bot && a.bot.running) State.stopBot(a); }); toast('RuneCoin depleted — all bots stopped.'); } else { State.data.economy.rune = Math.max(0, State.data.economy.rune - cost); State.data.economy.spent += cost; } State.save(); $rootScope.$broadcast('state:changed'); } }
      $interval(economyTick, 1000);
      function autosnapshotTick(){ State.data.accounts.forEach(acc=>{ if(acc.bot && acc.bot.running){ const sess=[...acc.sessions].reverse().find(s=>!s.endedAt); if(sess){ State.upsertSessionTxn(acc, sess, false); } } }); }
      $interval(autosnapshotTick, 30000); // update/flush ledger every 30s
      $('#dismissBan').addEventListener('click', ()=>{ $('#ban-overlay').style.display='none'; });
      $('#newAccountFromBan').addEventListener('click', ()=>{ if(!State.canCreateAccount()){ toast('Create account cooldown active.'); return; } const nm = randomName(); const acc = State.createAccount(nm); if(acc){ toast(`Created ${acc.name}`); $('#ban-overlay').style.display='none'; } });
      // Before unload: finalize running sessions to reduce loss
      window.addEventListener('beforeunload', ()=>{ State.data.accounts.forEach(acc=>{ if(acc.bot && acc.bot.running){ const sess=[...acc.sessions].reverse().find(s=>!s.endedAt); if(sess){ State.upsertSessionTxn(acc, sess, true); } } }); State.save(); });
    });

    // Toast
    window.toast = function(msg, ms=2200){ const t = el('div', { className: 'toast', innerHTML: msg }); $('#toasts').appendChild(t); setTimeout(()=>t.remove(), ms); };

    // Desktop window manager mounts Angular components
    const Desktop = {
      z:10, windows:new Map(),
      spawn(appId){ if(this.windows.has(appId)){ const w=this.windows.get(appId); this.focus(w.root); w.root.classList.remove('hidden'); return w; }
        const app = Apps[appId]; if(!app) return null;
        const root = el('div',{className:'window', style:`left:${50+Math.random()*120}px;top:${50+Math.random()*60}px;width:${app.size?.w||520}px;height:${app.size?.h||360}px;`});
        const titlebar=el('div',{className:'titlebar'}); const title=el('div',{className:'title'}); title.append(el('span',{textContent:app.icon}), el('span',{textContent:app.title}));
        const controls=el('div',{className:'controls'}); const btnMin=el('div',{className:'win-btn',title:'Minimize',innerHTML:'&#95;'}); const btnClose=el('div',{className:'win-btn',title:'Close',innerHTML:'&times;'});
        controls.append(btnMin, btnClose); titlebar.append(title, controls); const content=el('div',{className:'content'}); root.append(titlebar, content); $('#desktop').appendChild(root);
        let drag=null; titlebar.addEventListener('mousedown',(e)=>{ if(e.target.closest('.controls')) return; const r=root.getBoundingClientRect(); drag={dx:e.clientX-r.left, dy:e.clientY-r.top}; this.focus(root); });
        window.addEventListener('mousemove',(e)=>{ if(!drag) return; const maxX=innerWidth-root.offsetWidth-6; const maxY=innerHeight-36-root.offsetHeight-6; root.style.left=clamp(e.clientX-drag.dx,6,Math.max(6,maxX))+'px'; root.style.top=clamp(e.clientY-drag.dy,6,Math.max(6,maxY))+'px'; });
        window.addEventListener('mouseup',()=>drag=null); root.addEventListener('mousedown',()=>this.focus(root)); btnClose.addEventListener('click',()=>this.close(appId)); btnMin.addEventListener('click',()=>this.minimize(appId));
        // mount Angular component
        content.innerHTML = app.mountTag;
        const inj = angular.element(document.body).injector(); const $compile = inj.get('$compile'); const $rootScope = inj.get('$rootScope'); const scope = $rootScope.$new(); $compile(content)(scope);
        const taskItem=el('div',{className:'task-item',dataset:{appId:appId}}); taskItem.append(el('span',{textContent:app.icon}), el('span',{textContent:app.title})); taskItem.addEventListener('click',()=>{ if(root.classList.contains('hidden')) root.classList.remove('hidden'); this.focus(root); }); $('#task-items').appendChild(taskItem);
        const inst={root,content,app,taskItem}; this.windows.set(appId, inst); this.focus(root); return inst; },
      focus(root){ this.z+=1; root.style.zIndex=this.z; $$('.task-item').forEach(t=>t.classList.remove('active')); const id=[...this.windows.entries()].find(([,w])=>w.root===root)?.[0]; if(id) this.windows.get(id).taskItem.classList.add('active'); },
      close(id){ const w=this.windows.get(id); if(!w) return; w.root.remove(); w.taskItem.remove(); this.windows.delete(id); },
      minimize(id){ const w=this.windows.get(id); if(!w) return; w.root.classList.add('hidden'); w.taskItem.classList.remove('active'); }
    };
    window.Desktop = Desktop;

    // Apps registry
    const Apps = {
      'Bot Manager': { title:'Bot Manager', icon:'🤖', size:{ w:920, h:560 }, mountTag:'<bot-manager></bot-manager>' },
      'Account Manager': { title:'Account Manager', icon:'📈', size:{ w:980, h:600 }, mountTag:'<account-manager></account-manager>' },
      'Wallet': { title:'Crypto Wallet', icon:'👛', size:{ w:720, h:520 }, mountTag:'<wallet-app></wallet-app>' },
      'Script Market': { title:'Script Market', icon:'🛒', size:{ w:720, h:520 }, mountTag:'<script-market></script-market>' }
    };
    window.Apps = Apps;

    // Desktop icons & start menu
    const ICONS = [
      { title:'Bot Manager', icon:'🤖' },
      { title:'Account Manager', icon:'📈' },
      { title:'Wallet', icon:'👛' },
      { title:'Script Market', icon:'🛒' }
    ];
    function drawDesktop(){
      const d=$('#desktop'); d.innerHTML='';
      let wp=0; try{ const raw=localStorage.getItem('rs-bot-sim'); if(raw){ const parsed=JSON.parse(raw); wp = parsed.wallpaper|0; } }catch(e){}
      if ((wp % 3) === 1) document.body.style.background='radial-gradient(1200px 800px at 70% 20%, #1b2a2a 0%, #0b1212 55%)';
      else if ((wp % 3) === 2) document.body.style.background='linear-gradient(120deg, #0f1020, #120f1b 40%, #0a0f18)';
      else document.body.style.background='radial-gradient(1200px 800px at 20% 20%, #182033 0%, var(--bg) 55%)';
      for(const ic of ICONS){
        const div=el('div',{className:'desktop-icon',tabIndex:0});
        div.append(el('div',{className:'icon-emoji',textContent:ic.icon}), el('div',{className:'icon-label',textContent:ic.title}));
        div.addEventListener('dblclick',()=>{ if(ic.action) ic.action(); else Desktop.spawn(ic.title); });
        d.append(div);
      }
    }

    $('#start').addEventListener('click',()=>{ const m=$('#start-menu'); m.style.display = m.style.display==='block' ? 'none' : 'block'; });
    document.addEventListener('click',(e)=>{ const m=$('#start-menu'); if(!e.target.closest('#start-menu') && !e.target.closest('#start')) m.style.display='none'; });
    $('#start-menu').addEventListener('click',(e)=>{ const row=e.target.closest('.srow'); if(!row) return; const cmd=row.dataset.cmd||''; const State = angular.element(document.body).injector().get('State'); if(cmd.startsWith('open:')){ const id=cmd.split(':')[1]; Desktop.spawn(id); } else if(cmd==='reset'){ if(confirm('Reset all saves?')){ localStorage.removeItem('rs-bot-sim'); location.reload(); } } else if(cmd==='wallpaper'){ State.data.wallpaper=(State.data.wallpaper+1)%3; State.save(); drawDesktop(); } });

    document.addEventListener('keydown',(e)=>{ if(e.shiftKey){ const k=e.key.toLowerCase(); if(k==='b') Desktop.spawn('Bot Manager'); if(k==='s') Desktop.spawn('Account Manager'); if(k==='r') Desktop.spawn('Wallet'); if(k==='m') Desktop.spawn('Script Market'); }});

    // Initial draw
    drawDesktop(); if(!localStorage.getItem('rs-bot-sim__hinted')){ toast('Double-click icons to open. Shift+B opens Bot Manager.'); localStorage.setItem('rs-bot-sim__hinted','1'); }

