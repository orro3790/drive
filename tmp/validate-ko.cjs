const fs = require('fs');
const en = JSON.parse(fs.readFileSync('C:/Users/matto/projects/drive/messages/en.json', 'utf8'));
const ko = JSON.parse(fs.readFileSync('C:/Users/matto/projects/drive/messages/ko.json', 'utf8'));
const enKeys = Object.keys(en);
const koKeys = Object.keys(ko);
const missingInKo = enKeys.filter((k) => koKeys.indexOf(k) === -1);
const extraInKo = koKeys.filter((k) => enKeys.indexOf(k) === -1);
console.log('EN key count:', enKeys.length);
console.log('KO key count:', koKeys.length);
if (missingInKo.length) console.log('Missing in KO:', missingInKo);
if (extraInKo.length) console.log('Extra in KO:', extraInKo);
if (missingInKo.length === 0 && extraInKo.length === 0) console.log('All keys match perfectly.');

let issues = [];
for (const key of enKeys) {
	const em = (en[key].match(/\{[^}]+\}/g) || []).sort();
	const km = (ko[key].match(/\{[^}]+\}/g) || []).sort();
	if (JSON.stringify(em) !== JSON.stringify(km)) {
		issues.push({ key, en: em, ko: km });
	}
}
if (issues.length) {
	console.log('Placeholder mismatches:', JSON.stringify(issues, null, 2));
} else {
	console.log('All placeholders preserved correctly.');
}
