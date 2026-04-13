#!/usr/bin/env node
/**
 * Quick Xibo API probe — discovers playlist IDs, display IDs, and media.
 * Run this first to populate your .env file.
 *
 * Usage:  node xibo-probe.js
 */

require('dotenv').config();
const https = require('https');

const BASE = (process.env.XIBO_BASE_URL || 'https://cms.signtral.info').replace(/\/$/, '');
const ID = process.env.XIBO_CLIENT_ID;
const SECRET = process.env.XIBO_CLIENT_SECRET;

function post(path, body) {
  return new Promise((res, rej) => {
    const buf = Buffer.from(body);
    const req = https.request({
      hostname: new URL(BASE).hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': buf.length,
      },
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, json: JSON.parse(d) }));
    });
    req.on('error', rej);
    req.write(buf);
    req.end();
  });
}

function get(path, token) {
  return new Promise((res, rej) => {
    const url = new URL(BASE + path);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { res({ status: r.statusCode, json: JSON.parse(d) }); }
        catch (_) { res({ status: r.statusCode, raw: d }); }
      });
    });
    req.on('error', rej);
    req.end();
  });
}

function table(rows) {
  if (!rows.length) { console.log('  (none)'); return; }
  const keys = Object.keys(rows[0]);
  const widths = keys.map(k => Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)));
  const row = r => keys.map((k, i) => String(r[k] ?? '').padEnd(widths[i])).join('  ');
  console.log('  ' + keys.map((k, i) => k.padEnd(widths[i])).join('  '));
  console.log('  ' + widths.map(w => '-'.repeat(w)).join('  '));
  rows.forEach(r => console.log('  ' + row(r)));
}

async function main() {
  console.log('\n🔍 Xibo API Probe');
  console.log(`   Base: ${BASE}\n`);

  if (!ID || !SECRET) {
    console.error('❌ XIBO_CLIENT_ID and XIBO_CLIENT_SECRET must be set in .env');
    process.exit(1);
  }

  // Auth
  let token;
  try {
    const r = await post('/api/authorize/access_token',
      `grant_type=client_credentials&client_id=${encodeURIComponent(ID)}&client_secret=${encodeURIComponent(SECRET)}`);
    if (r.json?.access_token) {
      token = r.json.access_token;
      console.log(`✅ Auth OK  (expires in ${r.json.expires_in}s)\n`);
    } else {
      console.error('❌ Auth failed:', JSON.stringify(r.json));
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ Cannot reach Xibo:', e.message);
    process.exit(1);
  }

  // Displays
  console.log('── Displays ────────────────────────────────────────');
  try {
    const r = await get('/api/display', token);
    const displays = Array.isArray(r.json) ? r.json : (r.json?.data || []);
    table(displays.map(d => ({
      displayId: d.displayId,
      name: d.display,
      licensed: d.licensed,
      loggedIn: d.loggedIn,
      lastAccessed: d.lastAccessed?.split('T')[0] || '',
    })));
  } catch (e) { console.log('  Error:', e.message); }

  // Playlists
  console.log('\n── Playlists ───────────────────────────────────────');
  try {
    const r = await get('/api/playlist', token);
    const playlists = Array.isArray(r.json) ? r.json : (r.json?.data || []);
    table(playlists.map(p => ({ playlistId: p.playlistId, name: p.name, widgets: p.widgets?.length ?? '-' })));
    if (playlists.length >= 2) {
      console.log('\n📋 Suggested .env additions:');
      console.log(`   SCREEN_1_PLAYLIST_ID=${playlists[0].playlistId}   # ${playlists[0].name}`);
      console.log(`   SCREEN_2_PLAYLIST_ID=${playlists[1].playlistId}   # ${playlists[1].name}`);
    }
  } catch (e) { console.log('  Error:', e.message); }

  // Media
  console.log('\n── Media Library ───────────────────────────────────');
  try {
    const r = await get('/api/media', token);
    const media = Array.isArray(r.json) ? r.json : (r.json?.data || []);
    table(media.slice(0, 10).map(m => ({ mediaId: m.mediaId, name: m.name, type: m.mediaType, size: m.fileSize })));
    if (media.length > 10) console.log(`  … and ${media.length - 10} more`);
    const placeholder = media.find(m => String(m.mediaId) === String(process.env.PLACEHOLDER_MEDIA_ID || '1'));
    placeholder
      ? console.log(`\n✅ Placeholder media ID=${placeholder.mediaId} found: "${placeholder.name}"`)
      : console.log(`\n⚠️  Placeholder media ID=${process.env.PLACEHOLDER_MEDIA_ID || '1'} NOT found in media library`);
  } catch (e) { console.log('  Error:', e.message); }

  // Layouts
  console.log('\n── Layouts ─────────────────────────────────────────');
  try {
    const r = await get('/api/layout', token);
    const layouts = Array.isArray(r.json) ? r.json : (r.json?.data || []);
    table(layouts.slice(0, 10).map(l => ({ layoutId: l.layoutId, layout: l.layout, status: l.status })));
  } catch (e) { console.log('  Error:', e.message); }

  // Proof of Play
  console.log('\n── Proof of Play (last 7 days) ─────────────────────');
  try {
    const r = await get('/api/stats?type=media', token);
    const stats = Array.isArray(r.json) ? r.json : (r.json?.data || []);
    if (stats.length) {
      table(stats.slice(0, 5).map(s => ({
        displayId: s.displayId || s.display,
        media: s.mediaId || s.media,
        start: s.start?.split('T')[0],
        duration: s.duration,
        count: s.count,
      })));
      console.log(`\n✅ ${stats.length} proof-of-play record(s) found`);
    } else {
      console.log('  No records — screens may not have played content yet');
    }
  } catch (e) { console.log('  Error:', e.message); }

  console.log('\n✅ Probe complete\n');
}

main().catch(e => { console.error(e); process.exit(1); });