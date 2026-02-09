import { readFileSync } from 'fs';
const en = Object.keys(JSON.parse(readFileSync('messages/en.json', 'utf8')));
const zh = Object.keys(JSON.parse(readFileSync('messages/zh-Hant.json', 'utf8')));
const missing = en.filter(k => !zh.includes(k));
const extra = zh.filter(k => !en.includes(k));
console.log('EN keys:', en.length, 'ZH-Hant keys:', zh.length);
if (missing.length) console.log('Missing from zh-Hant:', missing);
if (extra.length) console.log('Extra in zh-Hant:', extra);
if (!missing.length && !extra.length) console.log('Keys match perfectly');
