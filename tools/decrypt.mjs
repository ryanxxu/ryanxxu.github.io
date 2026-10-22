// 用法：node tools/decrypt.mjs <密碼> [行程資料夾，預設 travel/hokkaido-2026]
// 讀取 <資料夾>/js/data.enc.js，解密後還原成 <資料夾>/js/data.js（註解不會保留）。已有 data.js 時不覆蓋，請先自行移走。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const pass = process.argv[2];
const dir = process.argv[3] || 'travel/hokkaido-2026';
const out = `${dir}/js/data.js`;
if (!pass) { console.error('請提供密碼：node tools/decrypt.mjs <密碼> [資料夾]'); process.exit(1); }
if (existsSync(out)) { console.error(`${out} 已存在，為避免覆蓋請先移走或改名。`); process.exit(1); }

const sandbox = { window: {} };
vm.runInNewContext(readFileSync(`${dir}/js/data.enc.js`, 'utf8'), sandbox);
const enc = sandbox.window.TRIP_ENC;
if (!enc) { console.error('data.enc.js 裡找不到 window.TRIP_ENC'); process.exit(1); }

const b64 = (s) => Buffer.from(s, 'base64');
const km = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
let trip;
try { trip = JSON.parse(new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct)))); }
catch { console.error('密碼不正確'); process.exit(1); }

writeFileSync(out, `/* 由 tools/decrypt.mjs 從 data.enc.js 還原。欄位說明見 README.md。改完後執行 tools/encrypt.mjs 重新加密。 */\nwindow.TRIP = ${JSON.stringify(trip, null, 2)};\n`);
console.log(`已還原 ${out}（請勿上傳）。`);
