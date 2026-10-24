# Recovers DCLabel's colour table (indexed by getColorAtIndex) by emulating the byte stores of its
# static initializer at 0x5d0c40 into the array at 0x980658 (3 bytes per entry, starting at +4).
# Run from the project root: python -I tools/re/palette.py
import re,sys
sys.path.insert(0,"tools/re")
import rdis as D
from capstone import *
md=Cs(CS_ARCH_ARM,CS_MODE_THUMB); md.detail=False
start=0x5d0c40
regs={}; mem={}
def imm(s): return int(s.lstrip('#'),0)
n=0
for i in md.disasm(D.rd(start,0x600),start):
    m,op=i.mnemonic,i.op_str
    parts=[p.strip() for p in op.split(',')]
    if m in('mov','movs','mov.w') and parts[1].startswith('#'): regs[parts[0]]=imm(parts[1])&0xffffffff
    elif m in('mov','movs','mov.w') and parts[1] in regs and not parts[1].startswith('#'): regs[parts[0]]=regs[parts[1]]
    elif m.startswith('strb') and parts[1]=='[r4' or (m.startswith('strb') and parts[1].startswith('[r4')):
        off=0
        mm=re.search(r'#(0x[0-9a-f]+|\d+)',op)
        if mm: off=int(mm.group(1),0)
        r=parts[0]
        if r in regs: mem[off]=regs[r]&0xff
        else: print('unknown reg',hex(i.address),op)
    elif m.startswith('strh') and '[r4' in op:
        mm=re.search(r'#(0x[0-9a-f]+|\d+)',op); off=int(mm.group(1),0) if mm else 0
        v=regs.get(parts[0])
        if v is not None: mem[off]=v&0xff; mem[off+1]=(v>>8)&0xff
    elif m in('pop','pop.w') and 'pc' in op and i.address>start+0x40:
        print('end',hex(i.address)); break
    else:
        # destination register clobbered
        d=parts[0] if parts and parts[0].startswith(('r','s','f','i')) else None
        if d in regs and not m.startswith(('str','cmp','cbz','cbnz','b')): del regs[d]
for k in range(0,40):
    o=4+3*k
    if o+2 in mem or o in mem:
        rgb=tuple(mem.get(o+j,None) for j in range(3))
        print(k, rgb, '#%02x%02x%02x'%rgb if None not in rgb else '??')
print(sorted(mem)[-5:])
