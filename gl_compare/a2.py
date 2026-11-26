import pickle
from collections import defaultdict,Counter
N,O,match,un_new,un_old=pickle.load(open('s1.pkl','rb'))
key=lambda v:(v[0],v[2],v[3])
gn=defaultdict(list); go=defaultdict(list)
for i in un_new: gn[key(N[i])].append(i)
for j in un_old: go[key(O[j])].append(j)
changed={}
for k in gn:
    if k not in go: continue
    pairs=sorted(((sum(a==b for a,b in zip(N[i],O[j])),i,j) for i in gn[k] for j in go[k]),key=lambda t:(-t[0],abs(t[1]-t[2])))
    ui=set();uj=set()
    for s,i,j in pairs:
        if i in ui or j in uj: continue
        ui.add(i);uj.add(j);changed[i]=j
added=[i for i in un_new if i not in changed]
cj=set(changed.values())
deleted=[j for j in un_old if j not in cj]
print('changed',len(changed),'added',len(added),'deleted',len(deleted))
cols=Counter()
for i,j in changed.items():
    for c in range(17):
        if N[i][c]!=O[j][c]: cols[c]+=1
print(cols)
print('check: new total',len(N),'=',len(match)+len(changed)+len(added),' old',len(O),'=',len(match)+len(changed)+len(deleted))
pickle.dump((N,O,changed,added,deleted),open('s2.pkl','wb'))
