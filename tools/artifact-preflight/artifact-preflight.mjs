#!/usr/bin/env node
/**
 * artifact-preflight — deterministic pre-delivery validator for generated artifacts.
 *
 * Executable Source of Truth: andykalyakin/agents-best-practices/tools/artifact-preflight
 * Upstream geometry engine: bybit-exchange/svg-diagram @ c30c9e3bc9a70f2b77b60c7ea27157de3a88d81a
 *
 * Exit codes: 0 PASS, 1 FAIL, 2 INVALID.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { lintSource } from './vendor/svg-diagram/tools/svg-lint/lib/lint.mjs';
import { parseSvg } from './vendor/svg-diagram/tools/svg-lint/lib/parse-svg.mjs';
import { buildDocument } from './vendor/svg-diagram/tools/svg-lint/lib/document.mjs';

const VERSION='0.1.0';
const UPSTREAM_COMMIT='c30c9e3bc9a70f2b77b60c7ea27157de3a88d81a';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const GEOMETRY_CHECKS=new Set([
  'xml-escaping','viewbox-clipping','box-height','baseline-offset','block-spacing',
  'arrow-marker','text-overflow','overlap','connector-geometry','document-model'
]);

function finding(check,code,message,extra={}) {
  return {check,severity:'error',code,message,...extra};
}
function parseArgs(argv){
  const o={svgs:[],html:null,pdf:null,json:false,profile:'geometry',pdfMarginPt:30,selfTest:false};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--json')o.json=true;
    else if(a==='--self-test')o.selfTest=true;
    else if(a==='--html')o.html=argv[++i];
    else if(a==='--pdf')o.pdf=argv[++i];
    else if(a==='--pdf-margin-pt')o.pdfMarginPt=Number(argv[++i]);
    else if(a==='--profile')o.profile=argv[++i];
    else if(a.startsWith('-'))throw new Error('Unknown option: '+a);
    else o.svgs.push(a);
  }
  if(!['geometry','strict'].includes(o.profile))throw new Error('profile must be geometry or strict');
  if(!Number.isFinite(o.pdfMarginPt)||o.pdfMarginPt<0)throw new Error('invalid --pdf-margin-pt');
  return o;
}
function walk(el,fn){
  if(!el||typeof el!=='object')return;
  if(el.type!=='text')fn(el);
  for(const c of el.children||[])walk(c,fn);
}
const normD=v=>String(v||'').replace(/\s+/g,' ').replace(/\s*,\s*/g,',').trim().toLowerCase();

function safeBoxFindings(doc){
  const out=[];
  for(const t of doc.texts){
    const r=t.container;
    if(!r)continue;
    const inset=t.fontSize*1.5*0.5;
    const inner={minX:r.bbox.minX+inset,minY:r.bbox.minY+inset,maxX:r.bbox.maxX-inset,maxY:r.bbox.maxY-inset};
    const b=t.bbox;
    if(b.minX<inner.minX-0.01||b.minY<inner.minY-0.01||b.maxX>inner.maxX+0.01||b.maxY>inner.maxY+0.01){
      out.push(finding('safe-content-box','safe-area-violation',
        `Text "${t.content.slice(0,80)}" violates the minimum 0.5×line-height inset.`,
        {line:t.line,column:t.column,inset:+inset.toFixed(2),textBBox:b,innerBBox:inner}));
    }
  }
  return out;
}

function arrowFamilyFindings(parsed,doc){
  const out=[], markerPath=new Map();
  walk(parsed.svg,el=>{
    if(el.tag!=='marker'||!el.attrs?.id)return;
    let p=null;
    const seek=n=>{for(const c of n.children||[]){if(c.type==='text')continue;if(c.tag==='path'){p=c;return;}seek(c);if(p)return;}};
    seek(el); markerPath.set(el.attrs.id,normD(p?.attrs?.d));
  });
  const expected=new Map([
    [8,normD('M0,0 L8,4 L0,8 L2,4 z')],
    [12,normD('M0,0 L12,6 L0,12 L3,6 z')],
    [16,normD('M0,0 L16,8 L0,16 L4,8 z')]
  ]);
  const used=new Set();
  for(const p of doc.paths){if(p.markerEnd)used.add(p.markerEnd);if(p.markerStart)used.add(p.markerStart);}
  for(const id of used){
    const m=doc.markers.get(id); if(!m)continue;
    const exp=expected.get(m.markerWidth), actual=markerPath.get(id);
    if(exp&&actual!==exp)out.push(finding('arrow-family','noncanonical-arrowhead',
      `Marker #${id} is not the canonical notched arrowhead for ${m.markerWidth}×${m.markerHeight}.`,
      {marker:id,line:m.line,column:m.column}));
  }
  for(const p of doc.paths.filter(p=>p.markerEnd)){
    const tier=p.strokeWidth<=1.5?8:p.strokeWidth<=2.5?12:16;
    const m=doc.markers.get(p.markerEnd);
    if(m&&m.markerWidth!==tier)out.push(finding('arrow-family','marker-tier-mismatch',
      `Connector stroke-width ${p.strokeWidth} requires ${tier}×${tier} marker, got ${m.markerWidth}×${m.markerHeight}.`,
      {line:p.line,column:p.column}));
  }
  return out;
}

function semanticGeometryFindings(doc){
  const out=[];
  const qs=doc.contentRects.filter(r=>r.element?.attrs?.['data-preflight-role']==='quadrant');
  if(!qs.length)return out;
  const a=qs.map(r=>({r,x:r.element.attrs['data-x-pole'],y:r.element.attrs['data-y-pole'],
    cx:(r.bbox.minX+r.bbox.maxX)/2,cy:(r.bbox.minY+r.bbox.maxY)/2}));
  if(a.some(q=>!['low','high'].includes(q.x)||!['low','high'].includes(q.y))){
    out.push(finding('semantic-geometry','missing-pole-annotation',
      'Every annotated quadrant must declare data-x-pole="low|high" and data-y-pole="low|high".'));
    return out;
  }
  const avg=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
  const xl=a.filter(q=>q.x==='low').map(q=>q.cx), xh=a.filter(q=>q.x==='high').map(q=>q.cx);
  const yl=a.filter(q=>q.y==='low').map(q=>q.cy), yh=a.filter(q=>q.y==='high').map(q=>q.cy);
  if(xl.length&&xh.length&&!(avg(xl)<avg(xh)))out.push(finding('semantic-geometry','x-axis-inverted',
    'Semantic X-axis contract violated: low pole must render left of high pole.'));
  if(yl.length&&yh.length&&!(avg(yh)<avg(yl)))out.push(finding('semantic-geometry','y-axis-inverted',
    'Semantic Y-axis contract violated: high pole must render above low pole.'));
  return out;
}

function lintSvg(name,source,profile='geometry'){
  const upstream=lintSource(name,source);
  let findings=upstream.findings;
  if(profile==='geometry')findings=findings.filter(f=>GEOMETRY_CHECKS.has(f.check));
  let parsed,doc;
  try{parsed=parseSvg(source);doc=buildDocument(parsed);}
  catch(e){return {file:name,findings:[...findings,finding('custom-model','custom-model-crashed',e.message)]};}
  findings=[...findings,...safeBoxFindings(doc),...arrowFamilyFindings(parsed,doc),...semanticGeometryFindings(doc)];
  return {file:name,findings};
}

const extractSvgs=html=>[...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].map((m,i)=>({name:`inline-svg-${i+1}.svg`,source:m[0]}));

function pdfCheck(file,margin){
  const script=path.join(HERE,'pdf-page-bounds.py');
  const p=spawnSync('python3',[script,file,String(margin)],{encoding:'utf8'});
  if(!p.stdout)return {invalid:true,reason:'pdf-check-no-output',stderr:p.stderr||'',findings:[]};
  try{const x=JSON.parse(p.stdout);x.processExitCode=p.status;return x;}
  catch(e){return {invalid:true,reason:'pdf-check-invalid-json',detail:e.message,stdout:p.stdout,stderr:p.stderr,findings:[]};}
}

function selfTest(){
  const font=`<style>text { font-family:'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',system-ui,sans-serif; }</style>`;
  const badSafe=`<svg viewBox="0 0 280 120" width="280" xmlns="http://www.w3.org/2000/svg">${font}<rect x="20" y="20" width="240" height="80" rx="6" fill="#dbeafe" stroke="#3b82f6"/><text x="22" y="66" font-size="12">Too close</text></svg>`;
  const badArrow=`<svg viewBox="0 0 320 120" width="320" xmlns="http://www.w3.org/2000/svg">${font}<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="2" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 z" fill="#64748b"/></marker></defs><rect x="20" y="30" width="90" height="40" fill="#dbeafe" stroke="#3b82f6"/><rect x="210" y="30" width="90" height="40" fill="#dbeafe" stroke="#3b82f6"/><path d="M115,50 L194,50" fill="none" stroke="#64748b" marker-end="url(#arrow)"/></svg>`;
  const badAxis=`<svg viewBox="0 0 420 300" width="420" xmlns="http://www.w3.org/2000/svg">${font}
    <rect x="30" y="30" width="160" height="90" data-preflight-role="quadrant" data-x-pole="low" data-y-pole="low" fill="#dbeafe" stroke="#3b82f6"/>
    <rect x="230" y="30" width="160" height="90" data-preflight-role="quadrant" data-x-pole="high" data-y-pole="low" fill="#dbeafe" stroke="#3b82f6"/>
    <rect x="30" y="170" width="160" height="90" data-preflight-role="quadrant" data-x-pole="low" data-y-pole="high" fill="#dbeafe" stroke="#3b82f6"/>
    <rect x="230" y="170" width="160" height="90" data-preflight-role="quadrant" data-x-pole="high" data-y-pole="high" fill="#dbeafe" stroke="#3b82f6"/>
  </svg>`;
  const a=lintSvg('bad-safe.svg',badSafe),b=lintSvg('bad-arrow.svg',badArrow),c=lintSvg('bad-axis.svg',badAxis);
  const checks={
    safe:a.findings.some(f=>f.code==='safe-area-violation'),
    arrow:b.findings.some(f=>f.code==='noncanonical-arrowhead'),
    semantic:c.findings.some(f=>f.code==='y-axis-inverted')
  };
  return {pass:Object.values(checks).every(Boolean),checks,details:{safe:a,arrow:b,semantic:c}};
}

function usage(){
  console.error('Usage: artifact-preflight.mjs [--json] [--profile geometry|strict] [--html FILE] [--pdf FILE] [--pdf-margin-pt N] [SVG...] | --self-test');
}

function main(){
  let a;try{a=parseArgs(process.argv.slice(2));}catch(e){usage();console.error(e.message);process.exit(2);}
  if(a.selfTest){const s=selfTest();console.log(JSON.stringify({tool:'artifact-preflight',version:VERSION,upstreamCommit:UPSTREAM_COMMIT,selfTest:s},null,2));process.exit(s.pass?0:1);}
  if(!a.html&&!a.pdf&&!a.svgs.length){usage();process.exit(2);}
  const inputs=a.svgs.map(f=>({name:f,source:fs.readFileSync(f,'utf8')}));
  if(a.html)inputs.push(...extractSvgs(fs.readFileSync(a.html,'utf8')).map(x=>({name:a.html+'#'+x.name,source:x.source})));
  const svg=inputs.map(x=>lintSvg(x.name,x.source,a.profile));
  const svgErrors=svg.reduce((n,r)=>n+r.findings.filter(f=>f.severity==='error').length,0);
  const svgWarnings=svg.reduce((n,r)=>n+r.findings.filter(f=>f.severity==='warning').length,0);
  const pdf=a.pdf?pdfCheck(a.pdf,a.pdfMarginPt):null;
  const pdfErrors=pdf?.findings?.length||0, invalid=Boolean(pdf?.invalid);
  const pass=!invalid&&svgErrors===0&&svgWarnings===0&&pdfErrors===0;
  const out={tool:'artifact-preflight',version:VERSION,upstream:{repo:'bybit-exchange/svg-diagram',commit:UPSTREAM_COMMIT,profile:a.profile},
    summary:{svgFiles:svg.length,svgErrors,svgWarnings,pdfErrors,invalid,pass},svg,pdf};
  if(a.json)console.log(JSON.stringify(out,null,2));
  else{
    console.log(`artifact-preflight: ${pass?'PASS':'FAIL'} | SVG ${svg.length} | errors ${svgErrors} | warnings ${svgWarnings} | PDF-boundary ${pdfErrors}`);
    for(const r of svg)for(const f of r.findings)console.log(`${f.severity.toUpperCase()} ${r.file}: ${f.check}/${f.code} — ${f.message}`);
    for(const f of pdf?.findings||[])console.log(`ERROR PDF p.${f.page}: ${f.code} — ${f.text}`);
  }
  process.exit(invalid?2:(pass?0:1));
}
main();
