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

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  const STYLE_ID  = 'csb-styles';
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

  function lsGet(k)    { try { return localStorage.getItem(k); }  catch(_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); }      catch(_) {}              }

  /** Extract IMDB tt-id from the current Stremio URL hash/path */
  function getContentId() {
    const m = (location.hash + ' ' + location.href).match(/tt\d+/);
    return m ? m[0] : null;
  }

  /** Stable fingerprint for a parsed stream — used to identify "last played" */
  function streamFp(s) { return [s.source, s.name, s.res].join('|'); }

  // ── CSS ────────────────────────────────────────────────────────────────────

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;

    // DM Sans font — same import as data-enrichment
    if (!document.getElementById('csb-font')) {
      const link = document.createElement('link');
      link.id   = 'csb-font';
      link.rel  = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap';
      document.head.appendChild(link);
    }

    const s = document.createElement('style');
    s.id = STYLE_ID;
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

  function esc(t) {
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
    return `<img class="csb-src-icon" src="${url}" alt="${esc(key)}" loading="lazy"
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
      badges += `<span class="csb-chip" style="background:${c.bg};color:${c.fg};border:1px solid ${c.b}">${esc(f)}</span>`;
    }
    
    // size chip
    if (s.size) {
      badges += `<span class="csb-chip csb-size-chip" style="background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.3)">💾 ${esc(s.size)}</span>`;
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
    const label = esc([s.source, s.name].filter(Boolean).join(' '));

    const meta = [];
    // Only show prov if it's distinct from the source bracket tag
    if (s.prov && s.prov !== s.source.replace(/[\[\]]/g, '')) {
      meta.push(`<span>${esc(s.prov)}</span>`);
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
    const txt = esc(s.el.textContent.trim().replace(/\n+/g, '  ·  '));
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
  let prevUrl = '';

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

  injectCSS();

  setInterval(() => {
    const u = location.hash || location.href;
    if (u !== prevUrl) { teardown(); prevUrl = u; }
    check();
  }, 300);

})();
