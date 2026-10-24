import sys,re
sys.path.insert(0,__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import rdis as D
pat=re.compile(sys.argv[1])
seen=set()
for k,(n,sz,raw,th) in sorted(D.syms.items()):
    if not th or not sz or not pat.search(n) or 'dtor' in n: continue
    ks=[]
    for l in D.dis(k,sz,1):
        m=re.search(r'; "(.*)"$',l)
        if m and not m.group(1).startswith('_Z') : ks.append(m.group(1))
    # dedupe preserving order
    o=[x for i,x in enumerate(ks) if x not in ks[:i]]
    if o: print(n.split('(')[0]+'('+n.split('(',1)[1][:60]+')' if '(' in n else n, '\n    ', o)
