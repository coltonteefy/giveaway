#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist/server dist/.openai
node --input-type=module <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const css=readFileSync('public/style.css','utf8');
const paypalQr='data:image/jpeg;base64,'+readFileSync('public/paypal-qr.jpg').toString('base64');
const venmoQr='data:image/png;base64,'+readFileSync('public/venmo-qr.png').toString('base64');
const pages={};
for(const [name,script] of [['USER','user.js'],['ADMIN','admin.js']]){
  const source=readFileSync(`public/${script}`,'utf8');
  pages[name]=readFileSync(`public/${name==='USER'?'user':'organizer'}.html`,'utf8').replace('/*CSS*/',()=>css).replace('/*PAYPAL_QR*/',()=>paypalQr).replace('/*VENMO_QR*/',()=>venmoQr).replace(`/*${name}_JS*/`,()=>source);
  if(!pages[name].includes(`<script>${source}</script>`))throw Error(`${name} script was not embedded intact`);
}
const prefix=`const USER_HTML=${JSON.stringify(pages.USER)};\nconst ADMIN_HTML=${JSON.stringify(pages.ADMIN)};\n`;
writeFileSync('dist/server/index.js',prefix+readFileSync('worker/server.js','utf8'));
JS
cp .openai/hosting.json dist/.openai/hosting.json
