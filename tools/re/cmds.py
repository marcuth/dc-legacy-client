import sys,re,collections
sys.path.insert(0,__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import rdis as D
def strings_of(k,sz):
    out=[]
    for l in D.dis(k,sz,1):
        m=re.search(r'; "(.*)"$',l)
        if m: out.append(m.group(1))
    return out
res=collections.OrderedDict()
for k,(n,sz,raw,th) in sorted(D.syms.items()):
    m=re.match(r'^(Command\w+|SerializableCommand)::(\{base ctor\}|\{ctor\}|commonInit|validateResponse)\(',n)
    if m and th and sz:
        cls,fn=m.group(1),m.group(2)
        if fn=='{ctor}' and (cls,'{base ctor}') in res and False: continue
        s=strings_of(k,sz)
        if s: res.setdefault(cls,{}).setdefault(fn,[]).extend(s)
for cls,d in res.items():
    print(cls)
    for fn,s in d.items(): print('  ',fn,s)
