import pickle
from collections import defaultdict,Counter
N,O,changed,added,deleted=pickle.load(open('s2.pkl','rb'))
key=lambda v:(v[0],v[15],v[16])
gn=defaultdict(list); go=defaultdict(list)
for i in added: gn[key(N[i])].append(i)
for j in deleted: go[key(O[j])].append(j)
c2={}
for k in gn:
    if k not in go: continue
    pairs=sorted(((sum(a==b for a,b in zip(N[i],O[j])),i,j) for i in gn[k] for j in go[k]),key=lambda t:(-t[0],abs(t[1]-t[2])))
    ui=set();uj=set()
    for s,i,j in pairs:
        if i in ui or j in uj: continue
        ui.add(i);uj.add(j);c2[i]=j
changed.update(c2)
added=[i for i in added if i not in c2]
cj=set(c2.values()); deleted=[j for j in deleted if j not in cj]
print('changed',len(changed),'added',len(added),'deleted',len(deleted))
for j in deleted: print(j,O[j])
diffcells={i:[c for c in range(17) if N[i][c]!=O[j][c]] for i,j in changed.items()}
pickle.dump((N,O,changed,added,deleted,diffcells),open('final.pkl','wb'))
