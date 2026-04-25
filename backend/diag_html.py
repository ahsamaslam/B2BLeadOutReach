import re
from bs4 import BeautifulSoup
with open('/tmp/sdat_response.html') as f:
    html = f.read()
soup = BeautifulSoup(html, 'lxml')
# Find table with GoToBusiness
for table in soup.find_all('table'):
    rows = table.find_all('tr')
    if rows and any('GoToBusiness' in str(r) for r in rows):
        print('TABLE:')
        for row in rows[:6]:
            print('  ROW:', row.get_text(' ', strip=True)[:120])
            for a in row.find_all('a'):
                print('    LINK href:', a.get('href','')[:100])
        break
# GoToBusiness pattern
matches = re.findall(r"GoToBusiness\('([^']+)',\s*(\d+),\s*(true|false)\)", html)
print('GoToBusiness calls:', matches[:5])
# Also check all a tags with GoToBusiness
for a in soup.find_all('a', href=re.compile('GoToBusiness')):
    print('GoToBusiness a:', a.get('href','')[:80], '|', a.get_text(strip=True)[:50])
