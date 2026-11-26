import json,pickle
from collections import Counter
N,O,changed,added,deleted,diff=pickle.load(open('final.pkl','rb'))
d=json.load(open('/root/.claude/projects/-home-user-test-repo/edc7220d-a332-57b2-ab9e-d94dcf82dfad/tool-results/mcp-Google_Sheets-get_spreadsheet-1795690620129-6719eh.txt'))
rows=d['content']['sheets'][0]['data'][0].get('rowData',[])
def cls(c):
    bg=(c or {}).get('userEnteredFormat',{}).get('backgroundColor')
    if not bg: return None
    r,g,b=bg.get('red',0),bg.get('green',0),bg.get('blue',0)
    if r==1 and g==1 and b==0: return 'Y'
    if abs(r-0.6)<0.01 and b==1: return 'B'
    if r==1 and g==1 and b==1: return None
    return 'other%s'%((round(r,2),round(g,2),round(b,2)),)
bad=Counter(); others=Counter()
for ri in range(1,17490):
    vals=rows[ri].get('values',[]) if ri<len(rows) else []
    row=ri+1
    for c in list(range(17))+[20]:
        got=cls(vals[c]) if c<len(vals) else None
        if c==20: exp='B' if row in added else 'Y' if row in changed else None
        else: exp='Y' if row in changed and c in diff[row] else None
        if got and got.startswith('other'): others[got]+=1; continue
        if got!=exp: bad[(c,exp,got)]+=1
print('mismatches',sum(bad.values()),bad.most_common(10)); print('pre-existing other colors',others.most_common(5))
