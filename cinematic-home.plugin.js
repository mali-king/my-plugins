/**
 * @name Cinematic Home Page
 * @description A next-level, industry-leading homepage transformation for Stremio Enhanced.
 *   Features: cinematic hero with ambient color system, rebuilt Continue Watching,
 *   personalized catalog rows, momentum scrolling, 3D poster tilt, search overlay,
 *   watchlist page, What to Watch Tonight, taste profile, notifications, video previews,
 *   film grain, particles, custom cursor, magnetic buttons, and a full settings panel.
 * @version 1.4.2
 * @author elmarco
 *
 * @copyright 2026 elmarco. All rights reserved.
 */

(function () {
  'use strict';

  // ─── GUARDS ───────────────────────────────────────────────────────────────
  const STYLE_ID = 'chp-styles';
  const ROOT_ID = 'chp-root';
  const AMBIENT_ID = 'chp-ambient';
  const GRAIN_ID = 'chp-grain';
  const CURSOR_ID = 'chp-cursor';
  const VIGNETTE_ID = 'chp-vignette';
  const MINIBAR_ID = 'chp-minibar';
  const SEARCH_ID = 'chp-search';
  const WATCHLIST_ID = 'chp-watchlist-overlay';
  const WTWT_ID = 'chp-wtwt';
  const CTX_ID = 'chp-ctx';
  const FONT_ID = 'chp-font';
  const CACHE_TTL = 600_000;   // 10 min
  const HERO_INTERVAL = 9000;

  // ─── FALLBACK TITLES ──────────────────────────────────────────────────────
  const FALLBACKS = [
    { id: 'tt0903747', title: 'Breaking Bad', type: 'series', year: '2008', rating: '9.5' },
    { id: 'tt1375666', title: 'Inception', type: 'movie', year: '2010', rating: '8.8' },
    { id: 'tt0468569', title: 'The Dark Knight', type: 'movie', year: '2008', rating: '9.0' },
    { id: 'tt5491994', title: 'Planet Earth II', type: 'series', year: '2016', rating: '9.5' },
    { id: 'tt0816692', title: 'Interstellar', type: 'movie', year: '2014', rating: '8.7' },
  ];

  // ─── GENRE COLOR MAP ──────────────────────────────────────────────────────
  const GENRE_COLORS = {
    'Action': { r: 239, g: 68, b: 68 },
    'Adventure': { r: 251, g: 146, b: 60 },
    'Animation': { r: 250, g: 204, b: 21 },
    'Comedy': { r: 74, g: 222, b: 128 },
    'Crime': { r: 248, g: 113, b: 113 },
    'Drama': { r: 229, g: 160, b: 13 },
    'Fantasy': { r: 192, g: 132, b: 252 },
    'Horror': { r: 185, g: 28, b: 28 },
    'Mystery': { r: 99, g: 102, b: 241 },
    'Romance': { r: 244, g: 114, b: 182 },
    'Sci-Fi': { r: 147, g: 197, b: 253 },
    'Thriller': { r: 156, g: 163, b: 175 },
    'Western': { r: 217, g: 119, b: 6 },
    'default': { r: 229, g: 160, b: 13 },
  };

  // ─── WLNM STORE (from data-enrichment) ───────────────────────────────────
  const WLNM_KEY = 'wlnm-data';
  function wlnmLoad() { try { return JSON.parse(localStorage.getItem(WLNM_KEY) || '{}'); } catch { return {}; } }
  function wlnmGet(id) { const s = wlnmLoad(); return s[id] || null; }
  function wlnmSet(id, patch) {
    const s = wlnmLoad();
    s[id] = { ...(s[id] || { status: 'none', rating: 0, notes: '', addedAt: null }), ...patch };
    if (patch.status && patch.status !== 'none' && !s[id].addedAt) s[id].addedAt = new Date().toISOString();
    if (patch.status === 'none') delete s[id];
    try { localStorage.setItem(WLNM_KEY, JSON.stringify(s)); } catch { }
  }

  // ─── LS HELPERS ───────────────────────────────────────────────────────────
  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch { } }
  function lsGetJSON(k, def) { try { return JSON.parse(lsGet(k)) || def; } catch { return def; } }
  function lsSetJSON(k, v) { try { lsSet(k, JSON.stringify(v)); } catch { } }

  // ─── FETCH WITH TIMEOUT ───────────────────────────────────────────────────
  async function fetchT(url, ms = 6000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(id);
      return r.ok ? r.json() : null;
    } catch { clearTimeout(id); return null; }
  }

  // ─── PRELOAD IMAGE ────────────────────────────────────────────────────────
  function preloadImg(url) {
    return new Promise(res => {
      if (!url) return res(false);
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = url;
    });
  }

  // ─── COLOR EXTRACTION ─────────────────────────────────────────────────────
  function extractColors(imgUrl) {
    return new Promise(res => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 8; c.height = 8;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, 8, 8);
          const d = ctx.getImageData(0, 0, 8, 8).data;
          const pixels = [];
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            const lum = (max + min) / 2;
            if (sat > 0.2 && lum > 30 && lum < 220) pixels.push({ r, g, b, sat });
          }
          pixels.sort((a, b) => b.sat - a.sat);
          const top = pixels.slice(0, 3);
          if (!top.length) return res([{ r: 229, g: 160, b: 13 }, { r: 255, g: 107, b: 53 }, { r: 20, g: 20, b: 30 }]);
          while (top.length < 3) top.push(top[0]);
          res(top.map(p => ({ r: p.r, g: p.g, b: p.b })));
        } catch { res([{ r: 229, g: 160, b: 13 }, { r: 80, g: 80, b: 120 }, { r: 20, g: 20, b: 30 }]); }
      };
      img.onerror = () => res([{ r: 229, g: 160, b: 13 }, { r: 80, g: 80, b: 120 }, { r: 20, g: 20, b: 30 }]);
      img.src = imgUrl;
    });
  }

  // ─── DOMINANT COLOR BLUR PLACEHOLDER ─────────────────────────────────────
  function colorBlurPlaceholder(r, g, b) {
    return `linear-gradient(135deg, rgba(${r},${g},${b},.35) 0%, rgba(${Math.floor(r * .6)},${Math.floor(g * .6)},${Math.floor(b * .6)},.2) 100%)`;
  }

  // ─── TIME OF DAY ──────────────────────────────────────────────────────────
  function getTimeContext() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return { label: 'Good morning', tempMod: 0.9, satMod: 0.85 };
    if (h >= 12 && h < 17) return { label: 'Good afternoon', tempMod: 1.0, satMod: 1.0 };
    if (h >= 17 && h < 21) return { label: 'Good evening', tempMod: 1.1, satMod: 1.1 };
    return { label: 'Late night', tempMod: 0.6, satMod: 0.7 };
  }

  // ─── SEASON CONTEXT ───────────────────────────────────────────────────────
  function getSeasonMod() {
    const m = new Date().getMonth();
    if (m === 9) return { rMod: 1.4, gMod: 0.7, bMod: 0.7 }; // October — dark reds
    if (m === 10) return { rMod: 1.2, gMod: 0.8, bMod: 0.8 }; // November
    if (m === 11) return { rMod: 0.9, gMod: 0.9, bMod: 1.3 }; // December — silver/cool
    if (m >= 5 && m <= 7) return { rMod: 1.1, gMod: 1.05, bMod: 0.9 }; // Summer — warm
    return { rMod: 1.0, gMod: 1.0, bMod: 1.0 };
  }

  // ─── LERP ─────────────────────────────────────────────────────────────────
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ─── FORMAT RUNTIME ───────────────────────────────────────────────────────
  function fmtRuntime(mins) {
    if (!mins) return '';
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // ─── GREETING ─────────────────────────────────────────────────────────────
  function buildGreeting(cwTitles) {
    const ctx = getTimeContext();
    if (!cwTitles.length) return `${ctx.label} — start something great tonight`;
    const t = cwTitles[0];
    if (t.progress > 0.85) return `${ctx.label} — you're almost done with ${t.title}`;
    if (t.progress > 0) return `${ctx.label} — ${t.title} is waiting for you`;
    return `${ctx.label} — ${cwTitles.length} title${cwTitles.length > 1 ? 's' : ''} in your list`;
  }

  // ─── IMDB URL → HASH ──────────────────────────────────────────────────────
  function navToTitle(imdbId, type) {
    const t = (type === 'movie' || type === 'movie') ? 'movie' : 'series';
    window.location.hash = `#/detail/${t}/${imdbId}`;
  }

  // ─── PERFORMANCE TIER ─────────────────────────────────────────────────────
  function measurePerf() {
    return new Promise(res => {
      let frames = 0, last = performance.now();
      const tick = () => {
        frames++;
        const now = performance.now();
        if (now - last >= 500) {
          const fps = Math.round(frames / ((now - last) / 1000));
          res(fps >= 50 ? 'high' : fps >= 30 ? 'mid' : 'low');
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // ─── REDUCED MOTION ───────────────────────────────────────────────────────
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ═══════════════════════════════════════════════════════════════════════════
  //  CSS
  // ═══════════════════════════════════════════════════════════════════════════
  function injectCSS(perfTier) {
    if (document.getElementById(STYLE_ID)) return;

    if (!document.getElementById(FONT_ID)) {
      const l = document.createElement('link');
      l.id = FONT_ID; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400&family=DM+Serif+Display:ital@0;1&display=swap';
      document.head.appendChild(l);
    }

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
@keyframes chp-wtwt-poster-spring {
  0%   { opacity: 0; transform: translateX(-48px) scale(.92); }
  60%  { opacity: 1; transform: translateX(6px) scale(1.01); }
  80%  { transform: translateX(-2px) scale(1); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes chp-wtwt-ring-fill {
  from { --ring-deg: 0deg; }
}
@keyframes chp-wtwt-spinner {
  to { transform: rotate(360deg); }
}
@keyframes chp-wtwt-vibe-glow {
  0%,100% { box-shadow: 0 0 6px var(--vibe-color, rgba(229,160,13,.15)); }
  50%     { box-shadow: 0 0 14px var(--vibe-color, rgba(229,160,13,.35)); }
}
@keyframes chp-wtwt-content-in {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
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
  background: rgba(8,8,14,.92);
  overflow: hidden;
}
.chp-wtwt-bg-img {
  position: absolute; inset: -20px; width: calc(100% + 40px); height: calc(100% + 40px);
  background-size: cover; background-position: center;
  filter: blur(40px) brightness(.45) saturate(1.4);
  transition: ${prefersReducedMotion ? 'none' : 'background-image .8s ease, opacity .8s ease'};
  opacity: 0;
}
.chp-wtwt-bg-img.chp-visible { opacity: 1; }
.chp-wtwt-bg::after {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, rgba(8,8,14,.3) 0%, rgba(8,8,14,.85) 100%);
  pointer-events: none;
}
.chp-wtwt-shell {
  position: relative; z-index: 1;
  width: 100%; max-width: 1700px;
  max-height: 190vh;
  padding: 0;
  animation: ${prefersReducedMotion ? 'none' : 'chp-overlay-in .5s cubic-bezier(.34,1.3,.64,1) both'};
  overflow-y: auto;
  scrollbar-width: none;
}
.chp-wtwt-shell::-webkit-scrollbar { display: none; }

/* ── MOOD PICKER ── */
.chp-wtwt-mood-wrap {
  display: flex; flex-direction: column; align-items: center;
  padding: 40px 20px;
}
.chp-wtwt-mood-title {
  font-family: 'DM Serif Display', serif;
  font-size: 2rem; color: #fff; text-align: center;
  margin-bottom: 10px; letter-spacing: -.3px;
}
.chp-wtwt-mood-subtitle {
  font-size: .88rem; color: rgba(255,255,255,.38);
  margin-bottom: 40px; text-align: center;
}
.chp-wtwt-mood-grid {
  display: grid; grid-template-columns: repeat(5, 1fr);
  gap: 14px; width: 100%;
}
.chp-wtwt-mood-btn {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 24px 12px; border-radius: 18px;
  border: 1px solid rgba(255,255,255,.09);
  background: rgba(255,255,255,.04);
  cursor: pointer; color: rgba(255,255,255,.7);
  font-family: 'DM Sans', sans-serif;
  transition: ${prefersReducedMotion ? 'none' : 'all .3s cubic-bezier(.34,1.3,.64,1)'};
}
.chp-wtwt-mood-btn:hover {
  background: rgba(229,160,13,.1); border-color: rgba(229,160,13,.3);
  transform: translateY(-4px);
  color: #fff;
}
.chp-wtwt-mood-btn.selected {
  background: rgba(229,160,13,.18); border-color: rgba(229,160,13,.5);
  transform: translateY(-4px) scale(1.04);
}
.chp-wtwt-mood-icon { font-size: 1.8rem; }
.chp-wtwt-mood-label {
  font-size: .82rem; font-weight: 700; color: inherit;
}
.chp-wtwt-mood-desc {
  font-size: .65rem; color: rgba(255,255,255,.3);
  text-align: center; line-height: 1.4;
}

/* ── RECOMMENDATION CARD ── */
.chp-wtwt-card-layout {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 0; border-radius: 24px; overflow: hidden;
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 40px 100px rgba(0,0,0,.8);
  min-height: 650px;
  animation: ${prefersReducedMotion ? 'none' : 'chp-wtwt-content-in .5s cubic-bezier(.22,1,.36,1) both'};
}
.chp-wtwt-card-backdrop-wrap {
  position: relative; overflow: hidden;
}
.chp-wtwt-card-backdrop {
  width: 100%; height: 100%; object-fit: cover;
  display: block; filter: brightness(.85);
  transition: ${prefersReducedMotion ? 'none' : 'transform .6s ease'};
  animation: ${prefersReducedMotion ? 'none' : 'chp-wtwt-poster-spring .7s cubic-bezier(.34,1.3,.64,1) both'};
}
.chp-wtwt-card-layout:hover .chp-wtwt-card-backdrop { transform: scale(1.04); }
.chp-wtwt-card-backdrop-grad {
  position: absolute; inset: 0;
  background: linear-gradient(to right, transparent 55%, rgba(12,12,20,1) 100%),
              linear-gradient(to top, rgba(12,12,20,.6) 0%, transparent 35%);
}
.chp-wtwt-card-content {
  background: rgba(12,12,20,.98);
  padding: 32px 36px 28px;
  display: flex; flex-direction: column; justify-content: space-between; gap: 0;
  animation: ${prefersReducedMotion ? 'none' : 'chp-wtwt-content-in .6s cubic-bezier(.22,1,.36,1) .15s both'};
}
.chp-wtwt-card-logo {
  max-height: 88px; max-width: 280px;
  object-fit: contain; object-position: left;
  filter: drop-shadow(0 4px 20px rgba(0,0,0,.7));
  display: block;
}
.chp-wtwt-card-reason {
  font-size: .88rem; color: rgba(255,255,255,.62);
  font-style: italic; font-family: 'DM Serif Display', serif;
  line-height: 1.6;
  padding: 12px 16px;
  background: rgba(229,160,13,.07);
  border-left: 2px solid rgba(229,160,13,.45);
  border-radius: 0 8px 8px 0;
  margin: 14px 0 4px;
}
.chp-wtwt-card-meta {
  display: flex; gap: 6px; flex-wrap: wrap;
  margin: 8px 0 0;
}
.chp-wtwt-card-desc {
  font-size: .92rem; color: rgba(255,255,255,.68); line-height: 1.7;
  display: -webkit-box; -webkit-line-clamp: 5;
  -webkit-box-orient: vertical; overflow: hidden;
  margin: 10px 0 4px;
}
.chp-wtwt-card-actions {
  display: flex; gap: 10px; flex-wrap: wrap;
  margin-top: 18px;
}
.chp-wtwt-counter {
  font-size: .72rem; color: rgba(255,255,255,.28);
  margin-top: 10px; letter-spacing: .4px;
}
.chp-wtwt-eyebrow {
  font-size: .68rem; font-weight: 700; letter-spacing: 1.4px;
  text-transform: uppercase; color: rgba(229,160,13,.7);
  margin-bottom: 10px;
}
.chp-wtwt-logo-wrap { display: flex; flex-direction: column; gap: 0; }
.chp-wtwt-card-title-text {
  font-family: 'DM Serif Display', serif;
  font-size: 2.4rem; font-weight: 400; color: #fff;
  letter-spacing: -.5px; line-height: 1.1;
  text-shadow: 0 4px 24px rgba(0,0,0,.6);
}
.chp-btn-disabled {
  opacity: .35 !important; pointer-events: none !important; cursor: default !important;
}
.chp-wtwt-dismiss-btn {
  background: rgba(248,113,113,.08) !important;
  border-color: rgba(248,113,113,.2) !important;
  color: rgba(248,113,113,.7) !important;
  font-size: .8rem !important; padding: 8px 14px !important;
}
.chp-wtwt-dismiss-btn:hover {
  background: rgba(248,113,113,.15) !important;
  border-color: rgba(248,113,113,.35) !important;
  color: #f87171 !important;
}
.chp-wtwt-close-btn {
  position: absolute; top: 20px; right: 20px;
  width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05);
  color: rgba(255,255,255,.5); cursor: pointer; font-size: .8rem;
  display: flex; align-items: center; justify-content: center;
  transition: ${prefersReducedMotion ? 'none' : 'all .25s'};
  z-index: 10;
}
.chp-wtwt-close-btn:hover { background: rgba(248,113,113,.15); color: #f87171; }
.chp-wtwt-loading {
  color: rgba(255,255,255,.3); font-size: .88rem;
  padding: 80px 0; text-align: center;
}

/* ── WTWT MID SECTION ── */
.chp-wtwt-mid {
  display: flex; flex-direction: column; gap: 14px;
  padding: 6px 0;
}
.chp-wtwt-match-row {
  display: flex; align-items: center; gap: 16px;
}
.chp-wtwt-match-ring {
  width: 64px; height: 64px; border-radius: 50%; flex-shrink: 0;
  background: conic-gradient(#e5a00d var(--ring-deg, 0deg), rgba(255,255,255,.07) var(--ring-deg, 0deg));
  display: flex; align-items: center; justify-content: center;
  position: relative;
  box-shadow: 0 0 22px rgba(229,160,13,.18);
  transition: ${prefersReducedMotion ? 'none' : 'box-shadow .6s ease'};
}
.chp-wtwt-match-ring.chp-animating {
  box-shadow: 0 0 28px rgba(229,160,13,.35);
}
.chp-wtwt-match-ring::before {
  content: ''; position: absolute; inset: 6px;
  border-radius: 50%; background: rgba(12,12,20,.95);
}
.chp-wtwt-match-num {
  position: relative; z-index: 1;
  font-size: .82rem; font-weight: 800; color: #e5a00d;
  font-variant-numeric: tabular-nums;
}
.chp-wtwt-match-info { flex: 1; min-width: 0; }
.chp-wtwt-match-label {
  font-size: .78rem; font-weight: 700; color: rgba(255,255,255,.75);
  margin-bottom: 3px;
}
.chp-wtwt-match-sub {
  font-size: .67rem; color: rgba(255,255,255,.32); letter-spacing: .2px;
}
.chp-wtwt-award-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: 20px; flex-shrink: 0;
  background: rgba(229,160,13,.1); border: 1px solid rgba(229,160,13,.25);
  font-size: .68rem; font-weight: 700; color: rgba(229,160,13,.8);
  letter-spacing: .3px; white-space: nowrap;
}
.chp-wtwt-vibes { display: flex; gap: 7px; flex-wrap: wrap; }
.chp-wtwt-vibe-tag {
  padding: 4px 12px; border-radius: 20px;
  font-size: .68rem; font-weight: 600; letter-spacing: .3px;
  background: rgba(var(--ambient-r,229), var(--ambient-g,160), var(--ambient-b,13), .08);
  border: 1px solid rgba(var(--ambient-r,229), var(--ambient-g,160), var(--ambient-b,13), .2);
  color: rgba(var(--ambient-r,229), var(--ambient-g,160), var(--ambient-b,13), .85);
  --vibe-color: rgba(var(--ambient-r,229), var(--ambient-g,160), var(--ambient-b,13), .25);
  transition: all .2s ease;
  animation: ${prefersReducedMotion ? 'none' : 'chp-wtwt-vibe-glow 3s ease-in-out infinite'};
  animation-delay: calc(var(--i, 0) * .15s);
}
.chp-wtwt-vibe-tag:hover {
  background: rgba(var(--ambient-r,229), var(--ambient-g,160), var(--ambient-b,13), .15);
  color: rgba(var(--ambient-r,229), var(--ambient-g,160), var(--ambient-b,13), 1);
}

/* Spinner for Show Another */
.chp-wtwt-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,.15); border-top-color: #e5a00d;
  border-radius: 50%; margin-right: 6px; vertical-align: middle;
  animation: chp-wtwt-spinner .6s linear infinite;
}

/* ── WTWT BOTTOM ── */
.chp-wtwt-bottom { display: flex; flex-direction: column; gap: 10px; }

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

      injectCSS(this.perfTier);
      this.setupHashWatcher();
      this.setupKeyboardShortcuts();
      this.setupNetworkWatcher();
      this.injectPersistentLayers();

      if (this.isHomePage()) this.mount();
    }

    isHomePage() {
      const h = window.location.hash;
      return h === '#/' || h === '' || h === '#';
    }

    // ── HASH WATCHER ─────────────────────────────────────────────────────────
    setupHashWatcher() {
      window.addEventListener('hashchange', () => {
        const wasHome = this.isActive;
        if (this.isHomePage()) {
          if (!wasHome) this.waitForContainerThenMount();
        } else {
          if (wasHome) this.unmount();
        }
      });
    }

    // ── WAIT FOR CONTAINER THEN MOUNT ─────────────────────────────────────────
    waitForContainerThenMount() {
      // Step 1 — try immediately, but only accept a container that has children
      // (meaning Stremio has finished rendering its home content into it)
      const container = this.findHomeContainer();
      if (container && container.children.length > 0) {
        this.mount();
        return;
      }

      // Step 2 — container not ready yet, watch the DOM
      let observer = null;
      let giveUpTimer = null;

      const tryMount = () => {
        const c = this.findHomeContainer();
        if (c && c.children.length > 0) {
          cleanup();
          this.mount();
        }
      };

      const cleanup = () => {
        if (observer) { observer.disconnect(); observer = null; }
        if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = null; }
      };

      observer = new MutationObserver(tryMount);
      observer.observe(document.body, { childList: true, subtree: true });

      // Step 3 — safety timeout, give up after 5 seconds
      giveUpTimer = setTimeout(() => {
        cleanup();
        console.warn('[CinematicHome] waitForContainerThenMount: timed out');
      }, 5000);
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
      rows.push({ id: 'top-week', label: 'Top This Week', type: 'mixed', genre: '', accentKey: 'default', titles: catalog.all.slice(0, 16), featured: true, seeAllHash: '#/discover/movie/com.linvo.cinemeta/top' });

      // New releases
      const newTitles = catalog.all.filter(t => catalog.newIds?.includes(t.id));
      if (newTitles.length > 2) {
        rows.push({ id: 'new', label: 'New Arrivals', type: 'mixed', genre: '', accentKey: 'Sci-Fi', titles: newTitles.slice(0, 14), badge: 'NEW', featured: false, seeAllHash: '#/discover/movie/com.linvo.cinemeta/top' });
      }

      // Movies
      if (catalog.movies?.length) {
        rows.push({ id: 'movies', label: 'Popular Movies', type: 'movie', genre: '', accentKey: 'Action', titles: catalog.movies.slice(0, 16), featured: true, seeAllHash: '#/discover/movie/com.linvo.cinemeta/top' });
      }

      // Series
      if (catalog.series?.length) {
        rows.push({ id: 'series', label: 'Popular Series', type: 'series', genre: '', accentKey: 'Drama', titles: catalog.series.slice(0, 16), featured: true, seeAllHash: '#/discover/series/com.linvo.cinemeta/top' });
      }

      // Critically acclaimed
      const acclaimed = catalog.all.filter(t => parseFloat(t.rating) >= 8.0).sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
      if (acclaimed.length > 4) {
        rows.push({ id: 'acclaimed', label: 'Critically Acclaimed', type: 'mixed', genre: '', accentKey: 'Drama', titles: acclaimed.slice(0, 14), featured: false, seeAllHash: '#/discover/movie/com.linvo.cinemeta/top' });
      }

      // Hidden gems (rating > 7.5, few votes proxy by lower rank)
      const gems = catalog.all.filter(t => parseFloat(t.rating) >= 7.5).slice(8, 22);
      if (gems.length > 3) {
        rows.push({ id: 'gems', label: 'Hidden Gems', type: 'mixed', genre: '', accentKey: 'Mystery', titles: gems, featured: false, seeAllHash: '#/discover/movie/com.linvo.cinemeta/top' });
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
            rows.push({ id: 'because', label: `Because You Watch ${topGenre}`, type: 'mixed', genre: topGenre, accentKey: topGenre, titles: rec, featured: false, seeAllHash: '#/discover/movie/com.linvo.cinemeta/top' });
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
          <button class="chp-see-all" onclick="window.open('','_self')">See All →</button>
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
          <button class="chp-see-all"${!def.seeAllHash ? ' style="visibility:hidden"' : ''}>See All →</button>
        </div>
        <div class="chp-row-scroll-wrap">
          <button class="chp-scroll-btn chp-scroll-left">‹</button>
          <div class="chp-row-scroller">
            ${def.titles.map((t, i) => this.buildPosterCard(t, i, def, catalog)).join('')}
          </div>
          <button class="chp-scroll-btn chp-scroll-right can-scroll">›</button>
        </div>`;
      if (def.seeAllHash) {
        row.querySelector('.chp-see-all').addEventListener('click', () => {
          window.location.hash = def.seeAllHash;
        });
      }

      this.setupRowScroll(row);
      this.setupPosterCardEvents(row, def.titles);
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
        const findRes = await fetchT(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${config.tmdbApiKey}&external_source=imdb_id`);
        if (!findRes) return null;

        const results = findRes.movie_results?.length ? findRes.movie_results : findRes.tv_results;
        if (!results?.length) return null;

        const tmdbId = results[0].id;
        const mt = findRes.movie_results?.length ? 'movie' : 'tv';

        const detailRes = await fetchT(`https://api.themoviedb.org/3/${mt}/${tmdbId}/videos?api_key=${config.tmdbApiKey}`);
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
            const findRes = await fetchT(`https://api.themoviedb.org/3/find/${t.id}?api_key=${config.tmdbApiKey}&external_source=imdb_id`);
            const tvResults = findRes?.tv_results;
            if (!tvResults?.length) continue;
            const detail = await fetchT(`https://api.themoviedb.org/3/tv/${tvResults[0].id}?api_key=${config.tmdbApiKey}`);
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
        const data = await fetchT(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`, 4000)
          || await fetchT(`https://cinemeta-catalogs.strem.io/top/catalog/movie/top.json`, 3000);

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
    <div class="chp-wtwt-bg">
      <div class="chp-wtwt-bg-img"></div>
    </div>
    <div class="chp-wtwt-shell" id="chp-wtwt-shell">
      <button class="chp-wtwt-close-btn" id="chp-wtwt-close">✕</button>
      <div class="chp-wtwt-loading">Finding the perfect title for you…</div>
    </div>
    <div class="dev-watermark-abh dev-watermark-modal">Developed by <span>Abdirahman Hussein</span></div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#chp-wtwt-close')?.addEventListener('click', () => this.closeWTWT());
      overlay.querySelector('.chp-wtwt-bg')?.addEventListener('click', () => this.closeWTWT());
    }

    async openWTWT() {
      const overlay = document.getElementById(WTWT_ID);
      if (!overlay) return;

      // Reset session state
      this._wtwtSuggestionCount = 0;
      this._wtwtExclude = new Set();
      this._currentMood = null;

      // Load persistent dismissals into exclude set
      const dismissed = lsGetJSON('chp-wtwt-dismissed', []);
      dismissed.forEach(id => this._wtwtExclude.add(id));

      overlay.classList.add('chp-wtwt-open');
      this._showWTWTMoodPicker(overlay);
    }

    _showWTWTMoodPicker(overlay) {
      const shell = document.getElementById('chp-wtwt-shell');
      if (!shell) return;

      const moods = [
        { id: 'intense', icon: '⚡', label: 'Intense', desc: 'Action, Thriller, Crime' },
        { id: 'feel-good', icon: '😊', label: 'Feel-Good', desc: 'Comedy, Romance, Animation' },
        { id: 'mind-bending', icon: '🌀', label: 'Mind-Bending', desc: 'Sci-Fi, Mystery, Fantasy' },
        { id: 'easy-watch', icon: '☕', label: 'Easy Watch', desc: 'Drama, Documentary' },
        { id: 'comfort', icon: '🎬', label: 'Comfort Rewatch', desc: 'Your top rated titles' },
      ];

      shell.innerHTML = `
    <button class="chp-wtwt-close-btn" id="chp-wtwt-close">✕</button>
    <div class="chp-wtwt-mood-wrap">
      <div class="chp-wtwt-mood-title">What are you in the mood for?</div>
      <div class="chp-wtwt-mood-subtitle">We'll find the perfect title for tonight</div>
      <div class="chp-wtwt-mood-grid">
        ${moods.map(m => `
          <button class="chp-wtwt-mood-btn" data-mood="${m.id}">
            <span class="chp-wtwt-mood-icon">${m.icon}</span>
            <span class="chp-wtwt-mood-label">${m.label}</span>
            <span class="chp-wtwt-mood-desc">${m.desc}</span>
          </button>`).join('')}
      </div>
    </div>`;

      shell.querySelector('#chp-wtwt-close')?.addEventListener('click', () => this.closeWTWT());

      shell.querySelectorAll('.chp-wtwt-mood-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          shell.querySelectorAll('.chp-wtwt-mood-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');

          await new Promise(r => setTimeout(r, 300));

          const moodLabel = btn.querySelector('.chp-wtwt-mood-label').textContent.toLowerCase();
          shell.innerHTML = `
        <button class="chp-wtwt-close-btn" id="chp-wtwt-close">✕</button>
        <div class="chp-wtwt-loading">Finding the perfect ${moodLabel} title…</div>`;
          shell.querySelector('#chp-wtwt-close')?.addEventListener('click', () => this.closeWTWT());

          this._currentMood = btn.dataset.mood;
          const pick = await this.computeWTWTRec(this._currentMood);

          if (!pick) {
            shell.innerHTML = `
          <button class="chp-wtwt-close-btn" id="chp-wtwt-close">✕</button>
          <div class="chp-wtwt-loading">No titles found — try a different mood</div>`;
            shell.querySelector('#chp-wtwt-close')?.addEventListener('click', () => this.closeWTWT());
            return;
          }

          this._showWTWTCard(overlay, pick);
        });
      });
    }

    async _showWTWTCard(overlay, pick) {
      const shell = document.getElementById('chp-wtwt-shell');
      if (!shell || !overlay.classList.contains('chp-wtwt-open')) return;

      this._wtwtSuggestionCount++;
      const maxSuggestions = 10;
      const atLimit = this._wtwtSuggestionCount >= maxSuggestions;

      const backdropUrl = `https://images.metahub.space/background/large/${pick.id}/img`;
      const logoUrl = `https://images.metahub.space/logo/medium/${pick.id}/img`;
      await preloadImg(backdropUrl);
      if (!overlay.classList.contains('chp-wtwt-open')) return;

      // ── Set blurred backdrop behind the panel ──
      const bgImg = overlay.querySelector('.chp-wtwt-bg-img');
      if (bgImg) {
        bgImg.classList.remove('chp-visible');
        bgImg.style.backgroundImage = `url(${backdropUrl})`;
        requestAnimationFrame(() => requestAnimationFrame(() => bgImg.classList.add('chp-visible')));
      }

      const matchPct = Math.min(99, Math.round(70 + ((pick.score || 10) / 23) * 29));
      const rating = parseFloat(pick.rating) || 0;
      const awardTag = rating >= 9.2 ? '🏆 All-Time Classic' : rating >= 8.8 ? '🥇 Critically Acclaimed' : rating >= 8.0 ? '✦ Highly Rated' : '';
      const genreVibeMap = { Action: 'Intense', Thriller: 'Gripping', Crime: 'Dark & Gritty', Comedy: 'Feel-Good', Drama: 'Emotional', 'Sci-Fi': 'Mind-Bending', Horror: 'Spine-Chilling', Fantasy: 'Otherworldly', Mystery: 'Keep-Guessing', Romance: 'Heartfelt', Animation: 'Delightful', Documentary: 'Eye-Opening', Western: 'Rugged', Family: 'Wholesome' };
      const vibes = [...new Set((pick.genres || []).map(g => genreVibeMap[g]).filter(Boolean))].slice(0, 4);

      // ── Extract ambient color from the title's primary genre ──
      const primaryGenre = (pick.genres || [])[0] || 'default';
      const amb = GENRE_COLORS[primaryGenre] || GENRE_COLORS['default'];

      shell.innerHTML = `
<button class="chp-wtwt-close-btn" id="chp-wtwt-close">✕</button>
<div class="chp-wtwt-card-layout">
  <div class="chp-wtwt-card-backdrop-wrap">
    <img class="chp-wtwt-card-backdrop" src="${backdropUrl}" alt="${pick.title}"
         onerror="this.style.opacity='0'">
    <div class="chp-wtwt-card-backdrop-grad"></div>
  </div>
  <div class="chp-wtwt-card-content" style="--ambient-r:${amb.r};--ambient-g:${amb.g};--ambient-b:${amb.b}">

    <div class="chp-wtwt-top">
      <div class="chp-wtwt-eyebrow">✦ Tonight's Pick</div>
      <div class="chp-wtwt-logo-wrap">
        <img class="chp-wtwt-card-logo" src="${logoUrl}" alt=""
             onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
        <div class="chp-wtwt-card-title-text" style="display:none">${pick.title}</div>
      </div>
      <div class="chp-wtwt-card-reason">${pick.reason}</div>
    </div>

    <div class="chp-wtwt-mid">
      <div class="chp-wtwt-match-row">
        <div class="chp-wtwt-match-ring" id="chp-wtwt-ring" data-target="${matchPct}">
          <span class="chp-wtwt-match-num" id="chp-wtwt-ring-num">0%</span>
        </div>
        <div class="chp-wtwt-match-info">
          <div class="chp-wtwt-match-label">Taste Match</div>
          <div class="chp-wtwt-match-sub">${pick.genres?.slice(0, 2).join(' · ') || 'Based on your history'}</div>
        </div>
        ${awardTag ? `<div class="chp-wtwt-award-badge">${awardTag}</div>` : ''}
      </div>
      ${vibes.length ? `<div class="chp-wtwt-vibes">${vibes.map((v, i) => `<span class="chp-wtwt-vibe-tag" style="--i:${i}">${v}</span>`).join('')}</div>` : ''}
    </div>

    <div class="chp-wtwt-bottom">
      <div class="chp-wtwt-card-meta">
        ${pick.year ? `<span class="chp-hero-meta-pill">${pick.year}</span>` : ''}
        ${pick.rating && pick.rating !== 'na' ? `<span class="chp-hero-meta-pill chp-rating">⭐ ${pick.rating}</span>` : ''}
        ${pick.type ? `<span class="chp-hero-meta-pill">${pick.type === 'movie' ? 'Movie' : 'Series'}</span>` : ''}
        ${pick.duration ? `<span class="chp-hero-meta-pill">${pick.duration}</span>` : ''}
        ${pick.seasons && pick.type === 'series' ? `<span class="chp-hero-meta-pill">${pick.seasons}</span>` : ''}
        ${pick.genres?.length ? `<span class="chp-hero-meta-pill">${pick.genres.slice(0, 2).join(' · ')}</span>` : ''}
      </div>
      ${pick.description ? `<div class="chp-wtwt-card-desc">${pick.description}</div>` : ''}
      <div class="chp-wtwt-card-actions">
        <button class="chp-btn-watch" id="chp-wtwt-watch">▶ Watch This</button>
        <button class="chp-btn-info${atLimit ? ' chp-btn-disabled' : ''}" id="chp-wtwt-another">🎲 Show Another</button>
        <button class="chp-btn-info chp-wtwt-dismiss-btn" id="chp-wtwt-dismiss">✕ Not Interested</button>
      </div>
      <div class="chp-wtwt-counter">${this._wtwtSuggestionCount} of ${maxSuggestions} suggestions</div>
    </div>

  </div>
</div>`;

      shell.querySelector('#chp-wtwt-close')?.addEventListener('click', () => this.closeWTWT());

      shell.querySelector('#chp-wtwt-watch')?.addEventListener('click', () => {
        navToTitle(pick.id, pick.type);
        this.closeWTWT();
      });

      shell.querySelector('#chp-wtwt-dismiss')?.addEventListener('click', () => {
        // Persist so this title never surfaces again
        this._wtwtExclude.add(pick.id);
        const dismissed = lsGetJSON('chp-wtwt-dismissed', []);
        if (!dismissed.includes(pick.id)) {
          dismissed.push(pick.id);
          lsSetJSON('chp-wtwt-dismissed', dismissed);
        }
        this._showNextWTWT(overlay);
      });

      shell.querySelector('#chp-wtwt-another')?.addEventListener('click', () => {
        if (atLimit) return;
        this._showNextWTWT(overlay);
      });

      this.updateAmbient(backdropUrl);

      // ── Animate match ring from 0% → matchPct% ──
      this._animateMatchRing(matchPct);
    }

    /** Animates the WTWT taste-match ring and counter from 0 to target */
    _animateMatchRing(targetPct) {
      const ring = document.getElementById('chp-wtwt-ring');
      const num = document.getElementById('chp-wtwt-ring-num');
      if (!ring || !num) return;

      ring.classList.add('chp-animating');
      const targetDeg = (targetPct / 100) * 360;
      const duration = 800; // ms
      const start = performance.now();

      const tick = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out quad
        const eased = 1 - (1 - progress) * (1 - progress);
        const currentDeg = eased * targetDeg;
        const currentPct = Math.round(eased * targetPct);

        ring.style.setProperty('--ring-deg', `${currentDeg}deg`);
        num.textContent = `${currentPct}%`;

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          ring.classList.remove('chp-animating');
        }
      };
      requestAnimationFrame(tick);
    }

    async _showNextWTWT(overlay) {
      const shell = document.getElementById('chp-wtwt-shell');
      if (!shell) return;

      // Show spinner on the "Show Another" button instead of replacing content
      const anotherBtn = shell.querySelector('#chp-wtwt-another');
      if (anotherBtn) {
        anotherBtn.innerHTML = '<span class="chp-wtwt-spinner"></span>Finding…';
        anotherBtn.classList.add('chp-btn-disabled');
      }

      const next = await this.computeWTWTRec(this._currentMood);
      if (!next) {
        shell.innerHTML = `
      <button class="chp-wtwt-close-btn" id="chp-wtwt-close">✕</button>
      <div class="chp-wtwt-loading">No more suggestions — try a different mood</div>`;
        shell.querySelector('#chp-wtwt-close')?.addEventListener('click', () => this.closeWTWT());
        return;
      }

      this._showWTWTCard(overlay, next);
    }

    async computeWTWTRec(mood = null) {
      const wlData = wlnmLoad();
      const completed = new Set(Object.entries(wlData).filter(([, v]) => v.status === 'completed').map(([id]) => id));
      const catalog = this.cache.get('chp-all-titles') || [];
      const cwTitles = this.cache.get('chp-cw-titles') || [];
      const topGenres = this.computeTopGenres(cwTitles, wlData);
      const excluded = this._wtwtExclude || new Set();
      const timeCtx = getTimeContext();
      const inProgress = new Set(cwTitles.map(t => t.id));

      const moodGenres = {
        'intense': ['Action', 'Thriller', 'Crime', 'Western'],
        'feel-good': ['Comedy', 'Romance', 'Animation', 'Family'],
        'mind-bending': ['Sci-Fi', 'Mystery', 'Fantasy', 'Horror'],
        'easy-watch': ['Drama', 'Documentary', 'Biography'],
        'comfort': null,
      };

      const scored = catalog
        .filter(t => !excluded.has(t.id))
        .map(t => {
          let score = parseFloat(t.rating) || 0;

          // Personal taste match
          const genreMatch = (t.genres || []).filter(g => topGenres.includes(g)).length;
          score += genreMatch * 1.5;

          // Mood scoring
          if (mood && mood !== 'comfort' && moodGenres[mood]) {
            const moodMatch = (t.genres || []).filter(g => moodGenres[mood].includes(g)).length;
            if (moodMatch === 0) score -= 8;
            else score += moodMatch * 3;
          }

          // Comfort mode — boost already loved titles
          if (mood === 'comfort') {
            const wlEntry = wlnmGet(t.id);
            if (wlEntry?.rating >= 4) score += 6;
            if (completed.has(t.id)) score += 3;
          } else {
            // Non-comfort — completed titles are less fresh
            if (completed.has(t.id)) score -= 4;
          }

          // Already in progress — slight penalty
          if (inProgress.has(t.id)) score -= 2;

          // Watchlist personal rating bonus
          const wlEntry = wlnmGet(t.id);
          if (wlEntry?.rating) score += wlEntry.rating * 0.5;

          // Time of day modifiers
          if (timeCtx.label === 'Late night') {
            if ((t.genres || []).some(g => ['Thriller', 'Horror', 'Crime', 'Mystery'].includes(g))) score += 1.5;
          }
          if (timeCtx.label === 'Good morning') {
            if ((t.genres || []).some(g => ['Comedy', 'Animation', 'Documentary'].includes(g))) score += 1.2;
          }

          return { ...t, score };
        })
        .sort((a, b) => b.score - a.score);

      // Random pick from top 10 so it's never the same title twice
      const pool = scored.slice(0, 10);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!pick) return null;

      // Exclude from future picks this session
      this._wtwtExclude = this._wtwtExclude || new Set();
      this._wtwtExclude.add(pick.id);

      pick.reason = this._buildWTWTReason(pick, mood, topGenres, timeCtx, cwTitles);
      return pick;
    }

    _buildWTWTReason(pick, mood, topGenres, timeCtx, cwTitles) {
      const matchedGenre = (pick.genres || []).find(g => topGenres.includes(g));
      const relatedCount = cwTitles.filter(t => (t.genres || []).some(g => topGenres.includes(g))).length;
      const wlEntry = wlnmGet(pick.id);

      if (mood === 'comfort' && wlEntry?.rating >= 4) {
        return `You rated this ${wlEntry.rating} stars — a perfect rewatch for tonight`;
      }
      if (timeCtx.label === 'Late night' && (pick.genres || []).some(g => ['Thriller', 'Crime', 'Horror'].includes(g))) {
        return `A late night pick — dark, gripping, and worth staying up for`;
      }
      if (timeCtx.label === 'Good morning' && (pick.genres || []).some(g => ['Comedy', 'Animation'].includes(g))) {
        return `A light start to your morning — rated ${pick.rating || '?'}`;
      }
      if (matchedGenre && relatedCount > 1) {
        return `You've watched ${relatedCount} ${matchedGenre.toLowerCase()} titles recently — this one's rated ${pick.rating || '?'}`;
      }
      if (matchedGenre) {
        return `Matches your taste for ${matchedGenre.toLowerCase()} — rated ${pick.rating || '?'}`;
      }
      if (parseFloat(pick.rating) >= 8.5) {
        return `One of the highest rated titles available right now`;
      }
      return `Highly rated and worth your ${timeCtx.label === 'Late night' ? 'evening' : 'time'}`;
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
          fetchT('https://cinemeta-catalogs.strem.io/top/catalog/movie/top.json'),
          fetchT('https://cinemeta-catalogs.strem.io/top/catalog/series/top.json'),
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
        const data = await fetchT(`https://v3-cinemeta.strem.io/meta/${title.type}/${title.id}.json`, 4000);
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
  const boot = () => {
    new CinematicHome();
    injectAbhWatermark(document.body);
  };
  if (document.body) boot();
  else { const w = () => document.body ? boot() : setTimeout(w, 50); w(); }

  function injectAbhWatermark(target, isModal = false) {
    if (target.querySelector('.dev-watermark-abh')) return;
    const wm = document.createElement('div');
    wm.className = 'dev-watermark-abh' + (isModal ? ' dev-watermark-modal' : '');
    wm.innerHTML = 'Developed by <span>Abdirahman Hussein</span>';

    if (!document.getElementById('dev-watermark-style')) {
      const style = document.createElement('style');
      style.id = 'dev-watermark-style';
      style.textContent = `
        .dev-watermark-abh {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 2147483647;
          font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
          font-size: 0.75rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.4);
          background: rgba(10, 10, 15, 0.6);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 6px 12px;
          border-radius: 6px;
          letter-spacing: 0.5px;
          pointer-events: none;
          text-transform: uppercase;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          transition: opacity 0.3s ease;
        }
        .dev-watermark-abh.dev-watermark-modal {
          position: absolute;
          bottom: 24px;
          right: 32px;
        }
        .dev-watermark-abh span {
          color: #e5a00d;
          font-weight: 700;
          text-shadow: 0 0 8px rgba(229,160,13,0.4);
        }
        @media (max-width: 768px) {
          .dev-watermark-abh {
            bottom: 12px;
            right: 12px;
            font-size: 0.65rem;
            padding: 4px 8px;
          }
        }
      `;
      document.head.appendChild(style);
    }
    target.appendChild(wm);
  }

})();