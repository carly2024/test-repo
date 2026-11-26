import pickle,re
from collections import defaultdict,Counter
new,old=pickle.load(open('data.pkl','rb'))
def norm(r):
    r=(list(r)+['']*17)[:17]
    out=[]
    for i,c in enumerate(r):
        c=str(c).strip()
        if i in (0,15,16) and re.fullmatch(r'-?[\d,]+(\.\d+)?',c): c=c.replace(',','')
        out.append(c)
    return tuple(out)
N={i:norm(r) for i,r in new.items() if i>1}
O={i:norm(r) for i,r in old.items() if i>1}
# blank rows
print('blank new',sum(1 for v in N.values() if not any(v)),'blank old',sum(1 for v in O.values() if not any(v)))
idx=defaultdict(list)
for i,v in O.items(): idx[v].append(i)
match={}
un_new=[]
for i in sorted(N):
    v=N[i]
    if idx[v]: match[i]=idx[v].pop(0)
    else: un_new.append(i)
un_old=sorted(j for l in idx.values() for j in l)
print('exact',len(match),'unNew',len(un_new),'unOld',len(un_old))
pickle.dump((N,O,match,un_new,un_old),open('s1.pkl','wb'))
for i in un_new[:15]: print('N',i,N[i])
for j in un_old[:15]: print('O',j,O[j])
