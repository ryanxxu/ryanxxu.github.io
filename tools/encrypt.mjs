// 用法：node tools/encrypt.mjs <密碼> [行程資料夾，預設 travel/hokkaido-2026]
// 讀取 <資料夾>/js/data.js，加密後輸出 <資料夾>/js/data.enc.js（AES-256-GCM + PBKDF2）
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const pass = process.argv[2];
const dir = process.argv[3] || 'travel/hokkaido-2026';
if (!pass || pass.length < 8) { console.error('請提供至少 8 個字元的密碼：node tools/encrypt.mjs <密碼> [資料夾]'); process.exit(1); }

const sandbox = { window: {} };
vm.runInNewContext(readFileSync(`${dir}/js/data.js`, 'utf8'), sandbox);
if (!sandbox.window.TRIP) { console.error('data.js 裡找不到 window.TRIP'); process.exit(1); }

const b64 = (u8) => Buffer.from(u8).toString('base64');
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const iter = 250000;
const km = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(sandbox.window.TRIP)));

writeFileSync(`${dir}/js/data.enc.js`, `window.TRIP_ENC=${JSON.stringify({ v: 1, iter, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) })};\n`);
console.log(`已輸出 ${dir}/js/data.enc.js。請只上傳這個檔案，不要上傳 js/data.js。`);
