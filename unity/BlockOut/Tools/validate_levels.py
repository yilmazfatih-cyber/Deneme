#!/usr/bin/env python3
"""levels.txt bölümlerini çözer; çözülemeyen bölümü bildirir.
Kullanım: python3 Tools/validate_levels.py Assets/Resources/levels.txt [-v]
Kurallar Assets/Scripts/Core/Board.cs ile birebir aynıdır."""
import sys, collections
DIRS = {'U':(0,-1),'D':(0,1),'L':(-1,0),'R':(1,0)}

def parse(text):
    levels=[]; cur=None; mode=None
    for raw in text.splitlines():
        line=raw.rstrip('\n')
        if line.startswith('#') or not line.strip():
            if mode=='map' and not line.strip(): mode=None
            continue
        if line.startswith('level:'):
            cur={'name':line[6:].strip(),'map':[],'colors':{},'frozen':{},'gates':[],'time':60}; levels.append(cur); mode=None; continue
        if line.startswith('time:'): cur['time']=int(line[5:]); mode=None; continue
        if line.startswith('map:'): mode='map'; continue
        if line.startswith('colors:'):
            mode=None
            for p in line[7:].split(): k,v=p.split(':'); cur['colors'][k]=v
            continue
        if line.startswith('frozen:'):
            mode=None
            for p in line[7:].split(): k,v=p.split(':'); cur['frozen'][k]=int(v)
            continue
        if line.startswith('gates:'):
            mode=None
            for g in line[6:].split(';'):
                s,st,ln,c=[x.strip() for x in g.split(',')]; cur['gates'].append((s,int(st),int(ln),c))
            continue
        if mode=='map': cur['map'].append(line.strip())
    return levels

def build(lv):
    rows=lv['map']; H=len(rows); W=len(rows[0])
    assert all(len(r)==W for r in rows), lv['name']
    blocks={}; walls=set()
    for y,r in enumerate(rows):
        for x,ch in enumerate(r):
            if ch=='#': walls.add((x,y))
            elif ch!='.': blocks.setdefault(ch,[]).append((x,y))
    for b in blocks: assert b in lv['colors'], (lv['name'],b)
    return W,H,walls,blocks

def can_exit(W,H,cells,color,gates,side,frozen_left):
    if frozen_left>0: return False
    xs=[c[0] for c in cells]; ys=[c[1] for c in cells]
    if side=='U' and min(ys)!=0: return False
    if side=='D' and max(ys)!=H-1: return False
    if side=='L' and min(xs)!=0: return False
    if side=='R' and max(xs)!=W-1: return False
    lo,hi=(min(xs),max(xs)) if side in 'UD' else (min(ys),max(ys))
    for s,st,ln,c in gates:
        if s==side and c==color and st<=lo and st+ln-1>=hi: return True
    return False

import heapq, itertools
def solve(lv, cap=300000):
    """Best-first search with greedy exits: removing a block never hurts, so every state first exits
    everything it can (closure), then branches on single-step slides. Priority = remaining blocks."""
    W,H,walls,blocks=build(lv)
    ids=sorted(blocks); total=len(ids)
    def closure(st):
        changed=True; moves=[]
        while changed:
            changed=False
            exited=total-len(st)
            for idx,(i,dx,dy) in enumerate(st):
                cells=[(x+dx,y+dy) for x,y in blocks[i]]
                fl=lv['frozen'].get(i,0)-exited
                for d in 'UDLR':
                    if can_exit(W,H,cells,lv['colors'][i],lv['gates'],d,fl):
                        st=st[:idx]+st[idx+1:]; moves.append(f'{i} exit {d}'); changed=True; break
                if changed: break
        return st,moves
    start,m0=closure(tuple((i,0,0) for i in ids))
    prev={start:None}; cnt=itertools.count(); pq=[(len(start),0,next(cnt),start)]
    while pq:
        _,g,_,st=heapq.heappop(pq)
        if not st:
            path=[]; s=st
            while prev[s]: path.extend(reversed(prev[s][1])); s=prev[s][0]
            return m0+list(reversed(path))
        if len(prev)>cap: return None
        o={}
        for i,dx,dy in st:
            for x,y in blocks[i]: o[(x+dx,y+dy)]=i
        for idx,(i,dx,dy) in enumerate(st):
            cells=[(x+dx,y+dy) for x,y in blocks[i]]
            for d,(ddx,ddy) in DIRS.items():
                if all(0<=x+ddx<W and 0<=y+ddy<H and (x+ddx,y+ddy) not in walls and o.get((x+ddx,y+ddy),i)==i for x,y in cells):
                    ns=st[:idx]+((i,dx+ddx,dy+ddy),)+st[idx+1:]
                    ns,ms=closure(ns)
                    if ns not in prev:
                        prev[ns]=(st,[f'{i} {d}']+ms); heapq.heappush(pq,(len(ns)*1000+g+1,g+1,next(cnt),ns))
    return None

if __name__=='__main__':
    text=open(sys.argv[1],encoding='utf-8').read()
    for lv in parse(text):
        W,H,walls,blocks=build(lv)
        # check gate spans in bounds
        for s,st,ln,c in lv['gates']:
            lim=W if s in 'UD' else H
            assert 0<=st and st+ln<=lim, (lv['name'],s,st,ln)
        for b,cells in blocks.items():
            # connectivity check
            todo=[cells[0]]; seen={cells[0]}
            while todo:
                x,y=todo.pop()
                for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                    if (nx,ny) in cells and (nx,ny) not in seen: seen.add((nx,ny)); todo.append((nx,ny))
            assert len(seen)==len(cells), f"level {lv['name']}: block {b} is not connected"
        p=solve(lv)
        print(f"level {lv['name']}: {W}x{H} blocks={len(blocks)} ->", 'UNSOLVABLE' if p is None else f'{len(p)} steps')
        if p is not None and '-v' in sys.argv: print('  ', ' | '.join(p))

def diag(lv, cap=400000):
    """Report best reachable state: fewest remaining blocks and which ones remain."""
    W,H,walls,blocks=build(lv)
    ids=sorted(blocks); total=len(ids)
    start=tuple((i,0,0) for i in ids)
    seen={start}; q=collections.deque([start]); best=start
    while q and len(seen)<cap:
        st=q.popleft()
        if len(st)<len(best): best=st
        o={}
        for i,dx,dy in st:
            for x,y in blocks[i]: o[(x+dx,y+dy)]=i
        exited=total-len(st)
        for idx,(i,dx,dy) in enumerate(st):
            cells=[(x+dx,y+dy) for x,y in blocks[i]]
            fl=lv['frozen'].get(i,0)-exited
            for d,(ddx,ddy) in DIRS.items():
                if can_exit(W,H,cells,lv['colors'][i],lv['gates'],d,fl):
                    ns=st[:idx]+st[idx+1:]
                    if ns not in seen: seen.add(ns); q.append(ns)
                    continue
                if all(0<=x+ddx<W and 0<=y+ddy<H and (x+ddx,y+ddy) not in walls and o.get((x+ddx,y+ddy),i)==i for x,y in cells):
                    ns=st[:idx]+((i,dx+ddx,dy+ddy),)+st[idx+1:]
                    if ns not in seen: seen.add(ns); q.append(ns)
    return sorted(i for i,_,_ in best)
