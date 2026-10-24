import sys,re,collections
sys.path.insert(0,__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import rdis as D
def trace(k,sz):
    lines=D.dis(k,sz,1)
    lab={'r1':'p1','r2':'p2','r3':'p3'}
    spoff=0; out=[]; pushed=0
    for l in lines:
        m=re.match(r'([0-9a-f]+): (\S+) (.*?)( ; (.*))?$',l)
        if not m: continue
        addr,mn,op,_,note=m.groups(); note=note or ''
        if mn.startswith('push'):
            pushed=len(re.findall(r'r\d+|sb|sl|fp|ip|lr',op)); spoff=4*pushed
        elif mn=='sub' and op.startswith('sp, #'): spoff+=int(op.split('#')[1],16)
        elif mn.startswith('mov') and not mn.startswith('movw') and not mn.startswith('movt'):
            a,b=[x.strip() for x in op.split(',',1)]
            lab[a]=lab.get(b,'const'+b) if not b.startswith('#') else 'imm'+b
        elif mn.startswith('movs') : pass
        elif mn.startswith('ldr') and '[sp' in op:
            a=op.split(',')[0].strip(); mm=re.search(r'#(0x[0-9a-f]+)',op); off=int(mm.group(1),16) if mm else 0
            lab[a]=f'stk{(off-spoff)//4+4}' if False else f'p{4+(off-spoff)//4}'
        elif mn.startswith('ldr'):
            a=op.split(',')[0].strip(); mm=re.search(r'\[(\w+)(?:, #(0x[0-9a-f]+))?\]',op)
            lab[a]=f'{mm.group(1)}+{mm.group(2) or 0}' if mm else '?'
        elif mn.startswith('movw') or mn.startswith('mvn'): lab[op.split(',')[0].strip()]='imm'+op.split(',')[1].strip()
        elif mn.startswith('adds') or mn.startswith('add'):
            a=op.split(',')[0].strip(); 
            if a in('r1','r2','r3','r0') and 'pc' not in op: lab[a]=f'{op}'
        if mn in('bl','blx'):
            mm=re.search(r'-> (.*)$',note)
            if mm and ('Attr' in mm.group(1) or 'Command::' in mm.group(1)) :
                out.append(f"{mm.group(1).split('(')[0].replace('hydra::','')}({lab.get('r1','?')}{', '+lab.get('r2','?') if 'Dictionary' in mm.group(1) else ''})")
            elif mm and ('Attr' in mm.group(1)): pass
        s=re.search(r'"(.*)"$',note)
        if s: out.append('"'+s.group(1)+'"')
        if mn in('bl','blx'):
            for r in('r1','r2','r3','r0'): lab.pop(r,None) if False else None
    return out
if __name__=='__main__':
  for k,(n,sz,raw,th) in sorted(D.syms.items()):
    m=re.match(r'^(Command\w*)::(\{base ctor\}|\{ctor\}|commonInit)\((.*)\)$',n)
    if m and th and sz and m.group(1) not in('CommandResources','CommandQueue','CommandManager'):
        print(f'{m.group(1)}::{m.group(2)}({m.group(3)})')
        print('    ',' '.join(trace(k,sz)))
