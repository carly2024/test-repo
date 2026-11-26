import json,pickle
T='/root/.claude/projects/-home-user-test-repo/edc7220d-a332-57b2-ab9e-d94dcf82dfad/tool-results/'
def load(files, starts):
    rows={}
    for f,s in zip(files,starts):
        v=json.load(open(T+f)).get('values',[])
        for i,r in enumerate(v):
            rows[s+i]=r
    return rows
new=load(['mcp-Google_Sheets-get_values-1795689808931-e3gxl0.txt','mcp-Google_Sheets-get_values-1795689813403-90hg7m.txt','mcp-Google_Sheets-get_values-1795689815001-ctzsm7.txt'],[1,6001,12001])
old=load(['mcp-Google_Sheets-get_values-1795689817295-namd21.txt','mcp-Google_Sheets-get_values-1795689818888-bvq9of.txt','mcp-Google_Sheets-get_values-1795689820442-3oc6i0.txt'],[1,6001,12001])
pickle.dump((new,old),open('data.pkl','wb'))
print(len(new),max(new),len(old),max(old))
