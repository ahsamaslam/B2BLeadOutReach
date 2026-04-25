"""Examine the entity detail HTML structure for owner/status fields."""
from bs4 import BeautifulSoup
import re

with open('/tmp/entity_detail.html') as f:
    html = f.read()

soup = BeautifulSoup(html, 'lxml')

# Strip noise tags
for tag in soup.find_all(["nav", "header", "footer", "script", "style", "noscript", "iframe", "svg"]):
    tag.decompose()

# Get clean text
text = soup.get_text(' ', strip=True)

# Look for "Owner" and "Status" context in cleaned text
for keyword in ['Owner', 'Status', 'Resident Agent', 'General Information']:
    idx = text.find(keyword)
    if idx > 0:
        print(f'\n--- {keyword} context ---')
        print(repr(text[idx:idx+200]))

# Inspect the HTML around "owner"
print('\n\n--- HTML around "Owner:" ---')
for m in re.finditer(r'Owner', html, re.IGNORECASE):
    start = max(0, m.start() - 100)
    end = min(len(html), m.end() + 400)
    snippet = html[start:end]
    if '<' in snippet:  # only HTML context
        print(snippet[:500])
        print('...')
        break

# Also look at definition lists
print('\n--- All DL/DT/DD elements ---')
for dl in soup.find_all('dl'):
    for dt in dl.find_all('dt'):
        dd = dt.find_next_sibling('dd')
        dd_txt = dd.get_text(strip=True)[:80] if dd else "N/A"
        print(f'  DT: {dt.get_text(strip=True)!r:40} DD: {dd_txt!r}')

# Look at tables
print('\n--- Table rows ---')
for table in soup.find_all('table'):
    for row in table.find_all('tr')[:10]:
        cells = [td.get_text(strip=True) for td in row.find_all(['th','td'])]
        if any(cells):
            print(f'  ROW: {cells}')

# Look at divs with class containing "field" or "label"
print('\n--- Divs with field/label classes ---')
for div in soup.find_all('div', class_=True):
    cls = ' '.join(div.get('class', []))
    if any(kw in cls.lower() for kw in ('field', 'label', 'detail', 'info', 'row')):
        txt = div.get_text(' ', strip=True)
        if txt and len(txt) > 3:
            print(f'  class={cls!r}: {txt[:100]}')
