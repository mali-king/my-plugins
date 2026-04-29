/**
 * @name Stremio Cinematic Suite
 * @description Unified mega-plugin: Theme Engine + Home Page + Stream Browser +
 *   Data Enrichment + Discover + Library + Calendar. Single CSS injection,
 *   deduplicated helpers, hash-based router, left-edge theme trigger.
 * @version 2.0.0
 * @author elmarco
 */
(function () {
  'use strict';

  if (window.__CinematicSuiteLoaded) return;
  window.__CinematicSuiteLoaded = true;

  // ═══════════════════════════════════════════════════════════════════
  // ── SHARED ──────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

  const CS_VERSION = '2.0.0';
  const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prefersReducedMotion = rm; // alias used by home/stream CSS builders

  // localStorage
  function lsGet(k)        { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v)     { try { localStorage.setItem(k, String(v)); } catch {} }
  function lsGetJSON(k, d) { try { return JSON.parse(lsGet(k)) ?? d; } catch { return d; } }
  function lsSetJSON(k, v) { try { lsSet(k, JSON.stringify(v)); } catch {} }
  function lerp(a, b, t)   { return a + (b - a) * t; }

  // OKLCH math
  function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r:parseInt(r[1],16), g:parseInt(r[2],16), b:parseInt(r[3],16) } : {r:229,g:160,b:13};
  }
  function rgbToOklch(r, g, b) {
    r/=255;g/=255;b/=255;
    r=r>.04045?Math.pow((r+.055)/1.055,2.4):r/12.92;
    g=g>.04045?Math.pow((g+.055)/1.055,2.4):g/12.92;
    b=b>.04045?Math.pow((b+.055)/1.055,2.4):b/12.92;
    const X=r*.4124+g*.3576+b*.1805,Y=r*.2126+g*.7152+b*.0722,Z=r*.0193+g*.1192+b*.9505;
    const l=Math.cbrt(.4122214708*X+.5363325363*Y+.0514459929*Z);
    const m=Math.cbrt(.2119034982*X+.6806995451*Y+.1073969566*Z);
    const s=Math.cbrt(.0883024619*X+.2817188376*Y+.6299787005*Z);
    const L=.2104542553*l+.7936177850*m-.0040720468*s;
    const a=1.9779984951*l-2.4285922050*m+.4505937099*s;
    const bk=.0259040371*l+.7827717662*m-.8086757660*s;
    return {l:Math.round(L*1000)/10,c:Math.round(Math.sqrt(a*a+bk*bk)*1000)/1000,h:Math.round((Math.atan2(bk,a)*180/Math.PI+360)%360*10)/10};
  }
  function oklchToHex(l, c, h) {
    const hr=h*Math.PI/180,a=c*Math.cos(hr),bk=c*Math.sin(hr);
    const l_=l/100+.3963377774*a+.2158037573*bk,m_=l/100-.1055613458*a-.0638541728*bk,s_=l/100-.0894841775*a-1.2914855480*bk;
    const L3=l_**3,M3=m_**3,S3=s_**3;
    const u8=x=>Math.max(0,Math.min(255,Math.round((x>.0031308?1.055*x**(1/2.4)-.055:12.92*x)*255)));
    return '#'+u8(4.0767416621*L3-3.3077115913*M3+.2309699292*S3).toString(16).padStart(2,'0')
              +u8(-1.2684380046*L3+2.6097574011*M3-.3413193965*S3).toString(16).padStart(2,'0')
              +u8(-.0041960863*L3-.7034186147*M3+1.7076147010*S3).toString(16).padStart(2,'0');
  }
  function luminance(r,g,b){return [r,g,b].reduce((a,v,i)=>{v/=255;return a+[.2126,.7152,.0722][i]*(v<=.03928?v/12.92:((v+.055)/1.055)**2.4)},0);}

  // Fetch with TTL cache
  const _fc = new Map();
  async function fetchJSON(url, ttl=600000, ms=6000) {
    const now=Date.now(), c=_fc.get(url);
    if(c&&now-c.ts<ttl) return c.data;
    const ctrl=new AbortController(); const tid=setTimeout(()=>ctrl.abort(),ms);
    try {
      const r=await fetch(url,{signal:ctrl.signal}); clearTimeout(tid);
      if(!r.ok) return null; const data=await r.json(); _fc.set(url,{data,ts:now}); return data;
    } catch { clearTimeout(tid); return null; }
  }

  // Event bus
  const _bus={};
  const busOn=(ev,fn)=>((_bus[ev]??=[])).push(fn);
  const busOff=(ev,fn)=>{if(_bus[ev])_bus[ev]=_bus[ev].filter(f=>f!==fn);};
  const busEmit=(ev,d)=>(_bus[ev]||[]).forEach(fn=>{try{fn(d);}catch{}});

  async function measurePerf() {
    return new Promise(res=>{
      let f=0,last=performance.now();
      const tick=()=>{f++;const now=performance.now();if(now-last>=500){const fps=Math.round(f/((now-last)/1000));res(fps>=55?'ultra':fps>=40?'high':fps>=25?'mid':'low');}else requestAnimationFrame(tick);};
      requestAnimationFrame(tick);
    });
  }

  // WLNM shared store
  const WLNM_KEY='wlnm-data';
  function wlnm_loadStore(){try{return JSON.parse(localStorage.getItem(WLNM_KEY)||'{}')}catch{return{}}}
  function wlnm_saveStore(s){try{localStorage.setItem(WLNM_KEY,JSON.stringify(s))}catch{}}
  function wlnm_getEntry(id){const s=wlnm_loadStore();return s[id]||{status:'none',rating:0,notes:'',addedAt:null,title:''}}
  function wlnm_setEntry(id,patch){
    const s=wlnm_loadStore();const prev=s[id]||{status:'none',rating:0,notes:'',addedAt:null,title:''};
    s[id]={...prev,...patch};
    if(patch.status&&patch.status!=='none'&&!prev.addedAt)s[id].addedAt=new Date().toISOString();
    if(patch.status==='none')delete s[id];
    wlnm_saveStore(s);
  }
  function wlnm_countWatchlist(){return Object.keys(wlnm_loadStore()).length}

  function extractColors(imgUrl){
    return new Promise(res=>{
      const img=new Image();img.crossOrigin='anonymous';
      img.onload=()=>{
        try{
          const c=document.createElement('canvas');c.width=16;c.height=16;
          const ctx=c.getContext('2d');ctx.drawImage(img,0,0,16,16);
          const d=ctx.getImageData(0,0,16,16).data;const px=[];
          for(let i=0;i<d.length;i+=4){
            const r=d[i],g=d[i+1],b=d[i+2];
            const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
            const sat=mx===0?0:(mx-mn)/mx,lum=(mx+mn)/510;
            if(sat>.18&&lum>.08&&lum<.88)px.push({r,g,b,sat});
          }
          px.sort((a,b)=>b.sat-a.sat);
          const top=px.slice(0,5);if(!top.length)return res(null);
          while(top.length<5)top.push(top[0]);
          res(top.map(p=>rgbToOklch(p.r,p.g,p.b)));
        }catch{res(null);}
      };
      img.onerror=()=>res(null);
      img.src=imgUrl;
    });
  }

  function preloadImg(url){return new Promise(res=>{if(!url)return res(false);const img=new Image();img.onload=()=>res(true);img.onerror=()=>res(false);img.src=url;});}
  function colorBP(r,g,b){return 'linear-gradient(135deg,rgba('+r+','+g+','+b+',.35) 0%,rgba('+Math.floor(r*.6)+','+Math.floor(g*.6)+','+Math.floor(b*.6)+',.2) 100%)';}
  function navToTitle(id,type){window.location.hash='#/detail/'+(type==='movie'?'movie':'series')+'/'+id;}
  function fmtRuntime(m){if(!m)return '';const h=Math.floor(m/60),mn=m%60;return h?h+'h '+mn+'m':mn+'m';}
  function getTimeCtx(){const h=new Date().getHours();if(h>=5&&h<12)return{label:'Good morning',tempMod:.9,satMod:.85};if(h>=12&&h<17)return{label:'Good afternoon',tempMod:1,satMod:1};if(h>=17&&h<21)return{label:'Good evening',tempMod:1.1,satMod:1.1};return{label:'Late night',tempMod:.6,satMod:.7};}
  function getSeasonMod(){const m=new Date().getMonth();if(m===9)return{rMod:1.4,gMod:.7,bMod:.7};if(m===10)return{rMod:1.2,gMod:.8,bMod:.8};if(m===11)return{rMod:.9,gMod:.9,bMod:1.3};if(m>=5&&m<=7)return{rMod:1.1,gMod:1.05,bMod:.9};return{rMod:1,gMod:1,bMod:1};}
  function esc(t){const d=document.createElement('span');d.textContent=t;return d.innerHTML;}
  function buildGreeting(cwTitles){const ctx=getTimeCtx();if(!cwTitles.length)return ctx.label+' — start something great tonight';const t=cwTitles[0];if(t.progress>.85)return ctx.label+' — you\'re almost done with '+t.title;if(t.progress>0)return ctx.label+' — '+t.title+' is waiting for you';return ctx.label+' — '+cwTitles.length+' title'+(cwTitles.length>1?'s':'')+' in your list';}

  // ═══════════════════════════════════════════════════════════════════
  // ── MODULE: THEME ENGINE ────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

  const CT_STORE_KEY  = 'ct-theme-v1';
  const CT_DNA_KEY    = 'ct-dna-history';
  const CT_STYLE_ID   = 'cs-styles';
  const CT_FONT_ID    = 'cs-font';
  const CT_GRAIN_ID   = 'ct-grain';
  const CT_VIGNETTE_ID= 'ct-vignette';
  const CT_AMBIENT_ID = 'ct-ambient';
  const CT_MESH_ID    = 'ct-mesh';
  const CT_CURSOR_ID  = 'ct-cursor';
  const CT_PANEL_ID   = 'ct-panel';
  const CT_TRIGGER_ID = 'ct-panel-trigger';
  const CT_DIR_TOP_ID = 'ct-directors-top';
  const CT_DIR_BOT_ID = 'ct-directors-bot';
  const CT_CB_SVG_ID  = 'ct-cb-filters';

  const PRESETS = {
    'cinema':       {l:65,c:.18,h:83,  a2:'#ff6b35',bg:7, g:1.0,label:'Cinema'},
    'oled':         {l:65,c:.20,h:220, a2:'#a78bfa',bg:2, g:0.6,label:'OLED'},
    'ocean':        {l:62,c:.18,h:195, a2:'#06b6d4',bg:6, g:0.8,label:'Ocean Deep'},
    'amber-noir':   {l:60,c:.14,h:70,  a2:'#b45309',bg:5, g:1.3,label:'Amber Noir'},
    'neon-tokyo':   {l:65,c:.25,h:320, a2:'#06b6d4',bg:4, g:0.7,label:'Neon Tokyo'},
    'dune':         {l:68,c:.16,h:65,  a2:'#d97706',bg:5, g:1.4,label:'Dune'},
    'interstellar': {l:60,c:.14,h:210, a2:'#e5a00d',bg:4, g:1.1,label:'Interstellar'},
    'drive':        {l:65,c:.22,h:330, a2:'#7c3aed',bg:3, g:1.2,label:'Drive'},
    'oppenheimer':  {l:62,c:.12,h:45,  a2:'#dc2626',bg:5, g:1.5,label:'Oppenheimer'},
    'matrix':       {l:65,c:.22,h:145, a2:'#16a34a',bg:2, g:0.9,label:'Matrix'},
    'blade-runner': {l:60,c:.20,h:195, a2:'#f97316',bg:4, g:1.0,label:'Blade Runner'},
    '2001':         {l:70,c:.08,h:0,   a2:'#ef4444',bg:3, g:0.5,label:'2001'},
    'arctic':       {l:72,c:.10,h:200, a2:'#e0f2fe',bg:8, g:0.4,label:'Arctic'},
    'void':         {l:55,c:.15,h:270, a2:'#6d28d9',bg:1, g:0.8,label:'Void'},
    'ember':        {l:65,c:.20,h:30,  a2:'#fbbf24',bg:6, g:1.1,label:'Ember'},
    'synthwave':    {l:65,c:.24,h:295, a2:'#22d3ee',bg:3, g:0.6,label:'Synthwave'},
    'sunset-blvd':  {l:68,c:.21,h:20,  a2:'#fcd34d',bg:6, g:1.0,label:'Sunset Blvd'},
    'daylight':     {l:50,c:.16,h:83,  a2:'#ff6b35',bg:92,g:0.0,label:'Daylight'},
    'studio':       {l:45,c:.12,h:220, a2:'#3b82f6',bg:90,g:0.0,label:'Studio'},
  };

  const MOOD = {
    'Horror':     {dH:-40,dC:.04,dL:-8, gr:1.6},
    'Thriller':   {dH:-20,dC:.03,dL:-5, gr:1.3},
    'Sci-Fi':     {dH:+80,dC:.05,dL:+2, gr:0.7},
    'Action':     {dH:-10,dC:.06,dL:+3, gr:1.2},
    'Romance':    {dH:+30,dC:.02,dL:+8, gr:0.6},
    'Comedy':     {dH:+20,dC:.02,dL:+12,gr:0.4},
    'Drama':      {dH:0,  dC:.01,dL:-3, gr:1.1},
    'Animation':  {dH:+25,dC:.08,dL:+10,gr:0.0},
    'Documentary':{dH:0,  dC:-.04,dL:-5,gr:0.9},
    'Western':    {dH:-15,dC:.01,dL:-6, gr:1.4},
    'Fantasy':    {dH:+60,dC:.06,dL:+5, gr:0.5},
    'Mystery':    {dH:-30,dC:.03,dL:-7, gr:1.3},
    'Crime':      {dH:-25,dC:.04,dL:-6, gr:1.2},
  };

  const CT_DEFAULTS = {
    version:1,preset:'cinema',customAccent:null,
    effects:{grain:true,ambient:true,vignette:true,mesh:true,cursor:'ring',directorsCut:false},
    sliders:{grainIntensity:1.0,animSpeed:1.0},
    a11y:{colorblind:'none',highContrast:false},
    dna:{enabled:true,drift:{dH:0,dC:0,dL:0}},
  };

  function ct_loadConfig(){
    const s=lsGetJSON(CT_STORE_KEY,{});
    if(s.version!==1) return {...CT_DEFAULTS};
    return {
      ...CT_DEFAULTS,...s,
      effects:{...CT_DEFAULTS.effects,...(s.effects||{})},
      sliders:{...CT_DEFAULTS.sliders,...(s.sliders||{})},
      a11y:{...CT_DEFAULTS.a11y,...(s.a11y||{})},
      dna:{...CT_DEFAULTS.dna,...(s.dna||{}),drift:{...CT_DEFAULTS.dna.drift,...(s.dna?.drift||{})}},
    };
  }

  let ct_config = ct_loadConfig();
  let ct_perfTier = 'high';
  function ct_saveConfig(){lsSetJSON(CT_STORE_KEY,ct_config);}

  // ── CSS injection ─────────────────────────────────────────────────────────────
  function ct_injectCSS(){
    if(document.getElementById(CT_STYLE_ID)) return;
    if(!document.getElementById(CT_FONT_ID)){
      const l=document.createElement('link');l.id=CT_FONT_ID;l.rel='stylesheet';
      l.href='https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,300;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap';
      document.head.appendChild(l);
    }
    const s=document.createElement('style');s.id=CT_STYLE_ID;s.textContent=ct_buildCSS();document.head.appendChild(s);
  }

  function ct_buildCSS(){return `
@layer ct.tokens,ct.reset,ct.base,ct.effects,ct.glass,ct.components,ct.native,ct.overrides;
@property --ct-accent-l{syntax:'<number>';initial-value:65;inherits:true;}
@property --ct-accent-c{syntax:'<number>';initial-value:18;inherits:true;}
@property --ct-accent-h{syntax:'<number>';initial-value:83;inherits:true;}
@property --ct-ambient-l{syntax:'<number>';initial-value:10;inherits:true;}
@property --ct-ambient-c{syntax:'<number>';initial-value:2;inherits:true;}
@property --ct-ambient-h{syntax:'<number>';initial-value:83;inherits:true;}
@property --ct-grain-opacity{syntax:'<number>';initial-value:0.032;inherits:true;}
@property --ct-bg-l{syntax:'<number>';initial-value:7;inherits:true;}

@layer ct.tokens {
:root {
  --ct-accent-l:65;--ct-accent-c:18;--ct-accent-h:83;
  --ct-accent:oklch(calc(var(--ct-accent-l)*1%) calc(var(--ct-accent-c)*0.01) calc(var(--ct-accent-h)*1deg));
  --ct-accent2:#ff6b35;--ct-accent-rgb:229,160,13;
  --ct-accent-dim:color-mix(in oklch,var(--ct-accent) 28%,transparent);
  --ct-accent-soft:color-mix(in oklch,var(--ct-accent) 14%,transparent);
  --ct-accent-glow:color-mix(in oklch,var(--ct-accent) 44%,transparent);
  --ct-accent-muted:color-mix(in oklch,var(--ct-accent) 16%,var(--ct-bg));
  --ct-text-on-accent:#000;
  --ct-bg-l:7;--ct-bg:oklch(calc(var(--ct-bg-l)*1%) .010 250deg);
  --ct-surface1:color-mix(in oklch,var(--ct-bg) 80%,oklch(20% .015 250deg));
  --ct-surface2:color-mix(in oklch,var(--ct-bg) 68%,oklch(25% .015 250deg));
  --ct-surface3:color-mix(in oklch,var(--ct-bg) 55%,oklch(30% .015 250deg));
  --ct-surface4:color-mix(in oklch,var(--ct-bg) 42%,oklch(35% .015 250deg));
  --ct-danger:#f87171;--ct-success:#4ade80;--ct-info:#93c5fd;--ct-warning:#fbbf24;
  --ct-ambient-l:10;--ct-ambient-c:2;--ct-ambient-h:83;
  --ct-ambient:oklch(calc(var(--ct-ambient-l)*1%) calc(var(--ct-ambient-c)*0.01) calc(var(--ct-ambient-h)*1deg));
  --ct-ambient-blend:color-mix(in oklch,var(--ct-ambient) 38%,var(--ct-bg));
  --ct-font-body:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;
  --ct-font-display:'DM Serif Display',Georgia,serif;
  --ct-text-xs:.65rem;--ct-text-sm:.78rem;--ct-text-base:.88rem;--ct-text-md:.95rem;
  --ct-text-lg:1.1rem;--ct-text-xl:1.22rem;--ct-text-2xl:1.55rem;--ct-text-3xl:2rem;
  --ct-sp1:4px;--ct-sp2:8px;--ct-sp3:12px;--ct-sp4:16px;--ct-sp5:20px;--ct-sp6:24px;--ct-sp8:32px;
  --ct-r-xs:6px;--ct-r-sm:8px;--ct-r-md:12px;--ct-r-lg:16px;--ct-r-xl:20px;--ct-r-2xl:24px;--ct-r-pill:30px;--ct-r-full:9999px;
  --ct-blur-sm:8px;--ct-blur-md:16px;--ct-blur-lg:24px;--ct-blur-xl:32px;--ct-blur-2xl:44px;
  --ct-sh-sm:0 2px 8px rgba(0,0,0,.35);--ct-sh-md:0 8px 24px rgba(0,0,0,.48);
  --ct-sh-lg:0 16px 44px rgba(0,0,0,.58);--ct-sh-xl:0 24px 64px rgba(0,0,0,.65);
  --ct-sh-accent:0 10px 32px var(--ct-accent-glow);
  --ct-glass-op:.10;--ct-border-a:.08;--ct-border-a-hi:.14;
  --ct-ease-spring:cubic-bezier(.34,1.3,.64,1);--ct-ease-out:cubic-bezier(.22,1,.36,1);
  --ct-ease-cinema:cubic-bezier(.4,0,.2,1);--ct-ease-bounce:cubic-bezier(.34,1.56,.64,1);
  --ct-anim:1;--ct-grain-opacity:.032;
  --row-accent:var(--ct-accent);--row-accent2:var(--ct-accent2);
}}

@layer ct.base {
  *,*::before,*::after{box-sizing:border-box;}
  *{scrollbar-width:thin;scrollbar-color:var(--ct-accent-dim) transparent;}
  *::-webkit-scrollbar{width:5px;height:5px;}
  *::-webkit-scrollbar-thumb{background:var(--ct-accent-dim);border-radius:99px;}
}

@keyframes ct-fade-up{from{opacity:0;transform:translateY(22px) scale(.98)}to{opacity:1;transform:none}}
@keyframes ct-fade-in{from{opacity:0}to{opacity:1}}
@keyframes ct-shimmer{0%{background-position:-700px 0}100%{background-position:700px 0}}
@keyframes ct-pulse-glow{0%,100%{box-shadow:0 0 8px var(--ct-accent-soft),0 4px 18px rgba(0,0,0,.35)}50%{box-shadow:0 0 24px var(--ct-accent-dim),0 4px 18px rgba(0,0,0,.35)}}
@keyframes ct-grain{0%{background-position:0 0}10%{background-position:-30px -40px}20%{background-position:20px 10px}30%{background-position:-45px 25px}40%{background-position:35px -15px}50%{background-position:-10px 40px}60%{background-position:50px -30px}70%{background-position:-25px 15px}80%{background-position:15px -45px}90%{background-position:-40px 30px}100%{background-position:5px -20px}}
@keyframes ct-panel-in{from{opacity:0;transform:translateX(-18px) scale(.97)}to{opacity:1;transform:none}}
@keyframes ct-dna-pulse{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes ct-gate-weave{0%,100%{transform:rotate(0deg)}50%{transform:rotate(.15deg)}}
@keyframes ct-hero-enter{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
@keyframes ct-spring-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes ct-ctx-in{from{opacity:0;transform:scale(.95) translateY(-6px)}to{opacity:1;transform:none}}
@keyframes ct-bell{0%,100%{transform:rotate(0)}15%{transform:rotate(12deg)}30%{transform:rotate(-10deg)}45%{transform:rotate(8deg)}60%{transform:rotate(-5deg)}75%{transform:rotate(3deg)}}
@keyframes ct-progress{from{width:0}}
@keyframes ct-load-pulse{0%,100%{opacity:.45}50%{opacity:1}}
/* chp- aliases so cinematic-home CSS works unchanged */
@keyframes chp-fade-up{from{opacity:0;transform:translateY(22px) scale(.98)}to{opacity:1;transform:none}}
@keyframes chp-fade-in{from{opacity:0}to{opacity:1}}
@keyframes chp-slide-down{from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:none}}
@keyframes chp-shimmer{0%{background-position:-700px 0}100%{background-position:700px 0}}
@keyframes chp-pulse-glow{0%,100%{box-shadow:0 0 8px rgba(229,160,13,.12),0 4px 18px rgba(0,0,0,.35)}50%{box-shadow:0 0 24px rgba(229,160,13,.42),0 4px 18px rgba(0,0,0,.35)}}
@keyframes chp-spring-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes chp-grain{0%{background-position:0 0}10%{background-position:-30px -40px}20%{background-position:20px 10px}30%{background-position:-45px 25px}40%{background-position:35px -15px}50%{background-position:-10px 40px}60%{background-position:50px -30px}70%{background-position:-25px 15px}80%{background-position:15px -45px}90%{background-position:-40px 30px}100%{background-position:5px -20px}}
@keyframes chp-particle-float{0%,100%{transform:translateY(0) translateX(0);opacity:.045}33%{transform:translateY(-14px) translateX(6px);opacity:.08}66%{transform:translateY(8px) translateX(-8px);opacity:.05}}
@keyframes chp-hero-enter{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
@keyframes chp-overlay-in{from{opacity:0;transform:translateY(-24px) scale(.98)}to{opacity:1;transform:none}}
@keyframes chp-badge-in{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@keyframes chp-progress-fill{from{width:0}}
@keyframes chp-load-pulse{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes chp-ctx-in{from{opacity:0;transform:scale(.95) translateY(-6px)}to{opacity:1;transform:none}}
@keyframes chp-bell-jiggle{0%,100%{transform:rotate(0)}15%{transform:rotate(12deg)}30%{transform:rotate(-10deg)}45%{transform:rotate(8deg)}60%{transform:rotate(-5deg)}75%{transform:rotate(3deg)}}
@keyframes chp-ticker-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
/* csb- / de- / wlnm- aliases */
@keyframes csb-fade-up{from{opacity:0;transform:translateY(20px) scale(.98)}to{opacity:1;transform:none}}
@keyframes csb-card-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes csb-shimmer{0%{background-position:-700px 0}100%{background-position:700px 0}}
@keyframes csb-glow-pulse{0%,100%{box-shadow:0 0 8px rgba(229,160,13,.12),0 4px 18px rgba(0,0,0,.35)}50%{box-shadow:0 0 22px rgba(229,160,13,.38),0 4px 18px rgba(0,0,0,.35)}}
@keyframes csb-tier-drop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes csb-card-flash{0%{border-color:rgba(229,160,13,.85);box-shadow:0 0 0 2px rgba(229,160,13,.38),0 12px 32px rgba(0,0,0,.42)}100%{border-color:rgba(255,255,255,.07);box-shadow:0 4px 18px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05)}}
@keyframes csb-load-pulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes csb-best-shine{from{transform:translateX(-120%) skewX(-18deg)}to{transform:translateX(320%) skewX(-18deg)}}
@keyframes wlnm-fade-up{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}
@keyframes wlnm-shimmer{0%{background-position:-600px 0}100%{background-position:600px 0}}
@keyframes wlnm-pulse-glow{0%,100%{box-shadow:0 0 8px rgba(229,160,13,.15),0 4px 16px rgba(0,0,0,.35)}50%{box-shadow:0 0 22px rgba(229,160,13,.38),0 4px 16px rgba(0,0,0,.35)}}
@keyframes wlnm-star-pop{0%{transform:scale(1)}40%{transform:scale(1.45)}70%{transform:scale(.88)}100%{transform:scale(1)}}
@keyframes wlnm-badge-in{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@keyframes wlnm-count-bump{0%{transform:scale(1)}50%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes deFadeUp{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:none}}
@keyframes de-fade-up{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}
@keyframes de-shimmer{0%{background-position:-600px 0}100%{background-position:600px 0}}
@keyframes de-cast-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}

@layer ct.effects {
  #ct-ambient{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:var(--ct-ambient-blend);transition:${rm?'none':'background 1.6s ease'};}
  #ct-ambient::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.42) 0%,rgba(0,0,0,.88) 60%,rgba(0,0,0,1) 100%);}
  #ct-ambient[data-off]{background:none;}
  #ct-mesh{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse 60% 50% at 20% 30%,var(--ct-accent-soft) 0%,transparent 70%),radial-gradient(ellipse 50% 60% at 80% 70%,var(--ct-ambient-blend) 0%,transparent 70%);opacity:.55;mix-blend-mode:screen;transition:${rm?'none':'background 2.4s ease'};}
  #ct-mesh[data-off]{display:none;}
  #ct-grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:var(--ct-grain-opacity);background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-size:128px 128px;animation:${rm?'none':'ct-grain .12s steps(1) infinite'};}
  #ct-grain[data-off]{display:none;}
  #ct-vignette{position:fixed;inset:0;z-index:2;pointer-events:none;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.32) 100%),linear-gradient(to right,rgba(0,0,0,.18) 0%,transparent 8%,transparent 92%,rgba(0,0,0,.18) 100%),linear-gradient(to bottom,rgba(0,0,0,.22) 0%,transparent 6%);}
  #ct-vignette[data-off]{display:none;}
  #ct-directors-top,#ct-directors-bot{position:fixed;left:0;right:0;z-index:9999;pointer-events:none;background:#000;height:0;transition:${rm?'none':'height .6s var(--ct-ease-cinema)'};}
  #ct-directors-top{top:0;}#ct-directors-bot{bottom:0;}
  [data-ct-mode="directors-cut"] #ct-directors-top,[data-ct-mode="directors-cut"] #ct-directors-bot{height:5.5vh;}
  body[data-ct-mode="directors-cut"]{animation:${rm?'none':'ct-gate-weave 6s ease-in-out infinite'};}
  #ct-cursor{position:fixed;z-index:99999;pointer-events:none;width:40px;height:40px;margin:-20px 0 0 -20px;border:1.5px solid rgba(255,255,255,.5);border-radius:50%;transition:${rm?'none':'width .25s var(--ct-ease-out),height .25s var(--ct-ease-out),margin .25s var(--ct-ease-out),border-color .2s,background .2s'};display:none;will-change:transform;}
  #ct-cursor.ct-cur-on{display:block;}
  #ct-cursor.ct-cur-btn{width:52px;height:52px;margin:-26px 0 0 -26px;border-color:var(--ct-accent);background:var(--ct-accent-soft);}
  #ct-cursor.ct-cur-poster{width:56px;height:56px;margin:-28px 0 0 -28px;border-color:rgba(255,255,255,.7);}
  .ct-cursor-none{cursor:none !important;}
}

@layer ct.glass {
  .ct-glass{background:rgba(14,14,22,var(--ct-glass-op));backdrop-filter:blur(var(--ct-blur-lg)) saturate(1.6);-webkit-backdrop-filter:blur(var(--ct-blur-lg)) saturate(1.6);border:1px solid rgba(255,255,255,var(--ct-border-a));box-shadow:var(--ct-sh-lg),inset 0 1px 0 rgba(255,255,255,.06);}
  .ct-glass-sm{background:rgba(14,14,22,calc(var(--ct-glass-op)*.7));backdrop-filter:blur(var(--ct-blur-md)) saturate(1.4);-webkit-backdrop-filter:blur(var(--ct-blur-md)) saturate(1.4);border:1px solid rgba(255,255,255,var(--ct-border-a));}
  .ct-glass-xl{background:rgba(14,14,22,calc(var(--ct-glass-op)*1.4));backdrop-filter:blur(var(--ct-blur-2xl)) saturate(1.8);-webkit-backdrop-filter:blur(var(--ct-blur-2xl)) saturate(1.8);border:1px solid rgba(255,255,255,var(--ct-border-a-hi));box-shadow:var(--ct-sh-xl),inset 0 1px 0 rgba(255,255,255,.07);}
}

@layer ct.components {
  .ct-skel{background:linear-gradient(90deg,rgba(255,255,255,.04) 0px,rgba(255,255,255,.10) 60px,rgba(255,255,255,.04) 120px);background-size:700px 100%;animation:ct-shimmer 1.6s infinite linear;border-radius:var(--ct-r-sm);}
  .ct-will-enter{opacity:0;transform:translateY(28px);transition:${rm?'none':'opacity .58s var(--ct-ease-out),transform .58s var(--ct-ease-out)'};}
  .ct-entered{opacity:1!important;transform:none!important;}
  .ct-btn{display:inline-flex;align-items:center;gap:var(--ct-sp2);padding:11px 28px;border-radius:var(--ct-r-pill);background:linear-gradient(135deg,var(--ct-accent) 0%,var(--ct-accent2) 100%);color:var(--ct-text-on-accent);border:none;font-family:var(--ct-font-body);font-size:var(--ct-text-sm);font-weight:700;cursor:pointer;position:relative;overflow:hidden;transition:${rm?'none':'transform .35s var(--ct-ease-spring),box-shadow .3s ease'};animation:ct-pulse-glow calc(3.2s*var(--ct-anim)) infinite ease-in-out;}
  .ct-btn:hover{transform:translateY(-3px);box-shadow:var(--ct-sh-accent);filter:brightness(1.08);animation:none;}
  .ct-btn-ghost{display:inline-flex;align-items:center;gap:var(--ct-sp2);padding:11px 22px;border-radius:var(--ct-r-pill);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,var(--ct-border-a-hi));color:rgba(255,255,255,.85);font-family:var(--ct-font-body);font-size:var(--ct-text-sm);font-weight:600;cursor:pointer;backdrop-filter:blur(var(--ct-blur-md));transition:${rm?'none':'all .3s var(--ct-ease-spring)'};}
  .ct-btn-ghost:hover{background:rgba(255,255,255,.16);transform:translateY(-3px);box-shadow:var(--ct-sh-md);}
  .ct-badge{display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:var(--ct-r-md);font-size:.6rem;font-weight:800;letter-spacing:.4px;backdrop-filter:blur(8px);}
  .ct-badge-accent{background:var(--ct-accent-dim);border:1px solid var(--ct-accent-soft);color:var(--ct-accent);}
  :focus-visible{outline:2px solid var(--ct-accent);outline-offset:3px;border-radius:var(--ct-r-xs);}
  .ct-e0{animation:${rm?'none':'ct-fade-in calc(.4s*var(--ct-anim)) ease both'};}
  .ct-e1{animation:${rm?'none':'ct-hero-enter calc(.6s*var(--ct-anim)) var(--ct-ease-out) both .15s'};}
  .ct-e2{animation:${rm?'none':'ct-fade-up calc(.5s*var(--ct-anim)) var(--ct-ease-out) both .3s'};}

  /* ── LEFT-EDGE THEME TRIGGER ── */
  #ct-panel-trigger{
    position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:8888;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
    width:28px;padding:18px 0;
    border-radius:0 var(--ct-r-md) var(--ct-r-md) 0;border:none;
    background:linear-gradient(180deg,var(--ct-accent) 0%,var(--ct-accent2) 100%);
    color:var(--ct-text-on-accent);
    box-shadow:4px 0 20px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.1);
    cursor:pointer;user-select:none;writing-mode:vertical-lr;text-orientation:mixed;
    font-family:var(--ct-font-body);font-size:.62rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;
    transition:${rm?'none':'width .3s var(--ct-ease-spring),box-shadow .3s ease'};
  }
  #ct-panel-trigger:hover{width:36px;box-shadow:6px 0 28px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.15);}
  #ct-panel-trigger.ct-trig-open{background:linear-gradient(180deg,var(--ct-accent2) 0%,var(--ct-accent) 100%);}

  /* ── THEME PANEL (slides in from left) ── */
  #ct-panel{
    position:fixed;left:28px;top:50%;transform:translateY(-50%);z-index:8889;
    width:408px;max-height:86vh;
    display:none;flex-direction:column;
    border-radius:var(--ct-r-2xl);overflow:hidden;
    background:rgba(11,11,19,.98);
    backdrop-filter:blur(var(--ct-blur-2xl)) saturate(1.9);
    -webkit-backdrop-filter:blur(var(--ct-blur-2xl)) saturate(1.9);
    border:1px solid rgba(255,255,255,.10);
    box-shadow:8px 0 48px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.05),inset 0 1px 0 rgba(255,255,255,.08);
    font-family:var(--ct-font-body);
  }
  #ct-panel.ct-panel-on{display:flex;animation:${rm?'none':'ct-panel-in .38s var(--ct-ease-spring) both'};}
  .ct-ph{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 16px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;}
  .ct-ph-title{display:flex;align-items:center;gap:10px;font-size:.95rem;font-weight:700;color:#fff;letter-spacing:-.2px;}
  .ct-ph-title span{font-size:.62rem;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--ct-accent);background:var(--ct-accent-soft);border:1px solid var(--ct-accent-dim);padding:2px 8px;border-radius:var(--ct-r-full);}
  .ct-ph-close{width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);cursor:pointer;font-size:.75rem;display:flex;align-items:center;justify-content:center;transition:${rm?'none':'all .2s var(--ct-ease-spring)'};}
  .ct-ph-close:hover{background:rgba(248,113,113,.15);border-color:rgba(248,113,113,.3);color:#f87171;}
  .ct-pb{overflow-y:auto;padding:20px 22px 22px;flex:1;scrollbar-width:thin;scrollbar-color:var(--ct-accent-dim) transparent;}
  .ct-ps{margin-bottom:26px;}.ct-ps:last-child{margin-bottom:0;}
  .ct-pl{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:1.1px;color:rgba(255,255,255,.35);margin-bottom:12px;display:flex;align-items:center;gap:8px;}
  .ct-pl::before{content:'';width:3px;height:.9em;background:var(--ct-accent);border-radius:3px;flex-shrink:0;}
  .ct-pl-sub{margin-left:auto;font-size:.62rem;font-weight:600;color:rgba(255,255,255,.22);text-transform:none;}
  .ct-sep{height:1px;background:rgba(255,255,255,.055);margin:0 0 26px;}
  .ct-pg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
  .ct-pw{position:relative;border-radius:var(--ct-r-md);cursor:pointer;overflow:hidden;border:2px solid transparent;aspect-ratio:16/9;transition:${rm?'none':'transform .3s var(--ct-ease-spring),border-color .2s'};}
  .ct-pw:hover{transform:scale(1.04);}
  .ct-pw.ct-on{border-color:var(--ct-accent);box-shadow:0 0 0 1px var(--ct-accent-dim);}
  .ct-pw-label{position:absolute;bottom:0;left:0;right:0;padding:14px 8px 7px;background:linear-gradient(to top,rgba(0,0,0,.82) 0%,transparent 100%);font-size:.7rem;font-weight:700;color:rgba(255,255,255,.92);}
  .ct-pw-check{position:absolute;top:6px;right:6px;width:18px;height:18px;border-radius:50%;background:var(--ct-accent);display:none;align-items:center;justify-content:center;font-size:.6rem;color:var(--ct-text-on-accent);font-weight:900;}
  .ct-pw.ct-on .ct-pw-check{display:flex;}
  .ct-color-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--ct-r-md);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);}
  .ct-color-swatch{width:40px;height:40px;border-radius:var(--ct-r-sm);cursor:pointer;border:2px solid rgba(255,255,255,.18);flex-shrink:0;overflow:hidden;position:relative;}
  .ct-cin{opacity:0;position:absolute;inset:0;width:100%;height:100%;cursor:pointer;}
  .ct-color-info{flex:1;min-width:0;}
  .ct-color-label{font-size:.68rem;color:rgba(255,255,255,.35);margin-bottom:3px;}
  .ct-chex{font-size:.9rem;font-weight:700;color:rgba(255,255,255,.85);}
  .ct-creset{padding:6px 12px;border-radius:var(--ct-r-pill);border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:rgba(255,255,255,.5);font-family:var(--ct-font-body);font-size:.72rem;font-weight:600;cursor:pointer;transition:all .2s;}
  .ct-creset:hover{background:var(--ct-accent-soft);border-color:var(--ct-accent-dim);color:var(--ct-accent);}
  .ct-tr{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:var(--ct-r-md);background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.055);margin-bottom:7px;transition:background .2s;}
  .ct-tr:hover{background:rgba(255,255,255,.055);}
  .ct-tl{display:flex;align-items:center;gap:12px;}
  .ct-ti{width:34px;height:34px;border-radius:var(--ct-r-sm);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center;font-size:.9rem;}
  .ct-tlab{font-size:.85rem;font-weight:500;color:rgba(255,255,255,.82);}
  .ct-sw{position:relative;width:44px;height:24px;flex-shrink:0;}
  .ct-sw input{opacity:0;width:0;height:0;position:absolute;}
  .ct-sl{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,.12);border-radius:24px;transition:.3s;}
  .ct-sl::before{position:absolute;content:'';height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s var(--ct-ease-spring);}
  .ct-sw input:checked+.ct-sl{background:var(--ct-accent);}
  .ct-sw input:checked+.ct-sl::before{transform:translateX(20px);}
  .ct-cursor-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;}
  .ct-copt{padding:10px 4px 8px;border-radius:var(--ct-r-md);border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);font-size:.65rem;font-weight:600;cursor:pointer;text-align:center;transition:all .2s var(--ct-ease-spring);display:flex;flex-direction:column;align-items:center;gap:5px;}
  .ct-copt:hover{background:rgba(255,255,255,.08);color:rgba(255,255,255,.8);transform:translateY(-2px);}
  .ct-copt.ct-on{background:var(--ct-accent-soft);border-color:var(--ct-accent-dim);color:var(--ct-accent);}
  .ct-copt-icon{font-size:1rem;line-height:1;}
  .ct-slider-row{padding:12px 14px;border-radius:var(--ct-r-md);background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.055);margin-bottom:7px;}
  .ct-slider-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
  .ct-slider-name{font-size:.82rem;font-weight:500;color:rgba(255,255,255,.75);}
  .ct-slider-val{font-size:.75rem;font-weight:700;color:var(--ct-accent);min-width:28px;text-align:right;}
  .ct-range{width:100%;accent-color:var(--ct-accent);height:4px;cursor:pointer;}
  .ct-dna-row{display:flex;gap:8px;}
  .ct-dna-swatch{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;}
  .ct-dna-color{width:100%;height:40px;border-radius:var(--ct-r-sm);animation:ct-dna-pulse 3s infinite ease-in-out;border:1px solid rgba(255,255,255,.06);}
  .ct-dna-name{font-size:.58rem;font-weight:600;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.5px;}
  .ct-dna-card{padding:14px;border-radius:var(--ct-r-md);background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.055);}
  .ct-dna-status{font-size:.82rem;color:rgba(255,255,255,.55);line-height:1.5;margin-bottom:12px;min-height:2.2em;}
  .ct-dna-status strong{color:var(--ct-accent);font-weight:700;}
  .ct-dna-footer{display:flex;align-items:center;gap:10px;}
  .ct-dna-enable{display:flex;align-items:center;gap:8px;flex:1;}
  .ct-dna-enable-label{font-size:.78rem;color:rgba(255,255,255,.45);}
  .ct-a11y-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;}
  .ct-a11y-opt{padding:9px 4px 8px;border-radius:var(--ct-r-md);border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);font-size:.65rem;font-weight:600;cursor:pointer;text-align:center;transition:all .2s var(--ct-ease-spring);display:flex;flex-direction:column;align-items:center;gap:5px;}
  .ct-a11y-opt:hover{background:rgba(255,255,255,.08);color:rgba(255,255,255,.8);}
  .ct-a11y-opt.ct-on{background:var(--ct-accent-soft);border-color:var(--ct-accent-dim);color:var(--ct-accent);}
  .ct-a11y-opt-icon{font-size:.9rem;}
  .ct-io{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .ct-iob{padding:12px 16px;border-radius:var(--ct-r-md);border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.04);color:rgba(255,255,255,.65);font-family:var(--ct-font-body);font-size:.8rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s var(--ct-ease-spring);}
  .ct-iob:hover{background:rgba(255,255,255,.09);color:#fff;transform:translateY(-1px);}
  .ct-pf{padding:14px 22px 16px;border-top:1px solid rgba(255,255,255,.055);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
  .ct-pf-left{font-size:.65rem;color:rgba(255,255,255,.2);}
  .ct-pf-left span{color:var(--ct-accent);font-weight:600;}
  .ct-kbd{display:inline-flex;gap:4px;align-items:center;font-size:.6rem;color:rgba(255,255,255,.22);}
  .ct-kbd kbd{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:1px 5px;font-family:inherit;font-size:inherit;}
}

@layer ct.native {
  .chp-sidebar-hidden,[data-ct-sidebar-hidden]{width:0!important;min-width:0!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;padding:0!important;margin:0!important;}
  .chp-topbar-styled{background:rgba(8,8,14,.94)!important;backdrop-filter:blur(28px) saturate(1.7)!important;border-bottom:1px solid rgba(255,255,255,.09)!important;}
  [class*="poster"]:hover img{box-shadow:0 0 0 2px var(--ct-accent-dim),var(--ct-sh-md)!important;}
  [class*="progress"][class*="fill"],[class*="progressBar"]{background:linear-gradient(90deg,var(--ct-accent),var(--ct-accent2))!important;}
  [data-ct-route="player"] #ct-grain{opacity:0;}
  [data-ct-route="player"] #ct-ambient{opacity:.12;}
  [data-ct-mood="horror"]{--ct-accent-h:350;--ct-accent-c:20;--ct-accent-l:52;}
  [data-ct-mood="sci-fi"]{--ct-accent-h:210;--ct-accent-c:22;--ct-accent-l:65;}
  [data-ct-mood="action"]{--ct-accent-h:28;--ct-accent-c:24;--ct-accent-l:62;}
  [data-ct-mood="romance"]{--ct-accent-h:340;--ct-accent-c:18;--ct-accent-l:70;}
  [data-ct-mood="fantasy"]{--ct-accent-h:280;--ct-accent-c:22;--ct-accent-l:68;}
  [data-ct-a11y="deuteranopia"] body{filter:url(#ct-cb-deut);}
  [data-ct-a11y="protanopia"] body{filter:url(#ct-cb-prot);}
  [data-ct-a11y="tritanopia"] body{filter:url(#ct-cb-trit);}
  [data-ct-a11y="high-contrast"]:root{--ct-border-a:.28;--ct-border-a-hi:.44;}
  [data-ct-mode="directors-cut"] [class*="catalog"],[data-ct-mode="directors-cut"] [class*="board"]{filter:saturate(.78) contrast(1.06);}
}

@layer ct.overrides {
  .chp-btn-watch,.chp-poster-watch-btn{background:linear-gradient(135deg,var(--ct-accent) 0%,var(--ct-accent2) 100%)!important;}
  .chp-minibar-fill{background:linear-gradient(90deg,var(--ct-accent),var(--ct-accent2))!important;}
  .chp-hero-dot.active{background:var(--ct-accent)!important;}
  .chp-filter-tab.active{background:rgba(var(--ct-accent-rgb),.12)!important;border-color:rgba(var(--ct-accent-rgb),.35)!important;color:var(--ct-accent)!important;}
  .chp-see-all:hover{color:var(--ct-accent)!important;}
  .chp-wl-stat-val,.chp-sticky-rating{color:var(--ct-accent)!important;}
  .chp-switch input:checked+.chp-slider{background:var(--ct-accent)!important;}
  [class*="progress"][class*="fill"],[class*="progressBar"][class*="fill"],[class*="seekBar"][class*="fill"]{background:linear-gradient(90deg,var(--ct-accent),var(--ct-accent2))!important;}
  [class*="navTab"][class*="selected"] [class*="label"],[class*="navTab"][class*="active"] [class*="label"]{color:var(--ct-accent)!important;}
  [class*="playButton"],[class*="PlayButton"]:not([class*="disabled"]){background:linear-gradient(135deg,var(--ct-accent) 0%,var(--ct-accent2) 100%)!important;}
  :focus-visible{outline-color:var(--ct-accent)!important;}
}
`;}

  // ── Theme DOM layers ──────────────────────────────────────────────────────────
  function ct_injectLayers(){
    [CT_AMBIENT_ID,CT_MESH_ID,CT_GRAIN_ID,CT_VIGNETTE_ID,CT_DIR_TOP_ID,CT_DIR_BOT_ID].forEach(id=>{
      if(!document.getElementById(id)){const el=document.createElement('div');el.id=id;document.body.insertBefore(el,document.body.firstChild);}
    });
    if(!document.getElementById(CT_CB_SVG_ID)){
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.id=CT_CB_SVG_ID;svg.setAttribute('style','position:absolute;width:0;height:0;pointer-events:none;');
      svg.innerHTML='<defs><filter id="ct-cb-deut"><feColorMatrix type="matrix" values=".625 .375 0 0 0  .7 .3 0 0 0  0 .3 .7 0 0  0 0 0 1 0"/></filter><filter id="ct-cb-prot"><feColorMatrix type="matrix" values=".567 .433 0 0 0  .558 .442 0 0 0  0 .242 .758 0 0  0 0 0 1 0"/></filter><filter id="ct-cb-trit"><feColorMatrix type="matrix" values=".95 .05 0 0 0  0 .433 .567 0 0  0 .475 .525 0 0  0 0 0 1 0"/></filter></defs>';
      document.body.appendChild(svg);
    }
    if(!document.getElementById(CT_CURSOR_ID)){const c=document.createElement('div');c.id=CT_CURSOR_ID;document.body.appendChild(c);}
  }

  // ── Apply preset / custom accent ──────────────────────────────────────────────
  function ct_applyPreset(name, preview=false){
    const p=PRESETS[name]; if(!p) return;
    const root=document.documentElement;
    root.style.setProperty('--ct-accent-l',p.l);
    root.style.setProperty('--ct-accent-c',p.c*100);
    root.style.setProperty('--ct-accent-h',p.h);
    root.style.setProperty('--ct-accent2',p.a2);
    root.style.setProperty('--ct-bg-l',p.bg);
    const gi=ct_config.sliders?.grainIntensity??1;
    root.style.setProperty('--ct-grain-opacity',(0.032*p.g*gi).toFixed(4));
    const hex=oklchToHex(p.l,p.c*100,p.h);
    const rgb=hexToRgb(hex);
    root.style.setProperty('--ct-accent-rgb',rgb.r+','+rgb.g+','+rgb.b);
    root.style.setProperty('--ct-text-on-accent',luminance(rgb.r,rgb.g,rgb.b)>.179?'#000':'#fff');
    root.style.setProperty('--row-accent','oklch('+p.l+'% '+p.c+' '+p.h+')');
    root.style.setProperty('--row-accent2',p.a2);
    if(!preview){ct_config.preset=name;ct_config.customAccent=null;ct_saveConfig();ct_updatePanelActivePreset(name);busEmit('presetChange',{preset:name});}
  }

  function ct_applyCustomAccent(hex){
    const rgb=hexToRgb(hex); const ok=rgbToOklch(rgb.r,rgb.g,rgb.b);
    const root=document.documentElement;
    root.style.setProperty('--ct-accent-l',ok.l);
    root.style.setProperty('--ct-accent-c',ok.c*100);
    root.style.setProperty('--ct-accent-h',ok.h);
    root.style.setProperty('--ct-accent-rgb',rgb.r+','+rgb.g+','+rgb.b);
    root.style.setProperty('--ct-text-on-accent',luminance(rgb.r,rgb.g,rgb.b)>.179?'#000':'#fff');
    root.style.setProperty('--row-accent',hex);root.style.setProperty('--row-accent2',hex);
    ct_config.customAccent=hex;ct_config.preset='custom';ct_saveConfig();
    busEmit('presetChange',{preset:'custom',accent:hex});
  }

  // ── Ambient lerp ──────────────────────────────────────────────────────────────
  class AmbientLerper{
    constructor(){this.cur={l:10,c:2,h:83};this.tgt={l:10,c:2,h:83};this._raf=null;}
    setTarget(l,c,h){this.tgt={l,c,h:this._sh(this.cur.h,h)};if(!this._raf)this._tick();}
    _sh(cur,tgt){const d=tgt-cur;return cur+(Math.abs(d)>180?(d>0?d-360:d+360):d);}
    _tick(){
      const t=.04;this.cur.l=lerp(this.cur.l,this.tgt.l,t);this.cur.c=lerp(this.cur.c,this.tgt.c,t);this.cur.h=lerp(this.cur.h,this.tgt.h,t);
      const r=document.documentElement;
      r.style.setProperty('--ct-ambient-l',this.cur.l.toFixed(2));r.style.setProperty('--ct-ambient-c',this.cur.c.toFixed(3));r.style.setProperty('--ct-ambient-h',this.cur.h.toFixed(1));
      const done=Math.abs(this.cur.l-this.tgt.l)<.15&&Math.abs(this.cur.c-this.tgt.c)<.002&&Math.abs(this.cur.h-this.tgt.h)<.3;
      this._raf=done?null:requestAnimationFrame(()=>this._tick());
    }
    seedFromPreset(name){const p=PRESETS[name]||PRESETS.cinema;this.setTarget(p.l*.15,p.c*.3,p.h);}
  }
  const ambientLerper=new AmbientLerper();

  // ── DNA Engine ────────────────────────────────────────────────────────────────
  class DNAEngine{
    constructor(){this.history=lsGetJSON(CT_DNA_KEY,[]);this.drift=ct_config.dna?.drift||{dH:0,dC:0,dL:0};}
    record(genres,rating=0){if(!ct_config.dna?.enabled)return;this.history.push({genres,rating,ts:Date.now()});if(this.history.length>50)this.history.shift();lsSetJSON(CT_DNA_KEY,this.history);this._recalc();}
    _recalc(){let dH=0,dC=0,dL=0,n=0;this.history.forEach(e=>(e.genres||[]).forEach(g=>{const m=MOOD[g];if(m){dH+=m.dH*.1;dC+=m.dC*.05;dL+=m.dL*.08;n++;}}));if(!n)return;this.drift={dH:Math.max(-15,Math.min(15,dH/n)),dC:Math.max(-.03,Math.min(.03,dC/n)),dL:Math.max(-8,Math.min(8,dL/n))};ct_config.dna.drift=this.drift;ct_saveConfig();this._apply();}
    _apply(){if(!ct_config.dna?.enabled)return;const p=PRESETS[ct_config.preset]||PRESETS.cinema;const root=document.documentElement;root.style.setProperty('--ct-accent-h',(p.h+this.drift.dH).toFixed(1));root.style.setProperty('--ct-accent-c',((p.c+this.drift.dC)*100).toFixed(2));root.style.setProperty('--ct-accent-l',(p.l+this.drift.dL).toFixed(1));}
    reset(){this.history=[];this.drift={dH:0,dC:0,dL:0};lsSetJSON(CT_DNA_KEY,[]);ct_config.dna.drift=this.drift;ct_saveConfig();ct_applyPreset(ct_config.preset);}
    getDrift(){return {...this.drift};}
  }
  const dnaEngine=new DNAEngine();

  // ── Cursor driver ─────────────────────────────────────────────────────────────
  class CursorDriver{
    constructor(){this.x=0;this.y=0;this.tx=0;this.ty=0;this._raf=null;this.el=null;this.trail=[];this.trailEls=[];this.style='none';}
    init(el){
      this.el=el;
      document.addEventListener('mousemove',e=>{this.tx=e.clientX;this.ty=e.clientY;});
      document.addEventListener('mouseover',e=>{
        const poster=e.target.closest('[class*="poster"],.chp-poster-card');
        const btn=e.target.closest('button,a,[role="button"]');
        if(!el)return;el.classList.toggle('ct-cur-poster',!!poster);el.classList.toggle('ct-cur-btn',!!btn&&!poster);
      });
    }
    setStyle(s){
      this.style=s;if(!this.el)return;this.el.dataset.style=s;
      document.body.classList.toggle('ct-cursor-none',s!=='none');
      this.el.classList.toggle('ct-cur-on',s!=='none');
      if(s==='none'&&this._raf){cancelAnimationFrame(this._raf);this._raf=null;}
      if(s==='trail')this._buildTrail();
      if(s!=='none'&&!this._raf)this._tick();
    }
    _buildTrail(){this.trailEls.forEach(e=>e.remove());this.trailEls=[];for(let i=0;i<5;i++){const t=document.createElement('div');const sz=7-i;t.style.cssText='position:fixed;width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:var(--ct-accent);pointer-events:none;z-index:99998;opacity:0;margin:'+(- sz/2)+'px 0 0 '+(- sz/2)+'px;';document.body.appendChild(t);this.trailEls.push(t);}}
    _tick(){const t=.14;this.x=lerp(this.x,this.tx,t);this.y=lerp(this.y,this.ty,t);if(this.el){this.el.style.left=this.x+'px';this.el.style.top=this.y+'px';}if(this.style==='trail'&&this.trailEls.length){this.trail.unshift({x:this.x,y:this.y});this.trail=this.trail.slice(0,5);this.trailEls.forEach((e,i)=>{const p=this.trail[i];if(p){e.style.left=p.x+'px';e.style.top=p.y+'px';e.style.opacity=(0.5-i*.09).toString();}});}this._raf=requestAnimationFrame(()=>this._tick());}
  }
  const cursorDriver=new CursorDriver();

  // ── FLIP controller ───────────────────────────────────────────────────────────
  class FlipController{
    constructor(){this._first=null;}
    capture(el){if(el)this._first=el.getBoundingClientRect();}
    play(targetEl){if(!this._first||!targetEl){this._first=null;return;}const first=this._first;this._first=null;const last=targetEl.getBoundingClientRect();const dx=first.left-last.left,dy=first.top-last.top,sx=first.width/last.width,sy=first.height/last.height;targetEl.style.transformOrigin='top left';targetEl.style.transition='none';targetEl.style.transform='translate('+dx+'px,'+dy+'px) scale('+sx+','+sy+')';requestAnimationFrame(()=>requestAnimationFrame(()=>{targetEl.style.transition='transform .55s cubic-bezier(.22,1,.36,1)';targetEl.style.transform='';}));}
  }
  const flipCtrl=new FlipController();

  // ── Effects ───────────────────────────────────────────────────────────────────
  function ct_setEffect(key,val){
    const g=document.getElementById(CT_GRAIN_ID),a=document.getElementById(CT_AMBIENT_ID),m=document.getElementById(CT_MESH_ID),v=document.getElementById(CT_VIGNETTE_ID);
    if(key==='grain'&&g)g.toggleAttribute('data-off',!val);
    if(key==='ambient'&&a)a.toggleAttribute('data-off',!val);
    if(key==='mesh'&&m)m.toggleAttribute('data-off',!val);
    if(key==='vignette'&&v)v.toggleAttribute('data-off',!val);
    if(key==='directorsCut')document.body.dataset.ctMode=val?'directors-cut':'';
  }
  function ct_applyAllEffects(){
    Object.entries(ct_config.effects).forEach(([k,v])=>{if(k!=='cursor')ct_setEffect(k,v);});
    document.documentElement.style.setProperty('--ct-anim',ct_config.sliders?.animSpeed??1);
    if(ct_config.a11y?.colorblind&&ct_config.a11y.colorblind!=='none')document.documentElement.dataset.ctA11y=ct_config.a11y.colorblind;
  }

  // ── Export / Import ───────────────────────────────────────────────────────────
  function ct_export(){return btoa(JSON.stringify({v:1,preset:ct_config.preset,accent:ct_config.customAccent,effects:ct_config.effects,sliders:ct_config.sliders,a11y:ct_config.a11y}));}
  function ct_import(str){
    const d=JSON.parse(atob(str));if(d.v!==1)throw new Error('version');
    if(d.preset&&PRESETS[d.preset])ct_applyPreset(d.preset);
    if(d.accent)ct_applyCustomAccent(d.accent);
    if(d.effects){ct_config.effects={...ct_config.effects,...d.effects};ct_applyAllEffects();}
    if(d.sliders){ct_config.sliders={...ct_config.sliders,...d.sliders};document.documentElement.style.setProperty('--ct-anim',ct_config.sliders.animSpeed);}
    if(d.a11y){ct_config.a11y={...ct_config.a11y,...d.a11y};}
    ct_saveConfig();ct_buildOrRefreshPanel();busEmit('import',d);
  }

  // ── Panel ─────────────────────────────────────────────────────────────────────
  function ct_buildOrRefreshPanel(){if(!document.getElementById(CT_PANEL_ID))ct_buildPanel();else ct_refreshPanel();}

  function ct_buildPanel(){
    const trig=document.createElement('button');trig.id=CT_TRIGGER_ID;trig.textContent='Theme';document.body.appendChild(trig);
    const panel=document.createElement('div');panel.id=CT_PANEL_ID;panel.innerHTML=ct_panelHTML();document.body.appendChild(panel);
    trig.addEventListener('click',()=>{const on=panel.classList.toggle('ct-panel-on');trig.classList.toggle('ct-trig-open',on);if(on)ct_refreshPanel();});
    document.addEventListener('click',e=>{if(!panel.contains(e.target)&&e.target!==trig&&panel.classList.contains('ct-panel-on')){panel.classList.remove('ct-panel-on');trig.classList.remove('ct-trig-open');}});
    ct_wirePanelEvents(panel);
  }

  function ct_panelHTML(){
    const presets=Object.entries(PRESETS);
    const grainVal=(ct_config.sliders?.grainIntensity??1).toFixed(1);
    const animVal=(ct_config.sliders?.animSpeed??1).toFixed(1);
    return `<div class="ct-ph"><div class="ct-ph-title">🎬 Cinematic Theme <span>v2.0</span></div><button class="ct-ph-close" id="ct-ph-close">✕</button></div>
<div class="ct-pb">
<div class="ct-ps"><div class="ct-pl">Preset</div><div class="ct-pg" id="ct-pgrid">
${presets.map(([k,p])=>`<div class="ct-pw${ct_config.preset===k?' ct-on':''}" data-preset="${k}" style="background:linear-gradient(135deg,oklch(${p.l}% ${p.c} ${p.h}deg) 0%,${p.a2} 100%)"><div class="ct-pw-label">${p.label}</div><div class="ct-pw-check">✓</div></div>`).join('')}
</div></div>
<div class="ct-ps"><div class="ct-pl">Custom Accent</div><div class="ct-color-row">
<div class="ct-color-swatch" id="ct-csw" style="background:${ct_config.customAccent||'#e5a00d'}"><input type="color" id="ct-cin" class="ct-cin" value="${ct_config.customAccent||'#e5a00d'}"></div>
<div class="ct-color-info"><div class="ct-color-label">Custom accent color</div><div class="ct-chex" id="ct-chex">${ct_config.customAccent||'#e5a00d'}</div></div>
<button class="ct-creset" id="ct-creset">Reset</button></div></div>
<div class="ct-ps"><div class="ct-pl">Effects</div>
${[['grain','🎞','Film Grain'],['ambient','🌊','Ambient Color'],['vignette','◉','Vignette'],['mesh','✦','Gradient Mesh'],['directorsCut','🎬',"Director's Cut"]].map(([k,ic,lab])=>`<div class="ct-tr"><div class="ct-tl"><div class="ct-ti">${ic}</div><span class="ct-tlab">${lab}</span></div><label class="ct-sw"><input type="checkbox" data-eff="${k}" ${ct_config.effects[k]?'checked':''}><span class="ct-sl"></span></label></div>`).join('')}
</div>
<div class="ct-ps"><div class="ct-pl">Cursor Style</div><div class="ct-cursor-grid">
${[['none','○','None'],['ring','◎','Ring'],['dot-halo','●','Dot'],['magnetic','⊕','Magnetic'],['trail','✦','Trail']].map(([s,ic,lab])=>`<div class="ct-copt${ct_config.effects.cursor===s?' ct-on':''}" data-cur="${s}"><div class="ct-copt-icon">${ic}</div>${lab}</div>`).join('')}
</div></div>
<div class="ct-ps"><div class="ct-pl">Intensity</div>
<div class="ct-slider-row"><div class="ct-slider-header"><span class="ct-slider-name">Film Grain</span><span class="ct-slider-val" id="ct-gr-val">${grainVal}×</span></div><input type="range" class="ct-range" id="ct-gr" min="0" max="2" step=".05" value="${ct_config.sliders?.grainIntensity??1}"></div>
<div class="ct-slider-row"><div class="ct-slider-header"><span class="ct-slider-name">Animation Speed</span><span class="ct-slider-val" id="ct-ar-val">${animVal}×</span></div><input type="range" class="ct-range" id="ct-ar" min=".3" max="2" step=".1" value="${ct_config.sliders?.animSpeed??1}"></div>
</div>
<div class="ct-ps"><div class="ct-pl">Content DNA <span class="ct-pl-sub">poster colors</span></div><div class="ct-dna-row">
${['primary','secondary','shadow','highlight','midtone'].map(n=>`<div class="ct-dna-swatch"><div class="ct-dna-color" id="ct-dna-${n}" style="background:var(--ct-dna-${n},rgba(255,255,255,.06))"></div><div class="ct-dna-name">${n}</div></div>`).join('')}
</div></div>
<div class="ct-ps"><div class="ct-pl">Living DNA</div><div class="ct-dna-card">
<div class="ct-dna-status" id="ct-dna-info">Watch more content to build your color DNA.</div>
<div class="ct-dna-footer"><div class="ct-dna-enable"><label class="ct-sw"><input type="checkbox" id="ct-dna-toggle" ${ct_config.dna?.enabled?'checked':''}><span class="ct-sl"></span></label><span class="ct-dna-enable-label">Adapt to my taste</span></div>
<button class="ct-iob" id="ct-dna-rst" style="padding:8px 14px;font-size:.72rem">Reset</button></div></div></div>
<div class="ct-ps"><div class="ct-pl">Accessibility</div><div class="ct-a11y-grid">
${[['none','👁','Normal'],['deuteranopia','🟢','Deuter.'],['protanopia','🔴','Protan.'],['tritanopia','🔵','Tritan.'],['high-contrast','⚡','Hi-Con']].map(([m,ic,lab])=>`<div class="ct-a11y-opt${ct_config.a11y?.colorblind===m?' ct-on':''}" data-a11y="${m}"><div class="ct-a11y-opt-icon">${ic}</div>${lab}</div>`).join('')}
</div></div>
<div class="ct-sep"></div>
<div class="ct-ps"><div class="ct-pl">Share Theme</div><div class="ct-io">
<button class="ct-iob" id="ct-exp"><span>📋</span> Copy Theme</button>
<button class="ct-iob" id="ct-imp"><span>📥</span> Paste Theme</button>
</div></div>
</div>
<div class="ct-pf"><div class="ct-pf-left">Cinematic Suite <span>v2.0</span></div><div class="ct-kbd"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>T</kbd></div></div>`;
  }

  function ct_wirePanelEvents(panel){
    const trig=document.getElementById(CT_TRIGGER_ID);
    panel.querySelector('#ct-ph-close')?.addEventListener('click',()=>{panel.classList.remove('ct-panel-on');trig?.classList.remove('ct-trig-open');});
    panel.querySelectorAll('.ct-pw').forEach(sw=>{
      let t=null;
      sw.addEventListener('mouseenter',()=>{t=setTimeout(()=>ct_applyPreset(sw.dataset.preset,true),200);});
      sw.addEventListener('mouseleave',()=>{clearTimeout(t);ct_applyPreset(ct_config.preset,true);});
      sw.addEventListener('click',()=>{clearTimeout(t);ct_applyPreset(sw.dataset.preset);});
    });
    const csw=panel.querySelector('#ct-csw'),cin=panel.querySelector('#ct-cin'),chex=panel.querySelector('#ct-chex');
    csw?.addEventListener('click',()=>cin?.click());
    cin?.addEventListener('input',e=>{const v=e.target.value;if(chex)chex.textContent=v;if(csw)csw.style.background=v;ct_applyCustomAccent(v);});
    panel.querySelector('#ct-creset')?.addEventListener('click',()=>{ct_config.customAccent=null;ct_applyPreset(ct_config.preset);ct_buildOrRefreshPanel();});
    panel.querySelectorAll('[data-eff]').forEach(cb=>{cb.addEventListener('change',()=>{ct_config.effects[cb.dataset.eff]=cb.checked;ct_saveConfig();ct_setEffect(cb.dataset.eff,cb.checked);});});
    panel.querySelectorAll('[data-cur]').forEach(ch=>{ch.addEventListener('click',()=>{ct_config.effects.cursor=ch.dataset.cur;ct_saveConfig();cursorDriver.setStyle(ch.dataset.cur);panel.querySelectorAll('[data-cur]').forEach(c=>c.classList.toggle('ct-on',c.dataset.cur===ch.dataset.cur));});});
    panel.querySelector('#ct-gr')?.addEventListener('input',e=>{const v=parseFloat(e.target.value);ct_config.sliders.grainIntensity=v;ct_saveConfig();const el=panel.querySelector('#ct-gr-val');if(el)el.textContent=v.toFixed(1)+'×';const p=PRESETS[ct_config.preset]||PRESETS.cinema;document.documentElement.style.setProperty('--ct-grain-opacity',(0.032*p.g*v).toFixed(4));});
    panel.querySelector('#ct-ar')?.addEventListener('input',e=>{const v=parseFloat(e.target.value);ct_config.sliders.animSpeed=v;ct_saveConfig();const el=panel.querySelector('#ct-ar-val');if(el)el.textContent=v.toFixed(1)+'×';document.documentElement.style.setProperty('--ct-anim',v);});
    panel.querySelectorAll('[data-a11y]').forEach(ch=>{ch.addEventListener('click',()=>{const m=ch.dataset.a11y;ct_config.a11y.colorblind=m;ct_saveConfig();document.documentElement.dataset.ctA11y=m==='none'?'':m;panel.querySelectorAll('[data-a11y]').forEach(c=>c.classList.toggle('ct-on',c.dataset.a11y===m));});});
    panel.querySelector('#ct-dna-rst')?.addEventListener('click',()=>{dnaEngine.reset();ct_refreshPanel();});
    panel.querySelector('#ct-dna-toggle')?.addEventListener('change',e=>{ct_config.dna.enabled=e.target.checked;ct_saveConfig();});
    panel.querySelector('#ct-exp')?.addEventListener('click',()=>{const str=ct_export();navigator.clipboard?.writeText(str).then(()=>{const b=panel.querySelector('#ct-exp');if(b){b.innerHTML='<span>✓</span> Copied!';setTimeout(()=>{b.innerHTML='<span>📋</span> Copy Theme';},1800);}}).catch(()=>prompt('Copy:',str));});
    panel.querySelector('#ct-imp')?.addEventListener('click',async()=>{const text=await navigator.clipboard?.readText().catch(()=>null)||prompt('Paste theme string:');if(text){try{ct_import(text);}catch{alert('Invalid theme string.');}}});
  }

  function ct_refreshPanel(){
    const drift=dnaEngine.getDrift();
    const info=document.getElementById('ct-dna-info');
    if(info)info.textContent=drift.dH||drift.dL?'Hue '+(drift.dH>0?'+':'')+drift.dH.toFixed(1)+'° · Lightness '+(drift.dL>0?'+':'')+drift.dL.toFixed(1)+'%':'Watch more content to build your color DNA.';
  }
  function ct_updatePanelActivePreset(name){document.querySelectorAll('.ct-pw').forEach(s=>s.classList.toggle('ct-on',s.dataset.preset===name));}

  // ── Route detection ───────────────────────────────────────────────────────────
  function ct_parseRoute(hash){
    if(!hash||hash==='#/'||hash==='#')return 'home';
    if(hash.startsWith('#/detail/'))return 'detail';
    if(hash.startsWith('#/discover')||hash.startsWith('#/search'))return 'discover';
    if(hash.startsWith('#/player')||hash.includes('/stream/'))return 'player';
    if(hash.startsWith('#/settings'))return 'settings';
    return 'other';
  }
  let ct_currentRoute='home', _lastHash='';
  function ct_onRouteChange(hash){
    const route=ct_parseRoute(hash);if(hash===_lastHash)return;_lastHash=hash;
    ct_currentRoute=route;document.body.dataset.ctRoute=route;busEmit('routeChange',{route,hash});
    if(route==='detail'){
      setTimeout(async()=>{
        const m=hash.match(/#\/detail\/[^/]+\/([^/?]+)/);const id=m?m[1]:null;
        if(id){
          const colors=await extractColors('https://images.metahub.space/background/medium/'+id+'/img');
          if(colors?.[0]){const{l,c,h}=colors[0];ambientLerper.setTarget(l*.18,c*.4,h);['primary','secondary','shadow','highlight','midtone'].forEach((n,i)=>{const el=document.getElementById('ct-dna-'+n);if(el&&colors[i])el.style.background='oklch('+colors[i].l+'% '+colors[i].c+' '+colors[i].h+'deg)';});}
          setTimeout(()=>{const genres=[...document.querySelectorAll('[class*="genre"],[data-genre]')].map(e=>e.textContent.trim()).filter(Boolean);if(genres.length){const matched=genres.find(g=>MOOD[g]);if(matched)document.body.dataset.ctMood=matched.toLowerCase().replace(/[^a-z]/g,'-');}},700);
        }
      },350);
    } else if(route==='home'){delete document.body.dataset.ctMood;ambientLerper.seedFromPreset(ct_config.preset);}
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  function ct_setupKeyboard(){
    document.addEventListener('keydown',e=>{
      if(e.ctrlKey&&e.shiftKey&&e.key==='T'){e.preventDefault();const p=document.getElementById(CT_PANEL_ID),t=document.getElementById(CT_TRIGGER_ID);if(p){const on=p.classList.toggle('ct-panel-on');t?.classList.toggle('ct-trig-open',on);if(on)ct_refreshPanel();}}
      if(e.ctrlKey&&e.shiftKey&&e.key==='D'){e.preventDefault();ct_config.effects.directorsCut=!ct_config.effects.directorsCut;ct_saveConfig();ct_setEffect('directorsCut',ct_config.effects.directorsCut);}
    });
  }

  // ── Theme init ────────────────────────────────────────────────────────────────
  async function initTheme(){
    ct_perfTier=await measurePerf();
    if(ct_perfTier==='low'){ct_config.effects.grain=false;ct_config.effects.mesh=false;}
    ct_injectCSS();ct_injectLayers();
    if(ct_config.customAccent)ct_applyCustomAccent(ct_config.customAccent);
    else ct_applyPreset(ct_config.preset);
    ct_applyAllEffects();
    if(ct_config.dna?.drift)dnaEngine._apply();
    const curEl=document.getElementById(CT_CURSOR_ID);
    if(curEl){cursorDriver.init(curEl);cursorDriver.setStyle(ct_config.effects.cursor);}
    window.addEventListener('hashchange',()=>ct_onRouteChange(location.hash));
    window.addEventListener('popstate',()=>ct_onRouteChange(location.hash));
    ct_onRouteChange(location.hash);
    ct_setupKeyboard();ct_buildPanel();ambientLerper.seedFromPreset(ct_config.preset);
    busOn('routeChange',({route})=>{if(route==='detail'){setTimeout(()=>{const genres=[...document.querySelectorAll('[class*="genre"],[data-genre]')].map(e=>e.textContent.trim()).filter(Boolean);if(genres.length)dnaEngine.record(genres,0);},900);}});
    // Public API
    window.CinematicTheme={
      version:CS_VERSION,getConfig:()=>JSON.parse(JSON.stringify(ct_config)),getPresets:()=>Object.keys(PRESETS),
      setPreset:n=>ct_applyPreset(n),setAccent:h=>ct_applyCustomAccent(h),
      setEffect:(k,v)=>{ct_config.effects[k]=v;ct_saveConfig();ct_setEffect(k,v);},
      setCursor:s=>cursorDriver.setStyle(s),recordView:(g,r)=>dnaEngine.record(g,r),
      resetDNA:()=>dnaEngine.reset(),on:(ev,fn)=>busOn(ev,fn),off:(ev,fn)=>busOff(ev,fn),
      export:()=>ct_export(),import:s=>ct_import(s),
    };
    console.log('%c[CinematicSuite] Theme v2.0 loaded · Ctrl+Shift+T','color:#e5a00d;font-weight:bold');
  }

  // ═══════════════════════════════════════════════════════════════════
  // ── MODULE: HOME PAGE ───────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

  const STYLE_ID    = 'chp-styles';
  const ROOT_ID     = 'chp-root';
  const AMBIENT_ID  = 'chp-ambient';
  const GRAIN_ID    = 'chp-grain';
  const CURSOR_ID   = 'chp-cursor';
  const VIGNETTE_ID = 'chp-vignette';
  const MINIBAR_ID  = 'chp-minibar';
  const SEARCH_ID   = 'chp-search';
  const WATCHLIST_ID= 'chp-watchlist-overlay';
  const WTWT_ID     = 'chp-wtwt';
  const CTX_ID      = 'chp-ctx';
  const FONT_ID     = 'chp-font';
  const CACHE_TTL   = 600_000;
  const HERO_INTERVAL = 9000;

  const FALLBACKS = [
    {id:'tt0903747',title:'Breaking Bad',type:'series',year:'2008',rating:'9.5'},
    {id:'tt1375666',title:'Inception',type:'movie',year:'2010',rating:'8.8'},
    {id:'tt0468569',title:'The Dark Knight',type:'movie',year:'2008',rating:'9.0'},
    {id:'tt5491994',title:'Planet Earth II',type:'series',year:'2016',rating:'9.5'},
    {id:'tt0816692',title:'Interstellar',type:'movie',year:'2014',rating:'8.7'},
  ];

  const GENRE_COLORS = {
    'Action':{r:239,g:68,b:68},'Adventure':{r:251,g:146,b:60},'Animation':{r:250,g:204,b:21},
    'Comedy':{r:74,g:222,b:128},'Crime':{r:248,g:113,b:113},'Drama':{r:229,g:160,b:13},
    'Fantasy':{r:192,g:132,b:252},'Horror':{r:185,g:28,b:28},'Mystery':{r:99,g:102,b:241},
    'Romance':{r:244,g:114,b:182},'Sci-Fi':{r:147,g:197,b:253},'Thriller':{r:156,g:163,b:175},
    'Western':{r:217,g:119,b:6},'default':{r:229,g:160,b:13},
  };

  // WLNM convenience aliases for home module
  function wlnmLoad(){return wlnm_loadStore();}
  function wlnmGet(id){return wlnm_getEntry(id);}
  function wlnmSet(id,patch){return wlnm_setEntry(id,patch);}

  // ═══════════════════════════════════════════════════════════════════════════
  class CinematicHome {
    constructor() {
      this.cache = new Map();
      this.heroTitles = [];
      this.heroIndex = 0;
      this.heroTimer = null;
      this.isActive = false;
      this.perfTier = 'high';
      this.cursorX = 0;
      this.cursorY = 0;
      this.cursorTargX = 0;
      this.cursorTargY = 0;
      this.io = null;
      this.contextCard = null;
      this.videoTimers = new Map();
      this.lastCatalog = lsGetJSON('chp-last-catalog', null);
      this.config = this.loadConfig();
      this.notifications = [];
      this.ambientColors = [{ r: 20, g: 20, b: 30 }, { r: 40, g: 20, b: 60 }, { r: 20, g: 40, b: 30 }];
      this.lastHash = '';
      this.init();
    }

    loadConfig() {
      return {
        ambient: lsGet('chp-cfg-ambient') !== 'false',
        particles: lsGet('chp-cfg-particles') !== 'false',
        grain: lsGet('chp-cfg-grain') !== 'false',
        videoPrev: lsGet('chp-cfg-videoprev') !== 'false',
        cursor: lsGet('chp-cfg-cursor') === 'true',   // off by default
        tilt: lsGet('chp-cfg-tilt') !== 'false',
        minibar: lsGet('chp-cfg-minibar') !== 'false',
        heroSpeed: parseInt(lsGet('chp-cfg-speed') || '9000'),
        compact: lsGet('chp-cfg-compact') === 'true',
        ticker: lsGet('chp-cfg-ticker') !== 'false',
        ...lsGetJSON('chp-config', {}),
      };
    }

    saveConfig() { lsSetJSON('chp-config', this.config); }

    // ── INIT ─────────────────────────────────────────────────────────────────
    async init() {
      this.perfTier = await measurePerf();
      if (this.perfTier === 'low') {
        this.config.particles = false;
        this.config.grain = false;
        this.config.videoPrev = false;
        this.config.tilt = false;
      }

      injectHomeCSS(this.perfTier);
      this.setupHashWatcher();
      this.setupKeyboardShortcuts();
      this.setupNetworkWatcher();
      this.injectPersistentLayers();
      this.mergeNavToTopBar();

      if (this.isHomePage()) this.mount();
    }

    isHomePage() {
      const h = window.location.hash;
      return h === '#/' || h === '' || h === '#' || /^#\/(board|index)/.test(h);
    }

    // ── HASH WATCHER ─────────────────────────────────────────────────────────
    setupHashWatcher() {
      window.addEventListener('hashchange', () => {
        const wasHome = this.isActive;
        if (this.isHomePage()) {
          if (!wasHome) this.mount();
        } else {
          if (wasHome) this.unmount();
        }
      });
    }

    // ── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────
    setupKeyboardShortcuts() {
      document.addEventListener('keydown', e => {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.target.matches('input,textarea')) {
          e.preventDefault(); this.toggleSearch();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault(); this.toggleSearch();
        }
        if (e.key === 'Escape') {
          this.closeSearch();
          this.closeWatchlist();
          this.closeWTWT();
          this.closeContextMenu();
          document.querySelectorAll('.chp-notif-panel,.chp-settings-panel').forEach(p => p.classList.remove('visible'));
        }
        if (!this.isActive) return;
        if (e.key === 'ArrowLeft' && !document.getElementById(SEARCH_ID)?.classList.contains('chp-search-open')) this.prevHero();
        if (e.key === 'ArrowRight' && !document.getElementById(SEARCH_ID)?.classList.contains('chp-search-open')) this.nextHero();
      });
    }

    // ── NETWORK WATCHER ──────────────────────────────────────────────────────
    setupNetworkWatcher() {
      const bar = document.createElement('div');
      bar.className = 'chp-offline-bar';
      bar.id = 'chp-offline-bar';
      bar.textContent = '● Offline — showing cached content';
      document.body.appendChild(bar);

      window.addEventListener('offline', () => bar.classList.add('visible'));
      window.addEventListener('online', () => { bar.classList.remove('visible'); if (this.isActive && this.heroTitles.length === 0) this.mount(); });
    }

    // ── MERGE SIDEBAR ICONS INTO NATIVE TOP BAR — FINAL ──────────────────────
    mergeNavToTopBar() {
      const TOPNAV_ID = 'chp-topnav-group';
      const STYLE_ID = 'chp-topnav-styles';
      const TOPBAR_ID = 'chp-topbar-style';

      // ── Our own nav definition — hardcoded routes + hand-written SVG icons ──
      const NAV = [
        {
          label: 'Board',
          hash: '#/',
          svg: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>'
        },
        {
          label: 'Discover',
          hash: '#/discover',
          svg: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
        },
        {
          label: 'Library',
          hash: '#/library',
          svg: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'
        },
        {
          label: 'Calendar',
          hash: '#/calendar',
          svg: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
        },
        {
          label: 'Addons',
          hash: '#/addons',
          svg: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'
        },
        {
          label: 'Settings',
          hash: '#/settings',
          svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
        },
      ];

      // ── Inject styles once ─────────────────────────────────────────────────
      if (!document.getElementById(STYLE_ID)) {
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
          #${TOPNAV_ID} {
            display: flex !important;
            align-items: center !important;
            gap: 2px !important;
            padding: 0 8px 0 6px !important;
            border-right: 1px solid rgba(255,255,255,.08) !important;
            flex-shrink: 0 !important;
            align-self: stretch !important;
          }
          .chp-tnl {
            display: inline-flex !important;
            align-items: center !important;
            gap: 0px !important;
            height: 32px !important;
            max-width: 32px !important;
            padding: 0 7px !important;
            border-radius: 8px !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-decoration: none !important;
            cursor: pointer !important;
            color: rgba(255,255,255,.5) !important;
            font-family: 'DM Sans', -apple-system, sans-serif !important;
            font-size: .78rem !important;
            font-weight: 600 !important;
            letter-spacing: .1px !important;
            flex-shrink: 0 !important;
            transition:
              max-width .24s cubic-bezier(.34,1.2,.64,1),
              gap .24s cubic-bezier(.34,1.2,.64,1),
              color .16s ease,
              background .16s ease !important;
          }
          .chp-tnl:hover {
            max-width: 130px !important;
            gap: 6px !important;
            color: rgba(255,255,255,.88) !important;
            background: rgba(255,255,255,.07) !important;
          }
          .chp-tnl.chp-nav-active {
            color: #e5a00d !important;
            background: rgba(229,160,13,.12) !important;
          }
          .chp-tnl.chp-nav-active:hover {
            max-width: 130px !important;
            gap: 6px !important;
            background: rgba(229,160,13,.17) !important;
          }
          .chp-tnl svg {
            width: 16px !important;
            height: 16px !important;
            flex-shrink: 0 !important;
            display: block !important;
            stroke: currentColor !important;
            fill: none !important;
            stroke-width: 1.75 !important;
            stroke-linecap: round !important;
            stroke-linejoin: round !important;
            pointer-events: none !important;
            transition: none !important;
          }
          .chp-tnl-label {
            opacity: 0 !important;
            max-width: 0 !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            pointer-events: none !important;
            transition:
              opacity .15s ease .04s,
              max-width .24s cubic-bezier(.34,1.2,.64,1) !important;
          }
          .chp-tnl:hover .chp-tnl-label,
          .chp-tnl.chp-nav-active:hover .chp-tnl-label {
            opacity: 1 !important;
            max-width: 90px !important;
          }
        `;
        document.head.appendChild(s);
      }

      const attempt = (retries = 0) => {
        try {
          if (retries > 30) return;
          if (document.getElementById(TOPNAV_ID)) return;

          // ── 1. Find nav links via title attributes ─────────────────────────
          // These confirmed working in v1.3.x
          const boardLink = document.querySelector('a[title="Board"]');
          if (!boardLink) { setTimeout(() => attempt(retries + 1), 400); return; }

          // ── 2. Find sidebar — walk up to first narrow ancestor ─────────────
          let sidebar = boardLink;
          for (let i = 0; i < 12 && sidebar && sidebar !== document.body; i++) {
            const r = sidebar.getBoundingClientRect();
            if (r.width >= 28 && r.width <= 120 && r.height > 200) break;
            sidebar = sidebar.parentElement;
          }
          if (!sidebar || sidebar === document.body || sidebar === document.documentElement) {
            console.warn('[CinematicHome] sidebar not found, retry', retries);
            setTimeout(() => attempt(retries + 1), 400); return;
          }
          console.log('[CinematicHome] sidebar:', sidebar.className?.slice(0, 60));

          // ── 3. Find search input ───────────────────────────────────────────
          const searchInput = document.querySelector(
            'input[placeholder*="Search"], input[placeholder*="search"], input[placeholder*="paste"]'
          );
          if (!searchInput) { setTimeout(() => attempt(retries + 1), 400); return; }

          // ── 4. Find topBar — pure DOM: the element that contains the search
          //    but is NOT the sidebar and NOT its descendant ───────────────────
          const sidebarParent = sidebar.parentElement;
          let topBar = null;

          // Strategy A: sibling of sidebar that contains search
          if (sidebarParent) {
            for (const child of Array.from(sidebarParent.children)) {
              if (child !== sidebar && child.contains(searchInput)) {
                topBar = child; break;
              }
            }
          }

          // Strategy B: walk up from search, stop when we reach a direct child
          // of sidebarParent (i.e., a sibling-level element to the sidebar)
          if (!topBar) {
            let el = searchInput;
            while (el && el.parentElement !== sidebarParent && el.parentElement !== document.body) {
              el = el.parentElement;
            }
            if (el && el.parentElement === sidebarParent && el !== sidebar) topBar = el;
          }

          // Strategy C: walk up from search 6 levels — take whatever we find
          if (!topBar) {
            let el = searchInput;
            for (let i = 0; i < 6 && el && el !== document.body; i++) {
              el = el.parentElement;
            }
            if (el && el !== document.body) topBar = el;
          }

          if (!topBar) {
            console.warn('[CinematicHome] topBar not found, retry', retries);
            setTimeout(() => attempt(retries + 1), 400); return;
          }
          console.log('[CinematicHome] topBar:', topBar.tagName, topBar.className?.slice(0, 60));

          // ── 5. Find insertion point — first child of topBar ───────────────
          const insertAfter = topBar.firstElementChild;
          console.log('[CinematicHome] insertAfter:', insertAfter?.tagName, insertAfter?.className?.slice(0, 40));

          // ── 6. Build nav group ─────────────────────────────────────────────
          const group = document.createElement('div');
          group.id = TOPNAV_ID;

          NAV.forEach(item => {
            const btn = document.createElement('a');
            btn.className = 'chp-tnl';
            btn.setAttribute('href', item.hash);
            btn.setAttribute('title', item.label);

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('width', '16');
            svg.setAttribute('height', '16');
            svg.setAttribute('aria-hidden', 'true');
            svg.innerHTML = item.svg;
            btn.appendChild(svg);

            const lbl = document.createElement('span');
            lbl.className = 'chp-tnl-label';
            lbl.textContent = item.label;
            btn.appendChild(lbl);

            btn.addEventListener('click', e => {
              e.preventDefault();
              e.stopPropagation();
              window.location.hash = item.hash;
            });

            group.appendChild(btn);
          });

          // ── 7. Insert group inside topBar, after first child ───────────────
          if (insertAfter) {
            insertAfter.insertAdjacentElement('afterend', group);
          } else {
            topBar.insertBefore(group, topBar.firstChild);
          }

          // ── 6. Style the top bar ───────────────────────────────────────────
          if (!document.getElementById(TOPBAR_ID)) {
            const cls = Array.from(topBar.classList).find(c => c.length > 3 && !c.startsWith('chp-'));
            const sel = cls ? '.' + cls : '[class*="nav-bar"],[class*="topbar"],[class*="header"]';
            const st = document.createElement('style');
            st.id = TOPBAR_ID;
            st.textContent = sel + `{
              background: rgba(8,8,14,.96) !important;
              backdrop-filter: blur(32px) saturate(1.8) !important;
              -webkit-backdrop-filter: blur(32px) saturate(1.8) !important;
              border-bottom: 1px solid rgba(255,255,255,.08) !important;
              box-shadow: 0 1px 0 rgba(255,255,255,.04), 0 4px 28px rgba(0,0,0,.5) !important;
            }`;
            document.head.appendChild(st);
          }

          // ── 8. Hide the sidebar we already found above ─────────────────────
          if (sidebar && sidebar !== document.body && sidebar !== document.documentElement) {
            // display:none removes it from flex flow entirely — no width reservation
            sidebar.style.setProperty('display', 'none', 'important');
            this._sidebar = sidebar;
            console.log('[CinematicHome] Sidebar hidden:', sidebar.className?.slice(0, 60));

            // ── 8. Remove content wrapper left offset 50ms later ──────────
            // By then the sidebar is gone from layout and margins are measurable
            setTimeout(() => {
              const sp = sidebar.parentElement;
              if (!sp) return;
              // Zero any margin-left on siblings that reserved sidebar space
              Array.from(sp.children).forEach(child => {
                if (child.id?.startsWith('chp-')) return;
                const ml = parseInt(getComputedStyle(child).marginLeft) || 0;
                const pl = parseInt(getComputedStyle(child).paddingLeft) || 0;
                if (ml >= 30 && ml <= 120) child.style.setProperty('margin-left', '0', 'important');
                if (pl >= 30 && pl <= 120) child.style.setProperty('padding-left', '0', 'important');
              });
              // Also scan one level deeper — Stremio sometimes nests the offset
              sp.querySelectorAll('[class*="route"], [class*="content"], [class*="board"]').forEach(el => {
                const ml = parseInt(getComputedStyle(el).marginLeft) || 0;
                if (ml >= 30 && ml <= 120) el.style.setProperty('margin-left', '0', 'important');
              });
            }, 50);

            // MutationObserver to keep sidebar gone if Stremio re-adds display
            new MutationObserver(() => {
              sidebar.style.setProperty('display', 'none', 'important');
            }).observe(sidebar, { attributes: true, attributeFilter: ['style'] });
          }

          // ── 9. Active state — sync with hash ──────────────────────────────
          this._updateTopNavActive(group);
          window.addEventListener('hashchange', () => this._updateTopNavActive(group));

          console.log('[CinematicHome] ✓ Nav built and injected into top bar');

        } catch (err) {
          console.error('[CinematicHome] mergeNavToTopBar failed:', err);
        }
      };

      setTimeout(() => attempt(), 900);
    }

    _updateTopNavActive(group) {
      const hash = window.location.hash || '#/';
      group.querySelectorAll('.chp-tnl').forEach(btn => {
        const h = btn.getAttribute('href') || '';
        const isActive =
          (h === '#/' && (hash === '#/' || hash === '' || hash === '#')) ||
          (h !== '#/' && h.length > 2 && hash.startsWith(h));
        btn.classList.toggle('chp-nav-active', isActive);
      });
    }




    // ── PERSISTENT LAYERS ────────────────────────────────────────────────────
    injectPersistentLayers() {
      // Ambient background
      if (!document.getElementById(AMBIENT_ID)) {
        const a = document.createElement('div');
        a.id = AMBIENT_ID;
        document.body.insertBefore(a, document.body.firstChild);
      }

      // Film grain
      if (this.config.grain && !document.getElementById(GRAIN_ID)) {
        const g = document.createElement('div'); g.id = GRAIN_ID;
        document.body.appendChild(g);
      }

      // Vignette
      if (!document.getElementById(VIGNETTE_ID)) {
        const v = document.createElement('div'); v.id = VIGNETTE_ID;
        document.body.appendChild(v);
      }

      // Custom cursor
      if (this.config.cursor && !document.getElementById(CURSOR_ID)) {
        const cur = document.createElement('div'); cur.id = CURSOR_ID;
        document.body.appendChild(cur);
        this.setupCursor();
      }

      // Search overlay
      if (!document.getElementById(SEARCH_ID)) this.buildSearchOverlay();

      // Watchlist overlay
      if (!document.getElementById(WATCHLIST_ID)) this.buildWatchlistOverlay();

      // WTWT overlay
      if (!document.getElementById(WTWT_ID)) this.buildWTWTOverlay();

      // Context menu
      if (!document.getElementById(CTX_ID)) {
        const c = document.createElement('div'); c.id = CTX_ID;
        document.body.appendChild(c);
      }

      // Minibar
      if (!document.getElementById(MINIBAR_ID)) this.buildMinibar();
    }

    // ── CUSTOM CURSOR ────────────────────────────────────────────────────────
    setupCursor() {
      const cur = document.getElementById(CURSOR_ID);
      if (!cur) return;

      document.addEventListener('mousemove', e => {
        this.cursorTargX = e.clientX;
        this.cursorTargY = e.clientY;

        if (this.isActive) cur.classList.add('chp-cursor-active');

        const el = e.target;
        const isBtn = el.matches('button,.chp-btn-watch,.chp-btn-info,.chp-poster-watch-btn,.chp-minibar-resume,.chp-sticky-resume');
        const isPoster = el.closest('.chp-poster-card');

        cur.classList.toggle('chp-cursor-hover-btn', isBtn && !isPoster);
        cur.classList.toggle('chp-cursor-hover-poster', !!isPoster && !isBtn);
      });

      document.addEventListener('mouseleave', () => cur.classList.remove('chp-cursor-active'));

      const animateCursor = () => {
        this.cursorX = lerp(this.cursorX, this.cursorTargX, 0.18);
        this.cursorY = lerp(this.cursorY, this.cursorTargY, 0.18);
        cur.style.left = this.cursorX + 'px';
        cur.style.top = this.cursorY + 'px';
        requestAnimationFrame(animateCursor);
      };
      requestAnimationFrame(animateCursor);
    }

    // ── AMBIENT UPDATE ───────────────────────────────────────────────────────
    async updateAmbient(backdropUrl) {
      if (!this.config.ambient) return;
      const amb = document.getElementById(AMBIENT_ID);
      if (!amb) return;

      const colors = await extractColors(backdropUrl);
      const sm = getSeasonMod();
      const tm = getTimeContext();
      this.ambientColors = colors;

      // Write shared state for other plugins
      if (!window.__stremioPlugins) window.__stremioPlugins = {};
      window.__stremioPlugins.ambientColors = colors;
      window.__stremioPlugins.currentHeroId = this.heroTitles[this.heroIndex]?.id;

      const [c1, c2, c3] = colors.map(c => ({
        r: Math.min(255, Math.round(c.r * sm.rMod * tm.tempMod)),
        g: Math.min(255, Math.round(c.g * sm.gMod)),
        b: Math.min(255, Math.round(c.b * sm.bMod)),
      }));

      amb.style.background = `
        radial-gradient(ellipse at 20% 40%, rgba(${c1.r},${c1.g},${c1.b},.32) 0%, transparent 55%),
        radial-gradient(ellipse at 80% 25%, rgba(${c2.r},${c2.g},${c2.b},.24) 0%, transparent 50%),
        radial-gradient(ellipse at 55% 85%, rgba(${c3.r},${c3.g},${c3.b},.18) 0%, transparent 45%),
        linear-gradient(180deg, rgba(8,8,14,1) 0%, rgba(8,8,14,.92) 100%)
      `;
    }

    // ── MOUNT ─────────────────────────────────────────────────────────────────
    async mount() {
      if (document.getElementById(ROOT_ID)) return;
      this.isActive = true;

      const parent = this.findHomeContainer();
      if (!parent) {
        setTimeout(() => this.isActive && this.mount(), 400);
        return;
      }

      // Build root with skeletons
      const root = document.createElement('div');
      root.id = ROOT_ID;
      root.innerHTML = this.buildSkeleton();
      parent.insertBefore(root, parent.firstChild);

      // Hide native board rows
      this.hideBoardRows();

      // Fetch data
      const [catalog, cwTitles] = await Promise.all([
        this.fetchCatalog(),
        this.loadContinueWatching(),
      ]);

      // Stale guard
      if (!this.isActive || !this.isHomePage()) return;

      // Save catalog snapshot for "new" detection
      if (catalog) {
        const currentIds = catalog.all.map(t => t.id);
        const prevIds = this.lastCatalog?.ids || [];
        catalog.newIds = currentIds.filter(id => !prevIds.includes(id));
        lsSetJSON('chp-last-catalog', { ids: currentIds, ts: Date.now() });
      }

      // Preload top 4 hero images
      const heroPool = cwTitles.length ? cwTitles.slice(0, 3) : (catalog?.featured || FALLBACKS.slice(0, 3));
      this.heroTitles = heroPool.slice(0, 6);

      // Preload first hero backdrop
      if (this.heroTitles[0]) {
        const bg = `https://images.metahub.space/background/large/${this.heroTitles[0].id}/img`;
        await preloadImg(bg);
      }

      if (!this.isActive || !this.isHomePage()) return;

      // Render full UI
      root.innerHTML = '';
      root.className = 'chp-entrance-0';
      this.buildFullUI(root, catalog, cwTitles);

      // Setup interactions
      this.setupHeroRotation();
      this.setupScrollBehavior(root);
      this.setupScrollEntrances(root);
      this.setupContextMenu();
      this.buildMinibarContent(cwTitles);
      this.buildParticles();
      this.checkNotifications(cwTitles, catalog);
    }

    // ── UNMOUNT ───────────────────────────────────────────────────────────────
    unmount() {
      this.isActive = false;
      document.getElementById(ROOT_ID)?.remove();

      if (this.heroTimer) { clearInterval(this.heroTimer); this.heroTimer = null; }
      if (this.io) { this.io.disconnect(); this.io = null; }

      this.videoTimers.forEach(t => clearTimeout(t));
      this.videoTimers.clear();

      this.restoreBoardRows();
      this.heroTitles = [];
      this.heroIndex = 0;

      // Remove cursor hint
      document.getElementById(CURSOR_ID)?.classList.remove('chp-cursor-active');

      // NOTE: we intentionally do NOT remove the top nav merge on unmount —
      // it should persist across Stremio navigation for consistent UX.
      // The sidebar stays hidden and the top bar stays styled globally.
    }

    // ── HOME CONTAINER ────────────────────────────────────────────────────────
    findHomeContainer() {
      const selectors = [
        '[class*="board-container"] > div > div > div',
        '[class*="board-container"] > div > div',
        '[class*="board-container"] > div',
        '[class*="board-container"]',
        '.route-content > div',
        '[class*="route-content"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return document.querySelector('[class*="board"]') || document.body;
    }

    hideBoardRows() {
      document.querySelectorAll('[class*="board-row"]').forEach(row => {
        row._chpDisplay = row.style.display;
        row.style.cssText += '; visibility:hidden !important; height:0 !important; overflow:hidden !important; margin:0 !important; padding:0 !important;';
      });
    }

    restoreBoardRows() {
      document.querySelectorAll('[class*="board-row"]').forEach(row => {
        row.style.cssText = row.style.cssText
          .replace(/;?\s*visibility:[^;]+/g, '')
          .replace(/;?\s*height:0[^;]+/g, '')
          .replace(/;?\s*overflow:hidden ![^;]+/g, '')
          .replace(/;?\s*margin:0[^;]+/g, '')
          .replace(/;?\s*padding:0[^;]+/g, '');
      });
    }

    // ── SKELETON ──────────────────────────────────────────────────────────────
    buildSkeleton() {
      const skelRow = () => `
        <div class="chp-row" style="margin-bottom:36px">
          <div class="chp-row-header">
            <div class="chp-skel" style="width:160px;height:18px;border-radius:8px"></div>
            <div class="chp-skel" style="width:60px;height:14px;border-radius:6px"></div>
          </div>
          <div style="display:flex;gap:14px;padding:0 32px;overflow:hidden">
            ${Array.from({ length: 8 }, (_, i) => `
              <div style="flex:0 0 148px;display:flex;flex-direction:column;gap:8px;animation-delay:${i * 35}ms">
                <div class="chp-skel chp-poster-img-placeholder" style="width:148px;aspect-ratio:2/3;border-radius:14px"></div>
                <div class="chp-skel" style="height:10px;width:80%;border-radius:5px;margin:0 auto"></div>
              </div>`).join('')}
          </div>
        </div>`;

      return `
        <div style="position:relative;height:68vh;min-height:520px;overflow:hidden;margin-bottom:0">
          <div class="chp-skel" style="position:absolute;inset:0;border-radius:0;animation-duration:2s"></div>
          <div style="position:absolute;bottom:0;left:0;right:0;padding:0 32px 48px">
            <div class="chp-skel" style="width:300px;height:72px;border-radius:12px;margin-bottom:16px"></div>
            <div class="chp-skel" style="width:480px;height:12px;border-radius:6px;margin-bottom:8px"></div>
            <div class="chp-skel" style="width:360px;height:12px;border-radius:6px;margin-bottom:22px"></div>
            <div style="display:flex;gap:10px">
              <div class="chp-skel" style="width:140px;height:42px;border-radius:22px"></div>
              <div class="chp-skel" style="width:110px;height:42px;border-radius:22px"></div>
            </div>
          </div>
        </div>
        <div style="padding:16px 32px;display:flex;gap:8px">
          ${Array.from({ length: 6 }, () => `<div class="chp-skel" style="width:80px;height:30px;border-radius:20px"></div>`).join('')}
        </div>
        ${skelRow()}${skelRow()}${skelRow()}`;
    }

    // ── FULL UI ───────────────────────────────────────────────────────────────
    buildFullUI(root, catalog, cwTitles) {
      // 1. Hero
      const hero = this.buildHero();
      root.appendChild(hero);

      // 2. Sticky bar
      const sticky = document.createElement('div');
      sticky.id = 'chp-sticky-bar';
      sticky.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px">
          <span class="chp-sticky-title" id="chp-sticky-title">${this.heroTitles[0]?.title || ''}</span>
          <span class="chp-sticky-rating" id="chp-sticky-rating">${this.heroTitles[0]?.rating ? '⭐ ' + this.heroTitles[0].rating : ''}</span>
        </div>
        <button class="chp-sticky-resume" id="chp-sticky-resume">▶ Resume</button>`;
      root.appendChild(sticky);

      // 3. Greeting + stats
      const greeting = this.buildGreetingStrip(cwTitles, catalog);
      greeting.className += ' chp-entrance-2';
      root.appendChild(greeting);

      // 4. Ticker
      if (this.config.ticker && catalog?.all?.length) {
        const ticker = this.buildTicker(catalog.all);
        root.appendChild(ticker);
      }

      // 5. Filter bar
      const filterBar = this.buildFilterBar(catalog);
      filterBar.className += ' chp-entrance-3';
      root.appendChild(filterBar);

      // 6. Rows
      const rows = document.createElement('div');
      rows.id = 'chp-rows';
      rows.className = 'chp-entrance-4';

      if (cwTitles.length) {
        rows.appendChild(this.buildCWRow(cwTitles));
      }

      if (catalog) {
        const rowDefs = this.buildRowDefinitions(catalog, cwTitles);
        rowDefs.forEach(def => rows.appendChild(this.buildCatalogRow(def, catalog)));
      }

      root.appendChild(rows);

      // First hero render
      if (this.heroTitles.length) {
        this.renderHeroTitle(this.heroTitles[0], true);
        this.updateAmbient(`https://images.metahub.space/background/large/${this.heroTitles[0].id}/img`);
      }

      // Sticky resume action
      document.getElementById('chp-sticky-resume')?.addEventListener('click', () => {
        if (this.heroTitles[this.heroIndex]) {
          navToTitle(this.heroTitles[this.heroIndex].id, this.heroTitles[this.heroIndex].type);
        }
      });
    }

    // ── HERO ──────────────────────────────────────────────────────────────────
    buildHero() {
      const hero = document.createElement('div');
      hero.id = 'chp-hero';
      hero.className = 'chp-entrance-1';

      hero.innerHTML = `
        <div class="chp-hero-bg" id="chp-hero-bg"></div>
        <div class="chp-hero-grad"></div>
        <div id="chp-particles-layer"></div>
        <div class="chp-hero-content">
          <div class="chp-hero-left">
            <div class="chp-hero-logo-wrap">
              <img class="chp-hero-logo" id="chp-hero-logo" src="" alt="" onerror="this.style.display='none';document.getElementById('chp-hero-title-text').style.display='block'">
              <div class="chp-hero-title-text" id="chp-hero-title-text" style="display:none"></div>
            </div>
            <div class="chp-hero-meta" id="chp-hero-meta"></div>
            <div class="chp-hero-desc" id="chp-hero-desc"></div>
            <div class="chp-hero-actions">
              <button class="chp-btn-watch" id="chp-hero-watch">
                <div class="chp-watch-progress" id="chp-watch-progress">
                  <svg viewBox="0 0 16 16" width="16" height="16">
                    <circle class="chp-progress-bg" cx="8" cy="8" r="6" stroke-dasharray="37.7" stroke-dashoffset="0"/>
                    <circle class="chp-progress-fg" cx="8" cy="8" r="6" id="chp-progress-arc" stroke-dasharray="37.7" stroke-dashoffset="37.7"/>
                  </svg>
                </div>
                ▶ Watch Now
              </button>
              <button class="chp-btn-info" id="chp-hero-info">ⓘ More Info</button>
              <button class="chp-btn-info" id="chp-hero-wtwt" style="padding:11px 16px" title="What to Watch Tonight">🎲</button>
            </div>
          </div>
          <div class="chp-hero-right" id="chp-hero-thumbs"></div>
        </div>
        <div class="chp-hero-dots" id="chp-hero-dots"></div>`;

      // Hero button events
      hero.querySelector('#chp-hero-watch').addEventListener('click', () => {
        const t = this.heroTitles[this.heroIndex];
        if (t) navToTitle(t.id, t.type);
      });
      hero.querySelector('#chp-hero-info').addEventListener('click', () => {
        const t = this.heroTitles[this.heroIndex];
        if (t) navToTitle(t.id, t.type);
      });
      hero.querySelector('#chp-hero-wtwt').addEventListener('click', () => this.openWTWT());

      // Magnetic buttons
      if (!prefersReducedMotion) {
        [hero.querySelector('#chp-hero-watch'), hero.querySelector('#chp-hero-info')].forEach(btn => {
          if (!btn) return;
          btn.addEventListener('mousemove', e => {
            const r = btn.getBoundingClientRect();
            const dx = e.clientX - (r.left + r.width / 2);
            const dy = e.clientY - (r.top + r.height / 2);
            btn.style.transform = `translateY(-3px) translate(${dx * .18}px, ${dy * .18}px)`;
          });
          btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
        });
      }

      // Hero pause on hover
      hero.addEventListener('mouseenter', () => { if (this.heroTimer) { clearInterval(this.heroTimer); this.heroTimer = null; } });
      hero.addEventListener('mouseleave', () => { if (!this.heroTimer && this.isActive) this.startHeroTimer(); });

      return hero;
    }

    buildParticles() {
      if (!this.config.particles || prefersReducedMotion) return;
      const layer = document.getElementById('chp-particles-layer');
      if (!layer) return;
      for (let i = 0; i < 10; i++) {
        const p = document.createElement('div');
        p.className = 'chp-particle';
        const size = 4 + Math.random() * 6;
        p.style.cssText = `
          width:${size}px; height:${size}px;
          left:${8 + Math.random() * 82}%;
          top:${10 + Math.random() * 70}%;
          --dur:${7 + Math.random() * 8}s;
          --del:${Math.random() * -10}s;
          background: rgba(${this.ambientColors[i % 3]?.r || 229},${this.ambientColors[i % 3]?.g || 160},${this.ambientColors[i % 3]?.b || 13}, .06);
        `;
        layer.appendChild(p);
      }
    }

    // ── RENDER HERO TITLE ────────────────────────────────────────────────────
    async renderHeroTitle(title, initial = false) {
      const bg = document.getElementById('chp-hero-bg');
      const logo = document.getElementById('chp-hero-logo');
      const titleText = document.getElementById('chp-hero-title-text');
      const meta = document.getElementById('chp-hero-meta');
      const desc = document.getElementById('chp-hero-desc');
      const arc = document.getElementById('chp-progress-arc');

      if (!bg || !logo) return;

      // Exit animation
      if (!initial && !prefersReducedMotion) {
        [logo, titleText, desc].forEach(el => el?.classList.add('chp-exiting'));
        meta?.classList.add('chp-exiting');
        await new Promise(r => setTimeout(r, 260));
      }

      // Preload new backdrop
      const backdropUrl = `https://images.metahub.space/background/large/${title.id}/img`;
      const logoUrl = `https://images.metahub.space/logo/medium/${title.id}/img`;

      if (!initial) await preloadImg(backdropUrl);

      if (!this.isActive) return;

      // Apply backdrop
      bg.style.backgroundImage = `url(${backdropUrl})`;
      if (!prefersReducedMotion) {
        bg.style.opacity = '0';
        bg.style.transition = 'opacity .6s ease';
        requestAnimationFrame(() => requestAnimationFrame(() => { bg.style.opacity = '1'; }));
      }

      // Logo
      [logo, titleText].forEach(el => el?.classList.remove('chp-exiting'));
      logo.style.display = '';
      logo.src = logoUrl;
      titleText.textContent = title.title;
      titleText.style.display = 'none';

      // Meta pills
      const pills = [];
      if (title.year) pills.push(`<span class="chp-hero-meta-pill">${title.year}</span>`);
      if (title.rating && title.rating !== 'na') pills.push(`<span class="chp-hero-meta-pill chp-rating">⭐ ${title.rating}</span>`);
      if (title.duration && title.duration !== 'Unknown') pills.push(`<span class="chp-hero-meta-pill">${title.duration}</span>`);
      if (title.seasons) pills.push(`<span class="chp-hero-meta-pill">${title.seasons}</span>`);
      if (title.genres?.length) pills.push(`<span class="chp-hero-meta-pill">${title.genres.slice(0, 2).join(' · ')}</span>`);
      meta?.classList.remove('chp-exiting');
      if (meta) meta.innerHTML = pills.join('');

      // Description
      desc?.classList.remove('chp-exiting');
      if (desc) desc.textContent = title.description || '';

      // Progress arc
      if (arc) {
        const prog = title.progress || 0;
        const c = 37.7;
        arc.style.strokeDashoffset = String(c - (c * prog));
        document.getElementById('chp-watch-progress')?.style.setProperty('display', prog > 0 ? '' : 'none');
      }

      // Thumbnails
      this.renderHeroThumbs();

      // Dots
      this.renderHeroDots();

      // Sticky bar
      const st = document.getElementById('chp-sticky-title');
      const sr = document.getElementById('chp-sticky-rating');
      if (st) st.textContent = title.title;
      if (sr) sr.textContent = title.rating && title.rating !== 'na' ? `⭐ ${title.rating}` : '';

      // Ambient
      this.updateAmbient(backdropUrl);
    }

    renderHeroThumbs() {
      const wrap = document.getElementById('chp-hero-thumbs');
      if (!wrap) return;
      const others = this.heroTitles.filter((_, i) => i !== this.heroIndex).slice(0, 3);
      wrap.innerHTML = others.map((t, i) => `
        <div class="chp-hero-thumb ${i === 0 ? 'active' : ''}" data-idx="${this.heroTitles.indexOf(t)}">
          <img src="https://images.metahub.space/poster/large/${t.id}/img"
               onerror="this.style.opacity='0'"
               alt="${t.title}" loading="lazy">
          <div class="chp-hero-thumb-info">
            <div class="chp-hero-thumb-title">${t.title}</div>
            <div class="chp-hero-thumb-meta">${t.year || ''} · ${t.type === 'movie' ? 'Movie' : 'Series'}</div>
          </div>
        </div>`).join('');

      wrap.querySelectorAll('.chp-hero-thumb').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.idx);
          this.heroIndex = idx;
          this.renderHeroTitle(this.heroTitles[idx]);
        });
      });
    }

    renderHeroDots() {
      const wrap = document.getElementById('chp-hero-dots');
      if (!wrap) return;
      wrap.innerHTML = this.heroTitles.map((_, i) =>
        `<div class="chp-hero-dot ${i === this.heroIndex ? 'active' : ''}" data-i="${i}"></div>`
      ).join('');
      wrap.querySelectorAll('.chp-hero-dot').forEach(d => {
        d.addEventListener('click', () => {
          this.heroIndex = parseInt(d.dataset.i);
          this.renderHeroTitle(this.heroTitles[this.heroIndex]);
        });
      });
    }

    // ── HERO ROTATION ─────────────────────────────────────────────────────────
    setupHeroRotation() {
      this.startHeroTimer();
    }

    startHeroTimer() {
      if (this.heroTimer) clearInterval(this.heroTimer);
      this.heroTimer = setInterval(() => {
        if (!this.isActive) { clearInterval(this.heroTimer); return; }
        this.nextHero();
      }, this.config.heroSpeed);
    }

    nextHero() {
      if (!this.heroTitles.length) return;
      this.heroIndex = (this.heroIndex + 1) % this.heroTitles.length;
      this.renderHeroTitle(this.heroTitles[this.heroIndex]);
      // Preload next+1
      const next2 = (this.heroIndex + 1) % this.heroTitles.length;
      if (this.heroTitles[next2]) {
        preloadImg(`https://images.metahub.space/background/large/${this.heroTitles[next2].id}/img`);
      }
    }

    prevHero() {
      if (!this.heroTitles.length) return;
      this.heroIndex = (this.heroIndex - 1 + this.heroTitles.length) % this.heroTitles.length;
      this.renderHeroTitle(this.heroTitles[this.heroIndex]);
    }

    // ── GREETING ──────────────────────────────────────────────────────────────
    buildGreetingStrip(cwTitles, catalog) {
      const div = document.createElement('div');
      div.id = 'chp-greeting';

      const wlData = wlnmLoad();
      const wlCount = Object.keys(wlData).length;
      const totalRating = Object.values(wlData).reduce((a, v) => a + (v.rating || 0), 0);
      const avgRating = wlCount > 0 ? (totalRating / wlCount).toFixed(1) : '—';
      const genres = this.computeTopGenres(cwTitles, wlData);

      div.innerHTML = `
        <div class="chp-greeting-text">${buildGreeting(cwTitles)}</div>
        <div class="chp-stats-strip">
          <div class="chp-stat-item">
            <span class="chp-stat-val">${wlCount}</span>
            <span>in watchlist</span>
          </div>
          <div class="chp-stat-item">
            <span class="chp-stat-val">${cwTitles.length}</span>
            <span>in progress</span>
          </div>
          ${avgRating !== '—' ? `<div class="chp-stat-item"><span class="chp-stat-val">${avgRating}</span><span>avg rating</span></div>` : ''}
          ${genres[0] ? `<div class="chp-stat-item"><span class="chp-stat-val" style="font-size:.72rem">${genres[0]}</span><span>top genre</span></div>` : ''}
        </div>`;
      return div;
    }

    computeTopGenres(cwTitles, wlData) {
      const counts = {};
      [...cwTitles, ...Object.values(wlData)].forEach(t => {
        (t.genres || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; });
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
    }

    // ── TICKER ────────────────────────────────────────────────────────────────
    buildTicker(titles) {
      const ticker = document.createElement('div');
      ticker.id = 'chp-ticker';
      const items = [...titles, ...titles]; // double for seamless loop
      ticker.innerHTML = `<div class="chp-ticker-track">${items.map(t => `
        <div class="chp-ticker-item" onclick="window.location.hash='#/detail/${t.type}/${t.id}'">
          <img class="chp-ticker-img"
               src="https://images.metahub.space/background/large/${t.id}/img"
               loading="lazy" onerror="this.style.display='none'">
          <span class="chp-ticker-title">${t.title}</span>
        </div>`).join('')}</div>`;
      return ticker;
    }

    // ── FILTER BAR ───────────────────────────────────────────────────────────
    buildFilterBar(catalog) {
      const bar = document.createElement('div');
      bar.id = 'chp-filter-bar';

      const genres = catalog ? this.extractTopGenres(catalog.all, 5) : [];
      const tabs = [
        { id: 'all', label: 'All' },
        { id: 'movies', label: 'Movies' },
        { id: 'series', label: 'Series' },
        ...genres.map(g => ({ id: `genre-${g.toLowerCase()}`, label: g })),
      ];

      const active = lsGet('chp-filter') || 'all';

      bar.innerHTML = tabs.map(t => `
        <button class="chp-filter-tab ${t.id === active ? 'active' : ''}" data-filter="${t.id}">${t.label}</button>
      `).join('');

      bar.querySelectorAll('.chp-filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          bar.querySelectorAll('.chp-filter-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          lsSet('chp-filter', tab.dataset.filter);
          this.applyFilter(tab.dataset.filter);
        });
      });

      if (active !== 'all') setTimeout(() => this.applyFilter(active), 100);
      return bar;
    }

    applyFilter(filterId) {
      document.querySelectorAll('.chp-row').forEach(row => {
        if (filterId === 'all') { row.classList.remove('chp-row-hidden'); return; }
        const rowType = row.dataset.type || '';
        const rowGenre = row.dataset.genre || '';
        let show = false;
        if (filterId === 'movies' && rowType === 'movie') show = true;
        if (filterId === 'series' && rowType === 'series') show = true;
        if (filterId.startsWith('genre-') && rowGenre.toLowerCase() === filterId.replace('genre-', '')) show = true;
        if (filterId === 'movies' && rowType === 'cw') show = true;
        if (filterId === 'series' && rowType === 'cw') show = true;
        if (filterId === 'all') show = true;
        row.classList.toggle('chp-row-hidden', !show);
      });
    }

    extractTopGenres(titles, n) {
      const counts = {};
      titles.forEach(t => (t.genres || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
    }

    // ── ROW DEFINITIONS ───────────────────────────────────────────────────────
    buildRowDefinitions(catalog, cwTitles) {
      const rows = [];

      // Top this week
      rows.push({ id: 'top-week', label: 'Top This Week', type: 'mixed', genre: '', accentKey: 'default', titles: catalog.all.slice(0, 16), featured: true });

      // New releases
      const newTitles = catalog.all.filter(t => catalog.newIds?.includes(t.id));
      if (newTitles.length > 2) {
        rows.push({ id: 'new', label: 'New Arrivals', type: 'mixed', genre: '', accentKey: 'Sci-Fi', titles: newTitles.slice(0, 14), badge: 'NEW', featured: false });
      }

      // Movies
      if (catalog.movies?.length) {
        rows.push({ id: 'movies', label: 'Popular Movies', type: 'movie', genre: '', accentKey: 'Action', titles: catalog.movies.slice(0, 16), featured: true });
      }

      // Series
      if (catalog.series?.length) {
        rows.push({ id: 'series', label: 'Popular Series', type: 'series', genre: '', accentKey: 'Drama', titles: catalog.series.slice(0, 16), featured: true });
      }

      // Critically acclaimed
      const acclaimed = catalog.all.filter(t => parseFloat(t.rating) >= 8.0).sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
      if (acclaimed.length > 4) {
        rows.push({ id: 'acclaimed', label: 'Critically Acclaimed', type: 'mixed', genre: '', accentKey: 'Drama', titles: acclaimed.slice(0, 14), featured: false });
      }

      // Hidden gems (rating > 7.5, few votes proxy by lower rank)
      const gems = catalog.all.filter(t => parseFloat(t.rating) >= 7.5).slice(8, 22);
      if (gems.length > 3) {
        rows.push({ id: 'gems', label: 'Hidden Gems', type: 'mixed', genre: '', accentKey: 'Mystery', titles: gems, featured: false });
      }

      // Because you watched (genre cross-ref)
      if (cwTitles.length) {
        const cwGenres = new Set(cwTitles.flatMap(t => t.genres || []));
        if (cwGenres.size) {
          const rec = catalog.all.filter(t =>
            (t.genres || []).some(g => cwGenres.has(g)) &&
            !cwTitles.find(c => c.id === t.id)
          ).slice(0, 14);
          if (rec.length > 3) {
            const topGenre = [...cwGenres][0] || '';
            rows.push({ id: 'because', label: `Because You Watch ${topGenre}`, type: 'mixed', genre: topGenre, accentKey: topGenre, titles: rec, featured: false });
          }
        }
      }

      return rows;
    }

    // ── CONTINUE WATCHING ROW ─────────────────────────────────────────────────
    buildCWRow(cwTitles) {
      const row = document.createElement('div');
      row.className = 'chp-row chp-will-enter';
      row.dataset.type = 'cw';
      row.style.position = 'relative';

      const accentColor = GENRE_COLORS['default'];
      row.style.setProperty('--row-accent', `rgb(${accentColor.r},${accentColor.g},${accentColor.b})`);
      row.style.setProperty('--row-accent2', `#ff6b35`);

      row.innerHTML = `
        <div class="chp-row-header">
          <div class="chp-row-title">
            Continue Watching
            <span class="chp-row-count">${cwTitles.length} title${cwTitles.length > 1 ? 's' : ''}</span>
          </div>
          <button class="chp-see-all" onclick="window.location.hash='#/library'">See All →</button>
        </div>
        <div class="chp-row-scroll-wrap">
          <button class="chp-scroll-btn chp-scroll-left" aria-label="Scroll left">‹</button>
          <div class="chp-row-scroller" id="chp-cw-scroller">
            ${cwTitles.map((t, i) => this.buildCWCard(t, i)).join('')}
          </div>
          <button class="chp-scroll-btn chp-scroll-right can-scroll" aria-label="Scroll right">›</button>
        </div>`;

      this.setupRowScroll(row);
      this.setupPosterCardEvents(row, cwTitles);

      return row;
    }

    buildCWCard(title, index) {
      const progress = title.progress || 0;
      const circumference = 37.7;
      const offset = circumference - (circumference * progress);
      const wlEntry = wlnmGet(title.id);
      const isWatched = wlEntry?.status === 'completed' || progress >= 0.95;

      return `
        <div class="chp-poster-card${index === 0 ? ' chp-featured' : ''}"
             style="--i:${index};flex:0 0 ${index === 0 ? '210px' : '175px'}"
             data-id="${title.id}" data-type="${title.type}" data-idx="${index}">
          <img class="chp-poster-img" loading="lazy" alt="${title.title}"
               src="https://images.metahub.space/poster/large/${title.id}/img"
               onerror="this.style.background='${colorBlurPlaceholder(80, 80, 120)}'">
          <div class="chp-poster-badges">
            <span class="chp-badge chp-badge-rating">⭐ ${title.rating || '?'}</span>
            ${isWatched ? '<span class="chp-badge" style="background:rgba(74,222,128,.82);color:#000">✓</span>' : ''}
          </div>
          <div class="chp-cw-progress-wrap">
            <div class="chp-cw-progress-fill" style="width:${(progress * 100).toFixed(1)}%"></div>
          </div>
          <div class="chp-poster-hover">
            <div class="chp-poster-hover-title">${title.title}</div>
            <div class="chp-poster-hover-meta">${title.type === 'series' ? (title.currentEp || '') : 'Movie'} · ${Math.round((1 - progress) * 100)}% left</div>
            <button class="chp-poster-watch-btn" data-id="${title.id}" data-type="${title.type}">
              ${isWatched ? '↺ Rewatch' : '▶ Resume'}
            </button>
          </div>
        </div>`;
    }

    // ── CATALOG ROW ───────────────────────────────────────────────────────────
    buildCatalogRow(def, catalog) {
      const row = document.createElement('div');
      row.className = 'chp-row chp-will-enter';
      row.dataset.type = def.type;
      row.dataset.genre = def.genre || '';
      row.style.position = 'relative';

      const gc = GENRE_COLORS[def.accentKey] || GENRE_COLORS.default;
      const gc2 = GENRE_COLORS[def.accentKey] ? { r: 255, g: 107, b: 53 } : GENRE_COLORS.default;
      row.style.setProperty('--row-accent', `rgb(${gc.r},${gc.g},${gc.b})`);
      row.style.setProperty('--row-accent2', `rgb(${gc2.r},${gc2.g},${gc2.b})`);

      row.innerHTML = `
        <div class="chp-row-accent-edge" style="background:linear-gradient(to bottom,rgba(${gc.r},${gc.g},${gc.b},.5),transparent)"></div>
        <div class="chp-row-header">
          <div class="chp-row-title">
            ${def.label}
            <span class="chp-row-count">${def.titles.length}</span>
          </div>
          <button class="chp-see-all" data-see-all>See All →</button>
        </div>
        <div class="chp-row-scroll-wrap">
          <button class="chp-scroll-btn chp-scroll-left">‹</button>
          <div class="chp-row-scroller">
            ${def.titles.map((t, i) => this.buildPosterCard(t, i, def, catalog)).join('')}
          </div>
          <button class="chp-scroll-btn chp-scroll-right can-scroll">›</button>
        </div>`;

      this.setupRowScroll(row);
      this.setupPosterCardEvents(row, def.titles);
      // Wire "See All" → discover route with type/catalog context
      row.querySelector('[data-see-all]')?.addEventListener('click', () => {
        const type = row.dataset.type || 'movie';
        const cat  = row.dataset.catalogId || '';
        window.location.hash = cat ? '#/discover/'+type+'/'+cat : '#/discover';
      });
      if (this.config.tilt && !prefersReducedMotion) this.setupTiltEffect(row);

      return row;
    }

    buildPosterCard(title, index, def, catalog) {
      const isFeatured = index === 0 && def?.featured;
      const isNew = catalog?.newIds?.includes(title.id);
      const wlEntry = wlnmGet(title.id);
      const width = isFeatured ? '210px' : '175px';

      const featuredBadge = isFeatured ? `<span class="chp-badge-featured">${def?.label?.includes('Trending') ? 'Trending #1' : def?.label?.includes('New') ? 'Just Added' : '#1 Pick'}</span>` : '';

      return `
        <div class="chp-poster-card${isFeatured ? ' chp-featured' : ''}"
             style="--i:${index};flex:0 0 ${width}"
             data-id="${title.id}" data-type="${title.type}" data-idx="${index}">
          ${featuredBadge}
          <img class="chp-poster-img" loading="lazy" alt="${title.title}"
               src="https://images.metahub.space/poster/large/${title.id}/img"
               onerror="this.style.background='${colorBlurPlaceholder(40, 40, 80)}'">
          <div class="chp-poster-badges">
            <span class="chp-badge chp-badge-rating">⭐ ${title.rating || '?'}</span>
            ${isNew ? '<span class="chp-badge chp-badge-new">NEW</span>' : ''}
            ${wlEntry ? '<span class="chp-badge chp-badge-wl">🔖</span>' : ''}
          </div>
          <div class="chp-poster-hover">
            <div class="chp-poster-hover-title">${title.title}</div>
            <div class="chp-poster-hover-meta">${title.year || ''} · ${title.type === 'movie' ? 'Movie' : 'Series'}</div>
            <button class="chp-poster-watch-btn" data-id="${title.id}" data-type="${title.type}">▶ Watch</button>
          </div>
        </div>`;
    }

    // ── ROW SCROLL ────────────────────────────────────────────────────────────
    setupRowScroll(row) {
      const scroller = row.querySelector('.chp-row-scroller');
      const leftBtn = row.querySelector('.chp-scroll-left');
      const rightBtn = row.querySelector('.chp-scroll-right');
      if (!scroller || !leftBtn || !rightBtn) return;

      const amt = Math.min(900, window.innerWidth * 0.75);

      const update = () => {
        leftBtn.classList.toggle('can-scroll', scroller.scrollLeft > 10);
        rightBtn.classList.toggle('can-scroll', scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 10);
      };

      leftBtn.addEventListener('click', e => { e.stopPropagation(); scroller.scrollBy({ left: -amt, behavior: 'smooth' }); });
      rightBtn.addEventListener('click', e => { e.stopPropagation(); scroller.scrollBy({ left: amt, behavior: 'smooth' }); });
      scroller.addEventListener('scroll', update);

      // Momentum drag-to-scroll
      let isDragging = false, startX = 0, scrollStart = 0;
      scroller.addEventListener('mousedown', e => {
        isDragging = true; startX = e.clientX; scrollStart = scroller.scrollLeft;
        scroller.style.cursor = 'grabbing';
      });
      document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        scroller.scrollLeft = scrollStart - (e.clientX - startX);
      });
      document.addEventListener('mouseup', () => { isDragging = false; scroller.style.cursor = ''; });

      setTimeout(update, 200);
    }

    // ── POSTER CARD EVENTS ────────────────────────────────────────────────────
    setupPosterCardEvents(container, titles) {
      container.addEventListener('click', e => {
        const watchBtn = e.target.closest('.chp-poster-watch-btn');
        if (watchBtn) {
          e.stopPropagation();
          const card = watchBtn.closest('.chp-poster-card');
          card?.classList.add('chp-loading');
          navToTitle(watchBtn.dataset.id, watchBtn.dataset.type);
          setTimeout(() => card?.classList.remove('chp-loading'), 1800);
          return;
        }

        const card = e.target.closest('.chp-poster-card');
        if (!card) return;

        // Click transition — brief scale before nav
        if (!prefersReducedMotion) {
          card.style.transition = 'transform .2s ease, opacity .2s ease';
          card.style.transform = 'scale(1.06)';
          card.style.zIndex = '20';
          setTimeout(() => {
            navToTitle(card.dataset.id, card.dataset.type);
          }, 150);
        } else {
          navToTitle(card.dataset.id, card.dataset.type);
        }
      });

      // Right-click context menu
      container.addEventListener('contextmenu', e => {
        const card = e.target.closest('.chp-poster-card');
        if (!card) return;
        e.preventDefault();
        this.contextCard = card;
        this.showContextMenu(e.clientX, e.clientY, card.dataset.id, card.dataset.type, titles[parseInt(card.dataset.idx)]);
      });
    }

    // ── 3D TILT ───────────────────────────────────────────────────────────────
    setupTiltEffect(container) {
      container.querySelectorAll('.chp-poster-card').forEach(card => {
        card.addEventListener('mousemove', e => {
          const r = card.getBoundingClientRect();
          const dx = (e.clientX - r.left) / r.width - 0.5;
          const dy = (e.clientY - r.top) / r.height - 0.5;
          const tiltX = dy * -10;
          const tiltY = dx * 10;
          card.style.transform = `translateY(-6px) scale(1.03) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
          card.style.transition = 'transform .1s ease';

          // Specular highlight
          const specX = ((e.clientX - r.left) / r.width * 100).toFixed(1);
          const specY = ((e.clientY - r.top) / r.height * 100).toFixed(1);
          card.style.backgroundImage = `radial-gradient(circle at ${specX}% ${specY}%, rgba(255,255,255,.08) 0%, transparent 60%)`;
        });
        card.addEventListener('mouseleave', () => {
          card.style.transform = '';
          card.style.transition = 'transform .4s cubic-bezier(.34,1.3,.64,1)';
          card.style.backgroundImage = '';
        });
      });
    }

    // ── VIDEO PREVIEW ─────────────────────────────────────────────────────────
    setupVideoPreview(container, titles) {
      container.querySelectorAll('.chp-poster-card').forEach((card, i) => {
        const title = titles[i];
        if (!title) return;

        let timer = null;
        card.addEventListener('mouseenter', () => {
          timer = setTimeout(async () => {
            if (!this.isActive) return;
            const trailerKey = await this.fetchTrailerKey(title.id, title.type);
            if (!trailerKey || !card.matches(':hover')) return;
            let preview = card.querySelector('.chp-video-preview');
            if (!preview) {
              preview = document.createElement('div');
              preview.className = 'chp-video-preview chp-preview-active';
              preview.innerHTML = `<iframe src="https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&loop=1&playlist=${trailerKey}&start=15" allow="autoplay" allowfullscreen></iframe>`;
              card.appendChild(preview);
              setTimeout(() => preview.remove(), 18000);
            }
          }, 1500);
          this.videoTimers.set(card, timer);
        });
        card.addEventListener('mouseleave', () => {
          if (timer) { clearTimeout(timer); this.videoTimers.delete(card); }
          card.querySelector('.chp-video-preview')?.remove();
        });
      });
    }

    async fetchTrailerKey(imdbId, type) {
      const key = `trailer_${imdbId}`;
      const cached = this.cache.get(key);
      if (cached) return cached;

      const config = lsGetJSON('dataEnrichmentConfig', {});
      if (!config.tmdbApiKey) return null;

      try {
        const findRes = await fetchJSON(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${config.tmdbApiKey}&external_source=imdb_id`);
        if (!findRes) return null;

        const results = findRes.movie_results?.length ? findRes.movie_results : findRes.tv_results;
        if (!results?.length) return null;

        const tmdbId = results[0].id;
        const mt = findRes.movie_results?.length ? 'movie' : 'tv';

        const detailRes = await fetchJSON(`https://api.themoviedb.org/3/${mt}/${tmdbId}/videos?api_key=${config.tmdbApiKey}`);
        const trailers = (detailRes?.results || []).filter(v => v.site === 'YouTube' && v.type === 'Trailer');
        const trailerKey = trailers[0]?.key || null;

        if (trailerKey) this.cache.set(key, trailerKey);
        return trailerKey;
      } catch { return null; }
    }

    // ── CONTEXT MENU ──────────────────────────────────────────────────────────
    setupContextMenu() {
      document.addEventListener('click', () => this.closeContextMenu());
    }

    showContextMenu(x, y, id, type, title) {
      const menu = document.getElementById(CTX_ID);
      if (!menu) return;

      const wlEntry = wlnmGet(id);
      const isWL = !!wlEntry && wlEntry.status !== 'none';

      menu.innerHTML = `
        <div class="chp-ctx-item" data-action="watch">
          <span class="chp-ctx-icon">▶</span> Watch Now
        </div>
        <div class="chp-ctx-item" data-action="info">
          <span class="chp-ctx-icon">ⓘ</span> More Info
        </div>
        <div class="chp-ctx-divider"></div>
        <div class="chp-ctx-item" data-action="wl-watching">
          <span class="chp-ctx-icon">▶</span> Mark as Watching
        </div>
        <div class="chp-ctx-item" data-action="wl-plan">
          <span class="chp-ctx-icon">🕐</span> Plan to Watch
        </div>
        <div class="chp-ctx-item" data-action="wl-completed">
          <span class="chp-ctx-icon">✓</span> Mark as Watched
        </div>
        ${isWL ? `<div class="chp-ctx-item" data-action="wl-none"><span class="chp-ctx-icon">✕</span> Remove from Watchlist</div>` : ''}
        <div class="chp-ctx-divider"></div>
        <div class="chp-ctx-item" data-action="copy">
          <span class="chp-ctx-icon">⎘</span> Copy Title
        </div>`;

      // Position
      const vw = window.innerWidth, vh = window.innerHeight;
      const menuW = 190, menuH = 250;
      menu.style.left = `${Math.min(x, vw - menuW - 10)}px`;
      menu.style.top = `${Math.min(y, vh - menuH - 10)}px`;
      menu.classList.add('visible');

      menu.querySelectorAll('.chp-ctx-item').forEach(item => {
        item.addEventListener('click', e => {
          e.stopPropagation();
          const action = item.dataset.action;
          if (action === 'watch' || action === 'info') navToTitle(id, type);
          if (action.startsWith('wl-')) {
            const status = action.replace('wl-', '');
            wlnmSet(id, { status, title: title?.title || '', addedAt: new Date().toISOString() });
            this.refreshBadges(id);
          }
          if (action === 'copy') navigator.clipboard?.writeText(title?.title || '');
          this.closeContextMenu();
        });
      });
    }

    refreshBadges(id) {
      const wlEntry = wlnmGet(id);
      document.querySelectorAll(`.chp-poster-card[data-id="${id}"] .chp-poster-badges`).forEach(badges => {
        let wlBadge = badges.querySelector('.chp-badge-wl');
        if (wlEntry && wlEntry.status !== 'none') {
          if (!wlBadge) { wlBadge = document.createElement('span'); wlBadge.className = 'chp-badge chp-badge-wl'; wlBadge.textContent = '🔖'; badges.appendChild(wlBadge); }
        } else {
          wlBadge?.remove();
        }
      });
    }

    closeContextMenu() { document.getElementById(CTX_ID)?.classList.remove('visible'); }

    // ── SCROLL BEHAVIOR ───────────────────────────────────────────────────────
    setupScrollBehavior(root) {
      const sticky = document.getElementById('chp-sticky-bar');
      const filterBar = document.getElementById('chp-filter-bar');
      const heroEl = document.getElementById('chp-hero');

      const scrollParent = document.querySelector('[class*="route-content"]') || window;

      const onScroll = () => {
        const heroH = heroEl?.offsetHeight || 0;
        const scrollY = scrollParent === window ? window.scrollY : scrollParent.scrollTop;

        // Sticky bar
        if (sticky) {
          sticky.classList.toggle('chp-sticky-visible', scrollY > heroH * 0.5);
        }

        // Filter bar scrolled glass
        const filterTop = filterBar?.getBoundingClientRect().top || 999;
        filterBar?.classList.toggle('chp-filter-scrolled', filterTop <= 1);
      };

      scrollParent.addEventListener('scroll', onScroll, { passive: true });
    }

    // ── SCROLL ENTRANCES ─────────────────────────────────────────────────────
    setupScrollEntrances(root) {
      if (prefersReducedMotion) {
        root.querySelectorAll('.chp-will-enter').forEach(el => el.classList.add('chp-entered'));
        return;
      }

      this.io = new IntersectionObserver(entries => {
        entries.forEach((entry, idx) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const rowIndex = Array.from(document.querySelectorAll('.chp-row')).indexOf(el);
            if (rowIndex >= 0) el.style.transitionDelay = `${rowIndex * 60}ms`;
            el.classList.add('chp-entered');
            this.io.unobserve(el);
          }
        });
      }, { threshold: 0.06, rootMargin: '0px 0px -24px 0px' });

      root.querySelectorAll('.chp-will-enter').forEach(el => this.io.observe(el));
    }

    // ── MINIBAR ───────────────────────────────────────────────────────────────
    buildMinibar() {
      const bar = document.createElement('div');
      bar.id = MINIBAR_ID;
      bar.innerHTML = `
        <img class="chp-minibar-poster" id="chp-mb-poster" src="" alt="">
        <div class="chp-minibar-info">
          <div class="chp-minibar-title" id="chp-mb-title">Loading...</div>
          <div class="chp-minibar-ep" id="chp-mb-ep"></div>
        </div>
        <div class="chp-minibar-progress">
          <div class="chp-minibar-fill" id="chp-mb-fill" style="width:0%"></div>
        </div>
        <button class="chp-minibar-resume" id="chp-mb-resume">▶ Resume</button>
        <button class="chp-minibar-close" id="chp-mb-close">✕</button>`;
      document.body.appendChild(bar);

      bar.querySelector('#chp-mb-close')?.addEventListener('click', () => {
        bar.classList.remove('chp-minibar-visible');
        lsSet('chp-minibar-closed', '1');
      });
    }

    buildMinibarContent(cwTitles) {
      if (!this.config.minibar || lsGet('chp-minibar-closed') === '1') return;
      const first = cwTitles[0];
      if (!first) return;

      const bar = document.getElementById(MINIBAR_ID);
      if (!bar) return;

      const poster = bar.querySelector('#chp-mb-poster');
      const titleEl = bar.querySelector('#chp-mb-title');
      const epEl = bar.querySelector('#chp-mb-ep');
      const fill = bar.querySelector('#chp-mb-fill');
      const resumeBtn = bar.querySelector('#chp-mb-resume');

      if (poster) poster.src = `https://images.metahub.space/poster/large/${first.id}/img`;
      if (titleEl) titleEl.textContent = first.title;
      if (epEl) epEl.textContent = first.currentEp || (first.type === 'series' ? 'Series' : 'Movie');
      if (fill) fill.style.width = `${(first.progress || 0) * 100}%`;

      resumeBtn?.addEventListener('click', () => navToTitle(first.id, first.type));

      setTimeout(() => bar.classList.add('chp-minibar-visible'), 800);
    }

    // ── TOOLBAR — removed per user request ───────────────────────────────────
    injectToolbar() { /* intentionally empty */ }

    // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
    async checkNotifications(cwTitles, catalog) {
      const lastSeen = parseInt(lsGet('chp-notif-seen') || '0');
      const lastCheck = parseInt(lsGet('chp-notif-last') || '0');
      if (Date.now() - lastCheck < 3600000) return; // once per hour

      const notifs = [];
      const config = lsGetJSON('dataEnrichmentConfig', {});

      // Check for new episodes on watched series
      if (config.tmdbApiKey) {
        for (const t of cwTitles.filter(t => t.type === 'series').slice(0, 5)) {
          try {
            const findRes = await fetchJSON(`https://api.themoviedb.org/3/find/${t.id}?api_key=${config.tmdbApiKey}&external_source=imdb_id`);
            const tvResults = findRes?.tv_results;
            if (!tvResults?.length) continue;
            const detail = await fetchJSON(`https://api.themoviedb.org/3/tv/${tvResults[0].id}?api_key=${config.tmdbApiKey}`);
            if (!detail || !this.isActive) break;
            if (detail.next_episode_to_air) {
              const ep = detail.next_episode_to_air;
              const airDate = new Date(ep.air_date);
              if (airDate <= new Date() && Date.parse(ep.air_date) > lastSeen) {
                notifs.push({ title: t.title, text: `S${ep.season_number}E${ep.episode_number} "${ep.name || 'New Episode'}" is available`, id: t.id, type: t.type });
              }
            }
          } catch { /* skip */ }
        }
      }

      this.notifications = notifs;
      lsSet('chp-notif-last', Date.now());

      if (notifs.length) {
        const dot = document.getElementById('chp-bell-dot');
        if (dot) { dot.classList.add('visible'); }

        const list = document.getElementById('chp-notif-list');
        if (list) {
          list.innerHTML = notifs.map(n => `
            <div class="chp-notif-item" data-id="${n.id}" data-type="${n.type}">
              <div class="chp-notif-dot"></div>
              <div class="chp-notif-text"><strong>${n.title}</strong><br>${n.text}</div>
            </div>`).join('');

          list.querySelectorAll('.chp-notif-item').forEach(item => {
            item.addEventListener('click', () => navToTitle(item.dataset.id, item.dataset.type));
          });
        }
      }
    }

    // ── SETTINGS ─────────────────────────────────────────────────────────────
    buildSettingsContent(panel) {
      const toggles = [
        { key: 'ambient', icon: '🌊', label: 'Ambient Background' },
        { key: 'particles', icon: '✨', label: 'Hero Particles' },
        { key: 'grain', icon: '🎞', label: 'Film Grain' },
        { key: 'videoPrev', icon: '▶', label: 'Video Preview on Hover' },
        { key: 'tilt', icon: '🎭', label: '3D Poster Tilt' },
        { key: 'cursor', icon: '⊙', label: 'Custom Cursor' },
        { key: 'minibar', icon: '🎵', label: 'Mini Player Bar' },
        { key: 'ticker', icon: '📡', label: 'Trending Ticker' },
      ];

      panel.innerHTML = `
        <div class="chp-settings-title">Home Page Settings</div>
        <div class="chp-settings-group">
          <div class="chp-settings-group-label">Visual Effects</div>
          ${toggles.map(t => `
            <div class="chp-toggle-item">
              <div class="chp-toggle-left">
                <span class="chp-toggle-icon">${t.icon}</span>
                <span class="chp-toggle-label">${t.label}</span>
              </div>
              <label class="chp-switch">
                <input type="checkbox" data-key="${t.key}" ${this.config[t.key] ? 'checked' : ''}>
                <span class="chp-slider"></span>
              </label>
            </div>`).join('')}
        </div>
        <div class="chp-settings-group">
          <div class="chp-settings-group-label">Hero Rotation Speed</div>
          <div class="chp-range-row">
            <span class="chp-range-label">Every ${this.config.heroSpeed / 1000}s</span>
            <input type="range" class="chp-range" min="5000" max="20000" step="1000" value="${this.config.heroSpeed}" id="chp-speed-range">
          </div>
        </div>`;

      panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const key = cb.dataset.key;
          this.config[key] = cb.checked;
          this.saveConfig();
          lsSet(`chp-cfg-${key}`, cb.checked ? 'true' : 'false');

          // Live effects
          if (key === 'grain') document.getElementById(GRAIN_ID)?.style.setProperty('display', cb.checked ? '' : 'none');
          if (key === 'ambient') document.getElementById(AMBIENT_ID)?.style.setProperty('background', cb.checked ? '' : 'none');
          if (key === 'cursor') document.getElementById(CURSOR_ID)?.classList.toggle('chp-cursor-active', cb.checked && this.isActive);
        });
      });

      panel.querySelector('#chp-speed-range')?.addEventListener('input', e => {
        this.config.heroSpeed = parseInt(e.target.value);
        this.saveConfig();
        lsSet('chp-cfg-speed', e.target.value);
        panel.querySelector('.chp-range-label').textContent = `Every ${this.config.heroSpeed / 1000}s`;
        if (this.heroTimer) { clearInterval(this.heroTimer); this.startHeroTimer(); }
      });
    }

    // ── SEARCH OVERLAY ────────────────────────────────────────────────────────
    buildSearchOverlay() {
      const overlay = document.createElement('div');
      overlay.id = SEARCH_ID;
      overlay.innerHTML = `
        <div class="chp-search-backdrop" id="chp-search-backdrop"></div>
        <div class="chp-search-shell">
          <div class="chp-search-box">
            <span class="chp-search-icon">🔍</span>
            <input class="chp-search-input" id="chp-search-input" placeholder="Search movies & series…" autocomplete="off" spellcheck="false">
            <span class="chp-search-kbd">ESC</span>
          </div>
          <div class="chp-search-results" id="chp-search-results" style="display:none">
            <div class="chp-search-hint">Start typing to search…</div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.querySelector('#chp-search-backdrop')?.addEventListener('click', () => this.closeSearch());

      let searchTimer = null;
      overlay.querySelector('#chp-search-input')?.addEventListener('input', e => {
        clearTimeout(searchTimer);
        const q = e.target.value.trim();
        if (!q) { overlay.querySelector('#chp-search-results').style.display = 'none'; return; }
        searchTimer = setTimeout(() => this.runSearch(q), 220);
      });

      overlay.querySelector('#chp-search-input')?.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') this.searchFocusResult(1);
        if (e.key === 'ArrowUp') this.searchFocusResult(-1);
        if (e.key === 'Enter') {
          const focused = overlay.querySelector('.chp-search-result.chp-focused');
          if (focused) { navToTitle(focused.dataset.id, focused.dataset.type); this.closeSearch(); }
        }
      });
    }

    toggleSearch() {
      const overlay = document.getElementById(SEARCH_ID);
      if (!overlay) return;
      const isOpen = overlay.classList.contains('chp-search-open');
      if (isOpen) { this.closeSearch(); } else { this.openSearch(); }
    }

    openSearch() {
      const overlay = document.getElementById(SEARCH_ID);
      if (!overlay) return;
      overlay.classList.add('chp-search-open');
      setTimeout(() => overlay.querySelector('#chp-search-input')?.focus(), 50);
    }

    closeSearch() {
      const overlay = document.getElementById(SEARCH_ID);
      if (!overlay) return;
      overlay.classList.remove('chp-search-open');
      const input = overlay.querySelector('#chp-search-input');
      if (input) input.value = '';
      const results = overlay.querySelector('#chp-search-results');
      if (results) results.style.display = 'none';
    }

    async runSearch(query) {
      const results = document.getElementById('chp-search-results');
      if (!results) return;
      results.style.display = 'block';
      results.innerHTML = `<div class="chp-search-hint">Searching…</div>`;

      try {
        const data = await fetchJSON(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`, 4000)
          || await fetchJSON(`https://cinemeta-catalogs.strem.io/top/catalog/movie/top.json`, 3000);

        if (!document.getElementById(SEARCH_ID)?.classList.contains('chp-search-open')) return;

        // Filter by query against cached catalog
        const all = this.cache.get('chp-all-titles') || [];
        const q = query.toLowerCase();
        const filtered = all.filter(t => t.title.toLowerCase().includes(q)).slice(0, 8);

        if (!filtered.length) {
          results.innerHTML = `<div class="chp-search-hint">No results found for "${query}"</div>`;
          return;
        }

        results.innerHTML = filtered.map((t, i) => `
          <div class="chp-search-result" data-id="${t.id}" data-type="${t.type}" style="--i:${i}">
            <img src="https://images.metahub.space/poster/large/${t.id}/img"
                 onerror="this.style.opacity='0'" alt="${t.title}" loading="lazy">
            <div>
              <div class="chp-search-result-title">${t.title}</div>
              <div class="chp-search-result-meta">${t.year || ''} · ${t.type === 'movie' ? 'Movie' : 'Series'} ${t.rating && t.rating !== 'na' ? '· ⭐' + t.rating : ''}</div>
            </div>
          </div>`).join('');

        results.querySelectorAll('.chp-search-result').forEach(item => {
          item.addEventListener('click', () => {
            navToTitle(item.dataset.id, item.dataset.type);
            this.closeSearch();
          });
        });
      } catch {
        results.innerHTML = `<div class="chp-search-hint">Search unavailable — try again</div>`;
      }
    }

    searchFocusResult(dir) {
      const results = document.querySelectorAll('.chp-search-result');
      const focused = document.querySelector('.chp-search-result.chp-focused');
      const idx = [...results].indexOf(focused);
      results.forEach(r => r.classList.remove('chp-focused'));
      const next = results[Math.max(0, Math.min(results.length - 1, idx + dir))];
      next?.classList.add('chp-focused');
      next?.scrollIntoView({ block: 'nearest' });
    }

    // ── WATCHLIST PAGE ────────────────────────────────────────────────────────
    buildWatchlistOverlay() {
      const overlay = document.createElement('div');
      overlay.id = WATCHLIST_ID;
      overlay.innerHTML = `
        <div class="chp-wl-backdrop"></div>
        <div class="chp-wl-shell" id="chp-wl-shell"></div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('.chp-wl-backdrop')?.addEventListener('click', () => this.closeWatchlist());
    }

    openWatchlist() {
      const overlay = document.getElementById(WATCHLIST_ID);
      if (!overlay) return;

      this.renderWatchlistContent();
      overlay.classList.add('chp-wl-open');
    }

    closeWatchlist() {
      document.getElementById(WATCHLIST_ID)?.classList.remove('chp-wl-open');
    }

    renderWatchlistContent() {
      const shell = document.getElementById('chp-wl-shell');
      if (!shell) return;

      const wlData = wlnmLoad();
      const entries = Object.entries(wlData);
      const totalTitles = entries.length;
      const completedCount = entries.filter(([, v]) => v.status === 'completed').length;
      const avgRating = entries.filter(([, v]) => v.rating > 0).reduce((a, [, v]) => a + v.rating, 0) / Math.max(1, entries.filter(([, v]) => v.rating > 0).length);
      const genres = this.computeTopGenres(entries.map(([, v]) => v), wlData);

      const STATUS_GROUPS = [
        { key: 'watching', label: 'Currently Watching', icon: '▶' },
        { key: 'plan', label: 'Plan to Watch', icon: '🕐' },
        { key: 'completed', label: 'Completed', icon: '✓' },
        { key: 'rewatch', label: 'Re-watching', icon: '↺' },
        { key: 'dropped', label: 'Dropped', icon: '✕' },
      ];

      shell.innerHTML = `
        <div class="chp-wl-header">
          <div class="chp-wl-title">
            <span style="display:inline-block;width:4px;height:1em;background:linear-gradient(180deg,#e5a00d,#ff6b35);border-radius:3px;margin-right:12px;vertical-align:middle"></span>
            My Watchlist
          </div>
          <div class="chp-wl-stats">
            <div class="chp-wl-stat"><div class="chp-wl-stat-val">${totalTitles}</div><div class="chp-wl-stat-label">Total</div></div>
            <div class="chp-wl-stat"><div class="chp-wl-stat-val">${completedCount}</div><div class="chp-wl-stat-label">Completed</div></div>
            <div class="chp-wl-stat"><div class="chp-wl-stat-val">${avgRating > 0 ? avgRating.toFixed(1) : '—'}</div><div class="chp-wl-stat-label">Avg Rating</div></div>
          </div>
          <button class="chp-wl-close" id="chp-wl-close">✕</button>
        </div>

        ${genres.length ? `
        <div class="chp-taste-card">
          <div class="chp-taste-title">Your Taste Profile</div>
          <div class="chp-taste-profile-text">${this.buildTasteText(genres, avgRating)}</div>
          <div class="chp-genre-pills">${genres.map(g => `<span class="chp-genre-pill">${g}</span>`).join('')}</div>
        </div>` : ''}

        <div class="chp-wl-sort-bar">
          <button class="chp-wl-sort-btn active" data-sort="status">By Status</button>
          <button class="chp-wl-sort-btn" data-sort="date">By Date Added</button>
          <button class="chp-wl-sort-btn" data-sort="rating">By Rating</button>
        </div>

        <div id="chp-wl-groups">
          ${totalTitles === 0 ? `<div class="chp-wl-empty">Nothing saved yet — explore the catalog and start adding titles</div>` :
          STATUS_GROUPS.map(sg => {
            const groupEntries = entries.filter(([, v]) => v.status === sg.key);
            if (!groupEntries.length) return '';
            return `
                <div class="chp-wl-group">
                  <div class="chp-wl-group-title">${sg.icon} ${sg.label} (${groupEntries.length})</div>
                  <div class="chp-wl-grid">
                    ${groupEntries.map(([id, v], i) => `
                      <div class="chp-wl-card" data-id="${id}" data-type="${v.type || 'movie'}" style="--i:${i}">
                        <img src="https://images.metahub.space/poster/large/${id}/img" alt="${v.title || ''}" loading="lazy" onerror="this.style.opacity='0'">
                        <div class="chp-wl-card-overlay"></div>
                        <div class="chp-wl-card-bottom">
                          <div class="chp-wl-card-title">${v.title || id}</div>
                          ${v.rating > 0 ? `<div class="chp-wl-card-stars">${'★'.repeat(v.rating)}${'☆'.repeat(5 - v.rating)}</div>` : ''}
                        </div>
                      </div>`).join('')}
                  </div>
                </div>`;
          }).join('')
        }
        </div>`;

      shell.querySelector('#chp-wl-close')?.addEventListener('click', () => this.closeWatchlist());

      shell.querySelectorAll('.chp-wl-card').forEach(card => {
        card.addEventListener('click', () => {
          navToTitle(card.dataset.id, card.dataset.type || 'movie');
          this.closeWatchlist();
        });
      });

      shell.querySelectorAll('.chp-wl-sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          shell.querySelectorAll('.chp-wl-sort-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          // Re-sort and re-render groups inline
        });
      });
    }

    buildTasteText(genres, avgRating) {
      const g1 = genres[0] || 'Drama', g2 = genres[1] || 'Thriller';
      const rText = avgRating > 4 ? 'a discerning critic' : avgRating > 3 ? 'an appreciative viewer' : 'a generous rater';
      return `You gravitate toward ${g1.toLowerCase()} and ${g2.toLowerCase()} — ${rText} with specific taste.`;
    }

    // ── WHAT TO WATCH TONIGHT ─────────────────────────────────────────────────
    buildWTWTOverlay() {
      const overlay = document.createElement('div');
      overlay.id = WTWT_ID;
      overlay.innerHTML = `
        <div class="chp-wtwt-bg"></div>
        <div class="chp-wtwt-shell" id="chp-wtwt-shell">
          <button class="chp-wtwt-close-btn" id="chp-wtwt-close">✕</button>
          <div class="chp-wtwt-loading">Finding the perfect title for you…</div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#chp-wtwt-close')?.addEventListener('click', () => this.closeWTWT());
      overlay.querySelector('.chp-wtwt-bg')?.addEventListener('click', () => this.closeWTWT());
    }

    async openWTWT() {
      const overlay = document.getElementById(WTWT_ID);
      if (!overlay) return;
      overlay.classList.add('chp-wtwt-open');

      const pick = await this.computeWTWTRec();
      if (!pick) return;

      const shell = document.getElementById('chp-wtwt-shell');
      if (!shell || !overlay.classList.contains('chp-wtwt-open')) return;

      const backdropUrl = `https://images.metahub.space/background/large/${pick.id}/img`;
      const logoUrl = `https://images.metahub.space/logo/medium/${pick.id}/img`;
      await preloadImg(backdropUrl);

      shell.innerHTML = `
        <button class="chp-wtwt-close-btn" id="chp-wtwt-close">✕</button>
        <img class="chp-wtwt-backdrop" src="${backdropUrl}" alt="${pick.title}" onerror="this.style.opacity='0'">
        <img class="chp-wtwt-logo" src="${logoUrl}" alt="${pick.title}" onerror="this.style.display='none'">
        <div class="chp-wtwt-reason">${pick.reason}</div>
        <div class="chp-hero-meta" style="justify-content:center;margin-bottom:16px">
          ${pick.year ? `<span class="chp-hero-meta-pill">${pick.year}</span>` : ''}
          ${pick.rating && pick.rating !== 'na' ? `<span class="chp-hero-meta-pill chp-rating">⭐ ${pick.rating}</span>` : ''}
          ${pick.type ? `<span class="chp-hero-meta-pill">${pick.type === 'movie' ? 'Movie' : 'Series'}</span>` : ''}
        </div>
        <div class="chp-wtwt-actions">
          <button class="chp-btn-watch" id="chp-wtwt-watch">▶ Watch This</button>
          <button class="chp-btn-info" id="chp-wtwt-another">🎲 Show Another</button>
        </div>`;

      shell.querySelector('#chp-wtwt-close')?.addEventListener('click', () => this.closeWTWT());
      shell.querySelector('#chp-wtwt-watch')?.addEventListener('click', () => {
        navToTitle(pick.id, pick.type);
        this.closeWTWT();
      });
      shell.querySelector('#chp-wtwt-another')?.addEventListener('click', async () => {
        shell.innerHTML = `<button class="chp-wtwt-close-btn" id="chp-wtwt-close">✕</button><div class="chp-wtwt-loading">Finding another one…</div>`;
        shell.querySelector('#chp-wtwt-close')?.addEventListener('click', () => this.closeWTWT());
        this._wtwtExclude = this._wtwtExclude || new Set();
        this._wtwtExclude.add(pick.id);
        const next = await this.computeWTWTRec();
        if (next) {
          overlay.classList.remove('chp-wtwt-open');
          setTimeout(() => { overlay.classList.add('chp-wtwt-open'); this.openWTWT(); }, 150);
        }
      });

      // Update ambient for WTWT
      this.updateAmbient(backdropUrl);
    }

    async computeWTWTRec() {
      const wlData = wlnmLoad();
      const completed = new Set(Object.entries(wlData).filter(([, v]) => v.status === 'completed').map(([id]) => id));
      const catalog = this.cache.get('chp-all-titles') || [];
      const cwTitles = this.cache.get('chp-cw-titles') || [];
      const topGenres = this.computeTopGenres(cwTitles, wlData);
      const excluded = this._wtwtExclude || new Set();

      const scored = catalog
        .filter(t => !completed.has(t.id) && !excluded.has(t.id))
        .map(t => {
          let score = parseFloat(t.rating) || 0;
          const genreMatch = (t.genres || []).filter(g => topGenres.includes(g)).length;
          score += genreMatch * 1.5;
          const wlEntry = wlnmGet(t.id);
          if (wlEntry?.rating) score += wlEntry.rating * 0.5;
          return { ...t, score };
        })
        .sort((a, b) => b.score - a.score);

      const pick = scored[Math.floor(Math.random() * Math.min(10, scored.length))];
      if (!pick) return null;

      const matchedGenre = (pick.genres || []).find(g => topGenres.includes(g));
      pick.reason = matchedGenre
        ? `Based on your taste for ${matchedGenre.toLowerCase()} content`
        : `Highly rated and worth your evening`;

      return pick;
    }

    closeWTWT() {
      document.getElementById(WTWT_ID)?.classList.remove('chp-wtwt-open');
    }

    // ── FETCH CATALOG ─────────────────────────────────────────────────────────
    async fetchCatalog() {
      const cached = this.cache.get('chp-catalog');
      if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

      // Try network, fall back to previous catalog
      let movies = null, series = null;

      if (navigator.onLine) {
        [movies, series] = await Promise.all([
          fetchJSON('https://cinemeta-catalogs.strem.io/top/catalog/movie/top.json'),
          fetchJSON('https://cinemeta-catalogs.strem.io/top/catalog/series/top.json'),
        ]);
      }

      if (!movies && !series) {
        // Offline fallback
        return this.cache.get('chp-catalog')?.data || null;
      }

      const metas = m => (m?.metas || []).slice(0, 24).map(t => ({
        id: t.id, title: t.name || t.title,
        type: t.type || 'movie',
        year: t.year ? String(t.year) : '',
        rating: t.imdbRating || '',
        description: t.description || '',
        genres: Array.isArray(t.genre) ? t.genre : (Array.isArray(t.genres) ? t.genres : []),
        poster: `https://images.metahub.space/poster/large/${t.id}/img`,
      }));

      const movieList = metas(movies);
      const seriesList = metas(series);
      const all = [...movieList, ...seriesList].sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
      const featured = all.filter(t => parseFloat(t.rating) >= 8.5).slice(0, 8);

      // Enrich top 6 for detail metadata
      const toEnrich = [...featured.slice(0, 4), ...all.slice(0, 2)].filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i);
      await Promise.all(toEnrich.map(t => this.enrichTitle(t)));

      const catalog = { all, movies: movieList, series: seriesList, featured };
      this.cache.set('chp-catalog', { data: catalog, ts: Date.now() });
      this.cache.set('chp-all-titles', all);
      return catalog;
    }

    async enrichTitle(title) {
      const cached = this.cache.get(`enrich_${title.id}`);
      if (cached) { Object.assign(title, cached); return; }

      try {
        const data = await fetchJSON(`https://v3-cinemeta.strem.io/meta/${title.type}/${title.id}.json`, 4000);
        const meta = data?.meta;
        if (!meta) return;

        const patch = {
          rating: meta.imdbRating || title.rating,
          year: meta.year ? String(meta.year) : title.year,
          description: meta.description || title.description,
          genres: meta.genre || meta.genres || title.genres || [],
          duration: meta.runtime ? fmtRuntime(parseInt(meta.runtime)) : '',
          seasons: meta.type === 'series' ? (meta.videos ? `${new Set(meta.videos.map(v => v.season).filter(Boolean)).size} seasons` : 'Series') : 'Movie',
        };

        Object.assign(title, patch);
        this.cache.set(`enrich_${title.id}`, patch);
      } catch { /* skip */ }
    }

    // ── CONTINUE WATCHING ─────────────────────────────────────────────────────
    async loadContinueWatching() {
      // Read from Stremio's native board rows before hiding them
      const cwItems = [];
      const boardRows = document.querySelectorAll('[class*="board-row"]');

      boardRows.forEach(row => {
        const label = row.querySelector('[class*="label"], [class*="title"]')?.textContent?.toLowerCase() || '';
        if (!label.includes('continu') && !label.includes('watching')) return;

        row.querySelectorAll('a[href*="/detail/"]').forEach(link => {
          const match = link.href.match(/#\/detail\/(movie|series)\/(tt\d+)/);
          if (!match) return;
          const [, type, id] = match;
          const imgEl = link.querySelector('img');
          const titleEl = link.querySelector('[class*="title"], [class*="name"]');

          // Try to read progress from native progress bar
          const progressEl = link.querySelector('[class*="progress"]');
          let progress = 0;
          if (progressEl) {
            const w = progressEl.style.width || getComputedStyle(progressEl).width;
            progress = parseFloat(w) / 100;
          }

          if (!cwItems.find(t => t.id === id)) {
            cwItems.push({
              id, type,
              title: titleEl?.textContent?.trim() || id,
              poster: imgEl?.src || `https://images.metahub.space/poster/large/${id}/img`,
              progress: isNaN(progress) ? 0 : Math.min(1, Math.max(0, progress)),
              genres: [],
              year: '',
              rating: '',
            });
          }
        });
      });

      // If no native CW found, check wlnm watching entries as fallback
      if (!cwItems.length) {
        const wlData = wlnmLoad();
        Object.entries(wlData)
          .filter(([, v]) => v.status === 'watching')
          .forEach(([id, v]) => {
            cwItems.push({ id, type: 'movie', title: v.title || id, progress: 0, genres: [], year: '', rating: '' });
          });
      }

      // Enrich top 5
      await Promise.all(cwItems.slice(0, 5).map(t => this.enrichTitle(t)));

      this.cache.set('chp-cw-titles', cwItems);
      return cwItems;
    }

    // ── PAGE ENTRANCE ─────────────────────────────────────────────────────────
    async runPageEntrance(root) {
      if (prefersReducedMotion) return;
      // Sequence handled via CSS animation-delay on entrance classes
    }
  }

  // ── BOOT ───────────────────────────────────────────────────────────────────

  let _homeInstance = null;

  function initHome() {
    if (_homeInstance && _homeInstance.isActive) return;
    if (!_homeInstance) _homeInstance = new CinematicHome();
    else _homeInstance.mount();
  }

  function teardownHome() {
    if (_homeInstance && _homeInstance.isActive) _homeInstance.unmount();
  }

  function injectHomeCSS(perfTier) {
    if (document.getElementById(STYLE_ID)) return;

    if (!document.getElementById(FONT_ID) && !document.getElementById(CT_FONT_ID)) {
      const l = document.createElement('link');
      l.id = FONT_ID; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400&family=DM+Serif+Display:ital@0;1&display=swap';
      document.head.appendChild(l);
    }

    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `

/* ── RESET & BASE ── */
#${ROOT_ID}, #${ROOT_ID} * { box-sizing: border-box; }
#${ROOT_ID} { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }

/* ── AMBIENT BACKGROUND ── */
#${AMBIENT_ID} {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  transition: ${prefersReducedMotion ? 'none' : 'background 1.4s ease'};
  overflow: hidden;
}
#${AMBIENT_ID}::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(8,8,14,.45) 0%, rgba(8,8,14,.92) 60%, rgba(8,8,14,1) 100%);
}

/* ── FILM GRAIN ── */
#${GRAIN_ID} {
  position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: .032;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-size: 128px 128px;
  animation: ${prefersReducedMotion ? 'none' : 'chp-grain 0.12s steps(1) infinite'};
}
@keyframes chp-grain {
  0%   { background-position: 0 0; }
  10%  { background-position: -30px -40px; }
  20%  { background-position: 20px 10px; }
  30%  { background-position: -45px 25px; }
  40%  { background-position: 35px -15px; }
  50%  { background-position: -10px 40px; }
  60%  { background-position: 50px -30px; }
  70%  { background-position: -25px 15px; }
  80%  { background-position: 15px -45px; }
  90%  { background-position: -40px 30px; }
  100% { background-position: 5px -20px; }
}

/* ── VIGNETTE ── */
#${VIGNETTE_ID} {
  position: fixed; inset: 0; z-index: 2; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,.32) 100%),
              linear-gradient(to right, rgba(0,0,0,.18) 0%, transparent 8%, transparent 92%, rgba(0,0,0,.18) 100%),
              linear-gradient(to bottom, rgba(0,0,0,.22) 0%, transparent 6%);
}

/* ── CUSTOM CURSOR ── */
#${CURSOR_ID} {
  position: fixed; z-index: 99999; pointer-events: none;
  width: 40px; height: 40px; margin: -20px 0 0 -20px;
  border: 1.5px solid rgba(255,255,255,.5);
  border-radius: 50%;
  transition: ${prefersReducedMotion ? 'none' : 'width .25s ease, height .25s ease, margin .25s ease, border-color .25s ease, background .25s ease'};
  display: none;
}
#${CURSOR_ID}.chp-cursor-active { display: block; }
#${CURSOR_ID}.chp-cursor-hover-btn { width: 52px; height: 52px; margin: -26px 0 0 -26px; border-color: rgba(229,160,13,.8); background: rgba(229,160,13,.08); }
#${CURSOR_ID}.chp-cursor-hover-poster { width: 56px; height: 56px; margin: -28px 0 0 -28px; border-color: rgba(255,255,255,.7); background: rgba(255,255,255,.04); }
.chp-cursor-active { cursor: none !important; }

/* ── ROOT ── */
#${ROOT_ID} {
  position: relative; z-index: 3;
  padding-left: 0;
  padding-top: 0;
  min-height: 100vh;
  overflow-x: hidden;
  /* The board-container is already inside Stremio's content area,
     to the right of the sidebar. No extra offset needed. */
}

/* ── KEYFRAMES ── */
@keyframes chp-fade-up {
  from { opacity: 0; transform: translateY(22px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes chp-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes chp-slide-down {
  from { opacity: 0; transform: translateY(-18px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes chp-shimmer {
  0%   { background-position: -700px 0; }
  100% { background-position: 700px 0; }
}
@keyframes chp-pulse-glow {
  0%,100% { box-shadow: 0 0 8px rgba(229,160,13,.12), 0 4px 18px rgba(0,0,0,.35); }
  50%      { box-shadow: 0 0 24px rgba(229,160,13,.42), 0 4px 18px rgba(0,0,0,.35); }
}
@keyframes chp-spring-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes chp-particle-float {
  0%,100% { transform: translateY(0) translateX(0); opacity: .045; }
  33%     { transform: translateY(-14px) translateX(6px); opacity: .08; }
  66%     { transform: translateY(8px) translateX(-8px); opacity: .05; }
}
@keyframes chp-hero-enter {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes chp-overlay-in {
  from { opacity: 0; transform: translateY(-24px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes chp-bell-jiggle {
  0%,100% { transform: rotate(0); }
  15%     { transform: rotate(12deg); }
  30%     { transform: rotate(-10deg); }
  45%     { transform: rotate(8deg); }
  60%     { transform: rotate(-5deg); }
  75%     { transform: rotate(3deg); }
}
@keyframes chp-progress-fill {
  from { width: 0; }
}
@keyframes chp-load-pulse {
  0%,100% { opacity: .45; }
  50%      { opacity: 1; }
}
@keyframes chp-ctx-in {
  from { opacity: 0; transform: scale(.95) translateY(-6px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes chp-badge-in {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* ── SKELETON ── */
.chp-skel {
  background: linear-gradient(90deg,
    rgba(255,255,255,.04) 0px,
    rgba(255,255,255,.1) 60px,
    rgba(255,255,255,.04) 120px);
  background-size: 700px 100%;
  animation: chp-shimmer 1.6s infinite linear;
  border-radius: 8px;
}

/* ══════════════════════════════════════════════
   HERO BANNER
══════════════════════════════════════════════ */
#chp-hero {
  position: relative; width: 100%; height: 68vh; min-height: 520px; max-height: 800px;
  overflow: hidden; margin-bottom: 0;
  transition: ${prefersReducedMotion ? 'none' : 'height .6s cubic-bezier(.4,0,.2,1)'};
}
#chp-hero.chp-hero-compressed { height: 0 !important; min-height: 0; }

.chp-hero-bg {
  position: absolute; inset: -10%; width: 120%; height: 120%;
  background-size: cover; background-position: center top;
  filter: blur(0px) brightness(.72) saturate(.9);
  transition: ${prefersReducedMotion ? 'none' : 'background-image .05s, filter .9s ease, transform .9s ease'};
  transform: scale(1.08);
  will-change: transform, filter;
}
.chp-hero-bg.chp-hero-loaded { filter: blur(0px) brightness(.72) saturate(.9); transform: scale(1); }

.chp-hero-grad {
  position: absolute; inset: 0; pointer-events: none; z-index: 2;
  background:
    linear-gradient(to bottom,
      transparent 0%,
      transparent 18%,
      rgba(8,8,14,.4) 42%,
      rgba(8,8,14,.82) 65%,
      rgba(8,8,14,.97) 84%,
      rgb(8,8,14) 100%),
    linear-gradient(to right,
      rgba(8,8,14,.75) 0%,
      transparent 28%,
      transparent 72%,
      rgba(8,8,14,.55) 100%),
    linear-gradient(to top,
      transparent 0%, transparent 96%, rgba(0,0,0,.3) 100%);
}

.chp-hero-content {
  position: absolute; bottom: 0; left: 0; right: 0; z-index: 3;
  padding: 0 32px 48px 32px;
  display: grid;
  grid-template-columns: 1fr 230px;
  gap: 28px;
  align-items: end;
}

.chp-hero-left { display: flex; flex-direction: column; gap: 0; }

.chp-hero-logo-wrap { height: 90px; margin-bottom: 18px; display: flex; align-items: flex-end; }
.chp-hero-logo {
  max-height: 90px; max-width: 340px;
  object-fit: contain; object-position: left bottom;
  filter: drop-shadow(0 4px 20px rgba(0,0,0,.7));
  transition: ${prefersReducedMotion ? 'none' : 'opacity .4s ease, transform .4s cubic-bezier(.22,1,.36,1)'};
  transform: translateY(0); opacity: 1;
}
.chp-hero-logo.chp-exiting { opacity: 0; transform: translateY(-8px); }
.chp-hero-title-text {
  font-family: 'DM Serif Display', serif;
  font-size: 3.2rem; font-weight: 400; color: #fff;
  letter-spacing: -.5px; line-height: 1.1;
  text-shadow: 0 4px 24px rgba(0,0,0,.7);
  margin-bottom: 16px;
  transition: ${prefersReducedMotion ? 'none' : 'opacity .4s ease, transform .4s cubic-bezier(.22,1,.36,1)'};
}
.chp-hero-title-text.chp-exiting { opacity: 0; transform: translateY(-8px); }

.chp-hero-meta {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 14px;
  transition: ${prefersReducedMotion ? 'none' : 'opacity .35s ease .25s, transform .35s cubic-bezier(.22,1,.36,1) .25s'};
  opacity: 1; transform: translateX(0);
}
.chp-hero-meta.chp-exiting { opacity: 0; transform: translateX(-10px); }
.chp-hero-meta-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 20px;
  font-size: .72rem; font-weight: 700; letter-spacing: .4px;
  background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.14);
  color: rgba(255,255,255,.82);
  animation: chp-badge-in .3s cubic-bezier(.34,1.3,.64,1) both;
}
.chp-hero-meta-pill.chp-rating { background: rgba(229,160,13,.18); border-color: rgba(229,160,13,.35); color: #e5a00d; }
.chp-hero-meta-pill.chp-new    { background: rgba(74,222,128,.14); border-color: rgba(74,222,128,.28); color: #4ade80; }
.chp-hero-meta-pill.chp-4k    { background: rgba(96,165,250,.14); border-color: rgba(96,165,250,.28); color: #93c5fd; }

.chp-hero-desc {
  font-size: .95rem; font-weight: 400; color: rgba(255,255,255,.72); line-height: 1.65;
  max-width: 620px; display: -webkit-box;
  -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  margin-bottom: 24px;
  transition: ${prefersReducedMotion ? 'none' : 'opacity .35s ease .2s'};
}
.chp-hero-desc.chp-exiting { opacity: 0; }

.chp-hero-actions { display: flex; gap: 12px; align-items: center; }

.chp-btn-watch {
  display: inline-flex; align-items: center; gap: 9px;
  padding: 11px 28px; border-radius: 30px;
  background: linear-gradient(135deg, #e5a00d 0%, #ff6b35 100%);
  color: #000; border: none; font-family: 'DM Sans', sans-serif;
  font-size: .88rem; font-weight: 700; cursor: pointer; letter-spacing: .2px;
  position: relative; overflow: hidden;
  transition: ${prefersReducedMotion ? 'none' : 'transform .35s cubic-bezier(.34,1.3,.64,1), box-shadow .3s ease, filter .2s'};
  animation: chp-pulse-glow 3.2s infinite ease-in-out;
  will-change: transform;
}
.chp-btn-watch::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,.32) 50%, transparent 70%);
  transform: translateX(-120%) skewX(-18deg);
}
.chp-btn-watch:hover::after { transition: transform .55s ease; transform: translateX(320%) skewX(-18deg); }
.chp-btn-watch:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(229,160,13,.45); filter: brightness(1.08); animation: none; }
.chp-btn-watch:active { transform: translateY(-1px); }

.chp-btn-info {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 11px 22px; border-radius: 30px;
  background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18);
  color: rgba(255,255,255,.85); font-family: 'DM Sans', sans-serif;
  font-size: .88rem; font-weight: 600; cursor: pointer;
  backdrop-filter: blur(12px);
  transition: ${prefersReducedMotion ? 'none' : 'all .3s cubic-bezier(.34,1.3,.64,1)'};
}
.chp-btn-info:hover { background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.3); transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.38); }
.chp-btn-info:active { transform: translateY(-1px); }

/* Progress arc on watch button */
.chp-watch-progress {
  width: 16px; height: 16px; position: relative; flex-shrink: 0;
}
.chp-watch-progress svg { transform: rotate(-90deg); }
.chp-watch-progress circle { fill: none; stroke-width: 2.5; stroke-linecap: round; }
.chp-progress-bg { stroke: rgba(0,0,0,.3); }
.chp-progress-fg { stroke: rgba(0,0,0,.8); transition: stroke-dashoffset .5s ease; }

/* Hero right — rotation thumbnails */
.chp-hero-right {
  display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px;
}
.chp-hero-thumb {
  display: flex; gap: 10px; align-items: center;
  padding: 8px; border-radius: 12px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.07);
  background: rgba(255,255,255,.05);
  backdrop-filter: blur(12px);
  transition: ${prefersReducedMotion ? 'none' : 'all .3s cubic-bezier(.34,1.3,.64,1)'};
}
.chp-hero-thumb:hover, .chp-hero-thumb.active {
  background: rgba(229,160,13,.12); border-color: rgba(229,160,13,.3);
  transform: translateX(-3px);
}
.chp-hero-thumb img {
  width: 52px; height: 72px; object-fit: cover; border-radius: 8px;
  flex-shrink: 0;
}
.chp-hero-thumb-info { flex: 1; min-width: 0; }
.chp-hero-thumb-title {
  font-size: .75rem; font-weight: 600; color: rgba(255,255,255,.85);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 3px;
}
.chp-hero-thumb-meta { font-size: .65rem; color: rgba(255,255,255,.38); }

/* Indicator dots */
.chp-hero-dots { position: absolute; bottom: 18px; left: 32px; display: flex; gap: 6px; z-index: 4; }
.chp-hero-dot {
  width: 6px; height: 6px; border-radius: 3px; cursor: pointer;
  background: rgba(255,255,255,.28);
  transition: ${prefersReducedMotion ? 'none' : 'width .35s cubic-bezier(.34,1.3,.64,1), background .25s'};
}
.chp-hero-dot.active { width: 24px; background: #e5a00d; }

/* Particles */
.chp-particle {
  position: absolute; border-radius: 50%; pointer-events: none;
  animation: chp-particle-float var(--dur) infinite ease-in-out;
  animation-delay: var(--del);
  will-change: transform, opacity;
}

/* ══════════════════════════════════════════════
   SCROLL-LINKED STICKY BAR
══════════════════════════════════════════════ */
#chp-sticky-bar {
  position: sticky; top: 0; z-index: 50;
  height: 52px; padding: 0 32px;
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(8,8,14,.0);
  transition: ${prefersReducedMotion ? 'none' : 'background .4s ease, backdrop-filter .4s ease, box-shadow .4s ease'};
  pointer-events: none; opacity: 0;
}
#chp-sticky-bar.chp-sticky-visible {
  background: rgba(8,8,14,.88);
  backdrop-filter: blur(32px) saturate(1.6);
  -webkit-backdrop-filter: blur(32px) saturate(1.6);
  box-shadow: 0 1px 0 rgba(255,255,255,.06), 0 4px 24px rgba(0,0,0,.4);
  pointer-events: auto; opacity: 1;
}
.chp-sticky-title { font-size: .95rem; font-weight: 700; color: #fff; letter-spacing: -.3px; }
.chp-sticky-rating { font-size: .78rem; font-weight: 600; color: #e5a00d; }
.chp-sticky-resume {
  padding: 6px 18px; border-radius: 20px;
  background: linear-gradient(135deg, #e5a00d, #ff6b35);
  color: #000; border: none; font-family: 'DM Sans', sans-serif;
  font-size: .78rem; font-weight: 700; cursor: pointer;
  transition: ${prefersReducedMotion ? 'none' : 'transform .3s cubic-bezier(.34,1.3,.64,1), filter .2s'};
}
.chp-sticky-resume:hover { transform: translateY(-2px); filter: brightness(1.1); }

/* ══════════════════════════════════════════════
   GREETING STRIP
══════════════════════════════════════════════ */
#chp-greeting {
  padding: 18px 32px 14px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px;
}
.chp-greeting-text {
  font-size: .88rem; font-weight: 300; color: rgba(255,255,255,.5);
  letter-spacing: .2px; font-style: italic;
}
.chp-stats-strip {
  display: flex; gap: 20px; align-items: center;
}
.chp-stat-item {
  display: flex; flex-direction: column; align-items: flex-end;
  font-size: .66rem; color: rgba(255,255,255,.28);
}
.chp-stat-val {
  font-size: .82rem; font-weight: 700; color: rgba(255,255,255,.5);
  font-variant-numeric: tabular-nums;
}

/* ══════════════════════════════════════════════
   FILTER BAR
══════════════════════════════════════════════ */
#chp-filter-bar {
  position: sticky; top: 0; z-index: 40;
  padding: 10px 32px;
  display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
  transition: ${prefersReducedMotion ? 'none' : 'background .3s ease, box-shadow .3s ease'};
}
#chp-filter-bar.chp-filter-scrolled {
  background: rgba(8,8,14,.78);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  box-shadow: 0 1px 0 rgba(255,255,255,.05);
}
.chp-filter-tab {
  padding: 7px 16px; border-radius: 22px;
  border: 1px solid rgba(255,255,255,.09);
  background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.48); font-family: 'DM Sans', sans-serif;
  font-size: .78rem; font-weight: 600; cursor: pointer;
  transition: ${prefersReducedMotion ? 'none' : 'all .28s cubic-bezier(.34,1.3,.64,1)'};
  white-space: nowrap; user-select: none;
}
.chp-filter-tab:hover { background: rgba(255,255,255,.07); color: rgba(255,255,255,.75); transform: translateY(-1px); }
.chp-filter-tab.active { background: rgba(229,160,13,.12); border-color: rgba(229,160,13,.35); color: #e5a00d; transform: translateY(-1px); }

/* ══════════════════════════════════════════════
   CATALOG ROWS
══════════════════════════════════════════════ */
#chp-rows { padding: 8px 0 80px; }

.chp-row { margin-bottom: 40px; transition: opacity .3s ease; }
.chp-row.chp-row-hidden { display: none; }

.chp-row-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 32px; margin-bottom: 16px;
}
.chp-row-title {
  font-size: 1.22rem; font-weight: 700; color: #fff; letter-spacing: -.3px;
  display: flex; align-items: center; gap: 11px;
}
.chp-row-title::before {
  content: ''; display: block; width: 4px; height: 1.1em;
  background: linear-gradient(180deg, var(--row-accent, #e5a00d) 0%, var(--row-accent2, #ff6b35) 100%);
  border-radius: 3px; flex-shrink: 0;
}
.chp-row-count {
  font-size: .7rem; font-weight: 700; color: rgba(255,255,255,.3);
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
  padding: 2px 9px; border-radius: 14px;
}
.chp-see-all {
  font-size: .78rem; font-weight: 600; color: rgba(229,160,13,.7);
  cursor: pointer; padding: 4px 0;
  transition: ${prefersReducedMotion ? 'none' : 'color .2s, text-shadow .2s'};
  background: none; border: none; font-family: 'DM Sans', sans-serif;
}
.chp-see-all:hover { color: #e5a00d; text-shadow: 0 0 16px rgba(229,160,13,.4); }

/* Row genre accent edge */
.chp-row-accent-edge {
  position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 0 3px 3px 0;
  opacity: .4; pointer-events: none;
}

/* Scroll wrapper */
.chp-row-scroll-wrap { position: relative; }
.chp-row-scroller {
  display: flex; gap: 16px; overflow-x: auto;
  padding: 8px 32px 20px;
  scrollbar-width: none; -webkit-overflow-scrolling: touch;
  scroll-snap-type: x proximity;
}
.chp-row-scroller::-webkit-scrollbar { display: none; }

/* Fade edges */
.chp-row-scroll-wrap::before,
.chp-row-scroll-wrap::after {
  content: ''; position: absolute; top: 0; bottom: 20px; width: 32px; z-index: 5;
  pointer-events: none;
}
.chp-row-scroll-wrap::before { left: 0; background: linear-gradient(to right, rgba(8,8,14,.95) 0%, transparent 100%); }
.chp-row-scroll-wrap::after  { right: 0; background: linear-gradient(to left, rgba(8,8,14,.95) 0%, transparent 100%); }

/* Scroll buttons */
.chp-scroll-btn {
  position: absolute; top: 50%; z-index: 6;
  width: 40px; height: 40px; margin-top: -30px;
  border-radius: 50%; border: 1px solid rgba(255,255,255,.14);
  background: rgba(20,20,30,.85);
  backdrop-filter: blur(12px);
  color: rgba(255,255,255,.8); font-size: 1.1rem; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: ${prefersReducedMotion ? 'none' : 'opacity .25s ease, transform .35s cubic-bezier(.34,1.3,.64,1), background .2s'};
}
.chp-row-scroll-wrap:hover .chp-scroll-btn.can-scroll { opacity: 1; pointer-events: auto; }
.chp-scroll-btn:hover { background: rgba(229,160,13,.18); border-color: rgba(229,160,13,.35); transform: translateY(-50%) scale(1.1); }
.chp-scroll-btn.chp-scroll-left  { left: 8px; transform: translateY(-50%); }
.chp-scroll-btn.chp-scroll-right { right: 8px; transform: translateY(-50%); }
.chp-scroll-btn.chp-scroll-left:hover  { transform: translateY(-50%) scale(1.1); }
.chp-scroll-btn.chp-scroll-right:hover { transform: translateY(-50%) scale(1.1); }

/* ══════════════════════════════════════════════
   POSTER CARDS
══════════════════════════════════════════════ */
.chp-poster-card {
  flex: 0 0 175px; position: relative;
  border-radius: 14px; overflow: hidden;
  cursor: pointer;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.07);
  scroll-snap-align: start;
  transition: ${prefersReducedMotion ? 'none' : 'transform .4s cubic-bezier(.34,1.3,.64,1), box-shadow .35s ease, border-color .3s ease'};
  will-change: transform;
  animation: chp-spring-in .38s cubic-bezier(.22,1,.36,1) both;
  animation-delay: calc(var(--i, 0) * 35ms);
  transform-style: preserve-3d;
  perspective: 800px;
}
.chp-poster-card:hover {
  transform: translateY(-6px) scale(1.03);
  box-shadow: 0 22px 52px rgba(0,0,0,.68), 0 0 0 1px rgba(229,160,13,.15);
  border-color: rgba(229,160,13,.22);
  z-index: 10;
}
.chp-poster-card:hover ~ .chp-poster-card { opacity: .72; }
.chp-row-scroller:has(.chp-poster-card:hover) .chp-poster-card:not(:hover) { opacity: .72; }

/* Featured card (first in row) */
.chp-poster-card.chp-featured {
  flex: 0 0 210px;
  border-color: rgba(229,160,13,.18);
  box-shadow: 0 8px 32px rgba(0,0,0,.45);
}

.chp-poster-img {
  width: 100%; aspect-ratio: 2/3;
  object-fit: cover; display: block;
  border-radius: 13px;
  transition: ${prefersReducedMotion ? 'none' : 'opacity .5s ease'};
}
.chp-poster-img-placeholder {
  width: 100%; aspect-ratio: 2/3;
  border-radius: 13px;
}

/* Badges */
.chp-poster-badges {
  position: absolute; top: 8px; left: 8px; right: 8px;
  display: flex; justify-content: space-between; align-items: flex-start;
  pointer-events: none; z-index: 3;
}
.chp-badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 7px; border-radius: 8px;
  font-size: .62rem; font-weight: 800; letter-spacing: .4px;
  backdrop-filter: blur(8px);
}
.chp-badge-rating { background: rgba(229,160,13,.88); color: #000; }
.chp-badge-4k { background: rgba(96,165,250,.82); color: #000; }
.chp-badge-new { background: rgba(74,222,128,.82); color: #000; }
.chp-badge-featured {
  position: absolute; top: -28px; left: 0;
  background: rgba(229,160,13,.9); color: #000;
  padding: 2px 10px; border-radius: 6px;
  font-size: .6rem; font-weight: 800; letter-spacing: .6px; text-transform: uppercase;
  white-space: nowrap; pointer-events: none;
}
.chp-badge-wl { background: rgba(96,165,250,.82); color: #fff; }

/* Hover overlay on poster */
.chp-poster-hover {
  position: absolute; inset: 0; border-radius: 13px;
  background: linear-gradient(to top, rgba(8,8,14,.96) 0%, rgba(8,8,14,.5) 45%, transparent 70%);
  opacity: 0; transition: ${prefersReducedMotion ? 'none' : 'opacity .25s ease'};
  display: flex; flex-direction: column; justify-content: flex-end; padding: 10px;
  pointer-events: none; z-index: 4;
}
.chp-poster-card:hover .chp-poster-hover { opacity: 1; }
.chp-poster-hover-title {
  font-size: .78rem; font-weight: 700; color: #fff; margin-bottom: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.chp-poster-hover-meta { font-size: .65rem; color: rgba(255,255,255,.5); margin-bottom: 8px; }
.chp-poster-watch-btn {
  padding: 5px 12px; border-radius: 16px;
  background: linear-gradient(135deg, #e5a00d, #ff6b35);
  color: #000; border: none; font-family: 'DM Sans', sans-serif;
  font-size: .7rem; font-weight: 700; cursor: pointer; width: 100%;
  pointer-events: auto;
  transition: ${prefersReducedMotion ? 'none' : 'filter .2s'};
}
.chp-poster-watch-btn:hover { filter: brightness(1.1); }

/* Video preview overlay */
.chp-video-preview {
  position: absolute; inset: 0; z-index: 8; border-radius: 13px;
  overflow: hidden; pointer-events: none;
}
.chp-video-preview iframe { width: 100%; height: 100%; border: none; transform: scale(1.15); }
.chp-video-preview.chp-preview-active { pointer-events: auto; }

/* CW specific — progress bar */
.chp-cw-progress-wrap {
  position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
  background: rgba(255,255,255,.1); z-index: 5; border-radius: 0 0 13px 13px;
}
.chp-cw-progress-fill {
  height: 100%; background: linear-gradient(90deg, #e5a00d, #ff6b35);
  border-radius: 0 0 0 13px;
  animation: ${prefersReducedMotion ? 'none' : 'chp-progress-fill .9s cubic-bezier(.22,1,.36,1) both'};
  animation-delay: .3s;
}

/* CW hover episode strip */
.chp-ep-strip {
  display: flex; gap: 5px; margin-top: 6px;
}
.chp-ep-thumb {
  flex: 1; aspect-ratio: 16/9; object-fit: cover;
  border-radius: 5px; border: 1px solid rgba(255,255,255,.1);
  cursor: pointer;
  transition: ${prefersReducedMotion ? 'none' : 'transform .2s, border-color .2s'};
}
.chp-ep-thumb:hover { transform: scale(1.05); border-color: rgba(229,160,13,.4); }

/* Poster title below card */
.chp-poster-label {
  font-size: .78rem; font-weight: 500; color: rgba(255,255,255,.55);
  padding: 8px 4px 0; text-align: center;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Loading pulse on click */
.chp-poster-card.chp-loading { animation: chp-load-pulse .85s ease-in-out infinite; pointer-events: none; }

/* ══════════════════════════════════════════════
   MINI PLAYER BAR
══════════════════════════════════════════════ */
#${MINIBAR_ID} {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 60;
  height: 64px; padding: 0 36px;
  display: flex; align-items: center; gap: 14px;
  background: rgba(10,10,18,.92);
  backdrop-filter: blur(32px) saturate(1.7);
  -webkit-backdrop-filter: blur(32px) saturate(1.7);
  border-top: 1px solid rgba(255,255,255,.07);
  box-shadow: 0 -8px 32px rgba(0,0,0,.45);
  transform: translateY(100%);
  transition: ${prefersReducedMotion ? 'none' : 'transform .4s cubic-bezier(.34,1.3,.64,1)'};
}
#${MINIBAR_ID}.chp-minibar-visible { transform: translateY(0); }
.chp-minibar-poster { width: 32px; height: 46px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.chp-minibar-info { flex: 1; min-width: 0; }
.chp-minibar-title { font-size: .82rem; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chp-minibar-ep { font-size: .7rem; color: rgba(255,255,255,.4); margin-top: 2px; }
.chp-minibar-progress {
  flex: 1; height: 3px; background: rgba(255,255,255,.1);
  border-radius: 2px; overflow: hidden; max-width: 200px;
}
.chp-minibar-fill { height: 100%; background: linear-gradient(90deg, #e5a00d, #ff6b35); border-radius: 2px; }
.chp-minibar-resume {
  padding: 7px 18px; border-radius: 20px;
  background: linear-gradient(135deg, #e5a00d, #ff6b35);
  color: #000; border: none; font-family: 'DM Sans', sans-serif;
  font-size: .75rem; font-weight: 700; cursor: pointer; flex-shrink: 0;
  transition: ${prefersReducedMotion ? 'none' : 'transform .3s cubic-bezier(.34,1.3,.64,1), filter .2s'};
}
.chp-minibar-resume:hover { transform: translateY(-2px); filter: brightness(1.08); }
.chp-minibar-close {
  width: 28px; height: 28px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.4); cursor: pointer; font-size: .7rem;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: ${prefersReducedMotion ? 'none' : 'all .2s'};
}
.chp-minibar-close:hover { background: rgba(255,255,255,.1); color: #fff; }

/* ══════════════════════════════════════════════
   SEARCH OVERLAY
══════════════════════════════════════════════ */
#${SEARCH_ID} {
  position: fixed; inset: 0; z-index: 10000;
  display: flex; flex-direction: column; align-items: center;
  padding-top: 12vh;
  opacity: 0; pointer-events: none;
  transition: ${prefersReducedMotion ? 'none' : 'opacity .3s ease'};
}
#${SEARCH_ID}.chp-search-open { opacity: 1; pointer-events: auto; }
.chp-search-backdrop {
  position: absolute; inset: 0;
  background: rgba(8,8,14,.82);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
}
.chp-search-shell {
  position: relative; z-index: 1;
  width: 100%; max-width: 680px; padding: 0 20px;
  animation: ${prefersReducedMotion ? 'none' : 'chp-overlay-in .38s cubic-bezier(.34,1.3,.64,1) both'};
}
.chp-search-box {
  background: rgba(22,22,30,.92);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 22px;
  padding: 18px 22px;
  display: flex; align-items: center; gap: 14px;
  box-shadow: 0 24px 64px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.07);
  backdrop-filter: blur(44px);
  margin-bottom: 12px;
}
.chp-search-icon { font-size: 1.1rem; color: rgba(255,255,255,.35); flex-shrink: 0; }
.chp-search-input {
  flex: 1; background: none; border: none; outline: none;
  font-family: 'DM Sans', sans-serif; font-size: 1.15rem; font-weight: 400;
  color: #fff; letter-spacing: -.2px;
}
.chp-search-input::placeholder { color: rgba(255,255,255,.25); }
.chp-search-kbd {
  font-size: .68rem; color: rgba(255,255,255,.3);
  border: 1px solid rgba(255,255,255,.12); border-radius: 6px;
  padding: 2px 7px; flex-shrink: 0;
}
.chp-search-results {
  background: rgba(18,18,26,.95);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 18px; overflow: hidden;
  box-shadow: 0 18px 52px rgba(0,0,0,.55);
  max-height: 440px; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: rgba(229,160,13,.2) transparent;
}
.chp-search-result {
  display: flex; gap: 14px; align-items: center; padding: 12px 18px;
  cursor: pointer; border-bottom: 1px solid rgba(255,255,255,.04);
  transition: background .15s; animation: chp-spring-in .25s both;
  animation-delay: calc(var(--i, 0) * 30ms);
}
.chp-search-result:last-child { border-bottom: none; }
.chp-search-result:hover, .chp-search-result.chp-focused { background: rgba(229,160,13,.08); }
.chp-search-result img { width: 38px; height: 54px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.chp-search-result-title { font-size: .9rem; font-weight: 600; color: #fff; margin-bottom: 3px; }
.chp-search-result-meta { font-size: .72rem; color: rgba(255,255,255,.38); }
.chp-search-hint { padding: 20px; text-align: center; color: rgba(255,255,255,.22); font-size: .82rem; }

/* ══════════════════════════════════════════════
   WATCHLIST PAGE
══════════════════════════════════════════════ */
#${WATCHLIST_ID} {
  position: fixed; inset: 0; z-index: 9000;
  opacity: 0; pointer-events: none;
  transition: ${prefersReducedMotion ? 'none' : 'opacity .35s ease'};
}
#${WATCHLIST_ID}.chp-wl-open { opacity: 1; pointer-events: auto; }
.chp-wl-backdrop {
  position: absolute; inset: 0;
  background: rgba(8,8,14,.88);
  backdrop-filter: blur(32px) saturate(1.4);
  -webkit-backdrop-filter: blur(32px) saturate(1.4);
}
.chp-wl-shell {
  position: absolute; inset: 0;
  overflow-y: auto; padding: 28px;
  display: flex; flex-direction: column; gap: 0;
}
.chp-wl-header {
  display: flex; align-items: center; gap: 16px; margin-bottom: 28px;
  padding: 0 16px;
}
.chp-wl-title { font-size: 1.55rem; font-weight: 700; color: #fff; letter-spacing: -.4px; flex: 1; }
.chp-wl-stats {
  display: flex; gap: 20px;
}
.chp-wl-stat {
  text-align: center;
}
.chp-wl-stat-val { font-size: 1.1rem; font-weight: 700; color: #e5a00d; }
.chp-wl-stat-label { font-size: .65rem; color: rgba(255,255,255,.35); text-transform: uppercase; letter-spacing: .8px; }
.chp-wl-close {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05);
  color: rgba(255,255,255,.6); cursor: pointer; font-size: .9rem;
  display: flex; align-items: center; justify-content: center;
  transition: ${prefersReducedMotion ? 'none' : 'all .25s cubic-bezier(.34,1.3,.64,1)'};
}
.chp-wl-close:hover { background: rgba(248,113,113,.15); border-color: rgba(248,113,113,.3); color: #f87171; }

.chp-wl-sort-bar { display: flex; gap: 8px; margin-bottom: 24px; padding: 0 16px; flex-wrap: wrap; }
.chp-wl-sort-btn {
  padding: 6px 14px; border-radius: 18px; font-size: .75rem; font-weight: 600;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
  color: rgba(255,255,255,.45); cursor: pointer;
  transition: ${prefersReducedMotion ? 'none' : 'all .2s cubic-bezier(.34,1.3,.64,1)'};
}
.chp-wl-sort-btn.active { background: rgba(229,160,13,.12); border-color: rgba(229,160,13,.3); color: #e5a00d; }

.chp-wl-group { margin-bottom: 32px; padding: 0 16px; }
.chp-wl-group-title {
  font-size: .72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1px; color: rgba(255,255,255,.35); margin-bottom: 14px;
  display: flex; align-items: center; gap: 8px;
}
.chp-wl-group-title::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,.06); }
.chp-wl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px; }
.chp-wl-card {
  position: relative; border-radius: 12px; overflow: hidden; cursor: pointer;
  transition: ${prefersReducedMotion ? 'none' : 'transform .35s cubic-bezier(.34,1.3,.64,1), box-shadow .3s'};
  animation: chp-spring-in .35s both; animation-delay: calc(var(--i,0)*25ms);
}
.chp-wl-card:hover { transform: translateY(-5px) scale(1.02); box-shadow: 0 16px 40px rgba(0,0,0,.6); }
.chp-wl-card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 12px; }
.chp-wl-card-overlay {
  position: absolute; inset: 0; border-radius: 12px;
  background: linear-gradient(to top, rgba(8,8,14,.9) 0%, transparent 55%);
}
.chp-wl-card-bottom { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 10px; }
.chp-wl-card-title { font-size: .72rem; font-weight: 700; color: rgba(255,255,255,.9); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chp-wl-card-stars { font-size: .6rem; color: #e5a00d; }
.chp-wl-empty { text-align: center; padding: 60px 0; color: rgba(255,255,255,.28); font-size: .88rem; }

/* Taste profile card inside watchlist */
.chp-taste-card {
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
  border-radius: 18px; padding: 22px 24px; margin: 0 16px 28px;
}
.chp-taste-title {
  font-size: .78rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .9px; color: rgba(255,255,255,.38); margin-bottom: 14px;
  display: flex; align-items: center; gap: 10px;
}
.chp-taste-title::before { content: ''; width: 4px; height: 1em; background: linear-gradient(180deg,#e5a00d,#ff6b35); border-radius: 3px; }
.chp-taste-profile-text {
  font-size: .92rem; color: rgba(255,255,255,.65); font-style: italic;
  font-family: 'DM Serif Display', serif; margin-bottom: 14px; line-height: 1.55;
}
.chp-genre-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.chp-genre-pill {
  padding: 4px 12px; border-radius: 20px; font-size: .73rem; font-weight: 600;
  background: rgba(229,160,13,.1); border: 1px solid rgba(229,160,13,.2); color: rgba(229,160,13,.9);
}

/* ══════════════════════════════════════════════
   WHAT TO WATCH TONIGHT
══════════════════════════════════════════════ */
#${WTWT_ID} {
  position: fixed; inset: 0; z-index: 9500;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: ${prefersReducedMotion ? 'none' : 'opacity .4s ease'};
}
#${WTWT_ID}.chp-wtwt-open { opacity: 1; pointer-events: auto; }
.chp-wtwt-bg {
  position: absolute; inset: 0;
  background: rgba(8,8,14,.95);
  backdrop-filter: blur(40px) saturate(1.3);
}
.chp-wtwt-shell {
  position: relative; z-index: 1; text-align: center;
  max-width: 640px; padding: 20px;
  animation: ${prefersReducedMotion ? 'none' : 'chp-overlay-in .5s cubic-bezier(.34,1.3,.64,1) both'};
}
.chp-wtwt-backdrop {
  width: 100%; max-width: 540px; aspect-ratio: 16/9;
  object-fit: cover; border-radius: 20px; margin: 0 auto 28px;
  box-shadow: 0 32px 80px rgba(0,0,0,.7);
  filter: brightness(.85);
}
.chp-wtwt-logo { max-height: 80px; max-width: 280px; margin: 0 auto 16px; display: block; }
.chp-wtwt-reason {
  font-size: .82rem; color: rgba(255,255,255,.45); margin-bottom: 24px;
  font-style: italic; font-family: 'DM Serif Display', serif;
}
.chp-wtwt-actions { display: flex; gap: 12px; justify-content: center; margin-bottom: 28px; }
.chp-wtwt-close-btn {
  position: absolute; top: 20px; right: 20px;
  width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05);
  color: rgba(255,255,255,.5); cursor: pointer; font-size: .8rem;
  display: flex; align-items: center; justify-content: center;
  transition: ${prefersReducedMotion ? 'none' : 'all .25s'};
}
.chp-wtwt-close-btn:hover { background: rgba(248,113,113,.15); color: #f87171; }
.chp-wtwt-loading { color: rgba(255,255,255,.3); font-size: .88rem; padding: 60px 0; }

/* ══════════════════════════════════════════════
   NOTIFICATIONS DROPDOWN
══════════════════════════════════════════════ */
.chp-notif-panel {
  position: absolute; top: 44px; right: 0;
  width: 310px;
  background: rgba(18,18,26,.96); border: 1px solid rgba(255,255,255,.1);
  border-radius: 18px; padding: 16px;
  box-shadow: 0 18px 48px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06);
  backdrop-filter: blur(32px);
  animation: chp-slide-down .3s cubic-bezier(.34,1.3,.64,1) both;
  z-index: 100;
  display: none;
}
.chp-notif-panel.visible { display: block; }
.chp-notif-title { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .9px; color: rgba(255,255,255,.35); margin-bottom: 12px; }
.chp-notif-item {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.05);
  cursor: pointer; transition: background .15s;
}
.chp-notif-item:last-child { border-bottom: none; }
.chp-notif-item:hover { background: rgba(255,255,255,.03); border-radius: 8px; }
.chp-notif-dot { width: 7px; height: 7px; border-radius: 50%; background: #e5a00d; flex-shrink: 0; margin-top: 4px; }
.chp-notif-text { font-size: .8rem; color: rgba(255,255,255,.72); line-height: 1.5; }
.chp-notif-empty { font-size: .8rem; color: rgba(255,255,255,.28); text-align: center; padding: 16px 0; }

/* ══════════════════════════════════════════════
   SETTINGS PANEL
══════════════════════════════════════════════ */
.chp-settings-panel {
  position: absolute; top: 44px; right: 0;
  width: 340px;
  background: rgba(16,16,24,.96); border: 1px solid rgba(255,255,255,.1);
  border-radius: 20px; padding: 22px;
  box-shadow: 0 22px 56px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.06);
  backdrop-filter: blur(44px);
  animation: chp-slide-down .35s cubic-bezier(.34,1.3,.64,1) both;
  z-index: 100; display: none;
  max-height: 70vh; overflow-y: auto;
}
.chp-settings-panel.visible { display: block; }
.chp-settings-title {
  font-size: .78rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .9px; color: rgba(255,255,255,.35); margin-bottom: 18px;
  display: flex; align-items: center; gap: 9px;
}
.chp-settings-title::before { content: ''; width: 4px; height: 1em; background: linear-gradient(180deg,#e5a00d,#ff6b35); border-radius: 3px; }
.chp-settings-group { margin-bottom: 18px; }
.chp-settings-group-label { font-size: .65rem; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: rgba(255,255,255,.25); margin-bottom: 10px; }
.chp-toggle-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 14px; border-radius: 12px;
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.05);
  margin-bottom: 7px;
  transition: background .2s;
}
.chp-toggle-item:hover { background: rgba(255,255,255,.055); }
.chp-toggle-left { display: flex; align-items: center; gap: 10px; }
.chp-toggle-icon { font-size: 1rem; }
.chp-toggle-label { font-size: .83rem; font-weight: 500; color: rgba(255,255,255,.82); }
/* Switch */
.chp-switch { position: relative; width: 40px; height: 22px; flex-shrink: 0; }
.chp-switch input { opacity: 0; width: 0; height: 0; }
.chp-slider { position: absolute; cursor: pointer; inset: 0; background: rgba(255,255,255,.1); border-radius: 22px; transition: .35s; }
.chp-slider::before { position: absolute; content: ''; height: 16px; width: 16px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .35s cubic-bezier(.34,1.3,.64,1); }
.chp-switch input:checked + .chp-slider { background: #e5a00d; }
.chp-switch input:checked + .chp-slider::before { transform: translateX(18px); }
/* Slider range */
.chp-range-row { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.chp-range-label { font-size: .72rem; color: rgba(255,255,255,.35); min-width: 80px; }
.chp-range { flex: 1; accent-color: #e5a00d; }

/* ══════════════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════════════ */
#${CTX_ID} {
  position: fixed; z-index: 99000;
  background: rgba(18,18,26,.97); border: 1px solid rgba(255,255,255,.12);
  border-radius: 14px; padding: 6px;
  box-shadow: 0 16px 48px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.07);
  backdrop-filter: blur(32px);
  animation: chp-ctx-in .2s cubic-bezier(.34,1.3,.64,1) both;
  display: none; min-width: 180px;
}
#${CTX_ID}.visible { display: block; }
.chp-ctx-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px; border-radius: 10px;
  font-size: .82rem; font-weight: 500; color: rgba(255,255,255,.75);
  cursor: pointer; transition: background .15s, color .15s;
}
.chp-ctx-item:hover { background: rgba(229,160,13,.1); color: #e5a00d; }
.chp-ctx-icon { font-size: .9rem; width: 18px; text-align: center; }
.chp-ctx-divider { height: 1px; background: rgba(255,255,255,.07); margin: 4px 0; }

/* ══════════════════════════════════════════════
   SCROLL ENTRANCE (IntersectionObserver)
══════════════════════════════════════════════ */
.chp-will-enter {
  opacity: 0;
  transform: translateY(28px);
  transition: ${prefersReducedMotion ? 'none' : 'opacity .58s cubic-bezier(.22,1,.36,1), transform .58s cubic-bezier(.22,1,.36,1)'};
}
.chp-will-enter.chp-entered { opacity: 1; transform: translateY(0); }

/* ══════════════════════════════════════════════
   OFFLINE NOTICE
══════════════════════════════════════════════ */
.chp-offline-bar {
  position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%);
  background: rgba(248,113,113,.15); border: 1px solid rgba(248,113,113,.3);
  color: #fca5a5; border-radius: 20px; padding: 8px 20px;
  font-size: .78rem; font-weight: 600; z-index: 200;
  backdrop-filter: blur(12px);
  display: none;
}
.chp-offline-bar.visible { display: block; }

/* ══════════════════════════════════════════════
   TRENDING TICKER
══════════════════════════════════════════════ */
#chp-ticker {
  overflow: hidden; padding: 12px 0;
  position: relative; margin: 0 0 8px;
  border-top: 1px solid rgba(255,255,255,.04);
  border-bottom: 1px solid rgba(255,255,255,.04);
}
.chp-ticker-track {
  display: flex; gap: 52px;
  animation: ${prefersReducedMotion ? 'none' : 'chp-ticker-scroll 60s linear infinite'};
  width: max-content;
}
@keyframes chp-ticker-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.chp-ticker-item {
  display: flex; align-items: center; gap: 8px;
  opacity: .22; transition: opacity .2s;
  white-space: nowrap;
}
.chp-ticker-item:hover { opacity: .6; }
.chp-ticker-img { width: 28px; height: 18px; object-fit: cover; border-radius: 3px; }
.chp-ticker-title { font-size: .7rem; font-weight: 600; color: rgba(255,255,255,.8); }

/* ══════════════════════════════════════════════
   STREMIO TOP BAR MERGE
   Sidebar icons slot into the native top bar.
   Sidebar itself collapses to zero width.
   Content area expands edge-to-edge.
══════════════════════════════════════════════ */

/* 1 ── Hide the sidebar */
.chp-sidebar-hidden {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  padding: 0 !important;
  margin: 0 !important;
  flex-shrink: 0 !important;
  transition: width .35s ease, opacity .25s ease !important;
}

/* 2 ── Remove the content-area left offset Stremio adds for the sidebar */
.chp-content-full-width {
  margin-left: 0 !important;
  padding-left: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
}

/* 3 ── Give the native top bar contrast and depth */
.chp-topbar-styled {
  background: rgba(8,8,14,.94) !important;
  backdrop-filter: blur(28px) saturate(1.7) !important;
  -webkit-backdrop-filter: blur(28px) saturate(1.7) !important;
  border-bottom: 1px solid rgba(255,255,255,.09) !important;
  box-shadow:
    0 1px 0 rgba(255,255,255,.05),
    0 2px 24px rgba(0,0,0,.45) !important;
}

/* 4 ── Nav group — fixed position on body, overlaid on the native top bar */
#chp-topnav-group {
  /* position/top/left/height set dynamically in JS from measured coords */
  display: flex !important;
  align-items: center !important;
  gap: 2px !important;
  padding: 0 10px 0 6px !important;
  /* Right border separates icons from search field */
  border-right: 1px solid rgba(255,255,255,.08) !important;
  pointer-events: auto !important;
}

/* 5 ── Each cloned nav link */
.chp-topnav-link {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 36px !important; height: 36px !important;
  border-radius: 10px !important;
  opacity: .42 !important;
  color: rgba(255,255,255,.75) !important;
  text-decoration: none !important;
  position: relative !important;
  transition: background .18s ease, opacity .18s ease !important;
  flex-shrink: 0 !important;
}
.chp-topnav-link:hover {
  background: rgba(255,255,255,.07) !important;
  opacity: .85 !important;
}
.chp-topnav-link.chp-nav-active {
  background: rgba(229,160,13,.13) !important;
  opacity: 1 !important;
}
.chp-topnav-link.chp-nav-active svg,
.chp-topnav-link.chp-nav-active [class*="icon"] {
  color: #e5a00d !important;
  fill: #e5a00d !important;
  stroke: #e5a00d !important;
}
/* Active amber left-edge indicator */
.chp-topnav-link.chp-nav-active::after {
  content: '' !important;
  position: absolute !important;
  bottom: -1px !important; left: 6px !important; right: 6px !important;
  height: 2px !important;
  background: linear-gradient(90deg, #e5a00d, #ff6b35) !important;
  border-radius: 2px 2px 0 0 !important;
}
/* Force SVG/icon sizing inside cloned links */
.chp-topnav-link svg {
  width: 18px !important; height: 18px !important;
  flex-shrink: 0 !important; display: block !important;
}
.chp-topnav-link img {
  width: 18px !important; height: 18px !important;
  object-fit: contain !important;
}

/* ══════════════════════════════════════════════
   PAGE ENTRANCE SEQUENCE
══════════════════════════════════════════════ */
.chp-entrance-0 { animation: ${prefersReducedMotion ? 'none' : 'chp-fade-in .4s ease both'}; animation-delay: 0s; }
.chp-entrance-1 { animation: ${prefersReducedMotion ? 'none' : 'chp-hero-enter .6s cubic-bezier(.22,1,.36,1) both'}; animation-delay: .15s; }
.chp-entrance-2 { animation: ${prefersReducedMotion ? 'none' : 'chp-fade-up .5s cubic-bezier(.22,1,.36,1) both'}; animation-delay: .3s; }
.chp-entrance-3 { animation: ${prefersReducedMotion ? 'none' : 'chp-fade-up .5s cubic-bezier(.22,1,.36,1) both'}; animation-delay: .42s; }
.chp-entrance-4 { animation: ${prefersReducedMotion ? 'none' : 'chp-fade-up .5s cubic-bezier(.22,1,.36,1) both'}; animation-delay: .56s; }
`;
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MAIN CLASS
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════
  // ── MODULE: STREAM BROWSER ─────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

/**
 * @name Cinematic Stream Browser
 * @description Replaces the plain right-side stream panel on Stremio detail pages with a
 *   premium, glassmorphic cinema experience. Streams are grouped by resolution tier,
 *   ranked by quality score, and presented in beautifully animated glass cards —
 *   sharing the full design language of the Cinematic Title View Enhancer.
 * @version 2.0.0
 * @author elmarco
 *
 * @copyright 2026 elmarco. All rights reserved.
 *
 * v2.0.0 improvements:
 *  - Smarter parser with regex fallbacks for seeds/size/provider (no emoji dependency)
 *  - Debounced filter bar — type to narrow streams instantly, zero network cost
 *  - "Last played" badge per title, persisted in localStorage by IMDB ID
 *  - Tier collapse state persisted in localStorage across sessions
 *  - Click-loading state on stream cards (amber pulse while Stremio responds)
 *  - Skeleton loader — shimmer placeholders visible during the parse debounce
 *  - Seeder fill bar underneath signal bars for at-a-glance torrent health
 *  - Per-card debrid source icons (RD, PM, TB, DL, AD)
 *  - Best 4K / Best HD buttons now scroll + flash matched card before firing
 *  - Compact / expanded toggle in header, preference persisted in localStorage
 *  - All-fallback tier groups get a muted "no parseable streams" notice
 */


  // ── Constants ──────────────────────────────────────────────────────────────

  const CSB_STYLE_ID = 'csb-styles';
  const CONT_ID   = 'csb-root';
  const SKEL_ID   = 'csb-skeleton';
  const HIDE_CLS  = 'csb-hidden';
  const PANEL_CLS = 'csb-panel';

  // Debrid / service favicon map — keyed on the bracket tag without brackets
  const SOURCE_ICONS = {
    'RD':  'https://real-debrid.com/favicon.ico',
    'RD+': 'https://real-debrid.com/favicon.ico',
    'PM':  'https://www.premiumize.me/favicon.ico',
    'TB':  'https://torbox.app/favicon.ico',
    'DL':  'https://debrid-link.fr/favicon.ico',
    'AD':  'https://alldebrid.com/favicon.ico',
  };

  // ── Tier + chip definitions ────────────────────────────────────────────────

  const TIERS = {
    '4K':      { label: '4K UHD', color: '#93c5fd', bg: 'rgba(96,165,250,.13)',  border: 'rgba(96,165,250,.28)',  order: 0, glow: 'rgba(96,165,250,.22)'  },
    '1080p':   { label: '1080p',  color: '#86efac', bg: 'rgba(74,222,128,.13)',  border: 'rgba(74,222,128,.28)',  order: 1, glow: 'rgba(74,222,128,.22)'  },
    '720p':    { label: '720p',   color: '#fde047', bg: 'rgba(250,204,21,.13)',  border: 'rgba(250,204,21,.28)',  order: 2, glow: 'rgba(250,204,21,.22)'  },
    'SD':      { label: 'SD',     color: '#a1a1aa', bg: 'rgba(161,161,170,.10)', border: 'rgba(161,161,170,.22)', order: 3, glow: 'rgba(161,161,170,.14)' },
    'Unknown': { label: 'Other',  color: '#71717a', bg: 'rgba(113,113,122,.10)', border: 'rgba(113,113,122,.18)', order: 4, glow: 'rgba(113,113,122,.10)' },
  };

  const CHIP = {
    'DV':      { bg: 'rgba(192,132,252,.14)', fg: '#c084fc', b: 'rgba(192,132,252,.3)'  },
    'HDR10+':  { bg: 'rgba(251,191,36,.14)',  fg: '#fbbf24', b: 'rgba(251,191,36,.3)'   },
    'HDR10':   { bg: 'rgba(110,231,183,.14)', fg: '#6ee7b7', b: 'rgba(110,231,183,.3)'  },
    'HDR':     { bg: 'rgba(110,231,183,.12)', fg: '#6ee7b7', b: 'rgba(110,231,183,.25)' },
    'ATMOS':   { bg: 'rgba(125,211,252,.14)', fg: '#7dd3fc', b: 'rgba(125,211,252,.3)'  },
    'REMUX':   { bg: 'rgba(240,171,252,.14)', fg: '#f0abfc', b: 'rgba(240,171,252,.3)'  },
    'WEB-DL':  { bg: 'rgba(209,213,219,.10)', fg: '#d1d5db', b: 'rgba(209,213,219,.2)'  },
    'BluRay':  { bg: 'rgba(165,180,252,.14)', fg: '#a5b4fc', b: 'rgba(165,180,252,.3)'  },
  };

  // ── localStorage helpers ───────────────────────────────────────────────────


  /** Extract IMDB tt-id from the current Stremio URL hash/path */
  function getContentId() {
    const m = (location.hash + ' ' + location.href).match(/tt\d+/);
    return m ? m[0] : null;
  }

  /** Stable fingerprint for a parsed stream — used to identify "last played" */
  function streamFp(s) { return [s.source, s.name, s.res].join('|'); }

  // ── CSS ────────────────────────────────────────────────────────────────────

  function _injectStreamCSSInternal() {
    if (document.getElementById(CSB_STYLE_ID)) return;

    // DM Sans font — same import as data-enrichment
    if (!document.getElementById('csb-font')) {
      const link = document.createElement('link');
      link.id   = 'csb-font';
      link.rel  = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap';
      document.head.appendChild(link);
    }

    const s = document.createElement('style');
    s.id = CSB_STYLE_ID;
    s.textContent = `

/* ── utility ── */
.${HIDE_CLS} { display: none !important; }

/* ── KEYFRAMES (data-enrichment heritage) ── */
@keyframes csb-fade-up {
  from { opacity: 0; transform: translateY(20px) scale(.98); }
  to   { opacity: 1; transform: translateY(0)    scale(1);   }
}
@keyframes csb-card-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0);    }
}
@keyframes csb-shimmer {
  0%   { background-position: -700px 0; }
  100% { background-position:  700px 0; }
}
@keyframes csb-glow-pulse {
  0%,100% { box-shadow: 0 0 8px rgba(229,160,13,.12), 0 4px 18px rgba(0,0,0,.35); }
  50%      { box-shadow: 0 0 22px rgba(229,160,13,.38), 0 4px 18px rgba(0,0,0,.35); }
}
@keyframes csb-best-shine {
  from { transform: translateX(-120%) skewX(-18deg); }
  to   { transform: translateX(320%)  skewX(-18deg); }
}
@keyframes csb-tier-drop {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0);    }
}
/* Border flash fired when a best-pick button highlights its card */
@keyframes csb-card-flash {
  0%   { border-color: rgba(229,160,13,.85);
         box-shadow: 0 0 0 2px rgba(229,160,13,.38), 0 12px 32px rgba(0,0,0,.42); }
  100% { border-color: rgba(255,255,255,.07);
         box-shadow: 0 4px 18px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.05); }
}
/* Amber pulse shown on a card while Stremio processes the click */
@keyframes csb-load-pulse {
  0%,100% { opacity: .55; }
  50%      { opacity: 1;   }
}

/* ── OUTER PANEL: float it away from the viewport edge ── */
.${PANEL_CLS} {
  margin: 8px 14px 14px 8px !important;
  border-radius: 22px !important;
  border: 1px solid rgba(255,255,255,.07) !important;
  background: linear-gradient(160deg, rgba(20,20,28,.92) 0%, rgba(13,13,20,.78) 100%) !important;
  backdrop-filter: blur(44px) saturate(1.85) !important;
  -webkit-backdrop-filter: blur(44px) saturate(1.85) !important;
  box-shadow:
    0 24px 64px rgba(0,0,0,.55),
    inset 0 1px 0 rgba(255,255,255,.07) !important;
  overflow: visible !important;
}

/* ── SCROLL AREA ── */
#${CONT_ID} {
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: calc(100vh - 120px);
  padding: 22px 18px 24px;
  scrollbar-width: thin;
  scrollbar-color: rgba(229,160,13,.18) transparent;
  animation: csb-fade-up .42s cubic-bezier(.34,1.3,.64,1) both;
}
#${CONT_ID}::-webkit-scrollbar { width: 4px; }
#${CONT_ID}::-webkit-scrollbar-track { background: transparent; }
#${CONT_ID}::-webkit-scrollbar-thumb {
  background: rgba(229,160,13,.22);
  border-radius: 4px;
}
#${CONT_ID} * { box-sizing: border-box; }

/* ── SKELETON LOADER ── */
#${SKEL_ID} {
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  padding: 22px 18px 24px;
  animation: csb-fade-up .28s cubic-bezier(.34,1.3,.64,1) both;
}
.csb-skel-hdr {
  height: 22px;
  width: 52%;
  border-radius: 8px;
  margin-bottom: 20px;
  background: linear-gradient(90deg,
    rgba(255,255,255,.04) 25%,
    rgba(255,255,255,.09) 50%,
    rgba(255,255,255,.04) 75%);
  background-size: 700px 100%;
  animation: csb-shimmer 1.5s infinite linear;
}
.csb-skel-card {
  height: 76px;
  border-radius: 16px;
  margin-bottom: 7px;
  border: 1px solid rgba(255,255,255,.05);
  background: linear-gradient(90deg,
    rgba(255,255,255,.025) 25%,
    rgba(255,255,255,.065) 50%,
    rgba(255,255,255,.025) 75%);
  background-size: 700px 100%;
  animation: csb-shimmer 1.5s infinite linear;
}
.csb-skel-card:nth-child(2) { animation-delay: .08s; }
.csb-skel-card:nth-child(3) { animation-delay: .16s; height: 68px; }
.csb-skel-card:nth-child(4) { animation-delay: .24s; height: 68px; }
.csb-skel-card:nth-child(5) { animation-delay: .32s; }

/* ── HEADER ROW (section-title mirror from data-enrichment) ── */
.csb-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 14px;
  border-bottom: 1px solid rgba(255,255,255,.05);
  margin-bottom: 14px;
  gap: 10px;
  flex-wrap: wrap;
}
.csb-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -.3px;
  display: flex;
  align-items: center;
  gap: 11px;
}
/* amber accent bar — exact .plex-section-title::before clone */
.csb-title::before {
  content: '';
  display: block;
  width: 4px;
  height: 1.15em;
  background: linear-gradient(180deg, #e5a00d 0%, #ff6b35 100%);
  border-radius: 3px;
  flex-shrink: 0;
}
.csb-stream-count {
  font-size: .72rem;
  font-weight: 700;
  color: rgba(255,255,255,.3);
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.08);
  padding: 3px 10px;
  border-radius: 20px;
  letter-spacing: .4px;
}
.csb-hdr-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── COMPACT TOGGLE ── */
.csb-compact-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 10px;
  background: rgba(255,255,255,.04);
  cursor: pointer;
  color: rgba(255,255,255,.4);
  font-size: .88rem;
  transition: background .18s, color .18s, border-color .18s;
  flex-shrink: 0;
  user-select: none;
}
.csb-compact-btn:hover {
  background: rgba(255,255,255,.08);
  color: rgba(255,255,255,.78);
}
.csb-compact-btn.active {
  background: rgba(229,160,13,.12);
  border-color: rgba(229,160,13,.3);
  color: #e5a00d;
}

/* ── FILTER BAR ── */
.csb-filter-wrap {
  position: relative;
  margin-bottom: 14px;
}
.csb-filter-icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255,255,255,.2);
  font-size: .85rem;
  pointer-events: none;
  line-height: 1;
}
.csb-filter {
  width: 100%;
  padding: 9px 12px 9px 30px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.82);
  font-family: 'DM Sans', -apple-system, sans-serif;
  font-size: .83rem;
  outline: none;
  transition: border-color .2s, background .2s;
}
.csb-filter::placeholder { color: rgba(255,255,255,.2); }
.csb-filter:focus {
  border-color: rgba(229,160,13,.35);
  background: rgba(255,255,255,.055);
}
.csb-filter-empty {
  text-align: center;
  color: rgba(255,255,255,.2);
  font-size: .82rem;
  padding: 22px 0;
  font-style: italic;
  display: none;
}

/* ── BEST PICK BUTTONS ── */
.csb-bwrap { display: flex; gap: 8px; flex-shrink: 0; }
.csb-bp {
  position: relative;
  overflow: hidden;
  padding: 8px 16px;
  border: none;
  border-radius: 22px;
  font-family: 'DM Sans', -apple-system, sans-serif;
  font-size: .8rem;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: .25px;
  transition:
    filter .22s,
    transform .35s cubic-bezier(.34,1.3,.64,1),
    box-shadow .25s;
  animation: csb-glow-pulse 3.5s infinite ease-in-out;
}
.csb-bp::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%);
  transform: translateX(-120%) skewX(-18deg);
  transition: none;
}
.csb-bp:hover::after { animation: csb-best-shine .55s ease forwards; }
.csb-bp:hover:not(:disabled) {
  filter: brightness(1.18);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,.4);
  animation: none;
}
.csb-bp:active:not(:disabled) { transform: translateY(0); }
.csb-bp[data-t="4K"]    { background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: #fff; }
.csb-bp[data-t="1080p"] { background: linear-gradient(135deg, #e5a00d 0%, #ff6b35 100%); color: #000; }
.csb-bp:disabled { opacity: .22; cursor: default; filter: none; transform: none; animation: none; box-shadow: none; }

/* ── TIER GROUP ── */
.csb-g { margin-bottom: 6px; }
.csb-g + .csb-g { margin-top: 10px; }

.csb-gh {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 8px;
  border-radius: 12px;
  cursor: pointer;
  user-select: none;
  transition: background .18s;
  animation: csb-tier-drop .35s cubic-bezier(.34,1.3,.64,1) both;
}
.csb-gh:hover { background: rgba(255,255,255,.035); }

/* tier pill — data-enrichment de-rating-pill lineage */
.csb-tier-pill {
  padding: 5px 14px;
  border-radius: 20px;
  font-size: .78rem;
  font-weight: 800;
  letter-spacing: .6px;
  text-transform: uppercase;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: box-shadow .25s;
}
.csb-gh:hover .csb-tier-pill {
  box-shadow: 0 0 16px var(--tier-glow, rgba(255,255,255,.1));
}
.csb-gc {
  font-size: .78rem;
  color: rgba(255,255,255,.28);
  font-weight: 500;
}
.csb-ga {
  margin-left: auto;
  font-size: .7rem;
  color: rgba(255,255,255,.2);
  transition: transform .28s cubic-bezier(.34,1.3,.64,1);
}
.csb-g.shut .csb-ga { transform: rotate(-90deg); }
.csb-gb {
  overflow: hidden;
  transition: max-height .38s cubic-bezier(.4,0,.2,1), opacity .3s;
  opacity: 1;
}
.csb-g.shut .csb-gb { max-height: 0 !important; opacity: 0; }

/* ── "No parseable streams" tier notice ── */
.csb-no-parse {
  padding: 10px 14px;
  margin-bottom: 6px;
  border-radius: 12px;
  border: 1px dashed rgba(255,255,255,.08);
  color: rgba(255,255,255,.2);
  font-size: .78rem;
  font-style: italic;
  text-align: center;
}

/* ── STREAM CARD ── */
.csb-c {
  padding: 15px 17px;
  margin-bottom: 7px;
  border-radius: 16px;
  cursor: pointer;

  /* glass card — data-enrichment de-rating-pill / plex-review-card heritage */
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.07);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 4px 18px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.05);

  transition:
    background .28s ease,
    border-color .28s ease,
    transform .38s cubic-bezier(.34,1.3,.64,1),
    box-shadow .3s ease;

  animation: csb-card-in .32s cubic-bezier(.22,1,.36,1) both;
  animation-delay: calc(var(--i, 0) * 28ms);
}
.csb-c:hover {
  background: rgba(255,255,255,.075);
  border-color: rgba(229,160,13,.28);
  transform: translateY(-2px);
  box-shadow:
    0 12px 32px rgba(0,0,0,.42),
    0 0 0 1px rgba(229,160,13,.12),
    inset 0 1px 0 rgba(255,255,255,.09);
}
.csb-c:active { transform: translateY(0); box-shadow: 0 4px 16px rgba(0,0,0,.28); }

/* Best-pick flash: fired programmatically, overrides transition */
.csb-c.csb-flash {
  animation: csb-card-flash 1.2s ease-out forwards;
  pointer-events: none;
}
/* Loading pulse: visible while Stremio processes the stream click */
.csb-c.csb-loading,
.csb-fb.csb-loading {
  animation: csb-load-pulse .85s ease-in-out infinite;
  pointer-events: none;
  border-color: rgba(229,160,13,.25) !important;
}

/* ── COMPACT MODE ── */
#${CONT_ID}.compact .csb-c    { padding: 9px 14px; margin-bottom: 4px; border-radius: 12px; }
#${CONT_ID}.compact .csb-r1   { margin-bottom: 4px; }
#${CONT_ID}.compact .csb-chip { display: none; }
#${CONT_ID}.compact .csb-chip.csb-size-chip { display: inline-flex; }
#${CONT_ID}.compact .csb-r2   { margin-bottom: 4px; }
#${CONT_ID}.compact .csb-r3   { display: none; }
#${CONT_ID}.compact .csb-seed-bar-wrap { display: none; }
#${CONT_ID}.compact .csb-fb   { padding: 8px 14px; margin-bottom: 4px; font-size: .78rem; }
#${CONT_ID}.compact .csb-gh   { padding: 6px 8px; }
#${CONT_ID}.compact .csb-tier-pill { padding: 3px 10px; font-size: .7rem; }
#${CONT_ID}.compact .csb-sep  { margin: 8px 0; }

/* ── CARD ROW 1 ── */
.csb-r1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 8px;
}
.csb-name-wrap {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 1;
}
/* Debrid/service favicon icon */
.csb-src-icon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
  object-fit: contain;
  opacity: .72;
}
.csb-name {
  font-size: .9rem;
  font-weight: 600;
  color: rgba(255,255,255,.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -.1px;
}
.csb-r1-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* ── SEEDER WIDGET (signal bars + count + fill bar) ── */
.csb-seed-widget { flex-shrink: 0; }
.csb-seed { display: flex; align-items: center; gap: 5px; }
.csb-sig  { display: flex; align-items: flex-end; gap: 2px; height: 15px; }
.csb-bar  { width: 3px; border-radius: 1.5px; background: rgba(255,255,255,.08); }
.csb-bar:nth-child(1) { height: 4px;  }
.csb-bar:nth-child(2) { height: 7px;  }
.csb-bar:nth-child(3) { height: 11px; }
.csb-bar:nth-child(4) { height: 15px; }
.csb-bar.on { background: currentColor; }
.csb-sn {
  font-size: .78rem;
  font-weight: 700;
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.2px;
}
/* fill bar — de-pill-bar-track/fill lineage from data-enrichment */
.csb-seed-bar-wrap { margin-top: 5px; }
.csb-seed-bar-track {
  height: 3px;
  width: 58px;
  border-radius: 2px;
  background: rgba(255,255,255,.06);
  overflow: hidden;
}
.csb-seed-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width .4s ease;
}

/* ── CARD ROW 2 (badges) ── */
.csb-r2 { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-bottom: 9px; }

/* resolution pill — de-rating-pill style */
.csb-res-pill {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .55px;
  text-transform: uppercase;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: box-shadow .25s;
}
.csb-c:hover .csb-res-pill {
  box-shadow: 0 0 14px var(--res-glow, rgba(255,255,255,.1));
}

/* format chip */
.csb-chip {
  padding: 3px 9px;
  border-radius: 8px;
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .3px;
}

/* ── CARD ROW 3 (meta) ── */
.csb-r3 {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: .78rem;
  color: rgba(255,255,255,.32);
  font-weight: 400;
}
.csb-r3 span { white-space: nowrap; }
.csb-dot { color: rgba(255,255,255,.15); }

/* best-pick crown badge */
.csb-crown {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: .65rem;
  font-weight: 800;
  letter-spacing: .5px;
  text-transform: uppercase;
  background: rgba(229,160,13,.18);
  color: #e5a00d;
  border: 1px solid rgba(229,160,13,.35);
  flex-shrink: 0;
}

/* last-played badge */
.csb-last-played {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: .65rem;
  font-weight: 800;
  letter-spacing: .4px;
  text-transform: uppercase;
  background: rgba(99,102,241,.18);
  color: #a5b4fc;
  border: 1px solid rgba(99,102,241,.3);
  flex-shrink: 0;
}

/* ── FALLBACK CARD ── */
.csb-fb {
  padding: 13px 17px;
  margin-bottom: 7px;
  border-radius: 14px;
  cursor: pointer;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.05);
  font-size: .83rem;
  color: rgba(255,255,255,.4);
  transition: background .2s, border-color .2s, transform .3s cubic-bezier(.34,1.3,.64,1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  animation: csb-card-in .3s cubic-bezier(.22,1,.36,1) both;
  animation-delay: calc(var(--i, 0) * 28ms);
}
.csb-fb:hover {
  background: rgba(255,255,255,.065);
  border-color: rgba(255,255,255,.12);
  transform: translateY(-1px);
}

/* ── SECTION DIVIDER ── */
.csb-sep {
  height: 1px;
  background: rgba(255,255,255,.05);
  border: none;
  margin: 14px 0;
}
`;
    document.head.appendChild(s);
  }

  // ── Parser ─────────────────────────────────────────────────────────────────
  // Now uses emoji anchors where present, with regex fallbacks for addons
  // that emit plain text or bracket-style annotations.

  function csbEsc(t) {
    const d = document.createElement('span');
    d.textContent = t;
    return d.innerHTML;
  }

  function fb(el) {
    return { source:'', name:'Unknown', res:'Unknown', fmt:[], seeds:-1, size:'', prov:'', el, ok:false };
  }

  function parse(el) {
    try {
      const aEl = el.querySelector('[class*="addon-name-"]');
      const dEl = el.querySelector('[class*="description-container-"]');
      const aT  = aEl ? aEl.textContent.trim() : '';
      const dT  = dEl ? dEl.textContent.trim() : '';
      const all = aT + '\n' + dT;
      if (all.replace(/\s/g, '').length < 3) return fb(el);

      // Source bracket tag e.g. [RD+], [PM], [Comet]
      const sm     = all.match(/\[([A-Za-z][A-Za-z0-9+\-]*)\]/);
      const source = sm ? sm[0] : '';

      // Strip quality tokens from the display name
      let name = aT.split('\n')[0];
      if (source) name = name.replace(source, '');
      name = name
        .replace(/\b(4k|2160p|1080p|720p|480p|576p)\b/gi, '')
        .replace(/\b(HDR10\+?|HDR|DV|Dolby[\s.]?Vision|SDR|ATMOS|REMUX|WEB[- ]?DL|Blu[- ]?Ray)\b/gi, '')
        .replace(/[|]/g, '').trim() || 'Unknown';

      // Resolution
      let res = 'Unknown';
      if      (/\b(4k|2160p)\b/i.test(all))                              res = '4K';
      else if (/\b1080p\b/i.test(all))                                    res = '1080p';
      else if (/\b720p\b/i.test(all))                                     res = '720p';
      else if (/\b(480p|576p|SD|DVDRip|BDRip|BRRip)\b/i.test(all))      res = 'SD';

      // Format tags
      const fmt = [];
      if (/\bDV\b|Dolby[\s.]?Vision/i.test(all)) fmt.push('DV');
      if (/\bHDR10\+/i.test(all))                fmt.push('HDR10+');
      else if (/\bHDR10\b/i.test(all))           fmt.push('HDR10');
      else if (/\bHDR\b/i.test(all))             fmt.push('HDR');
      if (/\bAtmos\b/i.test(all))                fmt.push('ATMOS');
      if (/\bREMUX\b/i.test(all))               fmt.push('REMUX');
      if (/\bWEB[- ]?DL\b/i.test(all))          fmt.push('WEB-DL');
      if (/\bBlu[- ]?Ray\b/i.test(all))         fmt.push('BluRay');

      // Seeds — emoji first, then word-adjacent number, then bare number near keyword
      let seeds = -1;
      const seedEmoji = dT.match(/👤\s*(\d[\d,]*)/);
      if (seedEmoji) {
        seeds = parseInt(seedEmoji[1].replace(/,/g, ''), 10);
      } else {
        const seedWord = dT.match(/(\d[\d,]*)\s*(?:seed(?:er)?s?|peers?)\b/i)
                      || all.match(/\bseeds?[\s:]+(\d[\d,]*)/i);
        if (seedWord) seeds = parseInt(seedWord[1].replace(/,/g, ''), 10);
      }

      // Size — emoji first, then raw pattern `\d GB / MB / TB`
      let size = '';
      const sizeEmoji = dT.match(/💾\s*([\d.]+\s*(?:KB|MB|GB|TB|KiB|MiB|GiB|TiB))/i);
      if (sizeEmoji) {
        size = sizeEmoji[1];
      } else {
        const sizeRaw = all.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|TB|GiB|MiB|TiB))/i);
        if (sizeRaw) size = sizeRaw[1].toUpperCase().replace('IB', 'iB');
      }

      // Provider — emoji first, then bracket tag as fallback
      let prov = '';
      const provEmoji = dT.match(/⚙️\s*(.+?)(?:\n|$)/);
      if (provEmoji) {
        prov = provEmoji[1].trim();
      } else if (source) {
        prov = source.replace(/[\[\]]/g, '');
      }

      return { source, name, res, fmt, seeds, size, prov, el, ok: true };
    } catch (_) { return fb(el); }
  }

  // ── Scorer ─────────────────────────────────────────────────────────────────

  function score(s) {
    let v = 0;
    if (s.seeds > 0)               v += Math.min(s.seeds, 3000) * 10;
    if (/\[.+\+\]/.test(s.source)) v += 5000; // debrid+ services rank higher
    if (s.fmt.includes('DV'))      v += 300;
    if (s.fmt.includes('HDR10+'))  v += 250;
    else if (s.fmt.includes('HDR10')) v += 200;
    else if (s.fmt.includes('HDR'))   v += 150;
    if (s.fmt.includes('ATMOS'))   v += 100;
    if (s.fmt.includes('REMUX'))   v += 200;
    return v;
  }

  // ── Signal bars (premium styled) ───────────────────────────────────────────

  function signalBars(seeds) {
    const lvl = seeds >= 500 ? 4 : seeds >= 200 ? 3 : seeds >= 50 ? 2 : seeds >= 1 ? 1 : 0;
    const pal = ['#f87171', '#fb923c', '#fde047', '#4ade80'];
    const col = lvl ? pal[lvl - 1] : '#3f3f46';
    let h = `<div class="csb-sig" style="color:${col}">`;
    for (let i = 0; i < 4; i++) h += `<div class="csb-bar${i < lvl ? ' on' : ''}"></div>`;
    return h + '</div>';
  }

  // ── Seed fill bar — de-pill-bar-track/fill lineage ─────────────────────────

  function seedFillBar(seeds) {
    const pct = (Math.min(seeds, 3000) / 3000 * 100).toFixed(1);
    const col = seeds >= 500 ? '#4ade80' : seeds >= 200 ? '#fde047' : seeds >= 50 ? '#fb923c' : '#f87171';
    return `
<div class="csb-seed-bar-wrap">
  <div class="csb-seed-bar-track">
    <div class="csb-seed-bar-fill" style="width:${pct}%;background:${col}"></div>
  </div>
</div>`;
  }

  // ── Source icon — 14×14 favicon from debrid service ────────────────────────

  function sourceIcon(source) {
    const key = source.replace(/[\[\]]/g, '');
    const url = SOURCE_ICONS[key];
    if (!url) return '';
    return `<img class="csb-src-icon" src="${url}" alt="${csbEsc(key)}" loading="lazy"
              onerror="this.style.display='none'">`;
  }

  // ── Card HTML ──────────────────────────────────────────────────────────────

  function cardHTML(s, idx, ci, isBest, isLastPlayed) {
    const tier = TIERS[s.res] || TIERS.Unknown;

    // resolution pill
    let badges = `
      <span class="csb-res-pill"
        style="background:${tier.bg};color:${tier.color};border:1px solid ${tier.border};--res-glow:${tier.glow}">
        ${tier.label}
      </span>`;

    // format chips
    for (const f of s.fmt) {
      const c = CHIP[f] || { bg: 'rgba(255,255,255,.06)', fg: '#a1a1aa', b: 'rgba(255,255,255,.1)' };
      badges += `<span class="csb-chip" style="background:${c.bg};color:${c.fg};border:1px solid ${c.b}">${csbEsc(f)}</span>`;
    }
    
    // size chip
    if (s.size) {
      badges += `<span class="csb-chip csb-size-chip" style="background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.3)">💾 ${csbEsc(s.size)}</span>`;
    }

    // right-side status badges
    const statusBadges = [];
    if (isBest)       statusBadges.push(`<span class="csb-crown">⚡ Best</span>`);
    if (isLastPlayed) statusBadges.push(`<span class="csb-last-played">▶ Last played</span>`);

    // seeder widget: signal bars + count + fill bar
    let seedHTML = '';
    if (s.seeds >= 0) {
      const sc = s.seeds >= 500 ? '#4ade80' : s.seeds >= 200 ? '#fde047' : s.seeds >= 50 ? '#fb923c' : '#f87171';
      seedHTML = `
        <div class="csb-seed-widget">
          <div class="csb-seed">
            ${signalBars(s.seeds)}
            <span class="csb-sn" style="color:${sc}">${s.seeds.toLocaleString()}</span>
          </div>
          ${seedFillBar(s.seeds)}
        </div>`;
    }

    const icon  = sourceIcon(s.source);
    const label = csbEsc([s.source, s.name].filter(Boolean).join(' '));

    const meta = [];
    // Only show prov if it's distinct from the source bracket tag
    if (s.prov && s.prov !== s.source.replace(/[\[\]]/g, '')) {
      meta.push(`<span>${csbEsc(s.prov)}</span>`);
    }
    const metaHTML = meta.join('<span class="csb-dot"> · </span>');

    return `
<div class="csb-c" data-csb="${idx}" style="--i:${ci}">
  <div class="csb-r1">
    <div class="csb-name-wrap">
      ${icon}
      <span class="csb-name">${label}</span>
    </div>
    <div class="csb-r1-right">
      ${seedHTML}
      ${statusBadges.join('')}
    </div>
  </div>
  <div class="csb-r2">${badges}</div>
  ${metaHTML ? `<div class="csb-r3">${metaHTML}</div>` : ''}
</div>`;
  }

  function fbHTML(s, idx, ci) {
    const txt = csbEsc(s.el.textContent.trim().replace(/\n+/g, '  ·  '));
    return `<div class="csb-fb" data-csb="${idx}" style="--i:${ci}">${txt}</div>`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render(streams, parent, original) {
    const cid       = getContentId();
    const lastFp    = cid ? lsGet(`csb-last:${cid}`) : null;
    const isCompact = lsGet('csb-compact') === 'true';

    // Group & sort
    const groups = {};
    streams.forEach((s, i) => {
      s._i = i;
      (groups[s.res] || (groups[s.res] = [])).push(s);
    });
    const tierKeys = Object.keys(groups).sort(
      (a, b) => (TIERS[a]?.order ?? 99) - (TIERS[b]?.order ?? 99)
    );
    for (const k of tierKeys) groups[k].sort((a, b) => score(b) - score(a));

    const best4K   = groups['4K']?.[0];
    const best1080 = groups['1080p']?.[0];
    const total    = streams.length;

    // ── HTML assembly ──
    let h = `<div id="${CONT_ID}"${isCompact ? ' class="compact"' : ''}>`;

    // Header
    h += `
<div class="csb-hdr">
  <span class="csb-title">
    Streams
    <span class="csb-stream-count">${total}</span>
  </span>
  <div class="csb-hdr-right">
    <div class="csb-bwrap">
      <button class="csb-bp" data-t="4K"
        ${best4K ? `data-csb="${best4K._i}"` : 'disabled'}>⚡ Best 4K</button>
      <button class="csb-bp" data-t="1080p"
        ${best1080 ? `data-csb="${best1080._i}"` : 'disabled'}>⚡ Best HD</button>
    </div>
    <button class="csb-compact-btn${isCompact ? ' active' : ''}"
      title="Toggle compact view" aria-label="Toggle compact view">▤</button>
  </div>
</div>`;

    // Filter bar
    h += `
<div class="csb-filter-wrap">
  <span class="csb-filter-icon">⌕</span>
  <input class="csb-filter" type="text" placeholder="Filter by name, codec, source…" autocomplete="off" spellcheck="false">
</div>
<div class="csb-filter-empty">No streams match your filter</div>`;

    // Tier groups
    let ci = 0;
    for (const k of tierKeys) {
      const g          = groups[k];
      const td         = TIERS[k] || TIERS.Unknown;
      const allFb      = g.every(s => !s.ok);
      const collapsed  = lsGet(`csb-collapse:${k}`) === 'true';

      h += `<div class="csb-g${collapsed ? ' shut' : ''}" data-tier="${k}">`;
      h += `
<div class="csb-gh">
  <span class="csb-tier-pill"
    style="background:${td.bg};color:${td.color};border:1px solid ${td.border};--tier-glow:${td.glow}">
    ${td.label}
  </span>
  <span class="csb-gc">${g.length} stream${g.length !== 1 ? 's' : ''}</span>
  <span class="csb-ga">▾</span>
</div>`;
      h += `<div class="csb-gb">`;

      if (allFb) {
        // Muted notice when the entire tier is unparseable
        h += `<div class="csb-no-parse">
          Stream info couldn't be parsed — ${g.length} source${g.length !== 1 ? 's' : ''} available
        </div>`;
      }

      for (const s of g) {
        const isLastPlayed = !!(lastFp && s.ok && streamFp(s) === lastFp);
        h += s.ok
          ? cardHTML(s, s._i, ci, s === g[0] /* best in tier */, isLastPlayed)
          : fbHTML(s, s._i, ci);
        ci++;
      }

      h += `</div></div>`;
      if (ci < total) h += `<hr class="csb-sep">`;
    }

    h += '</div>'; // #csb-root

    // Mount
    const wrap = document.createElement('div');
    wrap.innerHTML = h;
    const picker = wrap.firstElementChild;
    parent.insertBefore(picker, original);

    // Measure group bodies for smooth collapse transitions
    picker.querySelectorAll('.csb-g').forEach(g => {
      const body = g.querySelector('.csb-gb');
      if (!body) return;
      body.style.maxHeight = g.classList.contains('shut') ? '0px' : body.scrollHeight + 'px';
    });

    // ── Events ──────────────────────────────────────────────────────────────

    picker.addEventListener('click', e => {

      // 1. Best-pick button → scroll + flash + delayed stream fire
      const bestBtn = e.target.closest('.csb-bp[data-csb]:not(:disabled)');
      if (bestBtn) {
        e.preventDefault(); e.stopPropagation();
        const idx  = parseInt(bestBtn.getAttribute('data-csb'), 10);
        const card = picker.querySelector(`.csb-c[data-csb="${idx}"], .csb-fb[data-csb="${idx}"]`);

        if (card) {
          // Auto-expand collapsed tier group if needed
          const group = card.closest('.csb-g');
          if (group?.classList.contains('shut')) {
            group.classList.remove('shut');
            const body = group.querySelector('.csb-gb');
            if (body) body.style.maxHeight = body.scrollHeight + 'px';
            lsSet(`csb-collapse:${group.dataset.tier}`, 'false');
          }
          // Scroll card into view then pulse its border
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          card.classList.remove('csb-flash');
          void card.offsetWidth; // reflow to restart animation
          card.classList.add('csb-flash');
          setTimeout(() => card.classList.remove('csb-flash'), 1200);
        }

        // Fire stream after a brief visual pause so the scroll registers
        setTimeout(() => {
          const stream = streams[idx];
          if (stream?.el) {
            if (cid && stream.ok) lsSet(`csb-last:${cid}`, streamFp(stream));
            stream.el.click();
          }
        }, 200);
        return;
      }

      // 2. Compact toggle button
      if (e.target.closest('.csb-compact-btn')) {
        const root = document.getElementById(CONT_ID);
        const btn  = e.target.closest('.csb-compact-btn');
        const next = !root.classList.contains('compact');
        root.classList.toggle('compact', next);
        btn.classList.toggle('active', next);
        lsSet('csb-compact', next ? 'true' : 'false');
        return;
      }

      // 3. Stream card click
      const card = e.target.closest('.csb-c[data-csb], .csb-fb[data-csb]');
      if (!card) return;
      e.preventDefault(); e.stopPropagation();

      const idx    = parseInt(card.getAttribute('data-csb'), 10);
      const stream = streams[idx];

      // Loading pulse while Stremio responds
      card.classList.add('csb-loading');
      setTimeout(() => card.classList.remove('csb-loading'), 2200);

      // Persist last played
      if (cid && stream?.ok) lsSet(`csb-last:${cid}`, streamFp(stream));

      if (stream?.el) stream.el.click();
    });

    // Group header → collapse / expand (with localStorage persistence)
    picker.querySelectorAll('.csb-gh').forEach(gh => {
      gh.addEventListener('click', () => {
        const group = gh.parentElement;
        const body  = group.querySelector('.csb-gb');
        const tier  = group.dataset.tier;
        if (group.classList.contains('shut')) {
          group.classList.remove('shut');
          body.style.maxHeight = body.scrollHeight + 'px';
          lsSet(`csb-collapse:${tier}`, 'false');
        } else {
          body.style.maxHeight = body.scrollHeight + 'px'; // lock before animating
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              group.classList.add('shut');
              lsSet(`csb-collapse:${tier}`, 'true');
            });
          });
        }
      });
    });

    // Filter bar — debounced, zero network cost
    const filterInput = picker.querySelector('.csb-filter');
    const emptyMsg    = picker.querySelector('.csb-filter-empty');
    let   filterTimer = null;

    filterInput.addEventListener('input', () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => applyFilter(picker, streams, filterInput.value, emptyMsg), 120);
    });

    return picker;
  }

  // ── Filter ─────────────────────────────────────────────────────────────────

  function applyFilter(picker, streams, query, emptyMsg) {
    const q = query.trim().toLowerCase();
    let anyVisible = false;

    // Show/hide individual cards
    picker.querySelectorAll('.csb-c[data-csb], .csb-fb[data-csb]').forEach(card => {
      const idx      = parseInt(card.getAttribute('data-csb'), 10);
      const s        = streams[idx];
      const haystack = [
        s.source, s.name, s.res, s.prov, s.size,
        ...(s.fmt || []),
        card.textContent,
      ].join(' ').toLowerCase();
      const visible = !q || haystack.includes(q);
      card.style.display = visible ? '' : 'none';
      if (visible) anyVisible = true;
    });

    // Hide entire tier groups that have no visible cards; show those that do
    picker.querySelectorAll('.csb-g').forEach(group => {
      const hasVisible = Array.from(
        group.querySelectorAll('.csb-c[data-csb], .csb-fb[data-csb]')
      ).some(c => c.style.display !== 'none');
      group.style.display = hasVisible ? '' : 'none';
    });

    emptyMsg.style.display = (!anyVisible && q) ? 'block' : 'none';
  }

  // ── Skeleton loader ────────────────────────────────────────────────────────

  function showSkeleton(list, parent) {
    if (document.getElementById(SKEL_ID) || document.getElementById(CONT_ID)) return;
    list.classList.add(PANEL_CLS);
    const skel = document.createElement('div');
    skel.id = SKEL_ID;
    skel.innerHTML = `
      <div class="csb-skel-hdr"></div>
      <div class="csb-skel-card"></div>
      <div class="csb-skel-card"></div>
      <div class="csb-skel-card"></div>
      <div class="csb-skel-card"></div>
      <div class="csb-skel-card"></div>
    `;
    // Insert before the original stream container
    const box = parent.querySelector('[class*="streams-container-"]');
    parent.insertBefore(skel, box || parent.firstChild);
  }

  function removeSkeleton() {
    document.getElementById(SKEL_ID)?.remove();
  }

  // ── DOM hook ───────────────────────────────────────────────────────────────

  let active  = false;
  let lastN   = 0;
  let timer   = null;
  let obs     = null;


  function check() {
    const list = document.querySelector('[class*="streams-list-"]');
    if (!list) { if (active) teardown(); return; }

    const box = list.querySelector('[class*="streams-container-"]');
    if (!box) return;

    const links = Array.from(box.querySelectorAll('a'));
    if (!links.length || !links.some(l => l.textContent.trim().length > 5)) return;
    if (active && links.length === lastN) return;

    // Show skeleton during the debounce window so the panel never looks empty
    if (!active) showSkeleton(list, box.parentElement);

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => build(list, box), active ? 620 : 260);
  }

  function build(list, box) {
    const links = Array.from(box.querySelectorAll('a'));
    lastN = links.length;

    // Remove any stale UI
    document.getElementById(CONT_ID)?.remove();
    removeSkeleton();

    const streams = links.map(parse);

    // Hide original list
    box.classList.add(HIDE_CLS);

    // Hide FilterStreams dropdowns (other plugins)
    const parent = box.parentElement;
    parent.querySelectorAll('.filter-streams, .dropdown.observer-ignore').forEach(
      el => el.classList.add(HIDE_CLS)
    );

    // Apply glass panel to the outer list wrapper
    list.classList.add(PANEL_CLS);

    render(streams, parent, box);

    // Watch for Stremio loading more streams
    if (!obs) {
      obs = new MutationObserver(() => {
        const n = Array.from(box.querySelectorAll('a')).length;
        if (n !== lastN) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => build(list, box), 620);
        }
      });
      obs.observe(box, { childList: true, subtree: true });
    }

    active = true;
  }

  function teardown() {
    active = false;
    lastN  = 0;
    if (timer) { clearTimeout(timer); timer = null; }
    if (obs)   { obs.disconnect(); obs = null; }
    document.getElementById(CONT_ID)?.remove();
    removeSkeleton();
    document.querySelectorAll('.' + HIDE_CLS).forEach(el => el.classList.remove(HIDE_CLS));
    document.querySelectorAll('.' + PANEL_CLS).forEach(el => el.classList.remove(PANEL_CLS));
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  function injectStreamCSS() { _injectStreamCSSInternal(); }

  let _streamTimer = null;
  let _streamPrevUrl = '';

  function initStreamBrowser() {
    injectStreamCSS();
    if (_streamTimer) return;
    _streamTimer = setInterval(() => {
      const u = location.hash || location.href;
      if (u !== _streamPrevUrl) { teardown(); _streamPrevUrl = u; }
      check();
    }, 300);
  }

  function teardownStreamBrowser() {
    teardown();
    if (_streamTimer) { clearInterval(_streamTimer); _streamTimer = null; }
  }


  // ═══════════════════════════════════════════════════════════════════
  // ── MODULE: DATA ENRICHMENT ────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) return resolve(element);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    const target = document.body || document.documentElement;
    observer.observe(target, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout: ${selector}`));
    }, timeout);
  });
}

/**
 * @name Cinematic Title View Enhancer
 * @description A professional Stremio plugin that seamlessly transforms default title details into a premium, cinematic experience using the TMDB API. Includes dynamic backdrop effects, comprehensive cast carousels, and multi-source rating bars.
 * @version 1.0.0 (First Iteration)
 * @author elmarco
 *
 * @copyright 2026 elmarco. All rights reserved.
 */

// ── WATCHLIST & NOTES INTEGRATION ───────────────────────────────────────────
const WLNM_STYLE_ID  = 'wlnm-styles';
const WLNM_PANEL_ID  = 'wlnm-panel';
const WLNM_STORE_KEY = 'wlnm-data';

const WLNM_STATUS = {
  none:      { label: 'Not in Watchlist', icon: '＋', color: 'rgba(255,255,255,.35)',  bg: 'rgba(255,255,255,.04)',  border: 'rgba(255,255,255,.08)'  },
  plan:      { label: 'Plan to Watch',    icon: '🕐', color: '#60a5fa',               bg: 'rgba(96,165,250,.10)',   border: 'rgba(96,165,250,.22)'   },
  watching:  { label: 'Watching',         icon: '▶',  color: '#e5a00d',               bg: 'rgba(229,160,13,.10)',   border: 'rgba(229,160,13,.28)'   },
  completed: { label: 'Completed',        icon: '✓',  color: '#4ade80',               bg: 'rgba(74,222,128,.10)',   border: 'rgba(74,222,128,.22)'   },
  dropped:   { label: 'Dropped',          icon: '✕',  color: '#f87171',               bg: 'rgba(248,113,113,.10)', border: 'rgba(248,113,113,.22)'  },
  rewatch:   { label: 'Re-watching',      icon: '↺',  color: '#c084fc',               bg: 'rgba(192,132,252,.10)', border: 'rgba(192,132,252,.22)'  },
};

const WLNM_STATUS_ORDER = ['none', 'plan', 'watching', 'completed', 'dropped', 'rewatch'];











function wlnm_injectCSS() {
  if (document.getElementById(WLNM_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = WLNM_STYLE_ID;
  s.textContent = `
@keyframes wlnm-fade-up {
  from { opacity: 0; transform: translateY(18px) scale(.98); }
  to   { opacity: 1; transform: translateY(0)    scale(1);   }
}
@keyframes wlnm-shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}
@keyframes wlnm-pulse-glow {
  0%, 100% { box-shadow: 0 0 8px rgba(229,160,13,.15), 0 4px 16px rgba(0,0,0,.35); }
  50%       { box-shadow: 0 0 22px rgba(229,160,13,.38), 0 4px 16px rgba(0,0,0,.35); }
}
@keyframes wlnm-star-pop {
  0%   { transform: scale(1);    }
  40%  { transform: scale(1.45); }
  70%  { transform: scale(.88);  }
  100% { transform: scale(1);    }
}
@keyframes wlnm-badge-in {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0);    }
}
@keyframes wlnm-count-bump {
  0%   { transform: scale(1);    }
  50%  { transform: scale(1.35); }
  100% { transform: scale(1);    }
}

#${WLNM_PANEL_ID} {
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  margin-top: 0;
  padding: 28px 32px 32px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,.08);
  background: linear-gradient(135deg, rgba(22,22,30,.82) 0%, rgba(14,14,20,.65) 100%);
  backdrop-filter: blur(42px) saturate(1.8);
  -webkit-backdrop-filter: blur(42px) saturate(1.8);
  box-shadow: 0 22px 56px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.06);
  animation: wlnm-fade-up .48s cubic-bezier(.34,1.3,.64,1) both;
  display: flex;
  flex-direction: column;
  gap: 26px;
}
#${WLNM_PANEL_ID} * { box-sizing: border-box; }

.wlnm-title {
  font-size: 1.38rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -.35px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
}
.wlnm-title::before {
  content: '';
  display: block;
  width: 4px;
  height: 1.2em;
  background: linear-gradient(180deg, #e5a00d 0%, #ff6b35 100%);
  border-radius: 3px;
  flex-shrink: 0;
}
.wlnm-title-count {
  font-size: .75rem;
  font-weight: 700;
  background: rgba(229,160,13,.18);
  color: #e5a00d;
  border: 1px solid rgba(229,160,13,.35);
  padding: 2px 9px;
  border-radius: 20px;
  letter-spacing: .5px;
  margin-left: auto;
  transition: transform .25s cubic-bezier(.34,1.56,.64,1);
}
.wlnm-title-count.bump { animation: wlnm-count-bump .32s cubic-bezier(.34,1.56,.64,1); }

.wlnm-status-row { display: flex; flex-wrap: wrap; gap: 8px; }
.wlnm-status-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 16px; border-radius: 30px;
  border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.04); color: rgba(255,255,255,.55);
  font-size: .85rem; font-weight: 600; cursor: pointer;
  transition: background .25s ease, border-color .25s ease, color .25s ease, transform .35s cubic-bezier(.34,1.3,.64,1), box-shadow .25s ease;
  user-select: none;
}
.wlnm-status-btn .wlnm-sicon { font-style: normal; font-size: .95rem; line-height: 1; }
.wlnm-status-btn:hover {
  background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.2); color: rgba(255,255,255,.88);
  transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.28);
}
.wlnm-status-btn.active {
  transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.32);
  animation: wlnm-badge-in .3s cubic-bezier(.34,1.3,.64,1);
}

.wlnm-divider { height: 1px; background: rgba(255,255,255,.06); border: none; margin: 0; }

.wlnm-rating-row { display: flex; flex-direction: column; gap: 10px; }
.wlnm-rating-label { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .95px; color: rgba(255,255,255,.38); }
.wlnm-stars { display: flex; gap: 6px; align-items: center; }
.wlnm-star {
  font-size: 1.7rem; line-height: 1; cursor: pointer; color: rgba(255,255,255,.15);
  transition: color .18s ease, transform .28s cubic-bezier(.34,1.56,.64,1), filter .2s;
  user-select: none;
}
.wlnm-star:hover, .wlnm-star.preview { color: #e5a00d; transform: scale(1.22); filter: drop-shadow(0 0 8px rgba(229,160,13,.55)); }
.wlnm-star.filled  { color: #e5a00d; filter: drop-shadow(0 0 5px rgba(229,160,13,.35)); }
.wlnm-star.popped  { animation: wlnm-star-pop .32s cubic-bezier(.34,1.56,.64,1); }
.wlnm-rating-text { font-size: .9rem; font-weight: 600; color: rgba(255,255,255,.4); margin-left: 4px; transition: color .2s; }
.wlnm-rating-text.has-rating { color: #e5a00d; }

.wlnm-notes-row { display: flex; flex-direction: column; gap: 10px; }
.wlnm-notes-label { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .95px; color: rgba(255,255,255,.38); }
.wlnm-notes-textarea {
  width: 100%; min-height: 88px; resize: vertical;
  background: rgba(0,0,0,.38); border: 1px solid rgba(255,255,255,.09); border-radius: 14px;
  color: rgba(255,255,255,.85); font-family: 'DM Sans', -apple-system, sans-serif;
  font-size: .9rem; font-weight: 400; line-height: 1.65; padding: 14px 16px; outline: none;
  transition: border-color .3s, background .3s, box-shadow .3s;
}
.wlnm-notes-textarea::placeholder { color: rgba(255,255,255,.22); }
.wlnm-notes-textarea:focus { border-color: rgba(229,160,13,.55); background: rgba(0,0,0,.48); box-shadow: 0 0 0 3px rgba(229,160,13,.1); }
.wlnm-notes-footer { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.wlnm-char-count { font-size: .72rem; color: rgba(255,255,255,.22); letter-spacing: .3px; }
.wlnm-save-btn {
  display: flex; align-items: center; gap: 8px; padding: 9px 22px; border-radius: 30px;
  background: #e5a00d; color: #000; border: none; font-family: 'DM Sans', -apple-system, sans-serif;
  font-size: .87rem; font-weight: 700; cursor: pointer; letter-spacing: .25px;
  transition: background .25s, transform .35s cubic-bezier(.34,1.3,.64,1), box-shadow .25s;
  animation: wlnm-pulse-glow 3.2s infinite ease-in-out;
}
.wlnm-save-btn:hover { background: #ffb82b; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(229,160,13,.42); }
.wlnm-save-btn:active { transform: translateY(0); }
.wlnm-save-btn.saved  { background: #4ade80; color: #fff; animation: none; box-shadow: 0 6px 20px rgba(74,222,128,.35); }

.wlnm-meta-footer { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.wlnm-meta-pill {
  display: flex; align-items: center; gap: 6px; font-size: .75rem; font-weight: 500;
  color: rgba(255,255,255,.35); background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
  border-radius: 20px; padding: 5px 13px; animation: wlnm-badge-in .35s cubic-bezier(.34,1.3,.64,1) both;
}
.wlnm-meta-pill span { color: rgba(255,255,255,.6); font-weight: 600; }

.wlnm-will-enter { opacity: 0; transform: translateY(18px); transition: opacity .55s cubic-bezier(.22,1,.36,1), transform .55s cubic-bezier(.22,1,.36,1); }
.wlnm-will-enter.wlnm-entered { opacity: 1; transform: translateY(0); }
`;
  document.head.appendChild(s);
}

const WLNM_RATING_LABELS = ['', 'Awful', 'Bad', 'Decent', 'Good', 'Excellent'];

function wlnm_fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function wlnm_extractTitle() {
  const sel = [
    '[class*="meta-info-name"]',
    '[class*="title-container"] h1',
    '[class*="meta-details"] h1',
    'h1',
  ];
  for (const s of sel) {
    const el = document.querySelector(s);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  return '';
}

function wlnm_buildPanel(imdbId) {
  const entry = wlnm_getEntry(imdbId);
  const root = document.createElement('div');
  root.id = WLNM_PANEL_ID;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:14px;';
  const titleEl = document.createElement('h3');
  titleEl.className = 'wlnm-title';
  titleEl.textContent = 'My Watchlist';
  const countBadge = document.createElement('span');
  countBadge.className = 'wlnm-title-count';
  countBadge.textContent = wlnm_countWatchlist() + ' saved';
  titleEl.appendChild(countBadge);
  header.appendChild(titleEl);
  root.appendChild(header);

  const statusRow = document.createElement('div');
  statusRow.className = 'wlnm-status-row';
  WLNM_STATUS_ORDER.forEach(key => {
    const def = WLNM_STATUS[key];
    const btn = document.createElement('button');
    btn.className = 'wlnm-status-btn' + (entry.status === key ? ' active' : '');
    if (entry.status === key) {
      btn.style.cssText = `background:${def.bg};border-color:${def.border};color:${def.color}`;
    }
    btn.innerHTML = `<em class="wlnm-sicon">${def.icon}</em>${def.label}`;
    btn.dataset.key = key;

    btn.addEventListener('click', () => {
      statusRow.querySelectorAll('.wlnm-status-btn').forEach(b => {
        b.classList.remove('active');
        b.style.cssText = '';
      });
      const newKey = btn.dataset.key;
      if (newKey !== 'none') {
        btn.classList.add('active');
        const d = WLNM_STATUS[newKey];
        btn.style.cssText = `background:${d.bg};border-color:${d.border};color:${d.color}`;
      }
      wlnm_setEntry(imdbId, { status: newKey, ...(wlnm_extractTitle() ? { title: wlnm_extractTitle() } : {}) });
      countBadge.textContent = wlnm_countWatchlist() + ' saved';
      countBadge.classList.remove('bump');
      void countBadge.offsetWidth;
      countBadge.classList.add('bump');
      refreshMetaFooter();
    });
    statusRow.appendChild(btn);
  });
  root.appendChild(statusRow);

  const div1 = document.createElement('hr');
  div1.className = 'wlnm-divider';
  root.appendChild(div1);

  const ratingRow = document.createElement('div');
  ratingRow.className = 'wlnm-rating-row';
  const ratingLabel = document.createElement('div');
  ratingLabel.className = 'wlnm-rating-label';
  ratingLabel.textContent = 'Personal Rating';
  ratingRow.appendChild(ratingLabel);

  const starsWrap = document.createElement('div');
  starsWrap.className = 'wlnm-stars';
  const ratingText = document.createElement('span');
  ratingText.className = 'wlnm-rating-text' + (entry.rating ? ' has-rating' : '');
  ratingText.textContent = entry.rating ? WLNM_RATING_LABELS[entry.rating] : 'Not rated';

  let currentRating = entry.rating;
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.className = 'wlnm-star' + (i <= currentRating ? ' filled' : '');
    star.textContent = '★';
    star.dataset.val = i;

    star.addEventListener('mouseenter', () => {
      stars.forEach((s, idx) => {
        s.classList.toggle('preview', idx < i);
        s.classList.toggle('filled', idx < i && idx < currentRating);
      });
      ratingText.textContent = WLNM_RATING_LABELS[i];
      ratingText.classList.add('has-rating');
    });

    star.addEventListener('mouseleave', () => {
      stars.forEach((s, idx) => {
        s.classList.remove('preview');
        s.classList.toggle('filled', idx < currentRating);
      });
      ratingText.textContent = currentRating ? WLNM_RATING_LABELS[currentRating] : 'Not rated';
      if (!currentRating) ratingText.classList.remove('has-rating');
    });

    star.addEventListener('click', () => {
      const clicked = parseInt(star.dataset.val, 10);
      currentRating = currentRating === clicked ? 0 : clicked;
      stars.forEach((s, idx) => {
        s.classList.toggle('filled', idx < currentRating);
        s.classList.remove('popped');
      });
      if (currentRating) {
        const target = stars[currentRating - 1];
        void target.offsetWidth;
        target.classList.add('popped');
      }
      ratingText.textContent = currentRating ? WLNM_RATING_LABELS[currentRating] : 'Not rated';
      ratingText.classList.toggle('has-rating', !!currentRating);
      wlnm_setEntry(imdbId, { rating: currentRating });
    });
    stars.push(star);
    starsWrap.appendChild(star);
  }
  starsWrap.appendChild(ratingText);
  ratingRow.appendChild(starsWrap);
  root.appendChild(ratingRow);

  const div2 = document.createElement('hr');
  div2.className = 'wlnm-divider';
  root.appendChild(div2);

  const notesRow = document.createElement('div');
  notesRow.className = 'wlnm-notes-row';
  const notesLabel = document.createElement('div');
  notesLabel.className = 'wlnm-notes-label';
  notesLabel.textContent = 'Personal Notes';
  notesRow.appendChild(notesLabel);

  const textarea = document.createElement('textarea');
  textarea.className = 'wlnm-notes-textarea';
  textarea.placeholder = 'Jot down your thoughts, spoilers, or anything you want to remember…';
  textarea.maxLength = 500;
  textarea.value = entry.notes || '';
  notesRow.appendChild(textarea);

  const notesFooter = document.createElement('div');
  notesFooter.className = 'wlnm-notes-footer';
  const charCount = document.createElement('span');
  charCount.className = 'wlnm-char-count';
  charCount.textContent = `${textarea.value.length} / 500`;
  textarea.addEventListener('input', () => {
    charCount.textContent = `${textarea.value.length} / 500`;
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'wlnm-save-btn';
  saveBtn.innerHTML = '💾 Save Notes';
  saveBtn.addEventListener('click', () => {
    wlnm_setEntry(imdbId, { notes: textarea.value.trim() });
    saveBtn.textContent = '✓ Saved!';
    saveBtn.classList.add('saved');
    setTimeout(() => {
      saveBtn.innerHTML = '💾 Save Notes';
      saveBtn.classList.remove('saved');
    }, 2000);
  });

  notesFooter.appendChild(charCount);
  notesFooter.appendChild(saveBtn);
  notesRow.appendChild(notesFooter);
  root.appendChild(notesRow);

  const metaFooter = document.createElement('div');
  metaFooter.className = 'wlnm-meta-footer';
  function refreshMetaFooter() {
    metaFooter.innerHTML = '';
    const e = wlnm_getEntry(imdbId);
    if (e.addedAt) {
      const pill = document.createElement('div');
      pill.className = 'wlnm-meta-pill';
      pill.innerHTML = `📅 Added <span>${wlnm_fmt(e.addedAt)}</span>`;
      metaFooter.appendChild(pill);
    }
    if (e.status && e.status !== 'none') {
      const st = WLNM_STATUS[e.status];
      const pill2 = document.createElement('div');
      pill2.className = 'wlnm-meta-pill';
      pill2.style.cssText = `color:${st.color};border-color:${st.border};background:${st.bg}`;
      pill2.innerHTML = `${st.icon} <span>${st.label}</span>`;
      metaFooter.appendChild(pill2);
    }
  }
  refreshMetaFooter();
  root.appendChild(metaFooter);

  return root;
}

function wlnm_setupEntrances(root) {
  const sections = root.querySelectorAll('.wlnm-status-row, .wlnm-rating-row, .wlnm-notes-row, .wlnm-meta-footer');
  sections.forEach(el => el.classList.add('wlnm-will-enter'));
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('wlnm-entered');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  sections.forEach(el => io.observe(el));
}

/**
 * Main application class for the Cinematic Title View Enhancer plugin.
 * Responsible for orchestrating metadata fetching, caching, and DOM-based UI injection
 * to create a seamless, cinematic experience within the Stremio client.
 *
 * @class DataEnrichment
 */
class DataEnrichment {
  constructor() {
    this.config = this.loadConfig();
    this.cache = new Map(); // { imdbId → { data, ts } } TTL-aware
    this.observer = null;
    this.currentImdbId = null;
    this.lastEnrichmentTime = 0;
    this.isEnriching = false;
    this.checkDebounceTimer = null;
    this.backdropElement = null;
    this.backdropObserver = null;
    this.init();
  }

  loadConfig() {
    const saved = localStorage.getItem("dataEnrichmentConfig");
    const defaults = {
      tmdbApiKey: "",
      omdbApiKey: "",
      watchProviderRegion: "US",
      enhancedCast: true,
      description: true,
      maturityRating: true,
      similarTitles: true,
      showCollection: true,
      showRatingsOnPosters: true,
      showTrailers: true,
      showReviews: true,
      showWatchProviders: true,
      showKeywords: true,
      showPhotoGallery: true,
      showAwards: true,
      showBoxOffice: true,
      showSeasonExplorer: true,
      showRecommendations: true,
    };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  }

  saveConfig() {
    localStorage.setItem("dataEnrichmentConfig", JSON.stringify(this.config));
  }

  init() {
    console.log("[CinematicTitleViewEnhancer] Plugin loaded v1.0.0");
    this.setupObserver();
    this.setupHashChangeListener();
    this.injectSettingsButton();
    waitForElement(".meta-details-container")
      .then(() => this.checkForDetailPage())
      .catch(() => setTimeout(() => this.checkForDetailPage(), 1000));
  }

  setupHashChangeListener() {
    this.lastHash = window.location.hash;
    const handleHashChange = () => {
      const newHash = window.location.hash;
      const oldImdbMatch = this.lastHash.match(/tt\d+/);
      const newImdbMatch = newHash.match(/tt\d+/);
      if (!newImdbMatch) {
        this.cleanup(true);
      } else if (
        oldImdbMatch &&
        newImdbMatch &&
        oldImdbMatch[0] !== newImdbMatch[0]
      ) {
        this.cleanup(true);
        waitForElement(".meta-details-container", 6000)
          .then(() => this.checkForDetailPage())
          .catch(() => this.checkForDetailPage());
      }
      this.lastHash = newHash;
    };
    window.addEventListener("hashchange", handleHashChange);
  }

  setupObserver() {
    this.observer = new MutationObserver(() => {
      if (this.isEnriching) return;
      if (this.checkDebounceTimer) clearTimeout(this.checkDebounceTimer);
      this.checkDebounceTimer = setTimeout(() => {
        this.checkForDetailPage();
        this.checkForPosters();
      }, 300);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      this.checkForDetailPage();
      this.checkForPosters();
    }, 1000);
  }

  checkForDetailPage() {
    if (this.isEnriching) return;
    if (!window.location.hash.match(/tt\d+/)) return;
    const metaInfoContainer =
      document.querySelector(".meta-details-container") ||
      document.querySelector('[class*="meta-info-container"]');
    if (!metaInfoContainer) return;
    const imdbId = this.extractImdbId();
    if (!imdbId) {
      this.cleanup();
      return;
    }
    if (imdbId === this.currentImdbId) return;
    console.log("[CinematicTitleViewEnhancer] Found IMDB ID:", imdbId);
    this.currentImdbId = imdbId;
    this.enrichDetailPage(imdbId, metaInfoContainer);
  }

  cleanup(force = false) {
    if (!force) return;
    document.querySelector(".data-enrichment-container")?.remove();
    document.querySelector(".de-ratings-bar")?.remove();
    document.getElementById("de-cinematic-overlay")?.remove();
    document.getElementById("de-home-btn")?.remove();

    // Cancel any pending backdrop-image wait so it doesn't fire after navigation
    if (this.backdropObserver) {
      this.backdropObserver.disconnect();
      this.backdropObserver = null;
    }

    // Reset the exact element we mutated — never re-query the selector here,
    // because after several navigations Stremio may have a different element
    // matching that selector, leaving the blurred/darkened one accumulating.
    if (this.backdropElement) {
      this.backdropElement.style.filter = "";
      this.backdropElement.style.transform = "";
      this.backdropElement = null;
    }

    this.isEnriching = false;
    this.currentImdbId = null;
    console.log("[CinematicTitleViewEnhancer] Cleaned up");
  }

  extractImdbId() {
    const url = window.location.hash || window.location.href;
    const match = url.match(/tt\d+/);
    if (match) return match[0];
    const imdbLink = document.querySelector('a[href*="imdb.com/title/tt"]');
    if (imdbLink) {
      const m = imdbLink.href.match(/tt\d+/);
      if (m) return m[0];
    }
    const metaEls = document.querySelectorAll("[data-imdbid], [data-imdb-id]");
    for (const el of metaEls) {
      const id = el.dataset.imdbid || el.dataset.imdbId;
      if (id && id.match(/tt\d+/)) return id;
    }
    const allLinks = document.querySelectorAll('a[href*="imdb"]');
    for (const link of allLinks) {
      const m = link.href.match(/tt\d+/);
      if (m) return m[0];
    }
    return null;
  }

  // ─────────────────────────────────────────────
  //  MAIN ORCHESTRATOR
  // ─────────────────────────────────────────────
  async enrichDetailPage(imdbId, container) {
    if (!this.config.tmdbApiKey) return;
    this.isEnriching = true;

    try {
      this.injectPlexStyles();
      document.querySelector(".data-enrichment-container")?.remove();
      document.querySelector(".de-ratings-bar")?.remove();
      document.getElementById("de-cinematic-overlay")?.remove();

      const skelContainer = this.createEnrichmentContainer();
      if (skelContainer) {
        skelContainer.dataset.imdbId = imdbId;
        this.injectSkeletonLoaders(skelContainer);
      }

      const [data, omdbData] = await Promise.all([
        this.fetchTMDBData(imdbId),
        this.config.omdbApiKey && this.config.showAwards
          ? this.fetchOMDbData(imdbId)
          : Promise.resolve(null),
      ]);

      document.querySelector(".data-enrichment-container")?.remove();
      if (!data) {
        this.isEnriching = false;
        return;
      }

      const currentUrl = window.location.hash.match(/tt\d+/);
      if (!currentUrl || currentUrl[0] !== imdbId) {
        this.isEnriching = false;
        return;
      }

      this.currentImdbId = imdbId;
      const enrichmentContainer = this.createEnrichmentContainer();
      if (!enrichmentContainer) {
        this.isEnriching = false;
        return;
      }
      enrichmentContainer.dataset.imdbId = imdbId;

      this.injectCinematicBackdrop();
      this.injectHomeButton();

      // 1. & 2. TOP ROW (Hero + Ratings | Watchlist)
      const topRow = document.createElement("div");
      topRow.className = "de-top-row";
      
      const leftCol = document.createElement("div");
      leftCol.className = "de-top-left-col";

      const rightCol = document.createElement("div");
      rightCol.className = "de-top-right-col";

      // 1. HERO — tagline, overview, status badge, next episode
      if (
        data.overview ||
        data.tagline ||
        (data.media_type === "tv" && data.status)
      ) {
        this.injectHeroSection(data, leftCol);
      }

      // 2. RATINGS BAR
      this.injectRatingsBar(data, leftCol);

      // CREW STRIP + STUDIO LOGOS
      if (data.credits && data.credits.crew && data.credits.crew.length) {
        this.injectCrewStrip(
          data.credits.crew,
          data.production_companies,
          leftCol,
        );
      }

      // WATCHLIST
      try {
        wlnm_injectCSS();
        const watchlistPanel = wlnm_buildPanel(imdbId);
        if (watchlistPanel) {
          watchlistPanel.dataset.imdb = imdbId;
          rightCol.appendChild(watchlistPanel);
          wlnm_setupEntrances(watchlistPanel);
        }
      } catch (err) {
        console.error("[WatchlistNotes] Error building panel:", err);
      }

      topRow.appendChild(leftCol);
      topRow.appendChild(rightCol);
      enrichmentContainer.appendChild(topRow);

      // 3. WHERE TO WATCH + THEMES — side by side in a two-column row
      {
        const hasProviders = this.config.showWatchProviders;
        const hasKeywords = this.config.showKeywords && data.keywords;
        if (hasProviders || hasKeywords) {
          const metaRow = document.createElement("div");
          metaRow.className = "de-meta-row";
          if (hasProviders) this.injectWatchProviders(data, metaRow);
          if (hasKeywords) this.injectKeywords(data, metaRow);
          if (metaRow.children.length) enrichmentContainer.appendChild(metaRow);
        }
      }

      // (Crew strip moved under Ratings Bar)
      // 5. CAST
      if (this.config.enhancedCast && data.credits) {
        this.injectEnhancedCast(data.credits, enrichmentContainer, data.id);
      }

      // 6. PHOTO GALLERY
      if (this.config.showPhotoGallery && data.images) {
        this.injectPhotoGallery(data, enrichmentContainer);
      }

      // 7. TRAILERS
      if (this.config.showTrailers && data.videos) {
        this.injectTrailers(data.videos, enrichmentContainer);
      }

      // 8. SEASON EXPLORER (TV only)
      if (
        this.config.showSeasonExplorer &&
        data.media_type === "tv" &&
        data.seasons &&
        data.seasons.length
      ) {
        this.injectSeasonExplorer(data, enrichmentContainer);
      }

      // 9. REVIEWS
      if (this.config.showReviews && data.reviews) {
        this.injectReviews(data.reviews, enrichmentContainer);
      }

      // 10. BECAUSE YOU'RE WATCHING (TMDB curated recommendations)
      if (this.config.showRecommendations && data.recommendations) {
        this.injectRecommendations(data, enrichmentContainer);
      }

      // 11. MORE BY DIRECTOR (person filmography)
      if (
        this.config.showRecommendations &&
        data.credits &&
        data.credits.crew
      ) {
        await this.injectMoreByDirector(data, enrichmentContainer);
      }

      // 12. MORE WITH LEAD ACTOR (person filmography)
      if (
        this.config.showRecommendations &&
        data.credits &&
        data.credits.cast
      ) {
        await this.injectMoreWithActor(data, enrichmentContainer);
      }

      // 13. AWARDS BANNER
      if (
        this.config.showAwards &&
        omdbData &&
        omdbData.Awards &&
        omdbData.Awards !== "N/A"
      ) {
        this.injectAwards(omdbData.Awards, enrichmentContainer);
      }

      // 14. COLLECTION
      if (this.config.showCollection && data.belongs_to_collection) {
        await this.injectCollection(
          data.belongs_to_collection,
          enrichmentContainer,
        );
      }

      this.setupScrollEntrances(enrichmentContainer);
      this.lastEnrichmentTime = Date.now();
      console.log("[CinematicTitleViewEnhancer] Enrichment complete v1.0");
    } catch (err) {
      console.error("[CinematicTitleViewEnhancer] Error:", err);
    } finally {
      this.isEnriching = false;
    }
  }

  createEnrichmentContainer() {
    document.querySelector(".data-enrichment-container")?.remove();
    const targets = [
      document.querySelector(".meta-details-container"),
      document.querySelector('[class*="meta-info-container"]'),
      (() => {
        const d = document.querySelector('[class*="description-container"]');
        return d && d.parentElement;
      })(),
      document.querySelector('[class*="menu-container"]'),
    ];
    for (const target of targets) {
      if (target) {
        const el = document.createElement("div");
        el.className = "data-enrichment-container";
        target.appendChild(el);
        return el;
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────
  //  FEATURE 1 — CINEMATIC BACKDROP
  // ─────────────────────────────────────────────
  injectCinematicBackdrop() {
    document.getElementById("de-cinematic-overlay")?.remove();

    // Disconnect any previous wait-observer so it doesn't fire on a stale element
    if (this.backdropObserver) {
      this.backdropObserver.disconnect();
      this.backdropObserver = null;
    }

    const backdrop = document.querySelector(
      '[class*="meta-preview-background"], [class*="background-image"], ' +
        '[class*="background-container"], [class*="meta-background"], ' +
        '[class*="background-preview"], [class*="backdrop"]',
    );
    if (!backdrop) return;

    // On hard-refresh Stremio mounts the backdrop element before setting its
    // background-image. Applying blur immediately would darken a blank element.
    // Wait until the element actually carries an image, then apply styles.
    const hasBg = () => {
      const v =
        backdrop.style.backgroundImage ||
        getComputedStyle(backdrop).backgroundImage;
      return v && v !== "none" && v !== "";
    };

    if (hasBg()) {
      this._applyBackdropStyles(backdrop);
    } else {
      this._waitForBackdropImage(backdrop);
    }
  }

  _waitForBackdropImage(backdrop) {
    // MutationObserver on style attribute catches Stremio setting background-image
    let resolved = false;
    const resolve = () => {
      if (resolved) return;
      resolved = true;
      if (this.backdropObserver) {
        this.backdropObserver.disconnect();
        this.backdropObserver = null;
      }
      // Guard: make sure the user hasn't navigated away
      const currentMatch = window.location.hash.match(/tt\d+/);
      if (!currentMatch || currentMatch[0] !== this.currentImdbId) return;
      this._applyBackdropStyles(backdrop);
    };

    this.backdropObserver = new MutationObserver(() => {
      const v =
        backdrop.style.backgroundImage ||
        getComputedStyle(backdrop).backgroundImage;
      if (v && v !== "none" && v !== "") resolve();
    });
    this.backdropObserver.observe(backdrop, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    // Also observe parent subtree in case the element is replaced wholesale
    if (backdrop.parentElement) {
      this.backdropObserver.observe(backdrop.parentElement, {
        childList: true,
        subtree: false,
      });
    }

    // Polling fallback — catches cases where the attribute change fires before
    // the observer is attached, or when a CSS class sets the background
    let ticks = 0;
    const poll = setInterval(() => {
      ticks++;
      const v =
        backdrop.style.backgroundImage ||
        getComputedStyle(backdrop).backgroundImage;
      if ((v && v !== "none" && v !== "") || ticks > 40) {
        // 40 × 150 ms = 6 s max
        clearInterval(poll);
        if (v && v !== "none" && v !== "") resolve();
      }
    }, 150);

    // Safety: always clean up the interval after 8 s regardless
    setTimeout(() => clearInterval(poll), 8000);
  }

  _applyBackdropStyles(backdrop) {
    // Safety: if we already applied styles to a different element, reset it first
    if (this.backdropElement && this.backdropElement !== backdrop) {
      this.backdropElement.style.filter = "";
      this.backdropElement.style.transform = "";
    }

    const parent = backdrop.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === "static")
      parent.style.position = "relative";

    // Pin the exact element we're mutating so cleanup() never re-queries
    this.backdropElement = backdrop;

    backdrop.style.filter = "blur(52px) saturate(0.62) brightness(0.55)";
    backdrop.style.transform = "scale(1.1)";
    backdrop.style.transition = "filter 0.9s ease, transform 0.9s ease";

    // Remove stale overlay in case this fires after a retry
    document.getElementById("de-cinematic-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "de-cinematic-overlay";
    overlay.style.cssText = `
            position:absolute; inset:0; pointer-events:none; z-index:2;
            background:
                linear-gradient(to bottom,
                    transparent 0%,
                    transparent 18%,
                    rgba(18,18,24,0.48) 46%,
                    rgba(18,18,24,0.84) 68%,
                    rgba(18,18,24,0.97) 84%,
                    rgb(18,18,24) 100%
                ),
                linear-gradient(to right,
                    rgba(18,18,24,0.70) 0%,
                    transparent 26%,
                    transparent 74%,
                    rgba(18,18,24,0.70) 100%
                );
        `;
    parent.appendChild(overlay);
  }

  // ─────────────────────────────────────────────
  //  HOME BUTTON — detail pages only
  // ─────────────────────────────────────────────
  injectHomeButton() {
    // Idempotent — only one button per page
    if (document.getElementById("de-home-btn")) return;

    const btn = document.createElement("button");
    btn.id = "de-home-btn";
    btn.setAttribute("aria-label", "Go to Homepage");
    btn.innerHTML = `
            <span class="de-home-glass-shine"></span>
            <span class="de-home-glass-shimmer"></span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round" class="de-home-icon">
                <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/>
                <polyline points="9 21 9 12 15 12 15 21"/>
            </svg>
            <span class="de-home-label">Go to Homepage</span>
            <span class="de-home-ripple"></span>
        `;
    btn.addEventListener("click", () => {
      const goHome = () => {
        if (
          window.location.hash === "#/" ||
          window.location.hash === "" ||
          window.location.hash === "#"
        )
          return;
        history.back();
        setTimeout(goHome, 80);
      };
      goHome();
    });
    document.body.appendChild(btn);
  }

  // ─────────────────────────────────────────────
  //  FEATURE 2 — MULTI-SOURCE RATINGS BAR
  // ─────────────────────────────────────────────
  injectRatingsBar(data, container) {
    document.querySelector(".de-ratings-bar")?.remove();

    const bar = document.createElement("div");
    bar.className = "de-ratings-bar";

    const pills = [];

    if (data.vote_average) {
      const score = data.vote_average.toFixed(1);
      const pct = Math.round((data.vote_average / 10) * 100);
      const votes =
        data.vote_count > 1000
          ? (data.vote_count / 1000).toFixed(1) + "k"
          : String(data.vote_count || "");
      pills.push(`
                <div class="de-rating-pill de-pill-tmdb">
                    <div class="de-pill-top">
                        <svg width="16" height="16" viewBox="0 0 185 133" xmlns="http://www.w3.org/2000/svg" style="border-radius:3px;flex-shrink:0">
                            <rect width="185" height="133" fill="#01b4e4"/>
                            <text x="92" y="100" font-family="Arial Black,sans-serif" font-size="84" fill="white" text-anchor="middle">T</text>
                        </svg>
                        <span class="de-pill-source">TMDB</span>
                    </div>
                    <div class="de-pill-score">${score}</div>
                    <div class="de-pill-bar-track"><div class="de-pill-bar-fill" style="width:${pct}%;background:#01b4e4"></div></div>
                    <div class="de-pill-sub">${votes} votes</div>
                </div>`);

      const fresh = pct >= 60;
      pills.push(`
                <div class="de-rating-pill ${fresh ? "de-pill-fresh" : "de-pill-rotten"}">
                    <div class="de-pill-top">
                        <span style="font-size:14px;line-height:1">${fresh ? "🍅" : "💧"}</span>
                        <span class="de-pill-source">Audience</span>
                    </div>
                    <div class="de-pill-score">${pct}%</div>
                    <div class="de-pill-bar-track"><div class="de-pill-bar-fill" style="width:${pct}%;background:${fresh ? "#34c759" : "#ff453a"}"></div></div>
                    <div class="de-pill-sub">${fresh ? "Fresh" : "Rotten"}</div>
                </div>`);
    }

    if (data.popularity) {
      const pop = Math.min(100, Math.round(data.popularity));
      pills.push(`
                <div class="de-rating-pill de-pill-pop">
                    <div class="de-pill-top">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e5a00d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                        </svg>
                        <span class="de-pill-source">Trending</span>
                    </div>
                    <div class="de-pill-score">${pop}</div>
                    <div class="de-pill-bar-track"><div class="de-pill-bar-fill" style="width:${pop}%;background:#e5a00d"></div></div>
                    <div class="de-pill-sub">popularity</div>
                </div>`);
    }

    const runtime =
      data.runtime || (data.episode_run_time && data.episode_run_time[0]);
    if (runtime) {
      const h = Math.floor(runtime / 60);
      const m = runtime % 60;
      const year = (data.release_date || data.first_air_date || "").slice(0, 4);
      pills.push(`
                <div class="de-rating-pill de-pill-meta">
                    <div class="de-pill-top">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span class="de-pill-source">Runtime</span>
                    </div>
                    <div class="de-pill-score" style="font-size:1.05rem">${h > 0 ? h + "h " : ""}${m}m</div>
                    <div class="de-pill-sub">${year}</div>
                </div>`);
    }

    // Maturity rating
    const maturity = this.getMaturityRating(data);
    if (maturity) {
      pills.push(`
                <div class="de-rating-pill de-pill-rating">
                    <div class="de-pill-top">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="2.2" stroke-linecap="round" style="flex-shrink:0">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                        <span class="de-pill-source">Rating</span>
                    </div>
                    <div class="de-pill-score" style="font-size:1.1rem">${maturity}</div>
                    <div class="de-pill-sub">maturity</div>
                </div>`);
    }

    // Box office (movies only)
    if (this.config.showBoxOffice && data.media_type === "movie") {
      if (data.budget && data.budget > 0) {
        const b = this.formatMoney(data.budget);
        pills.push(`
                    <div class="de-rating-pill de-pill-budget">
                        <div class="de-pill-top">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f5c842" stroke-width="2.2" stroke-linecap="round" style="flex-shrink:0">
                                <circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a1.5 1.5 0 010 3H10a1.5 1.5 0 000 3H15"/>
                            </svg>
                            <span class="de-pill-source">Budget</span>
                        </div>
                        <div class="de-pill-score" style="font-size:1.1rem">${b}</div>
                        <div class="de-pill-sub">production</div>
                    </div>`);
      }
      if (data.revenue && data.revenue > 0) {
        const r = this.formatMoney(data.revenue);
        const ratio =
          data.budget > 0
            ? Math.min(100, Math.round((data.revenue / data.budget) * 100))
            : 50;
        const profitColor =
          !data.budget || data.revenue >= data.budget ? "#34c759" : "#ff453a";
        pills.push(`
                    <div class="de-rating-pill de-pill-revenue">
                        <div class="de-pill-top">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2.2" stroke-linecap="round" style="flex-shrink:0">
                                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                            </svg>
                            <span class="de-pill-source">Gross</span>
                        </div>
                        <div class="de-pill-score" style="font-size:1.1rem">${r}</div>
                        <div class="de-pill-bar-track"><div class="de-pill-bar-fill" style="width:${ratio}%;background:${profitColor}"></div></div>
                        <div class="de-pill-sub">worldwide</div>
                    </div>`);
      }
    }

    bar.innerHTML = pills.join("");
    container.appendChild(bar);
  }

  getMaturityRating(data) {
    if (data.media_type === "movie") {
      const releases = (data.release_dates && data.release_dates.results) || [];
      const us = releases.find((r) => r.iso_3166_1 === "US");
      if (us && us.release_dates) {
        return (
          us.release_dates.map((d) => d.certification).filter(Boolean)[0] ||
          null
        );
      }
    } else {
      const ratings =
        (data.content_ratings && data.content_ratings.results) || [];
      const us = ratings.find((r) => r.iso_3166_1 === "US");
      if (us && us.rating) return us.rating;
    }
    return null;
  }

  formatMoney(n) {
    if (!n || n === 0) return null;
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return "$" + Math.round(n / 1e6) + "M";
    return "$" + n.toLocaleString();
  }

  // ─────────────────────────────────────────────
  //  FEATURE 3 — SKELETON LOADERS
  // ─────────────────────────────────────────────
  injectSkeletonLoaders(container) {
    const castSkel = document.createElement("div");
    castSkel.className = "plex-section";
    castSkel.innerHTML = `
            <div class="de-skel de-skel-title"></div>
            <div style="display:flex;gap:24px;overflow:hidden;padding-bottom:8px">
                ${Array.from(
                  { length: 8 },
                  () => `
                    <div style="flex:0 0 148px;display:flex;flex-direction:column;align-items:center;gap:12px">
                        <div class="de-skel" style="width:148px;height:148px;border-radius:50%"></div>
                        <div class="de-skel" style="width:108px;height:12px;border-radius:6px"></div>
                        <div class="de-skel" style="width:78px;height:10px;border-radius:6px;opacity:.6"></div>
                    </div>`,
                ).join("")}
            </div>`;

    const posterSkel = document.createElement("div");
    posterSkel.className = "plex-section";
    posterSkel.innerHTML = `
            <div class="de-skel de-skel-title"></div>
            <div style="display:flex;gap:20px;overflow:hidden;padding-bottom:8px">
                ${Array.from(
                  { length: 6 },
                  () => `
                    <div style="flex:0 0 186px;display:flex;flex-direction:column;gap:12px">
                        <div class="de-skel" style="width:186px;height:279px;border-radius:14px"></div>
                        <div class="de-skel" style="width:130px;height:12px;border-radius:6px;margin:0 auto"></div>
                    </div>`,
                ).join("")}
            </div>`;

    container.appendChild(castSkel);
    container.appendChild(posterSkel);
  }

  // ─────────────────────────────────────────────
  //  FEATURE 4 — CREW STRIP
  // ─────────────────────────────────────────────
  injectCrewStrip(crew, companies, container) {
    const roleMap = [
      { jobs: ["Director"], label: "Director", icon: "🎬" },
      {
        jobs: ["Screenplay", "Writer", "Story", "Author"],
        label: "Writer",
        icon: "✍️",
      },
      {
        jobs: ["Original Music Composer", "Music"],
        label: "Composer",
        icon: "🎵",
      },
      {
        jobs: ["Director of Photography", "Cinematography"],
        label: "Cinematography",
        icon: "📷",
      },
      {
        jobs: ["Producer", "Executive Producer"],
        label: "Producer",
        icon: "🎭",
      },
    ];

    const found = [];
    for (const role of roleMap) {
      const person = crew.find((c) => role.jobs.includes(c.job));
      if (person)
        found.push({ icon: role.icon, label: role.label, name: person.name });
      if (found.length >= 4) break;
    }
    if (!found.length) return;

    const logoCompanies = (companies || [])
      .filter((c) => c.logo_path)
      .slice(0, 5);
    const studiosHTML = logoCompanies.length
      ? `
            <div class="de-studios-row">
                <span class="de-studios-label">Studios</span>
                ${logoCompanies
                  .map(
                    (c) => `
                    <img class="de-studio-logo"
                         src="https://image.tmdb.org/t/p/w185${c.logo_path}"
                         alt="${c.name}" loading="lazy" title="${c.name}">`,
                  )
                  .join("")}
            </div>`
      : "";

    const strip = document.createElement("div");
    strip.className = "de-crew-strip";
    strip.innerHTML = `
            <div class="de-crew-cells">
                ${found
                  .map(
                    (f) => `
                    <div class="de-crew-cell">
                        <span class="de-crew-icon">${f.icon}</span>
                        <div class="de-crew-info">
                            <div class="de-crew-label">${f.label}</div>
                            <div class="de-crew-name">${f.name}</div>
                        </div>
                    </div>`,
                  )
                  .join("")}
            </div>
            ${studiosHTML}`;
    container.appendChild(strip);
  }

  // ─────────────────────────────────────────────
  //  FEATURE 5 — CAST + KNOWN-FOR LABELS
  // ─────────────────────────────────────────────
  injectEnhancedCast(credits, container, currentTmdbId) {
    const cast = (credits.cast || []).slice(0, 25);
    if (!cast.length) return;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">Cast &amp; Crew</div>
            <div class="plex-carousel-wrapper">
                <button class="plex-scroll-btn plex-scroll-left" aria-label="Scroll left">&#8249;</button>
                <div class="plex-hscroll">
                    ${cast
                      .map(
                        (actor, i) => `
                        <div class="plex-cast-card" style="--i:${i}" data-pid="${actor.id}">
                            ${
                              actor.profile_path
                                ? `<img class="plex-cast-avatar" src="https://image.tmdb.org/t/p/w342${actor.profile_path}" alt="${actor.name}" loading="lazy">`
                                : this.buildAvatarPlaceholder(actor.name, 148)
                            }
                            <div class="plex-cast-name">${actor.name}</div>
                            <div class="plex-cast-char">${actor.character || ""}</div>
                            <div class="plex-cast-known" data-pid="${actor.id}"></div>
                        </div>`,
                      )
                      .join("")}
                </div>
                <button class="plex-scroll-btn plex-scroll-right" aria-label="Scroll right">&#8250;</button>
            </div>`;
    container.appendChild(section);
    this.setupPlexScrollButtons(section);

    // Lazy Known-For for top 6
    cast.slice(0, 6).forEach(async (actor) => {
      const title = await this.fetchKnownFor(actor.id, currentTmdbId);
      if (!title) return;
      const el = section.querySelector(
        `.plex-cast-known[data-pid="${actor.id}"]`,
      );
      if (el) {
        el.textContent = "\u2605  " + title;
        el.classList.add("de-known-visible");
      }
    });
  }

  async fetchKnownFor(personId, excludeTmdbId) {
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${this.config.tmdbApiKey}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const work = (data.cast || [])
        .filter((w) => w.id !== excludeTmdbId && (w.vote_count || 0) > 150)
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
      return work ? work.title || work.name : null;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  FEATURE 6 — SCROLL-TRIGGERED ENTRANCES
  // ─────────────────────────────────────────────
  setupScrollEntrances(container) {
    const sections = container.querySelectorAll(
      ".plex-section, .de-crew-strip, .plex-hero",
    );
    sections.forEach((s, i) => {
      s.style.opacity = "0";
      s.style.transform = "translateY(30px)";
      s.style.transition =
        `opacity 0.62s cubic-bezier(0.22,1,0.36,1) ${i * 0.08}s,` +
        `transform 0.62s cubic-bezier(0.22,1,0.36,1) ${i * 0.08}s`;
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0)";
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.07, rootMargin: "0px 0px -32px 0px" },
    );

    sections.forEach((s) => io.observe(s));
  }

  // ─────────────────────────────────────────────
  //  TRAILERS
  // ─────────────────────────────────────────────
  injectTrailers(videos, container) {
    const vids = (videos.results || [])
      .filter(
        (v) =>
          v.site === "YouTube" &&
          ["Trailer", "Teaser", "Featurette"].includes(v.type),
      )
      .slice(0, 10);
    if (!vids.length) return;

    const playSVG = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" style="width:52px;height:52px;filter:drop-shadow(0 4px 12px rgba(0,0,0,.6));transition:transform .35s cubic-bezier(.34,1.56,.64,1)"><circle cx="30" cy="30" r="29" stroke="rgba(255,255,255,.9)" stroke-width="1.5" fill="none"/><path d="M24 20L42 30L24 40Z" fill="white"/></svg>`;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">Extras</div>
            <div class="plex-trailers-grid">
                ${vids
                  .map(
                    (vid, i) => `
                    <div class="plex-trailer-card" data-key="${vid.key}" style="--i:${i}">
                        <div class="plex-trailer-thumb">
                            <img src="https://img.youtube.com/vi/${vid.key}/mqdefault.jpg" alt="${vid.name}" loading="lazy">
                            <div class="plex-trailer-play-icon">${playSVG}</div>
                        </div>
                        <div class="plex-trailer-label">${vid.name}</div>
                    </div>`,
                  )
                  .join("")}
            </div>`;
    container.appendChild(section);

    section.querySelectorAll(".plex-trailer-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        e.preventDefault();
        this.openVideoPlayer(
          card.dataset.key,
          card.querySelector(".plex-trailer-label")?.textContent || "",
        );
      });
    });
  }

  openVideoPlayer(key, title) {
    document.getElementById("de-video-player-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "de-video-player-overlay";
    overlay.innerHTML = `
            <div class="de-vp-backdrop"></div>
            <div class="de-vp-shell">
                <div class="de-vp-topbar">
                    <button class="de-vp-back" aria-label="Back">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        <span>Back</span>
                    </button>
                    <div class="de-vp-title">${title}</div>
                    <div style="width:90px"></div>
                </div>
                <div class="de-vp-frame-wrap">
                    <iframe
                        src="https://www.youtube.com/embed/${key}?autoplay=1&rel=0&modestbranding=1"
                        allow="autoplay; fullscreen; encrypted-media"
                        allowfullscreen
                        frameborder="0"
                        class="de-vp-iframe">
                    </iframe>
                </div>
            </div>`;

    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.add("de-vp-closing");
      setTimeout(() => overlay.remove(), 280);
    };

    overlay.querySelector(".de-vp-back").addEventListener("click", close);
    overlay.querySelector(".de-vp-backdrop").addEventListener("click", close);
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onKey);
      }
    });
  }

  // ─────────────────────────────────────────────
  //  REVIEWS
  // ─────────────────────────────────────────────
  injectReviews(reviews, container) {
    const results = (reviews.results || []).slice(0, 15);
    if (!results.length) return;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">Ratings &amp; Reviews</div>
            <div class="plex-carousel-wrapper">
                <button class="plex-scroll-btn plex-scroll-left" aria-label="Scroll left">&#8249;</button>
                <div class="plex-hscroll">
                    ${results
                      .map((rev, i) => {
                        const stars =
                          rev.author_details && rev.author_details.rating
                            ? this.renderStars(rev.author_details.rating)
                            : "";
                        return `
                            <div class="plex-review-card" style="--i:${i}">
                                ${stars ? `<div class="plex-review-stars">${stars}</div>` : ""}
                                <div class="plex-review-author">${rev.author}</div>
                                <div class="plex-review-text">${rev.content}</div>
                            </div>`;
                      })
                      .join("")}
                </div>
                <button class="plex-scroll-btn plex-scroll-right" aria-label="Scroll right">&#8250;</button>
            </div>`;
    container.appendChild(section);
    this.setupPlexScrollButtons(section);
  }

  // ─────────────────────────────────────────────
  //  FEATURE 7 — SIMILAR TITLES (rating overlay)
  // ─────────────────────────────────────────────
  injectSimilarTitles(similar, container) {
    const titles = (similar.results || []).slice(0, 20);
    if (!titles.length) return;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">Titles You Might Like</div>
            <div class="plex-carousel-wrapper">
                <button class="plex-scroll-btn plex-scroll-left" aria-label="Scroll left">&#8249;</button>
                <div class="plex-hscroll">
                    ${titles.map((item, i) => this.buildPosterCard(item, i)).join("")}
                </div>
                <button class="plex-scroll-btn plex-scroll-right" aria-label="Scroll right">&#8250;</button>
            </div>`;
    container.appendChild(section);
    this.setupPlexScrollButtons(section);
    this.setupPosterClickHandlers(section);
  }

  async injectCollection(collection, container) {
    const res = await fetch(
      `https://api.themoviedb.org/3/collection/${collection.id}?api_key=${this.config.tmdbApiKey}`,
    );
    const data = await res.json();
    const parts = (data.parts || []).sort(
      (a, b) => new Date(a.release_date || 0) - new Date(b.release_date || 0),
    );
    if (parts.length <= 1) return;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">${data.name}</div>
            <div class="plex-carousel-wrapper">
                <button class="plex-scroll-btn plex-scroll-left" aria-label="Scroll left">&#8249;</button>
                <div class="plex-hscroll">
                    ${parts.map((item, i) => this.buildPosterCard(item, i, "movie")).join("")}
                </div>
                <button class="plex-scroll-btn plex-scroll-right" aria-label="Scroll right">&#8250;</button>
            </div>`;
    container.appendChild(section);
    this.setupPlexScrollButtons(section);
    this.setupPosterClickHandlers(section);
  }

  buildPosterCard(item, index, forceMediaType) {
    const mediaType =
      forceMediaType ||
      item.media_type ||
      (item.first_air_date ? "tv" : "movie");
    const title = item.title || item.name || "";
    const year = (item.release_date || item.first_air_date || "").slice(0, 4);
    const score = item.vote_average ? item.vote_average.toFixed(1) : null;
    const typeLabel = mediaType === "tv" ? "Series" : "Movie";

    return `
        <div class="plex-rec-card" style="--i:${index}" data-id="${item.id}" data-media-type="${mediaType}">
            <div class="plex-rec-poster-wrap">
                ${
                  item.poster_path
                    ? `<img class="plex-rec-poster" src="https://image.tmdb.org/t/p/w342${item.poster_path}" alt="${title}" loading="lazy">`
                    : `<div class="plex-rec-no-poster">${title}</div>`
                }
                <div class="plex-rec-overlay">
                    <div class="plex-rec-overlay-top">
                        <span class="plex-rec-type-badge">${typeLabel}</span>
                        ${year ? `<span class="plex-rec-year">${year}</span>` : ""}
                    </div>
                    ${score ? `<div class="plex-rec-score">&#9733; ${score}</div>` : ""}
                </div>
            </div>
            <div class="plex-rec-title">${title}</div>
        </div>`;
  }

  // ─────────────────────────────────────────────
  //  HERO
  // ─────────────────────────────────────────────
  injectHeroSection(data, container) {
    const section = document.createElement("div");
    section.className = "plex-hero";
    const genres = data.genres || [];
    const director =
      data.credits && data.credits.crew
        ? data.credits.crew.find((c) => c.job === "Director")
        : null;

    // TV status badge
    let statusBadge = "";
    if (data.media_type === "tv" && data.status) {
      const statusMap = {
        "Returning Series": {
          cls: "de-status-ongoing",
          dot: "●",
          label: "Ongoing",
        },
        Planned: { cls: "de-status-ongoing", dot: "●", label: "Planned" },
        Ended: { cls: "de-status-ended", dot: "◼", label: "Ended" },
        Canceled: { cls: "de-status-cancelled", dot: "✕", label: "Cancelled" },
        Cancelled: { cls: "de-status-cancelled", dot: "✕", label: "Cancelled" },
        "In Production": {
          cls: "de-status-production",
          dot: "⬡",
          label: "In Production",
        },
      };
      const s = statusMap[data.status];
      if (s)
        statusBadge = `<span class="de-status-badge ${s.cls}">${s.dot} ${s.label}</span>`;
    }

    // Next episode countdown
    let nextEpBanner = "";
    if (data.next_episode_to_air) {
      const ep = data.next_episode_to_air;
      const airDate = new Date(ep.air_date);
      const diffDays = Math.ceil((airDate - new Date()) / 86400000);
      const when =
        diffDays <= 0
          ? "today"
          : diffDays === 1
            ? "tomorrow"
            : `in ${diffDays} days`;
      nextEpBanner = `
                <div class="de-next-episode">
                    <span class="de-next-ep-label">🗓 Next Episode</span>
                    <span>S${ep.season_number}E${ep.episode_number} &ldquo;${ep.name || "TBA"}&rdquo; · airs ${when}</span>
                </div>`;
    }

    section.innerHTML = `
            ${statusBadge ? `<div class="de-hero-status-row">${statusBadge}</div>` : ""}
            ${data.tagline ? `<div class="plex-hero-tagline">&ldquo;${data.tagline}&rdquo;</div>` : ""}
            ${nextEpBanner}
            ${data.overview ? `<div class="plex-hero-overview">${data.overview}</div>` : ""}
            ${
              genres.length || director
                ? `
                <div class="plex-hero-meta">
                    ${genres.map((g) => `<span class="plex-hero-badge">${g.name}</span>`).join("")}
                    ${director ? `<span class="plex-hero-director"><em>Director</em> ${director.name}</span>` : ""}
                </div>`
                : ""
            }`;
    container.appendChild(section);
  }

  // ─────────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────────
  buildAvatarPlaceholder(name, size) {
    const initials = name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase();
    const gradients = [
      "linear-gradient(135deg,#c0392b,#922b21)",
      "linear-gradient(135deg,#2980b9,#1a5276)",
      "linear-gradient(135deg,#27ae60,#1e8449)",
      "linear-gradient(135deg,#8e44ad,#6c3483)",
      "linear-gradient(135deg,#e67e22,#ca6f1e)",
      "linear-gradient(135deg,#16a085,#0e6655)",
    ];
    const grad = gradients[name.length % gradients.length];
    const fs = Math.round(size * 0.34);
    return `<div class="plex-cast-avatar" style="background:${grad};display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:rgba(255,255,255,.9);letter-spacing:1px">${initials}</div>`;
  }

  renderStars(rating10) {
    const filled = Math.round((rating10 / 10) * 5);
    return (
      "\u2605".repeat(Math.max(0, filled)) +
      "\u2606".repeat(Math.max(0, 5 - filled))
    );
  }

  setupPlexScrollButtons(section) {
    const scroller = section.querySelector(".plex-hscroll");
    const leftBtn = section.querySelector(".plex-scroll-left");
    const rightBtn = section.querySelector(".plex-scroll-right");
    if (!scroller || !leftBtn || !rightBtn) return;

    const amount = Math.min(800, window.innerWidth * 0.7);
    const update = () => {
      leftBtn.classList.toggle("can-scroll", scroller.scrollLeft > 10);
      rightBtn.classList.toggle(
        "can-scroll",
        scroller.scrollWidth > scroller.clientWidth &&
          scroller.scrollLeft <
            scroller.scrollWidth - scroller.clientWidth - 10,
      );
    };
    leftBtn.addEventListener("click", (e) => {
      e.preventDefault();
      scroller.scrollBy({ left: -amount, behavior: "smooth" });
    });
    rightBtn.addEventListener("click", (e) => {
      e.preventDefault();
      scroller.scrollBy({ left: amount, behavior: "smooth" });
    });
    scroller.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    setTimeout(update, 300);
  }

  setupPosterClickHandlers(section) {
    section.querySelectorAll(".plex-rec-card").forEach((item) => {
      item.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tmdbId = item.dataset.id;
        const mediaType = item.dataset.mediaType || "movie";
        if (!tmdbId) return;
        item.style.opacity = "0.6";
        item.style.pointerEvents = "none";
        try {
          const res = await fetch(
            `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${this.config.tmdbApiKey}`,
          );
          if (!res.ok) return;
          const ids = await res.json();
          if (ids.imdb_id) {
            window.location.hash = `#/detail/${mediaType === "tv" ? "series" : "movie"}/${ids.imdb_id}`;
          }
        } catch (err) {
          console.error("[DataEnrichment] Nav error:", err);
        } finally {
          item.style.opacity = "";
          item.style.pointerEvents = "";
        }
      });
    });
  }

  // ─────────────────────────────────────────────
  //  WATCH PROVIDERS
  // ─────────────────────────────────────────────
  injectWatchProviders(data, container) {
    const region = this.config.watchProviderRegion || "US";
    const wp = data["watch/providers"];
    if (!wp || !wp.results) return;
    const rd = wp.results[region];
    if (!rd) return;
    const flatrate = rd.flatrate || [];
    const rent = rd.rent || [];
    const buy = rd.buy || [];
    if (!flatrate.length && !rent.length && !buy.length) return;

    const buildRow = (label, items) =>
      !items.length
        ? ""
        : `
            <div class="de-providers-row">
                <span class="de-providers-row-label">${label}</span>
                ${items
                  .map(
                    (p) => `
                    <div class="de-provider-logo-wrap">
                        <img class="de-provider-logo"
                             src="https://image.tmdb.org/t/p/w92${p.logo_path}"
                             alt="${p.provider_name}" loading="lazy">
                        <span class="de-provider-tooltip">${p.provider_name}</span>
                    </div>`,
                  )
                  .join("")}
            </div>`;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">Where to Watch</div>
            <div class="de-providers-card">
                <div class="de-providers-header">
                    <span class="de-providers-title">Streaming &amp; Purchase</span>
                    <span class="de-region-badge">🏄 ${region}</span>
                </div>
                <div class="de-providers-group">
                    ${buildRow("STREAM", flatrate)}
                    ${buildRow("RENT", rent)}
                    ${buildRow("BUY", buy)}
                </div>
            </div>`;
    container.appendChild(section);
  }

  // ─────────────────────────────────────────────
  //  KEYWORDS
  // ─────────────────────────────────────────────
  injectKeywords(data, container) {
    const keywords = [
      ...((data.keywords && data.keywords.keywords) || []),
      ...((data.keywords && data.keywords.results) || []),
    ].slice(0, 15);
    if (!keywords.length) return;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">Themes</div>
            <div class="de-providers-card">
                <div class="de-keyword-strip">
                    ${keywords.map((k) => `<span class="de-keyword-pill">${k.name}</span>`).join("")}
                </div>
            </div>`;
    container.appendChild(section);
  }

  // ─────────────────────────────────────────────
  //  PHOTO GALLERY
  // ─────────────────────────────────────────────
  injectPhotoGallery(data, container) {
    const backdrops = ((data.images && data.images.backdrops) || [])
      .filter((img) => !img.iso_639_1)
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 20);
    if (backdrops.length < 2) return;

    const expandIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">Photo Gallery</div>
            <div class="plex-carousel-wrapper">
                <button class="plex-scroll-btn plex-scroll-left" aria-label="Scroll left">&#8249;</button>
                <div class="plex-hscroll">
                    ${backdrops
                      .map(
                        (img, i) => `
                        <div class="plex-still-card" style="--i:${i}"
                             data-src="https://image.tmdb.org/t/p/original${img.file_path}">
                            <div class="plex-still-wrap">
                                <img class="plex-still-img"
                                     src="https://image.tmdb.org/t/p/w780${img.file_path}"
                                     alt="Still ${i + 1}" loading="lazy">
                                <div class="plex-still-expand">${expandIcon}</div>
                            </div>
                        </div>`,
                      )
                      .join("")}
                </div>
                <button class="plex-scroll-btn plex-scroll-right" aria-label="Scroll right">&#8250;</button>
            </div>`;
    container.appendChild(section);
    this.setupPlexScrollButtons(section);
    section.querySelectorAll(".plex-still-card").forEach((card) => {
      card.addEventListener("click", () => this.openLightbox(card.dataset.src));
    });
  }

  openLightbox(src) {
    document.getElementById("de-lightbox")?.remove();
    const lb = document.createElement("div");
    lb.id = "de-lightbox";
    lb.innerHTML = `
            <div class="de-lightbox-backdrop"></div>
            <img class="de-lightbox-img" src="${src}" alt="Photo">
            <button class="de-lightbox-close" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>`;
    document.body.appendChild(lb);
    const close = () => {
      lb.style.opacity = "0";
      lb.style.transition = "opacity .2s";
      setTimeout(() => lb.remove(), 200);
    };
    lb.querySelector(".de-lightbox-backdrop").addEventListener("click", close);
    lb.querySelector(".de-lightbox-close").addEventListener("click", close);
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onKey);
      }
    });
  }

  // ─────────────────────────────────────────────
  //  RECOMMENDATIONS
  // ─────────────────────────────────────────────
  injectRecommendations(data, container) {
    const titles = (
      (data.recommendations && data.recommendations.results) ||
      []
    ).slice(0, 20);
    if (!titles.length) return;
    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">Because You&rsquo;re Watching</div>
            <div class="plex-carousel-wrapper">
                <button class="plex-scroll-btn plex-scroll-left" aria-label="Scroll left">&#8249;</button>
                <div class="plex-hscroll">
                    ${titles.map((item, i) => this.buildPosterCard(item, i)).join("")}
                </div>
                <button class="plex-scroll-btn plex-scroll-right" aria-label="Scroll right">&#8250;</button>
            </div>`;
    container.appendChild(section);
    this.setupPlexScrollButtons(section);
    this.setupPosterClickHandlers(section);
  }

  // ─────────────────────────────────────────────
  //  MORE BY DIRECTOR
  // ─────────────────────────────────────────────
  async injectMoreByDirector(data, container) {
    const crew = (data.credits && data.credits.crew) || [];
    const director = crew.find((c) => c.job === "Director");
    if (!director) return;

    const credits = await this.fetchPersonCredits(director.id);
    if (!credits) return;

    const titles = (credits.crew || [])
      .filter(
        (c) =>
          c.job === "Director" &&
          c.id !== data.id &&
          c.poster_path &&
          c.vote_average > 0,
      )
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 20);
    if (!titles.length) return;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">More Directed by ${director.name}</div>
            <div class="plex-carousel-wrapper">
                <button class="plex-scroll-btn plex-scroll-left" aria-label="Scroll left">&#8249;</button>
                <div class="plex-hscroll">
                    ${titles.map((item, i) => this.buildPosterCard(item, i)).join("")}
                </div>
                <button class="plex-scroll-btn plex-scroll-right" aria-label="Scroll right">&#8250;</button>
            </div>`;
    container.appendChild(section);
    this.setupPlexScrollButtons(section);
    this.setupPosterClickHandlers(section);
  }

  // ─────────────────────────────────────────────
  //  MORE WITH LEAD ACTOR
  // ─────────────────────────────────────────────
  async injectMoreWithActor(data, container) {
    const cast = (data.credits && data.credits.cast) || [];
    const actor = cast[0];
    if (!actor) return;

    const credits = await this.fetchPersonCredits(actor.id);
    if (!credits) return;

    const titles = (credits.cast || [])
      .filter((c) => c.id !== data.id && c.poster_path && c.vote_average > 0)
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 20);
    if (!titles.length) return;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="plex-section-title">More with ${actor.name}</div>
            <div class="plex-carousel-wrapper">
                <button class="plex-scroll-btn plex-scroll-left" aria-label="Scroll left">&#8249;</button>
                <div class="plex-hscroll">
                    ${titles.map((item, i) => this.buildPosterCard(item, i)).join("")}
                </div>
                <button class="plex-scroll-btn plex-scroll-right" aria-label="Scroll right">&#8250;</button>
            </div>`;
    container.appendChild(section);
    this.setupPlexScrollButtons(section);
    this.setupPosterClickHandlers(section);
  }

  async fetchPersonCredits(personId) {
    const key = `person_${personId}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < 86400000) return cached.data;
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${this.config.tmdbApiKey}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      this.cache.set(key, { data, ts: Date.now() });
      return data;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  AWARDS (OMDb)
  // ─────────────────────────────────────────────
  injectAwards(awards, container) {
    if (!awards || awards === "N/A") return;
    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `
            <div class="de-awards-banner">
                <span class="de-awards-icon">🏆</span>
                <span class="de-awards-text">${awards}</span>
            </div>`;
    container.appendChild(section);
  }

  // ─────────────────────────────────────────────
  //  SEASON EXPLORER
  // ─────────────────────────────────────────────
  injectSeasonExplorer(data, container) {
    const mainSeasons = (data.seasons || []).filter((s) => s.season_number > 0);
    const specialsSeason = (data.seasons || []).filter(
      (s) => s.season_number === 0,
    );
    const seasons = [...mainSeasons, ...specialsSeason];
    if (seasons.length <= 1 && !specialsSeason.length) return;

    const section = document.createElement("div");
    section.className = "plex-section";
    section.innerHTML = `<div class="plex-section-title">Season Explorer</div>`;

    const list = document.createElement("div");
    list.className = "de-season-list";

    for (const season of seasons) {
      const year = (season.air_date || "").slice(0, 4);
      const details = document.createElement("details");
      details.className = "de-season-item";

      const posterHTML = season.poster_path
        ? `<img class="de-season-poster" src="https://image.tmdb.org/t/p/w154${season.poster_path}" alt="${season.name}" loading="lazy">`
        : `<div class="de-season-poster de-season-poster-placeholder"></div>`;

      const summary = document.createElement("summary");
      summary.className = "de-season-summary";
      summary.innerHTML = `
                <svg class="de-season-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                </svg>
                ${posterHTML}
                <div class="de-season-info">
                    <div class="de-season-name">${season.name}</div>
                    <div class="de-season-meta">${year || "TBA"}</div>
                </div>
                <div class="de-season-ep-count">${season.episode_count} ep${season.episode_count !== 1 ? "s" : ""}</div>`;

      const body = document.createElement("div");
      body.className = "de-season-episodes";

      let loaded = false;
      details.addEventListener("toggle", async () => {
        if (!details.open || loaded) return;
        loaded = true;
        body.innerHTML = `<div class="de-ep-grid">${Array.from(
          { length: 4 },
          () =>
            `<div class="de-episode-card">
                        <div class="de-skel" style="aspect-ratio:16/9;width:100%"></div>
                        <div style="padding:11px 13px">
                            <div class="de-skel" style="height:11px;width:80%;border-radius:5px"></div>
                            <div class="de-skel" style="height:9px;width:50%;border-radius:5px;margin-top:7px;opacity:.6"></div>
                        </div>
                    </div>`,
        ).join("")}</div>`;

        const episodes = await this.fetchSeasonEpisodes(
          data.id,
          season.season_number,
        );
        if (!episodes) {
          body.innerHTML = `<p style="padding:14px 0;color:rgba(255,255,255,.3);font-size:.85rem">Could not load episodes.</p>`;
          return;
        }
        body.innerHTML = `<div class="de-ep-grid">${episodes
          .map(
            (ep) => `
                    <div class="de-episode-card">
                        <div class="de-episode-still-wrap">
                            ${
                              ep.still_path
                                ? `<img class="de-episode-still" src="https://image.tmdb.org/t/p/w300${ep.still_path}" alt="${ep.name}" loading="lazy">`
                                : `<div class="de-episode-still" style="background:linear-gradient(135deg,#1a1a2e,#16213e)"></div>`
                            }
                            <span class="de-episode-num">E${ep.episode_number}</span>
                        </div>
                        <div class="de-episode-body">
                            <div class="de-episode-title">${ep.name || "TBA"}</div>
                            <div class="de-episode-air">${ep.air_date ? new Date(ep.air_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBA"}</div>
                        </div>
                    </div>`,
          )
          .join("")}</div>`;
      });

      details.appendChild(summary);
      details.appendChild(body);
      list.appendChild(details);
    }

    section.appendChild(list);
    container.appendChild(section);
  }

  async fetchSeasonEpisodes(tmdbId, seasonNumber) {
    const key = `season_${tmdbId}_${seasonNumber}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < 86400000) return cached.data;
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}?api_key=${this.config.tmdbApiKey}`,
      );
      if (!res.ok) return null;
      const json = await res.json();
      const episodes = json.episodes || [];
      this.cache.set(key, { data: episodes, ts: Date.now() });
      return episodes;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  TMDB FETCH (TTL-aware)
  // ─────────────────────────────────────────────
  async fetchTMDBData(imdbId) {
    const TTL = 1800000; // 30 minutes
    const cached = this.cache.get(imdbId);
    if (cached && cached.ts && Date.now() - cached.ts < TTL) return cached.data;
    const apiKey = this.config.tmdbApiKey;
    if (!apiKey) return null;
    try {
      const findRes = await fetch(
        `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`,
      );
      if (!findRes.ok) return null;
      const found = await findRes.json();

      let tmdbId, mediaType;
      if (found.movie_results && found.movie_results.length) {
        tmdbId = found.movie_results[0].id;
        mediaType = "movie";
      } else if (found.tv_results && found.tv_results.length) {
        tmdbId = found.tv_results[0].id;
        mediaType = "tv";
      } else return null;

      const detailRes = await fetch(
        `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${apiKey}` +
          `&append_to_response=credits,similar,recommendations,external_ids,content_ratings,` +
          `release_dates,videos,reviews,keywords,images,watch%2Fproviders` +
          `&include_image_language=en,null`,
      );
      if (!detailRes.ok) return null;
      const data = await detailRes.json();
      data.media_type = mediaType;
      this.cache.set(imdbId, { data, ts: Date.now() });
      return data;
    } catch (err) {
      console.error("[DataEnrichment] Fetch error:", err);
      return null;
    }
  }

  async fetchOMDbData(imdbId) {
    const key = `omdb_${imdbId}`;
    const cached = this.cache.get(key);
    if (cached && cached.ts && Date.now() - cached.ts < 86400000)
      return cached.data;
    try {
      const res = await fetch(
        `https://www.omdbapi.com/?i=${imdbId}&apikey=${this.config.omdbApiKey}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.Response === "False") return null;
      this.cache.set(key, { data, ts: Date.now() });
      return data;
    } catch {
      return null;
    }
  }

  checkForPosters() {
    if (!this.config.showRatingsOnPosters || !this.config.tmdbApiKey) return;
    document
      .querySelectorAll('[class*="meta-item-container"]:not([data-enriched])')
      .forEach((p) => {
        p.setAttribute("data-enriched", "true");
      });
  }

  // ─────────────────────────────────────────────
  //  ALL STYLES
  // ─────────────────────────────────────────────
  injectPlexStyles() {
    if (document.getElementById("plex-enrichment-styles")) return;

    if (!document.getElementById("de-font-import")) {
      const link = document.createElement("link");
      link.id = "de-font-import";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap";
      document.head.appendChild(link);
    }

    const style = document.createElement("style");
    style.id = "plex-enrichment-styles";
    style.textContent = `

/* BASE */
.data-enrichment-container {
    margin-top: 40px;
    padding-bottom: 80px;
    margin-right: -40px;
    padding-right: 40px;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 44px;
}
.data-enrichment-container * { box-sizing: border-box; }
.data-enrichment-container img { display: block; }

/* TWO-COLUMN TOP ROW (Hero & Ratings | Watchlist) */
.de-top-row {
    display: flex;
    gap: 32px;
    align-items: flex-start;
    margin-bottom: 24px;
}
.de-top-left-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.de-top-right-col {
    flex: 0 0 380px;
}
@media (max-width: 1000px) {
    .de-top-row { flex-direction: column; gap: 24px; }
    .de-top-right-col { flex: 1; width: 100%; }
}

/* TWO-COLUMN META ROW (Where to Watch + Themes) */
.de-meta-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: stretch;
}
.de-meta-row .de-providers-card {
    flex-grow: 1;
}
.de-meta-row > .plex-section:only-child {
    grid-column: 1 / -1;
}
@media (max-width: 900px) {
    .de-meta-row { grid-template-columns: 1fr; }
}

/* KEYFRAMES */
@keyframes de-shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position:  600px 0; }
}
@keyframes de-fade-up {
    from { opacity: 0; transform: translateY(20px) scale(.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* SECTION TITLES */
.plex-section { display: flex; flex-direction: column; }
.plex-section-title {
    font-size: 1.45rem; font-weight: 700; margin-bottom: 28px;
    color: #fff; letter-spacing: -.4px;
    display: flex; align-items: center; gap: 12px;
}
.plex-section-title::before {
    content: ''; display: block; width: 4px; height: 1.2em;
    background: linear-gradient(180deg,#e5a00d 0%,#ff6b35 100%);
    border-radius: 3px; flex-shrink: 0;
}

/* FEATURE 3 — SKELETON LOADERS */
.de-skel {
    background: linear-gradient(90deg,
        rgba(255,255,255,.04) 0px,
        rgba(255,255,255,.11) 40px,
        rgba(255,255,255,.04) 80px);
    background-size: 600px 100%;
    animation: de-shimmer 1.6s infinite linear;
}
.de-skel-title { width: 180px; height: 18px; border-radius: 7px; margin-bottom: 24px; }

/* FEATURE 2 — RATINGS BAR */
.de-ratings-bar { display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0 16px; }
.de-rating-pill {
    display: flex; flex-direction: column; gap: 5px;
    padding: 13px 18px 11px; border-radius: 16px;
    border: 1px solid rgba(255,255,255,.08);
    background: rgba(255,255,255,.04);
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    min-width: 96px; cursor: default;
    transition: transform .35s cubic-bezier(.34,1.3,.64,1), box-shadow .3s, background .25s;
}
.de-rating-pill:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,.45); background: rgba(255,255,255,.08); }
.de-pill-tmdb   { border-color: rgba(1,180,228,.28);  background: rgba(1,180,228,.07); }
.de-pill-fresh  { border-color: rgba(52,199,89,.28);  background: rgba(52,199,89,.07); }
.de-pill-rotten { border-color: rgba(255,69,58,.28);  background: rgba(255,69,58,.07); }
.de-pill-pop    { border-color: rgba(229,160,13,.28); background: rgba(229,160,13,.07); }
.de-pill-meta   { border-color: rgba(255,255,255,.08); }
.de-pill-top    { display: flex; align-items: center; gap: 6px; }
.de-pill-source { font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .9px; color: rgba(255,255,255,.4); }
.de-pill-score  { font-size: 1.35rem; font-weight: 700; color: #fff; line-height: 1; letter-spacing: -.5px; }
.de-pill-bar-track { height: 3px; background: rgba(255,255,255,.1); border-radius: 2px; overflow: hidden; }
.de-pill-bar-fill  { height: 100%; border-radius: 2px; transition: width .8s cubic-bezier(.22,1,.36,1); }
.de-pill-sub    { font-size: .7rem; color: rgba(255,255,255,.35); }

/* FEATURE 4 — CREW STRIP */
.de-crew-strip {
    display: flex; flex-direction: column;
    border: 1px solid rgba(255,255,255,.07); border-radius: 18px; overflow: hidden;
    background: rgba(255,255,255,.03); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.de-crew-cells { display: flex; flex-wrap: wrap; }
.de-crew-cell {
    display: flex; align-items: center; gap: 12px;
    padding: 17px 22px; flex: 1; min-width: 150px;
    border-right: 1px solid rgba(255,255,255,.05);
    transition: background .25s;
}
.de-crew-cell:last-child { border-right: none; }
.de-crew-cell:hover { background: rgba(255,255,255,.05); }
.de-crew-icon  { font-size: 1.2rem; flex-shrink: 0; }
.de-crew-label { font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .9px; color: rgba(255,255,255,.38); margin-bottom: 3px; }
.de-crew-name  { font-size: .93rem; font-weight: 600; color: rgba(255,255,255,.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* CAROUSEL */
.plex-carousel-wrapper { position: relative; margin: 0 -32px 0 -20px; padding: 0 32px 0 20px; }
.plex-hscroll {
    display: flex; gap: 24px; overflow-x: auto; padding-bottom: 20px;
    scrollbar-width: none; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; align-items: stretch;
}
.plex-hscroll::-webkit-scrollbar { display: none; }

/* FEATURE 5 — CAST CARDS + KNOWN-FOR */
.plex-cast-card {
    flex: 0 0 148px; text-align: center; cursor: default;
    display: flex; flex-direction: column; align-items: center;
    animation: de-fade-up .5s cubic-bezier(.34,1.3,.64,1) both;
    animation-delay: calc(var(--i,0) * .045s);
    transition: transform .4s cubic-bezier(.34,1.3,.64,1);
}
.plex-cast-card:hover { transform: translateY(-8px); }
.plex-cast-avatar {
    width: 148px; height: 148px; border-radius: 50%;
    object-fit: cover; object-position: center 15%;
    background: linear-gradient(135deg,#1e1e2e,#2a2a3a);
    margin: 0 auto 16px;
    border: 2.5px solid rgba(255,255,255,.07);
    transition: border-color .35s, box-shadow .35s, transform .4s cubic-bezier(.34,1.3,.64,1);
    box-shadow: 0 8px 24px rgba(0,0,0,.55);
    flex-shrink: 0; display: block;
}
.plex-cast-card:hover .plex-cast-avatar {
    border-color: rgba(229,160,13,.75);
    box-shadow: 0 0 0 5px rgba(229,160,13,.12), 0 16px 36px rgba(0,0,0,.6);
    transform: scale(1.06);
}
.plex-cast-name  { font-size: .9rem; font-weight: 600; color: #f0f0f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; padding: 0 6px; letter-spacing: -.1px; }
.plex-cast-char  { font-size: .78rem; color: rgba(255,255,255,.42); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; padding: 0 6px; font-weight: 400; }
.plex-cast-known { font-size: .7rem; color: #e5a00d; margin-top: 5px; opacity: 0; transition: opacity .5s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; padding: 0 6px; font-weight: 600; }
.plex-cast-known.de-known-visible { opacity: 1; }

/* TRAILERS */
.plex-trailers-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(290px,1fr)); gap: 22px; padding-bottom: 12px; }
.plex-trailer-card { cursor: pointer; display: flex; flex-direction: column; gap: 13px; animation: de-fade-up .5s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i,0)*.06s); }
.plex-trailer-thumb { position: relative; border-radius: 14px; overflow: hidden; aspect-ratio: 16/9; background: #111; box-shadow: 0 6px 20px rgba(0,0,0,.5); transition: transform .4s cubic-bezier(.34,1.2,.64,1), box-shadow .4s; }
.plex-trailer-card:hover .plex-trailer-thumb { transform: scale(1.03) translateY(-3px); box-shadow: 0 16px 40px rgba(0,0,0,.65); }
.plex-trailer-thumb img { width: 100%; height: 100%; object-fit: cover; }
.plex-trailer-play-icon { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.38); backdrop-filter: blur(2px); transition: background .3s; }
.plex-trailer-card:hover .plex-trailer-play-icon { background: rgba(229,160,13,.25); }
.plex-trailer-card:hover .plex-trailer-play-icon svg { transform: scale(1.14); }
.plex-trailer-label { font-size: .95rem; color: rgba(255,255,255,.72); font-weight: 500; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* REVIEWS */
.plex-review-card {
    flex: 0 0 390px; background: rgba(255,255,255,.04); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border-radius: 20px; padding: 26px 28px; border: 1px solid rgba(255,255,255,.07);
    transition: transform .4s cubic-bezier(.34,1.2,.64,1), border-color .3s, box-shadow .4s, background .3s;
    box-shadow: 0 6px 24px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.06);
    display: flex; flex-direction: column; min-height: 200px;
    animation: de-fade-up .5s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i,0)*.06s);
}
.plex-review-card:hover { transform: translateY(-6px); border-color: rgba(255,255,255,.13); box-shadow: 0 20px 48px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.1); background: rgba(255,255,255,.07); }
.plex-review-stars  { color: #e5a00d; font-size: 1rem; margin-bottom: 12px; letter-spacing: 2px; }
.plex-review-author { font-size: .97rem; font-weight: 600; color: #f0f0f0; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
.plex-review-author::before { content: ''; width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg,rgba(229,160,13,.35),rgba(255,107,53,.35)); border: 1px solid rgba(229,160,13,.25); flex-shrink: 0; }
.plex-review-text   { font-size: .875rem; color: rgba(255,255,255,.48); line-height: 1.7; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; flex-grow: 1; font-weight: 300; }

/* FEATURE 7 — POSTER CARDS + HOVER OVERLAY */
.plex-rec-card {
    flex: 0 0 240px; cursor: pointer; display: flex; flex-direction: column; gap: 13px;
    animation: de-fade-up .5s cubic-bezier(.34,1.2,.64,1) both; animation-delay: calc(var(--i,0)*.05s);
}
.plex-rec-poster-wrap {
    position: relative; width: 240px; height: 360px;
    border-radius: 14px; overflow: hidden; flex-shrink: 0;
    box-shadow: 0 8px 24px rgba(0,0,0,.45);
    transition: transform .4s cubic-bezier(.34,1.2,.64,1), box-shadow .4s;
}
.plex-rec-card:hover .plex-rec-poster-wrap { transform: translateY(-8px) scale(1.03); box-shadow: 0 20px 48px rgba(0,0,0,.65); }
.plex-rec-poster   { width: 100%; height: 100%; object-fit: cover; display: block; }
.plex-rec-no-poster {
    width: 100%; height: 100%;
    background: linear-gradient(135deg,#1a1a2e,#16213e);
    display: flex; align-items: center; justify-content: center;
    text-align: center; color: rgba(255,255,255,.35); font-size: .9rem; padding: 14px;
    border: 1px solid rgba(255,255,255,.06);
}
.plex-rec-overlay {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; justify-content: space-between; padding: 11px;
    background: linear-gradient(to bottom, rgba(0,0,0,.58) 0%, transparent 36%, transparent 55%, rgba(0,0,0,.88) 100%);
    opacity: 0; transform: translateY(8px);
    transition: opacity .32s ease, transform .38s cubic-bezier(.34,1.2,.64,1);
}
.plex-rec-card:hover .plex-rec-overlay { opacity: 1; transform: translateY(0); }
.plex-rec-overlay-top { display: flex; align-items: center; justify-content: space-between; }
.plex-rec-type-badge  { font-size: .65rem; font-weight: 800; text-transform: uppercase; letter-spacing: .7px; background: rgba(229,160,13,.92); color: #000; padding: 3px 8px; border-radius: 5px; }
.plex-rec-year        { font-size: .76rem; font-weight: 600; color: rgba(255,255,255,.82); }
.plex-rec-score       { font-size: .92rem; font-weight: 700; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,.8); }
.plex-rec-title {
    font-size: .9rem; font-weight: 500; color: rgba(255,255,255,.68);
    text-align: center; line-height: 1.4; overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    padding: 0 4px; transition: color .25s;
}
.plex-rec-card:hover .plex-rec-title { color: rgba(255,255,255,.95); }

/* SCROLL BUTTONS */
.plex-scroll-btn {
    position: absolute; top: calc(50% - 24px); transform: translateY(-50%);
    width: 54px; height: 54px; background: rgba(12,12,18,.88);
    border: 1px solid rgba(255,255,255,.1); border-radius: 50%;
    color: #fff; display: flex; align-items: center; justify-content: center;
    cursor: pointer; z-index: 10; opacity: 0; pointer-events: none;
    font-size: 22px; font-weight: 300;
    box-shadow: 0 6px 24px rgba(0,0,0,.65);
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    transition: opacity .3s, background .3s, transform .35s cubic-bezier(.34,1.56,.64,1), border-color .3s, box-shadow .3s;
}
.plex-scroll-btn:hover { background: rgba(229,160,13,.95); border-color: rgba(229,160,13,.6); transform: translateY(-50%) scale(1.1); box-shadow: 0 8px 32px rgba(229,160,13,.35); }
.plex-scroll-left  { left:  0; }
.plex-scroll-right { right: 0; }
.plex-carousel-wrapper:hover .plex-scroll-btn.can-scroll { opacity: 1; pointer-events: auto; }

/* HERO */
.plex-hero  { display: flex; flex-direction: column; gap: 16px; position: relative; z-index: 5; margin-bottom: 4px; }
.plex-hero-tagline { font-family: 'DM Serif Display', Georgia, serif; font-size: 1.45rem; font-style: italic; color: #e5a00d; letter-spacing: .2px; line-height: 1.35; opacity: .92; }
.plex-hero-overview { font-size: 1.05rem; line-height: 1.75; color: rgba(255,255,255,.76); max-width: 93%; font-weight: 300; letter-spacing: .1px; }
.plex-hero-meta { display: flex; flex-wrap: wrap; gap: 9px; align-items: center; margin-top: 4px; }
.plex-hero-badge { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.11); border-radius: 30px; padding: 6px 16px; font-size: .85rem; font-weight: 500; color: rgba(255,255,255,.82); backdrop-filter: blur(12px); letter-spacing: .3px; transition: background .25s, border-color .25s; }
.plex-hero-badge:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.2); }
.plex-hero-director { display: flex; align-items: center; gap: 7px; font-size: .88rem; font-weight: 600; color: rgba(255,255,255,.88); background: rgba(229,160,13,.1); padding: 6px 16px; border-radius: 30px; border: 1px solid rgba(229,160,13,.2); }
.plex-hero-director em { color: #e5a00d; font-style: normal; font-weight: 400; font-size: .82rem; }


/* ═══════════════════════════════════════════════════════
   HOME BUTTON — Liquid Glass / Glassmorphism
   sits in the top-right toolbar, left of native icons
═══════════════════════════════════════════════════════ */

@keyframes de-home-btn-in {
    0%   { opacity: 0; transform: translateY(-12px) scale(0.88); filter: blur(4px); }
    60%  { opacity: 1; filter: blur(0px); }
    100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px); }
}
@keyframes de-home-shimmer {
    0%   { transform: translateX(-120%) skewX(-18deg); }
    100% { transform: translateX(320%)  skewX(-18deg); }
}
@keyframes de-home-ripple-out {
    0%   { transform: translate(-50%, -50%) scale(0); opacity: 0.55; }
    100% { transform: translate(-50%, -50%) scale(3.5); opacity: 0; }
}

#de-home-btn {
    /* ── Position ── */
    position: fixed;
    top: 20px;
    right: 140px;
    z-index: 99990;

    /* ── Layout ── */
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 20px 9px 14px;
    white-space: nowrap;
    overflow: hidden;

    /* ── Liquid glass base ── */
    background:
        linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.18) 0%,
            rgba(255, 255, 255, 0.06) 40%,
            rgba(255, 255, 255, 0.10) 70%,
            rgba(255, 255, 255, 0.04) 100%
        );
    border-radius: 50px;

    /* ── Glass edge — top-bright, sides & bottom subtle ── */
    border-top:    1px solid rgba(255, 255, 255, 0.55);
    border-left:   1px solid rgba(255, 255, 255, 0.22);
    border-right:  1px solid rgba(255, 255, 255, 0.10);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    /* ── Text ── */
    color: rgba(255, 255, 255, 0.92);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    letter-spacing: 0.015em;
    cursor: pointer;

    /* ── Frosted blur ── */
    backdrop-filter: blur(28px) saturate(1.6) brightness(1.15);
    -webkit-backdrop-filter: blur(28px) saturate(1.6) brightness(1.15);

    /* ── Depth shadows ── */
    box-shadow:
        0 2px 0 0 rgba(255,255,255,0.28) inset,   /* top specular lip  */
        0 -1px 0 0 rgba(0,0,0,0.18) inset,         /* bottom inner edge */
        0 8px 24px rgba(0, 0, 0, 0.38),
        0 2px 6px  rgba(0, 0, 0, 0.22),
        0 0 0 0.5px rgba(255,255,255,0.12);

    /* ── Transitions ── */
    transition:
        background    0.38s ease,
        box-shadow    0.38s ease,
        border-color  0.38s ease,
        color         0.32s ease,
        transform     0.42s cubic-bezier(0.34, 1.4, 0.64, 1),
        filter        0.38s ease;

    /* ── Entrance ── */
    animation: de-home-btn-in 0.55s cubic-bezier(0.34, 1.3, 0.64, 1) both;
}

/* ── Specular shine layer (static highlight arc) ── */
.de-home-glass-shine {
    pointer-events: none;
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
        170deg,
        rgba(255,255,255,0.28) 0%,
        rgba(255,255,255,0.10) 28%,
        transparent 52%
    );
    opacity: 1;
    transition: opacity 0.38s ease;
}

/* ── Iridescent shimmer sweep (plays on hover) ── */
.de-home-glass-shimmer {
    pointer-events: none;
    position: absolute;
    top: 0; left: 0;
    width: 40%;
    height: 100%;
    background: linear-gradient(
        100deg,
        transparent 0%,
        rgba(255,255,255,0.0)  20%,
        rgba(200,220,255,0.22) 45%,
        rgba(255,200,240,0.18) 55%,
        rgba(255,255,255,0.0)  80%,
        transparent 100%
    );
    transform: translateX(-120%) skewX(-18deg);
    opacity: 0;
    transition: opacity 0.2s;
}

/* ── Ripple element ── */
.de-home-ripple {
    pointer-events: none;
    position: absolute;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: rgba(255,255,255,0.25);
    left: 50%; top: 50%;
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
}

/* ── Label ── */
.de-home-label {
    position: relative;
    z-index: 1;
}

/* ── Icon ── */
.de-home-icon {
    width: 17px;
    height: 17px;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    transition: transform 0.42s cubic-bezier(0.34, 1.6, 0.64, 1),
                filter 0.32s ease;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
}

/* ══ HOVER STATE ══════════════════════════════════════ */
#de-home-btn:hover {
    background:
        linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.26) 0%,
            rgba(200, 220, 255, 0.14) 35%,
            rgba(255, 200, 240, 0.10) 65%,
            rgba(255, 255, 255, 0.08) 100%
        );

    border-top:    1px solid rgba(255, 255, 255, 0.72);
    border-left:   1px solid rgba(255, 255, 255, 0.35);
    border-right:  1px solid rgba(255, 255, 255, 0.18);
    border-bottom: 1px solid rgba(255, 255, 255, 0.14);

    color: #fff;

    box-shadow:
        0 2px 0 0 rgba(255,255,255,0.45) inset,
        0 -1px 0 0 rgba(0,0,0,0.22) inset,
        0 12px 36px rgba(0, 0, 0, 0.48),
        0 4px 12px  rgba(0, 0, 0, 0.28),
        0 0 0 0.5px rgba(255,255,255,0.22),
        0 0 28px    rgba(180, 210, 255, 0.12);

    transform: translateY(-2px) scale(1.02);
    filter: brightness(1.08);
}

#de-home-btn:hover .de-home-glass-shine {
    opacity: 0.7;
}

#de-home-btn:hover .de-home-glass-shimmer {
    opacity: 1;
    animation: de-home-shimmer 0.65s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

#de-home-btn:hover .de-home-icon {
    transform: scale(1.2) translateY(-1px);
    filter: drop-shadow(0 0 6px rgba(200,220,255,0.6)) drop-shadow(0 2px 4px rgba(0,0,0,0.4));
}

/* ══ ACTIVE / CLICK ══════════════════════════════════ */
#de-home-btn:active {
    transform: translateY(0) scale(0.96);
    box-shadow:
        0 1px 0 0 rgba(255,255,255,0.25) inset,
        0 4px 12px rgba(0, 0, 0, 0.35),
        0 0 0 0.5px rgba(255,255,255,0.12);
    filter: brightness(0.95);
    transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}

#de-home-btn:active .de-home-ripple {
    animation: de-home-ripple-out 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

/* RESPONSIVE */
@media (max-width: 900px) {
    .data-enrichment-container { margin-top: 24px; gap: 32px; padding-bottom: 40px; }
    .plex-section-title { font-size: 1.2rem; margin-bottom: 18px; }
    .plex-hscroll { gap: 16px; }
    .plex-cast-card { flex: 0 0 110px; }
    .plex-cast-avatar { width: 110px; height: 110px; }
    .plex-rec-card { flex: 0 0 160px; }
    .plex-rec-poster-wrap { width: 160px; height: 240px; border-radius: 10px; }
    .plex-trailers-grid { grid-template-columns: repeat(auto-fill,minmax(230px,1fr)); gap: 16px; }
    .plex-review-card { flex: 0 0 300px; padding: 18px 20px; }
    .plex-scroll-btn { display: none; }
    .de-crew-cell { min-width: 140px; padding: 14px 16px; }
}

/* HIDE NATIVE STREMIO DUPLICATES */
[class*="description-text"],[class*="description-container"],
[class*="cast-list"],[class*="director-list"],
[class*="genres-list"],[class*="genres-container"],
[class*="meta-tags"] { display: none !important; }

/* VIDEO PLAYER OVERLAY */
#de-video-player-overlay {
    position: fixed; inset: 0; z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    animation: de-fade-up .28s cubic-bezier(.22,1,.36,1) both;
}
#de-video-player-overlay.de-vp-closing {
    animation: de-vp-out .28s cubic-bezier(.55,0,1,.45) both;
}
@keyframes de-vp-out {
    to { opacity: 0; transform: scale(.97); }
}
.de-vp-backdrop {
    position: absolute; inset: 0;
    background: rgba(0,0,0,.88);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
}
.de-vp-shell {
    position: relative; z-index: 1;
    display: flex; flex-direction: column;
    width: min(96vw, 1280px);
    gap: 14px;
}
.de-vp-topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 4px;
}
.de-vp-back {
    display: flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,.08);
    border: 1px solid rgba(255,255,255,.13);
    color: rgba(255,255,255,.9);
    padding: 7px 18px 7px 12px;
    border-radius: 50px;
    cursor: pointer;
    font-family: 'DM Sans', sans-serif;
    font-size: .9rem; font-weight: 600;
    letter-spacing: .01em;
    transition: background .22s, border-color .22s, color .22s, transform .22s;
}
.de-vp-back:hover {
    background: rgba(229,160,13,.18);
    border-color: rgba(229,160,13,.5);
    color: #e5a00d;
    transform: translateX(-2px);
}
.de-vp-back svg { width: 18px; height: 18px; }
.de-vp-title {
    font-family: 'DM Sans', sans-serif;
    font-size: 1rem; font-weight: 600;
    color: rgba(255,255,255,.8);
    text-align: center;
    flex: 1; padding: 0 12px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.de-vp-frame-wrap {
    border-radius: 16px; overflow: hidden;
    aspect-ratio: 16/9;
    box-shadow: 0 24px 80px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.06);
    background: #000;
}
.de-vp-iframe { width: 100%; height: 100%; display: block; border: none; }

/* PRODUCTION STUDIOS */
.de-studios-row {
    display: flex; flex-wrap: wrap; align-items: center; gap: 20px;
    padding: 14px 22px; border-top: 1px solid rgba(255,255,255,.05);
}
.de-studios-label {
    font-size: .62rem; font-weight: 800; text-transform: uppercase;
    letter-spacing: .9px; color: rgba(255,255,255,.25); flex-shrink: 0;
}
.de-studio-logo {
    height: 26px; width: auto; max-width: 80px; object-fit: contain;
    filter: brightness(.6) grayscale(.5);
    transition: filter .3s, transform .3s cubic-bezier(.34,1.3,.64,1);
}
.de-studio-logo:hover { filter: brightness(1) grayscale(0); transform: scale(1.1); }

/* STATUS BADGE + NEXT EPISODE */
.de-hero-status-row { margin-bottom: 10px; }
.de-status-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 14px; border-radius: 20px;
    font-size: .78rem; font-weight: 700; letter-spacing: .3px; border: 1px solid;
}
.de-status-ongoing    { color: #34c759; border-color: rgba(52,199,89,.35);   background: rgba(52,199,89,.1); }
.de-status-ended      { color: rgba(255,255,255,.45); border-color: rgba(255,255,255,.15); background: rgba(255,255,255,.05); }
.de-status-cancelled  { color: #ff453a; border-color: rgba(255,69,58,.35);   background: rgba(255,69,58,.08); }
.de-status-production { color: #007aff; border-color: rgba(0,122,255,.35);   background: rgba(0,122,255,.08); }
.de-next-episode {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 11px 16px; margin: 4px 0;
    background: rgba(229,160,13,.07); border: 1px solid rgba(229,160,13,.2);
    border-radius: 12px; font-size: .88rem; color: rgba(255,255,255,.65); line-height: 1.5;
}
.de-next-ep-label { color: #e5a00d; font-weight: 700; flex-shrink: 0; }

/* MATURITY + BOX OFFICE PILLS */
.de-pill-rating  { border-color: rgba(255,107,107,.28); background: rgba(255,107,107,.07); }
.de-pill-budget  { border-color: rgba(245,200,66,.28);  background: rgba(245,200,66,.07); }
.de-pill-revenue { border-color: rgba(52,199,89,.28);   background: rgba(52,199,89,.07); }

/* WATCH PROVIDERS */
.de-providers-card {
    background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
    border-radius: 20px; padding: 22px 24px;
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.de-providers-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.de-providers-title { font-size: .68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.1px; color: rgba(255,255,255,.32); }
.de-region-badge {
    font-size: .72rem; font-weight: 700; color: rgba(255,255,255,.5);
    background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
    padding: 4px 10px; border-radius: 20px;
}
.de-providers-group { display: flex; flex-direction: column; gap: 14px; }
.de-providers-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.de-providers-row-label {
    font-size: .62rem; font-weight: 800; text-transform: uppercase; letter-spacing: .9px;
    color: rgba(255,255,255,.28); min-width: 46px; flex-shrink: 0;
}
.de-provider-logo-wrap { position: relative; }
.de-provider-logo {
    width: 46px; height: 46px; border-radius: 12px; object-fit: cover;
    border: 1px solid rgba(255,255,255,.1); cursor: default;
    transition: transform .3s cubic-bezier(.34,1.3,.64,1), box-shadow .3s, border-color .3s;
    box-shadow: 0 4px 12px rgba(0,0,0,.4);
}
.de-provider-logo:hover { transform: scale(1.14) translateY(-2px); box-shadow: 0 10px 28px rgba(0,0,0,.6); border-color: rgba(255,255,255,.25); }
.de-provider-tooltip {
    position: absolute; bottom: calc(100% + 7px); left: 50%; transform: translateX(-50%);
    background: rgba(12,12,18,.95); border: 1px solid rgba(255,255,255,.1);
    color: rgba(255,255,255,.85); font-size: .68rem; font-weight: 600;
    padding: 4px 10px; border-radius: 8px; white-space: nowrap;
    pointer-events: none; opacity: 0; transition: opacity .2s;
    backdrop-filter: blur(12px); z-index: 20;
}
.de-provider-logo-wrap:hover .de-provider-tooltip { opacity: 1; }

/* KEYWORDS */
.de-keyword-strip { display: flex; flex-wrap: wrap; gap: 8px; }
.de-keyword-pill {
    background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.09);
    border-radius: 20px; padding: 5px 14px;
    font-size: .78rem; font-weight: 500; color: rgba(255,255,255,.6);
    backdrop-filter: blur(10px); cursor: default;
    transition: background .2s, border-color .2s, color .2s;
}
.de-keyword-pill:hover { background: rgba(229,160,13,.08); border-color: rgba(229,160,13,.3); color: rgba(255,255,255,.9); }

/* PHOTO GALLERY */
.plex-still-card {
    flex: 0 0 360px; cursor: pointer;
    animation: de-fade-up .5s cubic-bezier(.22,1,.36,1) both;
    animation-delay: calc(var(--i,0)*.05s);
}
.plex-still-wrap {
    position: relative; aspect-ratio: 16/9; border-radius: 14px; overflow: hidden;
    box-shadow: 0 8px 24px rgba(0,0,0,.45);
    transition: transform .4s cubic-bezier(.34,1.2,.64,1), box-shadow .4s;
}
.plex-still-card:hover .plex-still-wrap { transform: scale(1.03) translateY(-4px); box-shadow: 0 20px 48px rgba(0,0,0,.65); }
.plex-still-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.plex-still-expand {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,.35); opacity: 0; transition: opacity .28s;
    color: #fff;
}
.plex-still-card:hover .plex-still-expand { opacity: 1; }

/* LIGHTBOX */
#de-lightbox {
    position: fixed; inset: 0; z-index: 99999;
    display: flex; align-items: center; justify-content: center;
}
.de-lightbox-backdrop {
    position: absolute; inset: 0;
    background: rgba(0,0,0,.92); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
}
.de-lightbox-img {
    position: relative; z-index: 1;
    max-width: 96vw; max-height: 90vh; object-fit: contain;
    border-radius: 14px; box-shadow: 0 32px 100px rgba(0,0,0,.9);
    animation: de-fade-up .25s cubic-bezier(.22,1,.36,1) both;
}
.de-lightbox-close {
    position: absolute; top: 20px; right: 20px; z-index: 2;
    width: 44px; height: 44px; border-radius: 50%;
    background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.15);
    color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background .2s, transform .3s; backdrop-filter: blur(12px);
}
.de-lightbox-close:hover { background: rgba(255,255,255,.2); transform: scale(1.12); }

/* AWARDS */
.de-awards-banner {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 22px;
    background: rgba(229,160,13,.06); border: 1px solid rgba(229,160,13,.2);
    border-left: 3px solid #e5a00d; border-radius: 14px;
    backdrop-filter: blur(12px);
}
.de-awards-icon { font-size: 1.3rem; flex-shrink: 0; }
.de-awards-text { font-size: .92rem; color: rgba(255,255,255,.8); line-height: 1.55; }

/* SEASON EXPLORER */
.de-season-list { display: flex; flex-direction: column; gap: 10px; }
.de-season-item {
    background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
    border-radius: 14px; overflow: hidden; transition: border-color .25s;
}
.de-season-item:hover { border-color: rgba(255,255,255,.13); }
.de-season-summary {
    display: flex; align-items: center; gap: 14px; padding: 14px 18px;
    cursor: pointer; list-style: none; user-select: none;
    transition: background .2s;
}
.de-season-summary::-webkit-details-marker { display: none; }
.de-season-summary:hover { background: rgba(255,255,255,.03); }
.de-season-chevron {
    width: 18px; height: 18px; flex-shrink: 0; color: rgba(255,255,255,.35);
    transition: transform .35s cubic-bezier(.34,1.3,.64,1), color .2s;
}
details[open] .de-season-chevron { transform: rotate(90deg); color: #e5a00d; }
.de-season-poster {
    width: 40px; height: 60px; border-radius: 6px; object-fit: cover; flex-shrink: 0;
    background: rgba(255,255,255,.06);
}
.de-season-poster-placeholder { background: linear-gradient(135deg,#1a1a2e,#16213e); }
.de-season-info { flex: 1; min-width: 0; }
.de-season-name { font-size: .95rem; font-weight: 600; color: rgba(255,255,255,.88); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.de-season-meta { font-size: .75rem; color: rgba(255,255,255,.35); margin-top: 3px; }
.de-season-ep-count {
    font-size: .7rem; font-weight: 700; color: rgba(255,255,255,.3);
    background: rgba(255,255,255,.06); padding: 3px 10px; border-radius: 20px;
    white-space: nowrap; flex-shrink: 0;
}
.de-season-episodes { padding: 0 16px 16px; }
.de-ep-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.de-episode-card {
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);
    border-radius: 12px; overflow: hidden;
    transition: border-color .2s, background .2s, transform .3s cubic-bezier(.34,1.2,.64,1);
}
.de-episode-card:hover { border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.07); transform: translateY(-2px); }
.de-episode-still-wrap { position: relative; aspect-ratio: 16/9; background: rgba(0,0,0,.3); }
.de-episode-still { width: 100%; height: 100%; object-fit: cover; display: block; }
.de-episode-num {
    position: absolute; top: 7px; left: 7px;
    background: rgba(0,0,0,.72); color: rgba(255,255,255,.75);
    font-size: .62rem; font-weight: 700; padding: 2px 6px; border-radius: 5px;
    backdrop-filter: blur(6px);
}
.de-episode-body { padding: 10px 12px; }
.de-episode-title {
    font-size: .83rem; font-weight: 600; color: rgba(255,255,255,.82); line-height: 1.35;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.de-episode-air { font-size: .7rem; color: rgba(255,255,255,.3); margin-top: 4px; }
@media (max-width: 900px) { .de-ep-grid { grid-template-columns: 1fr; } .plex-still-card { flex: 0 0 280px; } }

        `;
    document.head.appendChild(style);
  }

  // ─────────────────────────────────────────────
  //  SETTINGS INTEGRATION
  // ─────────────────────────────────────────────
  injectSettingsButton() {
    // Continuous polling guarantees the settings gear injects no matter how long 
    // Stremio takes to render or fetch plugins, entirely bypassing React transition crashes.
    setInterval(() => {
      const hash = window.location.hash.toLowerCase();
      // Match typical Stremio settings routes
      if (hash.includes("settings") || hash.includes("enhanced") || hash.includes("plugins") || hash.includes("addons")) {
        this.injectSettingsToPluginRow();
      }
    }, 1000);
  }

  handleMutation() {
    if (!window.location.hash.toLowerCase().includes("settings")) return;
    this.injectSettingsToPluginRow();
  }

  findPluginCard() {
    // Collect all probable card containers
    const elements = document.querySelectorAll('div, li, section, article');
    
    for (const el of Array.from(elements)) {
      // Reject any massive layout containers (like the whole page body)
      if (el.clientHeight > 400) continue;

      const text = (el.textContent || "").toLowerCase();
      
      // Must contain BOTH the plugin title name AND the exact author name from the screenshot
      if ((text.includes('cinematic title view enhancer') || text.includes('data enrichment')) && 
           text.includes('author: elmarco')) {
         
         // Verify this specific container actively holds a functional toggle, switch, or button
         if (el.querySelector('input, button, [role="switch"], .toggle, svg')) {
             return el; 
         }
      }
    }
    return null;
  }

  injectSettingsToPluginRow() {
    if (document.querySelector(".de-gear-btn")) return;
    const targetRow = this.findPluginCard();
    if (!targetRow) return;

    // Make card a positioning context for the gear
    targetRow.style.position = "relative";

    const gearBtn = document.createElement("div");
    gearBtn.className = "de-gear-btn";
    gearBtn.title = "Configure Cinematic Title View Enhancer";
    gearBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2 2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

    targetRow.appendChild(gearBtn);

    const panel = this.createSettingsPanel();
    targetRow.appendChild(panel);

    gearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.toggle("de-collapsed");
      gearBtn.classList.toggle("active");
    });

    this.injectSettingsStyles();
  }


  createSettingsPanel(forceExpanded = false) {
    const panel = document.createElement("div");
    panel.className = `de-panel-wrapper ${forceExpanded ? "" : "de-collapsed"}`;

    const toggleMap = [
      { key: "enhancedCast", lbl: "Enhanced Cast", icon: "🎭" },
      { key: "showTrailers", lbl: "Trailers & Teasers", icon: "🎬" },
      { key: "showReviews", lbl: "Ratings & Reviews", icon: "⭐️" },
      { key: "similarTitles", lbl: "Similar Titles", icon: "📂" },
      { key: "showCollection", lbl: "Show Collection", icon: "🎞️" },
      { key: "showRatingsOnPosters", lbl: "Ratings on Posters", icon: "🏷️" },
      { key: "showWatchProviders", lbl: "Watch Providers", icon: "📺" },
      { key: "showKeywords", lbl: "Keyword Themes", icon: "🔖" },
      { key: "showPhotoGallery", lbl: "Photo Gallery", icon: "🖼️" },
      { key: "showAwards", lbl: "Awards Badge", icon: "🏆" },
      { key: "showBoxOffice", lbl: "Box Office", icon: "💰" },
      { key: "showSeasonExplorer", lbl: "Season Explorer", icon: "🗂️" },
      { key: "showRecommendations", lbl: "Recommendations", icon: "✨" },
    ];

    const REGIONS = [
      "US",
      "GB",
      "CA",
      "AU",
      "DE",
      "FR",
      "ES",
      "IT",
      "JP",
      "KR",
      "BR",
      "MX",
      "IN",
      "NL",
      "SE",
    ];

    panel.innerHTML = `
            <div class="de-panel-content">
                <div class="de-opt-group">
                    <div class="de-opt-label">
                        <span>TMDB API Key</span>
                        <div class="de-status-dot ${this.config.tmdbApiKey ? "active" : ""}"></div>
                    </div>
                    <div class="de-api-row">
                        <input type="password" class="de-api-input de-tmdb-input" value="${this.config.tmdbApiKey}" placeholder="Paste TMDB API key here...">
                        <button class="de-api-save de-tmdb-save">Save</button>
                    </div>
                </div>

                <div class="de-opt-group">
                    <div class="de-opt-label"><span>OMDb API Key <em style="font-weight:400;color:rgba(255,255,255,.35);text-transform:none;letter-spacing:0">(optional — for Awards)</em></span></div>
                    <div class="de-api-row">
                        <input type="password" class="de-api-input de-omdb-input" value="${this.config.omdbApiKey}" placeholder="Paste free OMDb key (omdbapi.com)...">
                        <button class="de-api-save de-omdb-save">Save</button>
                    </div>
                </div>

                <div class="de-opt-group">
                    <div class="de-opt-label"><span>Watch Provider Region</span></div>
                    <select class="de-region-select">
                        ${REGIONS.map((r) => `<option value="${r}" ${this.config.watchProviderRegion === r ? "selected" : ""}>${r}</option>`).join("")}
                    </select>
                </div>

                <div class="de-toggles-grid">
                    ${toggleMap
                      .map(
                        (opt, i) => `
                        <div class="de-toggle-item" style="--i: ${i}">
                            <div class="de-toggle-info">
                                <span class="de-toggle-icon">${opt.icon}</span>
                                <span class="de-toggle-text">${opt.lbl}</span>
                            </div>
                            <label class="de-switch">
                                <input type="checkbox" class="de-check-${opt.key}" ${this.config[opt.key] ? "checked" : ""}>
                                <span class="de-slider"></span>
                            </label>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
            </div>
        `;

    // TMDB key save
    const tmdbInput = panel.querySelector(".de-tmdb-input");
    const tmdbSave = panel.querySelector(".de-tmdb-save");
    const dot = panel.querySelector(".de-status-dot");
    tmdbSave.addEventListener("click", (e) => {
      e.stopPropagation();
      this.config.tmdbApiKey = tmdbInput.value.trim();
      this.saveConfig();
      this.cache.clear();
      dot.classList.toggle("active", !!this.config.tmdbApiKey);
      tmdbSave.textContent = "Saved!";
      tmdbSave.classList.add("success");
      setTimeout(() => {
        tmdbSave.textContent = "Save";
        tmdbSave.classList.remove("success");
      }, 2000);
    });

    // OMDb key save
    const omdbInput = panel.querySelector(".de-omdb-input");
    const omdbSave = panel.querySelector(".de-omdb-save");
    omdbSave.addEventListener("click", (e) => {
      e.stopPropagation();
      this.config.omdbApiKey = omdbInput.value.trim();
      this.saveConfig();
      this.cache.clear();
      omdbSave.textContent = "Saved!";
      omdbSave.classList.add("success");
      setTimeout(() => {
        omdbSave.textContent = "Save";
        omdbSave.classList.remove("success");
      }, 2000);
    });

    // Region select
    panel.querySelector(".de-region-select").addEventListener("change", (e) => {
      this.config.watchProviderRegion = e.target.value;
      this.saveConfig();
      this.cache.clear();
    });

    toggleMap.forEach((opt) => {
      const cb = panel.querySelector(`.de-check-${opt.key}`);
      cb.addEventListener("change", (e) => {
        this.config[opt.key] = e.target.checked;
        this.saveConfig();
      });
    });

    return panel;
  }

  injectSettingsStyles() {
    if (document.getElementById("de-settings-styles")) return;
    const style = document.createElement("style");
    style.id = "de-settings-styles";
    style.textContent = `
            /* GEAR BUTTON */
            .de-gear-btn {
                width: 30px; height: 30px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; border-radius: 50%;
                /* Match the panel's glass background style */
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(229,160,13,0.35);
                color: #e5a00d;
                /* Same easing used across the plugin */
                transition: background 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                            border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                            box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                            transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                /* Same blur depth as the fallback container */
                backdrop-filter: blur(40px) saturate(1.8);
                z-index: 100; flex-shrink: 0;
                /* JS sets top/right via elementFromPoint measurement */
                /* Positioned precisely next to the native Stremio green toggle */
                position: absolute;
                top: 24px;
                right: 80px;
                /* Glow-only pulse — no transform, only box-shadow changes */
                animation: dePulseGear 3.5s infinite ease-in-out;
            }
            @keyframes dePulseGear {
                0%   { box-shadow: 0 0 6px rgba(229,160,13,0.12), 0 2px 8px rgba(0,0,0,0.3); }
                50%  { box-shadow: 0 0 18px rgba(229,160,13,0.35), 0 2px 8px rgba(0,0,0,0.3); }
                100% { box-shadow: 0 0 6px rgba(229,160,13,0.12), 0 2px 8px rgba(0,0,0,0.3); }
            }
            .de-gear-btn svg {
                width: 16px; height: 16px;
                transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .de-gear-btn:hover {
                background: rgba(229,160,13,0.15);
                border-color: #e5a00d;
                color: #ffb82b;
                box-shadow: 0 0 22px rgba(229,160,13,0.4), 0 2px 12px rgba(0,0,0,0.4);
            }
            .de-gear-btn:hover svg { transform: rotate(180deg) scale(1.1); }
            /* Active: filled amber — pops crisply */
            .de-gear-btn.active {
                background: rgba(229,160,13,0.35);
                border-color: #e5a00d;
                color: #fff;
                box-shadow: 0 0 28px rgba(229,160,13,0.5), 0 0 12px rgba(255,255,255,0.2) inset;
            }
            .de-gear-btn.active svg { transform: rotate(180deg) scale(1.1); }

            /* PANEL WRAPPER */
            .de-panel-wrapper { 
                width: 100%; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                overflow: hidden; max-height: 800px; opacity: 1; margin-top: 15px;
            }
            .de-panel-wrapper.de-collapsed { max-height: 0; opacity: 0; margin-top: 0; pointer-events: none; }



            /* COMMON CONTENT */
            .de-panel-content {
                background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
                border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 24px;
            }
            .de-opt-group { margin-bottom: 5px; }
            .de-opt-label { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; }

            .de-api-row { display: flex; gap: 12px; margin-top: 10px; }
            .de-api-input {
                flex: 1; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);
                color: #fff; padding: 12px 16px; border-radius: 10px; font-size: 14px; outline: none; transition: all 0.3s;
            }
            .de-api-input:focus { border-color: #e5a00d; background: rgba(0,0,0,0.5); box-shadow: 0 0 0 3px rgba(229,160,13,0.1); }
            .de-api-save {
                background: #e5a00d; color: #000; border: none; padding: 0 24px;
                border-radius: 10px; font-weight: 700; cursor: pointer; transition: all 0.3s;
            }
            .de-api-save:hover { transform: translateY(-1px); box-shadow: 0 5px 15px rgba(229,160,13,0.3); }
            .de-api-save.success { background: #32d74b; color: #fff; }

            .de-region-select {
                background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.1);
                color: #fff; padding: 10px 14px; border-radius: 10px; font-size: 14px;
                outline: none; transition: all 0.3s; cursor: pointer;
                margin-top: 8px; width: 100%;
            }
            .de-region-select:focus { border-color: #e5a00d; box-shadow: 0 0 0 3px rgba(229,160,13,.1); }
            .de-region-select option { background: #1a1a2a; color: #fff; }

            .de-toggles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
            .de-toggle-item {
                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.05);
                border-radius: 12px; padding: 15px; display: flex; align-items: center; justify-content: space-between;
                animation: deFadeUp 0.5s ease forwards; animation-delay: calc(var(--i) * 0.05s); opacity: 0;
            }
            @keyframes deFadeUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
            
            .de-status-dot { width: 8px; height: 8px; border-radius: 50%; background: #ff4444; box-shadow: 0 0 10px rgba(255,68,68,0.5); }
            .de-status-dot.active { background: #00ff88; box-shadow: 0 0 10px rgba(0,255,136,0.5); }
            
            .de-toggle-info { display: flex; align-items: center; gap: 12px; }
            .de-toggle-icon { font-size: 18px; filter: drop-shadow(0 0 5px rgba(255,255,255,0.2)); }
            .de-toggle-text { font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.9); }

            /* SWITCH */
            .de-switch { position: relative; width: 44px; height: 24px; }
            .de-switch input { opacity: 0; width: 0; height: 0; }
            .de-slider { position: absolute; cursor: pointer; inset: 0; background: rgba(255,255,255,0.1); border-radius: 24px; transition: .4s; }
            .de-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .4s; }
            .de-switch input:checked + .de-slider { background: #e5a00d; }
            .de-switch input:checked + .de-slider:before { transform: translateX(20px); }
        `;
    document.head.appendChild(style);
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
    if (this.settingsObserver) this.settingsObserver.disconnect();
  }
}
  let _deInstance = null;

  function initDataEnrichment() {
    if (_deInstance) return;
    _deInstance = new DataEnrichment();
  }

  function teardownDataEnrichment() {
    if (_deInstance) {
      _deInstance.cleanup && _deInstance.cleanup();
      _deInstance = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ── MODULE: DISCOVER PAGE ──────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  // CSS prefix: cs-disc-
  // Activates on #/discover/* and #/browse/*

  let _discObs = null;
  let _discActive = false;

  function initDiscover() {
    if (_discActive) return;
    _discActive = true;
    _injectDiscoverSkin();
  }

  function teardownDiscover() {
    if (!_discActive) return;
    _discActive = false;
    if (_discObs) { _discObs.disconnect(); _discObs = null; }
    document.getElementById('cs-disc-pills')?.remove();
    document.querySelectorAll('.cs-disc-card-skin').forEach(el => el.remove());
  }

  function _injectDiscoverSkin() {
    if (!document.getElementById('cs-disc-styles')) {
      const s = document.createElement('style');
      s.id = 'cs-disc-styles';
      s.textContent = `
        .cs-disc-pill-bar { display:flex; gap:8px; padding:10px 24px; flex-wrap:wrap; z-index:20; position:sticky; top:0; background:rgba(8,8,14,.88); backdrop-filter:blur(20px); border-bottom:1px solid rgba(255,255,255,.06); }
        .cs-disc-pill { padding:5px 16px; border-radius:var(--ct-r-full,30px); font-size:.75rem; font-weight:700; cursor:pointer; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.06); color:rgba(255,255,255,.6); letter-spacing:.3px; transition:all .2s; }
        .cs-disc-pill:hover { background:rgba(255,255,255,.12); color:#fff; }
        .cs-disc-pill.active { background:var(--ct-accent-soft,rgba(229,160,13,.14)); border-color:var(--ct-accent-dim,rgba(229,160,13,.3)); color:var(--ct-accent,#e5a00d); }
        .cs-disc-card-skin { position:absolute; inset:0; border-radius:inherit; pointer-events:none; background:linear-gradient(to top,rgba(0,0,0,.8) 0%,transparent 55%); z-index:2; }
        [class*="meta-item"]:hover .cs-disc-card-skin, [class*="poster"]:hover .cs-disc-card-skin { opacity:.7; }
      `;
      document.head.appendChild(s);
    }

    // Wait for native grid then inject pill bar + card skins
    const waitAndInject = () => {
      const grid = document.querySelector('[class*="catalog-container"],[class*="discover"],[class*="meta-preview-container"]');
      if (!grid) return setTimeout(waitAndInject, 400);

      // Pill filter bar
      if (!document.getElementById('cs-disc-pills')) {
        const bar = document.createElement('div');
        bar.id = 'cs-disc-pills';
        bar.className = 'cs-disc-pill-bar';
        const genres = ['All','Action','Drama','Sci-Fi','Comedy','Horror','Thriller','Romance','Animation','Documentary'];
        bar.innerHTML = genres.map((g,i) => `<div class="cs-disc-pill${i===0?' active':''}" data-genre="${g}">${g}</div>`).join('');
        bar.querySelectorAll('.cs-disc-pill').forEach(pill => {
          pill.addEventListener('click', () => {
            bar.querySelectorAll('.cs-disc-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
          });
        });
        grid.parentElement?.insertBefore(bar, grid);
      }

      // Observe for new cards
      _discObs = new MutationObserver(() => _skinDiscoverCards());
      _discObs.observe(document.body, { childList:true, subtree:true });
      _skinDiscoverCards();
    };
    waitAndInject();
  }

  function _skinDiscoverCards() {
    document.querySelectorAll('[class*="meta-item"],[class*="poster-container"]').forEach(card => {
      if (card.querySelector('.cs-disc-card-skin')) return;
      card.style.position = 'relative';
      const skin = document.createElement('div');
      skin.className = 'cs-disc-card-skin';
      card.appendChild(skin);
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // ── MODULE: LIBRARY PAGE ───────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  // CSS prefix: cs-lib-
  // Activates on #/library

  let _libActive = false;
  let _libObs = null;

  function initLibrary() {
    if (_libActive) return;
    _libActive = true;
    _injectLibrarySkin();
  }

  function teardownLibrary() {
    if (!_libActive) return;
    _libActive = false;
    if (_libObs) { _libObs.disconnect(); _libObs = null; }
    document.querySelectorAll('.cs-lib-badge,.cs-lib-ring,.cs-lib-tabs').forEach(el => el.remove());
  }

  function _injectLibrarySkin() {
    if (!document.getElementById('cs-lib-styles')) {
      const s = document.createElement('style');
      s.id = 'cs-lib-styles';
      s.textContent = `
        .cs-lib-tabs { display:flex; gap:8px; padding:12px 24px; border-bottom:1px solid rgba(255,255,255,.07); flex-wrap:wrap; }
        .cs-lib-tab { padding:6px 18px; border-radius:var(--ct-r-full,30px); font-size:.75rem; font-weight:700; cursor:pointer; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.05); color:rgba(255,255,255,.55); transition:all .2s; }
        .cs-lib-tab.active { background:var(--ct-accent-soft,rgba(229,160,13,.14)); border-color:var(--ct-accent-dim,rgba(229,160,13,.3)); color:var(--ct-accent,#e5a00d); }
        .cs-lib-badge { position:absolute; top:5px; left:5px; z-index:10; font-size:.6rem; font-weight:800; letter-spacing:.4px; padding:2px 7px; border-radius:8px; pointer-events:none; }
        .cs-lib-badge-watching  { background:rgba(229,160,13,.85); color:#000; }
        .cs-lib-badge-plan      { background:rgba(96,165,250,.85); color:#000; }
        .cs-lib-badge-completed { background:rgba(74,222,128,.85); color:#000; }
        .cs-lib-badge-dropped   { background:rgba(248,113,113,.85); color:#fff; }
        .cs-lib-ring { position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:3; }
        svg.cs-lib-ring-svg { position:absolute; top:4px; right:4px; width:32px; height:32px; transform:rotate(-90deg); }
      `;
      document.head.appendChild(s);
    }

    const waitAndApply = () => {
      const container = document.querySelector('[class*="library"],[class*="catalog-container"]');
      if (!container) return setTimeout(waitAndApply, 400);

      // Section tabs from wlnm data
      if (!document.querySelector('.cs-lib-tabs')) {
        const tabs = document.createElement('div');
        tabs.className = 'cs-lib-tabs';
        const store = wlnm_loadStore();
        const statusCounts = {};
        Object.values(store).forEach(v => { statusCounts[v.status] = (statusCounts[v.status]||0)+1; });
        const tabDefs = [
          {key:'all',label:'All ('+Object.keys(store).length+')'},
          {key:'watching',label:'Watching'+(statusCounts.watching?` (${statusCounts.watching})`:'')},
          {key:'plan',label:'Plan to Watch'+(statusCounts.plan?` (${statusCounts.plan})`:'')},
          {key:'completed',label:'Completed'+(statusCounts.completed?` (${statusCounts.completed})`:'')},
          {key:'dropped',label:'Dropped'+(statusCounts.dropped?` (${statusCounts.dropped})`:'')},
        ];
        tabs.innerHTML = tabDefs.map((t,i)=>`<div class="cs-lib-tab${i===0?' active':''}" data-status="${t.key}">${t.label}</div>`).join('');
        tabs.querySelectorAll('.cs-lib-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            tabs.querySelectorAll('.cs-lib-tab').forEach(t=>t.classList.remove('active'));
            tab.classList.add('active');
          });
        });
        container.parentElement?.insertBefore(tabs, container);
      }

      // Status badge overlays on cards
      _libObs = new MutationObserver(() => _applyLibraryBadges());
      _libObs.observe(document.body, { childList:true, subtree:true });
      _applyLibraryBadges();
    };
    waitAndApply();
  }

  function _applyLibraryBadges() {
    const store = wlnm_loadStore();
    document.querySelectorAll('[class*="meta-item"],[class*="poster-container"],[class*="library-item"]').forEach(card => {
      if (card.querySelector('.cs-lib-badge')) return;
      const link = card.querySelector('a[href*="/detail/"]') || card.closest('a[href*="/detail/"]');
      if (!link) return;
      const m = (link.href||'').match(/\/detail\/[^/]+\/(tt\d+)/);
      if (!m) return;
      const entry = store[m[1]];
      if (!entry || entry.status === 'none') return;
      card.style.position = 'relative';
      const badge = document.createElement('div');
      badge.className = 'cs-lib-badge cs-lib-badge-'+entry.status;
      const labels = {watching:'▶ Watching',plan:'🕐 Plan',completed:'✓ Done',dropped:'✕ Dropped',rewatch:'↺ Rewatch'};
      badge.textContent = labels[entry.status] || entry.status;
      card.appendChild(badge);
      // Progress ring for watching items
      if (entry.status === 'watching' && entry.progress > 0) {
        const c = 75.4, off = c - (c * entry.progress);
        const ring = document.createElementNS('http://www.w3.org/2000/svg','svg');
        ring.setAttribute('class','cs-lib-ring-svg');
        ring.setAttribute('viewBox','0 0 32 32');
        ring.innerHTML = '<circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="3"/><circle cx="16" cy="16" r="12" fill="none" stroke="var(--ct-accent,#e5a00d)" stroke-width="3" stroke-dasharray="75.4" stroke-dashoffset="'+off+'" stroke-linecap="round"/>';
        card.appendChild(ring);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // ── MODULE: CALENDAR PAGE ──────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  // CSS prefix: cs-cal-
  // Activates on #/calendar

  let _calActive = false;

  function initCalendar() {
    if (_calActive) return;
    _calActive = true;
    _injectCalendarSkin();
  }

  function teardownCalendar() {
    if (!_calActive) return;
    _calActive = false;
    document.getElementById('cs-cal-styles')?.remove();
    document.querySelectorAll('.cs-cal-dot,.cs-cal-day-expand').forEach(el => el.remove());
  }

  function _injectCalendarSkin() {
    if (!document.getElementById('cs-cal-styles')) {
      const s = document.createElement('style');
      s.id = 'cs-cal-styles';
      s.textContent = `
        [class*="calendar"] { font-family:var(--ct-font-body,'DM Sans',sans-serif) !important; }
        [class*="calendar-day"] { transition:all .25s var(--ct-ease-spring,cubic-bezier(.34,1.3,.64,1)); cursor:pointer; border-radius:var(--ct-r-md,12px); }
        [class*="calendar-day"]:hover { background:rgba(255,255,255,.07) !important; transform:scale(1.04); }
        [class*="calendar-day"].cs-cal-has-release { border-bottom:2px solid var(--ct-accent,#e5a00d); }
        .cs-cal-dot { width:6px; height:6px; border-radius:50%; background:var(--ct-accent,#e5a00d); box-shadow:0 0 6px var(--ct-accent-glow,rgba(229,160,13,.4)); display:inline-block; margin:0 1px; animation:ct-dna-pulse 2s infinite ease-in-out; }
        .cs-cal-day-expand { position:absolute; left:50%; transform:translateX(-50%); top:100%; z-index:50; min-width:160px; padding:10px 14px; border-radius:var(--ct-r-md,12px); background:rgba(14,14,22,.97); border:1px solid rgba(255,255,255,.1); box-shadow:0 12px 32px rgba(0,0,0,.6); font-size:.75rem; color:rgba(255,255,255,.8); pointer-events:none; animation:ct-fade-up .25s ease both; }
        [class*="calendar-header"] h1,[class*="calendar-header"] h2 { font-family:var(--ct-font-display,'DM Serif Display',serif) !important; }
      `;
      document.head.appendChild(s);
    }

    // Observe calendar grid for release date cells
    const waitAndMark = () => {
      const cal = document.querySelector('[class*="calendar"]');
      if (!cal) return setTimeout(waitAndMark, 500);
      _markCalendarDates(cal);
      new MutationObserver(() => _markCalendarDates(cal)).observe(cal, { childList:true, subtree:true });
    };
    waitAndMark();
  }

  function _markCalendarDates(cal) {
    // Mark days that have content releases with an accent dot
    cal.querySelectorAll('[class*="calendar-day"]').forEach(day => {
      const hasContent = day.querySelector('[class*="episode"],[class*="movie"],[class*="release"]');
      if (hasContent && !day.querySelector('.cs-cal-dot')) {
        const dot = document.createElement('span');
        dot.className = 'cs-cal-dot';
        day.appendChild(dot);
        day.classList.add('cs-cal-has-release');
        day.style.position = 'relative';
        // Hover expand
        day.addEventListener('mouseenter', () => {
          let exp = day.querySelector('.cs-cal-day-expand');
          if (!exp) {
            exp = document.createElement('div');
            exp.className = 'cs-cal-day-expand';
            exp.textContent = hasContent.textContent?.trim() || 'Release';
            day.appendChild(exp);
          }
        });
        day.addEventListener('mouseleave', () => {
          day.querySelector('.cs-cal-day-expand')?.remove();
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // ── ROUTER ─────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

  function dispatch(hash) {
    const h = hash || '';
    const isHome     = h==='' || h==='#/' || h==='#' || /^#\/(board|index)/.test(h);
    const isDetail   = /^#\/detail/.test(h);
    const isDiscover = /^#\/(discover|browse|search)/.test(h);
    const isLibrary  = /^#\/library/.test(h);
    const isCalendar = /^#\/calendar/.test(h);

    // Theme runs on all routes
    ct_onRouteChange(h);

    if (isHome)     initHome();     else teardownHome();
    if (isDetail)   { initDataEnrichment(); initStreamBrowser(); }
    else            { teardownDataEnrichment(); teardownStreamBrowser(); }
    if (isDiscover) initDiscover(); else teardownDiscover();
    if (isLibrary)  initLibrary();  else teardownLibrary();
    if (isCalendar) initCalendar(); else teardownCalendar();
  }

  window.addEventListener('hashchange', () => dispatch(location.hash));
  window.addEventListener('popstate',   () => dispatch(location.hash));

  // ── BOOT ────────────────────────────────────────────────────────────
  async function boot() {
    // Theme first (global CSS + effects for all routes)
    await initTheme();

    // Home page CSS (injected once, used when home is active)
    const tier = ct_perfTier || 'high';
    injectHomeCSS(tier);

    // Home helpers init once
    if (!_homeInstance) _homeInstance = new CinematicHome();

    // Stream browser CSS
    injectStreamCSS();

    // Initial route dispatch
    dispatch(location.hash);

    console.log('%c[CinematicSuite] v2.0 fully loaded','color:#e5a00d;font-weight:bold');
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);

})();
