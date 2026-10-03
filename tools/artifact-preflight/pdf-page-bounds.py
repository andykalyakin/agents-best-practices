#!/usr/bin/env python3
import json, sys
try:
    import fitz
except Exception as e:
    print(json.dumps({"invalid": True, "reason": "pymupdf-unavailable", "detail": str(e)}))
    raise SystemExit(2)
if len(sys.argv) < 3:
    print(json.dumps({"invalid": True, "reason": "usage"})); raise SystemExit(2)
pdf=sys.argv[1]; margin=float(sys.argv[2])
try: doc=fitz.open(pdf)
except Exception as e:
    print(json.dumps({"invalid": True, "reason": "pdf-open-failed", "detail": str(e)})); raise SystemExit(2)
findings=[]
for pi,page in enumerate(doc):
    rect=page.rect
    safe=fitz.Rect(rect.x0+margin,rect.y0+margin,rect.x1-margin,rect.y1-margin)
    for block in page.get_text("dict").get("blocks",[]):
        if block.get("type")!=0: continue
        for line in block.get("lines",[]):
            for span in line.get("spans",[]):
                txt=(span.get("text") or "").strip()
                if not txt: continue
                bb=fitz.Rect(span["bbox"])
                if bb.x0<safe.x0-0.5 or bb.y0<safe.y0-0.5 or bb.x1>safe.x1+0.5 or bb.y1>safe.y1+0.5:
                    findings.append({"check":"pdf-page-bounds","severity":"error","code":"text-outside-safe-page",
                        "page":pi+1,"text":txt[:120],"bbox":[round(v,2) for v in bb],"safe":[round(v,2) for v in safe]})
print(json.dumps({"invalid":False,"pages":len(doc),"marginPt":margin,"findings":findings},ensure_ascii=False))
raise SystemExit(1 if findings else 0)
