#!/usr/bin/env node
// Creates .env from .env.example (if missing) and fills in every secret that
// is still blank or a "change-me" placeholder with a fresh random value.
// Safe to re-run: values that are already set are never touched, so it cannot
// rotate a database password out from under an initialized database.
//
//   node scripts/gen-secrets.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(examplePath, envPath);
  console.log('Created .env from .env.example');
}

let text = fs.readFileSync(envPath, 'utf8');
const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const isPlaceholder = (v) => v === '' || /change-?me/i.test(v);
const changed = [];

function get(key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}
function set(key, value) {
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, 'm').test(text)) text = text.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  else text += `${text.endsWith('\n') ? '' : '\n'}${line}\n`;
}
function fill(key, make) {
  const cur = get(key);
  if (cur === null || isPlaceholder(cur)) {
    const v = make();
    set(key, v);
    changed.push(key);
    return v;
  }
  return cur;
}

fill('SESSION_SECRET', () => hex(32));
fill('TOKEN_ENCRYPTION_KEY', () => hex(32));
fill('MYSQL_ROOT_PASSWORD', () => hex(16));
const dbPassword = fill('MYSQL_PASSWORD', () => hex(16));
fill('UPDATE_SHARED_SECRET', () => hex(32));

// Keep DATABASE_URL's password in step with MYSQL_PASSWORD, but only while it
// is still the placeholder one.
const url = get('DATABASE_URL');
if (url && /change-?me/i.test(url)) {
  set('DATABASE_URL', `"${url.replace(/:[^:@/]*@/, `:${dbPassword}@`)}"`);
  changed.push('DATABASE_URL');
}

fs.writeFileSync(envPath, text);
console.log(changed.length ? `Generated: ${changed.join(', ')}` : 'Nothing to do: all secrets already set.');
console.log('Next: set WEB_URL (and NODE_ENV=production) in .env, then see DEPLOY.md.');
