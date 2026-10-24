import sys, itanium_demangler as d
out=open(sys.argv[2],'w',encoding='utf8')
for l in open(sys.argv[1]):
    n=l.strip()
    if not n: continue
    try:
        r=d.parse(n); s=str(r) if r else n
    except Exception: s=n
    out.write(s+"\t"+n+"\n")
