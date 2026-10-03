#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const tool=path.join(here,'..','artifact-preflight.mjs');
const fixture=path.join(here,'fixtures','valday-2026-known-bad.svg');
const p=spawnSync(process.execPath,[tool,'--json',fixture],{encoding:'utf8'});
if(p.status!==1){
  console.error('Expected known-bad Valdai fixture to FAIL with exit 1; got',p.status,p.stderr);
  process.exit(1);
}
let report;
try{report=JSON.parse(p.stdout);}catch(e){
  console.error('Invalid JSON from artifact-preflight',e,p.stdout);
  process.exit(1);
}
const codes=new Set(report.svg.flatMap(r=>r.findings.map(f=>f.code)));
const required=['marker-units-missing','marker-size-off-spec','safe-area-violation'];
const missing=required.filter(x=>!codes.has(x));
if(missing.length){
  console.error('Regression lost required detections:',missing,'Observed:',[...codes]);
  process.exit(1);
}
console.log(JSON.stringify({pass:true,fixture:'valday-2026-known-bad.svg',detected:required},null,2));
