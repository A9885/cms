#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 *  DOOH Full Pipeline Test Suite  v2.0
 *  Covers: Admin Portal · Brand Portal · Partner Portal · Bus Ops
 *          Xibo CMS · Proof of Play · GPS · Billing · Alerts
 * ═══════════════════════════════════════════════════════════════
 *
 * Usage:
 *   node test-pipeline-v2.js                   # all stages
 *   node test-pipeline-v2.js --stage xibo      # single stage
 *   node test-pipeline-v2.js --verbose         # raw responses
 *   node test-pipeline-v2.js --report          # save JSON report
 */

require('dotenv').config();
const https = require('https');
const http  = require('http');
const fs    = require('fs');

// ─── Config ───────────────────────────────────────────────────

const C = {
  xiboBase:    (process.env.XIBO_BASE_URL || 'https://signt.signcdn.com').replace(/\/$/, ''),
  clientId:    process.env.XIBO_CLIENT_ID,
  clientSecret:process.env.XIBO_CLIENT_SECRET,
  screen1:     process.env.SCREEN_1_PLAYLIST_ID,
  screen2:     process.env.SCREEN_2_PLAYLIST_ID,
  placeholderMedia: process.env.PLACEHOLDER_MEDIA_ID || '1',
  jwtSecret:   process.env.JWT_SECRET,

  backendUrl:  process.env.BACKEND_URL   || 'http://localhost:3000',
  webAppUrl:   process.env.WEB_APP_URL   || 'http://localhost:3001',
  adminUrl:    process.env.ADMIN_URL     || 'http://localhost:3002',
  brandUrl:    process.env.BRAND_URL     || 'http://localhost:3003',
  partnerUrl:  process.env.PARTNER_URL   || 'http://localhost:3004',
};

const args        = process.argv.slice(2);
const VERBOSE     = args.includes('--verbose');
const SAVE_REPORT = args.includes('--report');
const STAGE_FILTER = (() => { const i = args.indexOf('--stage'); return i !== -1 ? args[i+1] : 'all'; })();

// ─── Console helpers ──────────────────────────────────────────

const G='\x1b[32m', R='\x1b[33m', Y='\x1b[33m', CYAN='\x1b[36m',
      B='\x1b[1m',  D='\x1b[2m',  X='\x1b[0m';

let pass=0, fail=0, warn=0;
const log    = m => console.log(m);
const vlog   = m => VERBOSE && log(`    ${D}${m}${X}`);
const section= n => log(`\n${B}${CYAN}▸ ${n}${X}`);

const results = [];
function ok(label, detail='')  { pass++; results.push({s:'pass',label,detail}); log(`  ${G}✓${X} ${label}${detail?` ${D}${detail}${X}`:''}`); }
function ko(label, detail='')  { fail++; results.push({s:'fail',label,detail}); log(`  ${R}✗${X} ${label}${detail?` ${R}${detail}${X}`:''}`); }
function wo(label, detail='')  { warn++; results.push({s:'warn',label,detail}); log(`  ${Y}⚠${X} ${label}${detail?` ${D}${detail}${X}`:''}`); }

// ─── HTTP helper ──────────────────────────────────────────────

function req(url, opts={}) {
  return new Promise((res,rej) => {
    let u; try { u = new URL(url); } catch(e) { return rej(new Error(`Bad URL: ${url}`)); }
    const lib = u.protocol==='https:' ? https : http;
    const body = opts.body ? Buffer.from(opts.body) : null;
    const hdrs = { ...(opts.headers||{}) };
    if (body) hdrs['Content-Length'] = body.length;
    const r = lib.request({ hostname:u.hostname, port:u.port||(u.protocol==='https:'?443:80),
      path:u.pathname+u.search, method:opts.method||'GET', headers:hdrs, timeout:12000 }, r2 => {
        let d=''; r2.on('data',c=>d+=c);
        r2.on('end',()=>{ let json=null; try{json=JSON.parse(d)}catch(_){}; res({status:r2.statusCode,headers:r2.headers,body:d,json}); });
    });
    r.on('timeout',()=>{r.destroy();rej(new Error('Timeout'));});
    r.on('error',rej);
    if(body) r.write(body);
    r.end();
  });
}

// ─── Shared state ─────────────────────────────────────────────

const state = { token: null, displays:[], playlists:[], media:[], layouts:[], stats:[] };

// ══════════════════════════════════════════════════════════════
//  STAGE 1 — Environment
// ══════════════════════════════════════════════════════════════
async function stageEnv() {
  section('Stage 1 — Environment Config');
  C.clientId    ? ok('XIBO_CLIENT_ID set', C.clientId.slice(0,8)+'…') : ko('XIBO_CLIENT_ID missing');
  C.clientSecret? ok('XIBO_CLIENT_SECRET set') : ko('XIBO_CLIENT_SECRET missing');
  C.xiboBase    ? ok('XIBO_BASE_URL set', C.xiboBase) : ko('XIBO_BASE_URL missing');
  C.screen1     ? ok('SCREEN_1_PLAYLIST_ID set', C.screen1) : ko('SCREEN_1_PLAYLIST_ID empty — scheduling broken');
  C.screen2     ? ok('SCREEN_2_PLAYLIST_ID set', C.screen2) : ko('SCREEN_2_PLAYLIST_ID empty — scheduling broken');
  C.placeholderMedia==='1' ? wo('PLACEHOLDER_MEDIA_ID is default "1" — verify exists') : ok('PLACEHOLDER_MEDIA_ID set', C.placeholderMedia);
  C.jwtSecret==='fallback_super_secret_key_123' ? wo('JWT_SECRET is insecure fallback — change for production') :
    C.jwtSecret ? ok('JWT_SECRET set (custom)') : ko('JWT_SECRET missing');
  [C.backendUrl,C.webAppUrl,C.adminUrl,C.brandUrl,C.partnerUrl].forEach(u=>ok('URL configured', u));
}

// ══════════════════════════════════════════════════════════════
//  STAGE 2 — Xibo OAuth2
// ══════════════════════════════════════════════════════════════
async function stageXiboAuth() {
  section('Stage 2 — Xibo OAuth2');
  if (!C.clientId || !C.clientSecret) { ko('No credentials — skipping'); return; }
  try {
    vlog(`POST ${C.xiboBase}/api/authorize/access_token`);
    const r = await req(`${C.xiboBase}/api/authorize/access_token`, {
      method:'POST', body:`grant_type=client_credentials&client_id=${encodeURIComponent(C.clientId)}&client_secret=${encodeURIComponent(C.clientSecret)}`,
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
    });
    vlog(`${r.status} ${r.body.slice(0,120)}`);
    if (r.status===200 && r.json?.access_token) {
      state.token = r.json.access_token;
      ok('OAuth2 token acquired', `expires_in=${r.json.expires_in}s`);
      r.json.token_type==='Bearer' ? ok('Token type Bearer') : wo(`Unexpected token_type: ${r.json.token_type}`);
    } else if (r.status===401) ko('Invalid credentials (401)');
    else if (r.status===400) ko(`Bad request (400) — ${r.json?.error||''}`);
    else ko(`Unexpected status ${r.status}`);
  } catch(e) { ko('Cannot reach Xibo auth endpoint', e.message); }
}

// ══════════════════════════════════════════════════════════════
//  STAGE 3 — Xibo Core API
// ══════════════════════════════════════════════════════════════
async function stageXiboAPI() {
  section('Stage 3 — Xibo Core API');
  if (!state.token) { ko('Skipping — no token'); return; }
  const auth = { Authorization:`Bearer ${state.token}` };

  const endpoint = async (path, label, onData) => {
    try {
      const r = await req(`${C.xiboBase}${path}`, { headers:auth });
      if (r.status===200) { ok(`${label} reachable`); if (onData && r.json) onData(r.json); }
      else wo(`${label} → ${r.status}`);
    } catch(e) { ko(`${label} failed`, e.message); }
  };

  // Displays
  await endpoint('/api/display', 'Displays', d => {
    state.displays = Array.isArray(d) ? d : (d.data||[]);
    ok(`${state.displays.length} display(s) found`);
    if (!state.displays.length) ko('No displays registered — screens will not receive content');
  });

  // Playlists
  await endpoint('/api/playlist', 'Playlists', d => {
    state.playlists = Array.isArray(d) ? d : (d.data||[]);
    ok(`${state.playlists.length} playlist(s) found`);
    if (state.playlists.length) {
      log(`\n    ${D}Available playlists (copy IDs to .env):${X}`);
      state.playlists.slice(0,8).forEach(p => log(`    ${D}  id=${p.playlistId}  "${p.name}"${X}`));
    }
    if (C.screen1) {
      state.playlists.find(p=>String(p.playlistId)===String(C.screen1))
        ? ok(`SCREEN_1 playlist ID=${C.screen1} exists`) : ko(`SCREEN_1 playlist ID=${C.screen1} NOT found`);
    }
    if (C.screen2) {
      state.playlists.find(p=>String(p.playlistId)===String(C.screen2))
        ? ok(`SCREEN_2 playlist ID=${C.screen2} exists`) : ko(`SCREEN_2 playlist ID=${C.screen2} NOT found`);
    }
  });

  // Media
  await endpoint('/api/media', 'Media library', d => {
    state.media = Array.isArray(d) ? d : (d.data||[]);
    ok(`${state.media.length} media file(s)`);
    const ph = state.media.find(m=>String(m.mediaId)===String(C.placeholderMedia));
    ph ? ok(`Placeholder media ID=${C.placeholderMedia} found: "${ph.name}"`) : ko(`Placeholder media ID=${C.placeholderMedia} NOT found`);
  });

  // Layouts
  await endpoint('/api/layout', 'Layouts', d => {
    state.layouts = Array.isArray(d) ? d : (d.data||[]);
    ok(`${state.layouts.length} layout(s)`);
    const published = state.layouts.filter(l=>l.status===1||l.publishedStatus==='Published');
    published.length ? ok(`${published.length} published layout(s)`) : wo('No published layouts — screens may show blank');
  });

  // Schedules
  await endpoint('/api/schedule', 'Schedules', d => {
    const s = Array.isArray(d) ? d : (d.data||[]);
    s.length ? ok(`${s.length} schedule(s) active`) : wo('No schedules — nothing playing on screens');
  });

  // Proof of Play stats
  await endpoint('/api/stats', 'Stats / Proof of Play', d => {
    state.stats = Array.isArray(d) ? d : (d.data||[]);
    state.stats.length ? ok(`${state.stats.length} PoP record(s)`) : wo('No PoP records yet');
  });
}

// ══════════════════════════════════════════════════════════════
//  STAGE 4 — Display / Screen Health
// ══════════════════════════════════════════════════════════════
async function stageDisplays() {
  section('Stage 4 — Display Registration & Health');
  if (!state.token) { wo('Skipping — no Xibo token'); return; }
  if (!state.displays.length) { ko('No displays registered in Xibo'); return; }

  state.displays.forEach(d => {
    const n = d.display || `id=${d.displayId}`;
    (d.licensed===1||d.licensed===true) ? ok(`"${n}" licensed`) : ko(`"${n}" NOT licensed — will not play`);
    (d.loggedIn===1||d.loggedIn===true)  ? ok(`"${n}" online`)   : wo(`"${n}" offline — check network/player`);
    d.mediaInventoryStatus===1 ? ok(`"${n}" media synced`) : wo(`"${n}" media not fully synced`);
  });
}

// ══════════════════════════════════════════════════════════════
//  STAGE 5 — Backend Health
// ══════════════════════════════════════════════════════════════
async function stageBackend() {
  section('Stage 5 — Backend API Health');

  // Health + core routes
  const routes = [
    ['/health',              'Health check'],
    ['/api/health',          'API health'],
    ['/api/status',          'Status'],
    // Admin Portal routes
    ['/api/displays',        'Displays proxy'],
    ['/api/playlists',       'Playlists proxy'],
    ['/api/media',           'Media proxy'],
    ['/api/layouts',         'Layouts proxy'],
    ['/api/schedule',        'Schedule proxy'],
    ['/api/campaigns',       'Campaigns'],
    ['/api/brands',          'Brands mgmt'],
    ['/api/partners',        'Partners mgmt'],
    ['/api/analytics',       'Analytics'],
    ['/api/billing',         'Billing'],
    ['/api/creative',        'Creative library'],
    // PoP
    ['/api/stats',           'Proof of Play stats'],
    ['/api/proof-of-play',   'PoP endpoint (alt)'],
    // Bus / Fleet
    ['/api/operators',       'Operators (fleet)'],
    ['/api/vehicles',        'Vehicles'],
    ['/api/depots',          'Depots'],
    ['/api/gps',             'GPS data'],
    ['/api/alerts',          'Alerts'],
    ['/api/maintenance',     'Maintenance logs'],
  ];

  let backendDown = false;
  for (const [path, label] of routes) {
    if (backendDown) break;
    try {
      const r = await req(`${C.backendUrl}${path}`);
      if ([200,201].includes(r.status)) ok(`${label}`, `${path} → 200`);
      else if (r.status===401) wo(`${label} requires auth (expected)`, path);
      else if (r.status===404) wo(`${label} not found`, path);
      else wo(`${label} → ${r.status}`, path);
    } catch(e) {
      if (e.message.includes('ECONNREFUSED') || e.message.includes('ENOTFOUND')) {
        ko(`Backend unreachable at ${C.backendUrl}`, e.message); backendDown=true;
      } else ko(`${label} error`, e.message);
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  STAGE 6 — Portal UI Reachability
// ══════════════════════════════════════════════════════════════
async function stagePortals() {
  section('Stage 6 — Portal UI Reachability');

  const portals = [
    { name:'Web App',       url:C.webAppUrl  },
    { name:'Admin Portal',  url:C.adminUrl   },
    { name:'Brand Portal',  url:C.brandUrl   },
    { name:'Partner Portal',url:C.partnerUrl },
  ];

  for (const p of portals) {
    try {
      const r = await req(p.url);
      if ([200,301,302].includes(r.status)) {
        ok(`${p.name} reachable`, `→ ${r.status}`);
        const ct = r.headers['content-type']||'';
        ct.includes('html') ? ok(`${p.name} returns HTML`) : wo(`${p.name} content-type: ${ct}`);
      } else ko(`${p.name} returned ${r.status}`);
    } catch(e) {
      e.message.includes('ECONNREFUSED') ? ko(`${p.name} not running at ${p.url}`) : ko(`${p.name} unreachable`, e.message);
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  STAGE 7 — Auth & JWT Flow
// ══════════════════════════════════════════════════════════════
async function stageAuth() {
  section('Stage 7 — Auth & JWT Flow');

  const routes = ['/api/auth/login','/api/auth/token','/api/login','/auth/login','/api/token'];
  let found = false;
  for (const route of routes) {
    try {
      const r = await req(`${C.backendUrl}${route}`, {
        method:'POST', body:JSON.stringify({username:'admin',password:'wrongpass'}),
        headers:{'Content-Type':'application/json'},
      });
      if ([200,400,401,422].includes(r.status)) {
        ok(`Auth route exists at ${route}`, `→ ${r.status}`);
        if (r.status===200 && r.json?.token) ok('JWT returned on login');
        found=true; break;
      }
    } catch(e) { if(e.message.includes('ECONNREFUSED')) break; }
  }
  if (!found) wo('No auth endpoint found — check your router');

  // Confirm protected routes reject unauthenticated requests
  for (const path of ['/api/displays','/api/campaigns','/api/brands']) {
    try {
      const r = await req(`${C.backendUrl}${path}`);
      r.status===401 ? ok(`${path} protected (401)`) : r.status===200 ? wo(`${path} publicly accessible — add JWT middleware`) : null;
    } catch(_) {}
  }

  // Admin role checks
  try {
    const r = await req(`${C.backendUrl}/api/admin/users`);
    r.status===401||r.status===403 ? ok('/api/admin/users requires admin role') : r.status===200 ? wo('/api/admin/users publicly accessible') : null;
  } catch(_) {}
}

// ══════════════════════════════════════════════════════════════
//  STAGE 8 — Admin Portal Modules
// ══════════════════════════════════════════════════════════════
async function stageAdmin() {
  section('Stage 8 — Admin Portal Feature Coverage');

  // From 1st_MVP_Admin_Portal.docx
  const modules = [
    // Dashboard KPIs
    ['/api/analytics/kpi',          'Dashboard KPI endpoint'],
    ['/api/analytics/daily-plays',  'Daily ad plays chart'],
    ['/api/analytics/utilisation',  'Screen utilisation chart'],
    ['/api/analytics/revenue',      'Revenue trend'],
    ['/api/alerts',                 'Recent alerts endpoint'],
    // Screens
    ['/api/screens',                'Screens list'],
    ['/api/screens/add',            'Add screen (should be POST)'],
    // Brands
    ['/api/brands',                 'Brands list'],
    ['/api/brands/approve',         'Brand approval action'],
    // Partners
    ['/api/partners',               'Partners list'],
    ['/api/partners/earnings',      'Partner earnings'],
    // Campaigns
    ['/api/campaigns',              'Campaigns list'],
    ['/api/campaigns/create',       'Create campaign'],
    ['/api/slots',                  'Ad slot management'],
    // Creative library
    ['/api/creatives',              'Creative library'],
    // Billing
    ['/api/invoices',               'Invoices'],
    ['/api/payments',               'Payments'],
    // System monitoring
    ['/api/screens/health',         'Screen health monitor'],
    // Settings
    ['/api/users',                  'User management'],
    ['/api/roles',                  'Role management'],
  ];

  for (const [path, label] of modules) {
    try {
      const r = await req(`${C.backendUrl}${path}`);
      [200,201].includes(r.status) ? ok(`${label}`, path) :
      [401,403].includes(r.status) ? ok(`${label} (auth-protected)`, path) :
      r.status===404 ? wo(`${label} NOT FOUND`, path) :
      wo(`${label} → ${r.status}`, path);
    } catch(e) {
      if (e.message.includes('ECONNREFUSED')) { wo('Backend down — skipping admin checks'); break; }
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  STAGE 9 — Brand Portal Modules
// ══════════════════════════════════════════════════════════════
async function stageBrand() {
  section('Stage 9 — Brand Portal Feature Coverage');

  // From Brands__portals.docx
  const modules = [
    ['/api/brand/dashboard',         'Brand dashboard'],
    ['/api/brand/screens',           'Brand screen list'],
    ['/api/brand/screens/map',       'Screen coverage map'],
    ['/api/brand/screens/playback',  'Live screen playback'],
    ['/api/brand/reports',           'Proof of play reports'],
    ['/api/brand/reports/download',  'Report download'],
    ['/api/brand/subscription',      'Subscription details'],
    ['/api/brand/invoices',          'Invoice history'],
    ['/api/brand/support',           'Support / issue submit'],
    ['/api/brand/reach-estimate',    'Estimated reach forecast'],
  ];

  for (const [path, label] of modules) {
    try {
      const r = await req(`${C.brandUrl}${path}`) || await req(`${C.backendUrl}${path}`);
      [200,201].includes(r.status) ? ok(`${label}`) :
      [401,403].includes(r.status) ? ok(`${label} (auth-protected)`) :
      r.status===404 ? wo(`${label} NOT FOUND`, path) : wo(`${label} → ${r.status}`);
    } catch(e) { if(e.message.includes('ECONNREFUSED')) { wo('Portal/backend down — skipping'); break; } }
  }
}

// ══════════════════════════════════════════════════════════════
//  STAGE 10 — Partner Portal Modules
// ══════════════════════════════════════════════════════════════
async function stagePartner() {
  section('Stage 10 — Partner Portal Feature Coverage');

  // From Partner_Portal.docx
  const modules = [
    ['/api/partner/dashboard',       'Partner dashboard'],
    ['/api/partner/screens',         'Partner screen list'],
    ['/api/partner/earnings',        'Earnings report'],
    ['/api/partner/availability',    'Slot availability'],
    ['/api/partner/support/tickets', 'Support tickets'],
    ['/api/partner/profile',         'Partner profile'],
    ['/api/partner/payments',        'Payment details'],
    ['/api/partner/revenue-calc',    'Revenue calculation'],
  ];

  for (const [path, label] of modules) {
    try {
      const r = await req(`${C.partnerUrl}${path}`) || await req(`${C.backendUrl}${path}`);
      [200,201].includes(r.status) ? ok(`${label}`) :
      [401,403].includes(r.status) ? ok(`${label} (auth-protected)`) :
      r.status===404 ? wo(`${label} NOT FOUND`, path) : wo(`${label} → ${r.status}`);
    } catch(e) { if(e.message.includes('ECONNREFUSED')) { wo('Portal/backend down — skipping'); break; } }
  }
}

// ══════════════════════════════════════════════════════════════
//  STAGE 11 — Bus Operations (PRD v2)
// ══════════════════════════════════════════════════════════════
async function stageBusOps() {
  section('Stage 11 — Bus Operations & Fleet (PRD v2)');

  // From Mobile_DOOH_PRD_v2_with_Bus_Operations.docx
  const modules = [
    // Fleet registration
    ['/api/operators',               'Operator registration'],
    ['/api/depots',                  'Depot management'],
    ['/api/vehicles',                'Vehicle registration'],
    ['/api/screens/assign',          'Screen-to-vehicle assignment'],
    ['/api/gps/devices',             'GPS device registry'],
    // Operator admin dashboard
    ['/api/operator/fleet-overview', 'Fleet overview dashboard'],
    ['/api/operator/bus-map',        'Real-time bus location map'],
    ['/api/operator/uptime',         'Screen uptime %'],
    ['/api/operator/campaigns',      'Campaigns on fleet'],
    ['/api/operator/revenue',        'Fleet revenue summary'],
    // Depot manager
    ['/api/depot/buses',             'Depot bus count'],
    ['/api/depot/screen-status',     'Screen status by bus'],
    ['/api/depot/health-report',     'Daily health report export'],
    // Field technician
    ['/api/tech/assigned',           'Assigned buses/screens'],
    ['/api/tech/maintenance/log',    'Log maintenance event'],
    ['/api/tech/maintenance/close',  'Close maintenance ticket'],
    // GPS & telemetry
    ['/api/gps/pings',               'GPS ping ingestion'],
    ['/api/gps/attribution',         'Playback geo-attribution'],
    ['/api/telemetry/pop',           'Proof of play ingestion'],
    // Alerts
    ['/api/alerts/offline',          'Screen offline alerts'],
    ['/api/alerts/gps',              'GPS not reporting alerts'],
    ['/api/alerts/mismatch',         'Playback mismatch alerts'],
  ];

  for (const [path, label] of modules) {
    try {
      const r = await req(`${C.backendUrl}${path}`);
      [200,201].includes(r.status) ? ok(`${label}`, path) :
      [401,403].includes(r.status) ? ok(`${label} (auth-protected)`) :
      r.status===404 ? wo(`${label} NOT FOUND`, path) : wo(`${label} → ${r.status}`);
    } catch(e) { if(e.message.includes('ECONNREFUSED')) { wo('Backend down — skipping bus ops checks'); break; } }
  }
}

// ══════════════════════════════════════════════════════════════
//  STAGE 12 — Proof of Play End-to-End
// ══════════════════════════════════════════════════════════════
async function stagePoP() {
  section('Stage 12 — Proof of Play End-to-End');

  if (state.token) {
    try {
      const r = await req(`${C.xiboBase}/api/stats?type=media`, { headers:{Authorization:`Bearer ${state.token}`} });
      if (r.status===200) {
        const records = Array.isArray(r.json) ? r.json : (r.json?.data||[]);
        ok('Xibo /api/stats reachable');
        if (records.length) {
          ok(`${records.length} play record(s) found in Xibo`);
          const s = records[0];
          ok('Sample record', `display="${s.displayId||s.display}" media="${s.mediaId||s.media}"`);
        } else {
          wo('No PoP records in Xibo — schedule content and wait for first play');
        }
      } else wo(`Stats API → ${r.status}`);
    } catch(e) { wo('Xibo stats check failed', e.message); }
  }

  // Check PoP flows from Xibo → backend → Brand/Partner portals
  const popRoutes = ['/api/stats','/api/proof-of-play','/api/pop','/api/reports'];
  for (const portal of [{name:'Brand Portal',url:C.brandUrl},{name:'Partner Portal',url:C.partnerUrl}]) {
    let found=false;
    for (const r of popRoutes) {
      try {
        const res = await req(`${portal.url}${r}`);
        if ([200,401,403].includes(res.status)) {
          ok(`${portal.name} has PoP route at ${r}`, `→ ${res.status}`);
          found=true; break;
        }
      } catch(_) {}
    }
    if (!found) wo(`${portal.name} has no PoP/stats route — check portal routes`);
  }

  // Geo attribution
  try {
    const r = await req(`${C.backendUrl}/api/gps/attribution`);
    [200,401].includes(r.status) ? ok('Geo-attribution endpoint exists') : wo('Geo-attribution endpoint not found');
  } catch(_) {}
}

// ══════════════════════════════════════════════════════════════
//  Summary & Report
// ══════════════════════════════════════════════════════════════

function summary() {
  log('\n' + '═'.repeat(56));
  log(`${B}Test Summary${X}`);
  log('═'.repeat(56));
  log(`  ${G}Passed  ${X}: ${pass}`);
  log(`  ${Y}Warnings${X}: ${warn}`);
  log(`  ${R}Failed  ${X}: ${fail}`);
  log('═'.repeat(56));

  const fails = results.filter(r=>r.s==='fail');
  if (fails.length) {
    log(`\n${B}${R}Critical failures:${X}`);
    fails.forEach(r=>log(`  ${R}•${X} ${r.label}${r.detail?' — '+r.detail:''}`));
  }

  const warns = results.filter(r=>r.s==='warn');
  if (warns.length) {
    log(`\n${B}${Y}Warnings:${X}`);
    warns.forEach(r=>log(`  ${Y}•${X} ${r.label}${r.detail?' — '+r.detail:''}`));
  }

  // Suggest playlist IDs if found
  if (state.playlists.length && (!C.screen1||!C.screen2)) {
    log(`\n${B}Add to .env (playlist IDs discovered):${X}`);
    state.playlists.slice(0,4).forEach(p=>log(`  SCREEN_X_PLAYLIST_ID=${p.playlistId}   # ${p.name}`));
  }

  if (SAVE_REPORT) {
    const report = { timestamp: new Date().toISOString(), pass, fail, warn,
      summary: { xibo: C.xiboBase, backend: C.backendUrl },
      results, playlists: state.playlists, displays: state.displays };
    fs.writeFileSync('pipeline-report.json', JSON.stringify(report, null, 2));
    log(`\nReport saved to pipeline-report.json`);
  }

  log('');
  fail===0&&warn===0 ? log(`${G}${B}All pipeline checks passed!${X}`) :
  fail===0 ? log(`${Y}Pipeline functional — review warnings.${X}`) :
  log(`${R}Pipeline has critical failures — fix before testing UI.${X}`);
  log('');
}

// ══════════════════════════════════════════════════════════════
//  Runner
// ══════════════════════════════════════════════════════════════

const STAGES = {
  env:      stageEnv,
  auth:     stageXiboAuth,
  xibo:     stageXiboAPI,
  displays: stageDisplays,
  backend:  stageBackend,
  portals:  stagePortals,
  jwt:      stageAuth,
  admin:    stageAdmin,
  brand:    stageBrand,
  partner:  stagePartner,
  busops:   stageBusOps,
  pop:      stagePoP,
};

async function run() {
  log(`\n${B}DOOH Full Pipeline Test Suite v2.0${X}`);
  log(`${D}Xibo: ${C.xiboBase}${X}`);
  log(`${D}Backend: ${C.backendUrl}  |  Stage: ${STAGE_FILTER}${X}`);

  const toRun = STAGE_FILTER==='all'
    ? Object.values(STAGES)
    : STAGE_FILTER.split(',').map(s=>STAGES[s.trim()]).filter(Boolean);

  for (const stage of toRun) await stage();
  summary();
  process.exit(fail>0?1:0);
}

run().catch(e=>{ console.error(`\n${R}Fatal:${X}`, e.message); process.exit(1); });