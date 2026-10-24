import sys,re
sys.path.insert(0,__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import rdis as D
from capstone import *
# find functions that call target address (bl/blx) or reference string
mode=sys.argv[1]; arg=sys.argv[2]
if mode=='call':
    tgts=[k for k,v in D.syms.items() if arg in v[0]]
    tg=set(tgts); print('targets',[hex(t) for t in tgts])
    md=Cs(CS_ARCH_ARM,CS_MODE_THUMB)
    for k,(n,sz,raw,th) in D.syms.items():
        if not th or sz==0: continue
        for i in md.disasm(D.rd(k,sz),k):
            if i.mnemonic in('bl','blx') and i.op_str.startswith('#') and int(i.op_str[1:],16) in tg:
                print(f'{n} @{i.address:x}')
elif mode=='str':
    # find string vaddr in rodata, then scan for literal-pool values that + pc == vaddr
    target=int(arg,16)
    md=Cs(CS_ARCH_ARM,CS_MODE_THUMB)
    for k,(n,sz,raw,th) in D.syms.items():
        if not th or sz==0: continue
        regs={}
        for i in md.disasm(D.rd(k,sz),k):
            op=i.op_str
            if i.mnemonic.startswith('ldr') and '[pc' in op:
                m=re.search(r'#(-?0x[0-9a-f]+)',op); off=int(m.group(1),16) if m else 0
                lit=((i.address+4)&~3)+off
                regs[op.split(',')[0].strip()]=int.from_bytes(D.rd(lit,4),'little')
            elif i.mnemonic=='add' and op.endswith('pc') and op.split(',')[0].strip() in regs:
                if (regs[op.split(',')[0].strip()]+i.address+4)&0xffffffff==target: print(n,hex(i.address))
