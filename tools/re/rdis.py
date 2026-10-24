import sys, re, pickle, os
from elftools.elf.elffile import ELFFile
from capstone import *
import itanium_demangler as dm
import os
F=os.environ.get("LIBDC", os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","..","Dragon City 2.0 (1311051831) (11-05-2013)","lib","armeabi-v7a","libdc.so"))
CACHE=os.path.join(os.path.dirname(__file__),"syms.pkl")
data=open(F,'rb').read()
def load():
    if os.path.exists(CACHE): return pickle.load(open(CACHE,'rb'))
    e=ELFFile(open(F,'rb')); syms={}
    for s in e.get_section_by_name('.dynsym').iter_symbols():
        if s['st_shndx']!='SHN_UNDEF' and s.name:
            try: p=dm.parse(s.name); n=str(p) if p else s.name
            except Exception: n=s.name
            syms[s['st_value']&~1]=(n,s['st_size'],s.name,s['st_value']&1)
    # PLT relocs -> names
    plt={}
    rp=e.get_section_by_name('.rel.plt'); ds=e.get_section_by_name('.dynsym')
    got={}
    for r in rp.iter_relocations():
        got[r['r_offset']]=ds.get_symbol(r['r_info_sym']).name
    pickle.dump((syms,got),open(CACHE,'wb')); return syms,got
syms,got=load()
# sections: vaddr==offset for file mapping up to text; handle .rodata via program headers
e=ELFFile(open(F,'rb'))
segs=[(p['p_vaddr'],p['p_offset'],p['p_filesz']) for p in e.iter_segments() if p['p_type']=='PT_LOAD']
def rd(va,n):
    for v,o,sz in segs:
        if v<=va<v+sz: return data[o+va-v:o+va-v+min(n,v+sz-va)]
    return b''
def cstr(va):
    b=rd(va,200)
    i=b.find(b'\0')
    if i>=1 and all(32<=c<127 for c in b[:i]): return b[:i].decode()
import bisect
keys=sorted(syms)
def symat(va):
    i=bisect.bisect_right(keys,va)-1
    if i>=0:
        k=keys[i]; n,sz,_,_t=syms[k]
        if va<k+max(sz,1): return n,va-k
    return '?',0
def plt_name(va):
    # decode PLT stub: add ip,pc,#x; add ip,ip,#y; ldr pc,[ip,#z]!
    b=rd(va,12)
    if len(b)<12: return None
    w=[int.from_bytes(b[i:i+4],'little') for i in range(0,12,4)]
    def imm(x):
        v=x&0xff; r=((x>>8)&0xf)*2; return ((v>>r)|(v<<(32-r)))&0xffffffff if r else v
    if (w[0]&0xfffff000)==0xe28fc000 and (w[1]&0xfffff000)==0xe28cc000 and (w[2]&0xfffff000)==0xe5bcf000:
        addr=va+8+imm(w[0])+imm(w[1])+(w[2]&0xfff)
        return got.get(addr)
def dis(va,size,thumb):
    md=Cs(CS_ARCH_ARM,CS_MODE_THUMB if thumb else CS_MODE_ARM)
    code=rd(va,size); out=[]; regs={}
    for i in md.disasm(code,va):
        note=''
        op=i.op_str
        if i.mnemonic.startswith(('bl','b.w','b')) and op.startswith('#') and i.mnemonic in('bl','blx','b','b.w'):
            t=int(op[1:],16)
            n=plt_name(t)
            if n:
                try: p=dm.parse(n); n=str(p) if p else n
                except Exception: pass
            else:
                n,off=symat(t); n=n+(f'+{off}' if off else '')
            note=' ; -> '+n
        elif i.mnemonic.startswith('ldr') and '[pc' in op:
            m=re.search(r'#(-?0x[0-9a-f]+)',op); off=int(m.group(1),16) if m else 0
            base=(i.address+4)&~3 if thumb else i.address+8
            lit=base+off
            v=int.from_bytes(rd(lit,4),'little'); rn=op.split(',')[0].strip()
            regs[rn]=v
            s2=cstr(v); note=f' ; lit=0x{v:x}'+(f' "{s2}"' if s2 else '')
        elif i.mnemonic=='add' and op.endswith('pc') and op.split(',')[0].strip() in regs:
            rn=op.split(',')[0].strip(); pcv=i.address+(4 if thumb else 8)
            t=(regs[rn]+pcv)&0xffffffff; s2=cstr(t)
            if s2: note=f' ; "{s2}"'
            else:
                n,off=symat(t); note=f' ; ->0x{t:x} ({n}+{off})'
        elif i.mnemonic=='movw': regs[op.split(',')[0].strip()]=int(op.split('#')[1],16)
        out.append(f'{i.address:x}: {i.mnemonic} {op}{note}')
    return out
if __name__=='__main__':
    pat=sys.argv[1]; exact=len(sys.argv)>2 and sys.argv[2]=='x'
    for k in keys:
        n,sz,raw,th=syms[k]
        if (n==pat if exact else pat in n):
            print(f'=== {n} @0x{k:x} size {sz} thumb={th}')
            print(chr(10).join(dis(k,sz,th)))
