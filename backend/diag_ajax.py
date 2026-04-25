"""
Find the AJAX endpoint used by the entity detail page to load business data.
"""
import requests, os, re
import capsolver
from bs4 import BeautifulSoup

capsolver.api_key = os.environ['CAPSOLVER_API_KEY']
SITEKEY = '0x4AAAAAACrspThEZJdPCE9i'
BASE = 'https://egov.maryland.gov'
SEARCH_URL = f'{BASE}/BusinessExpress/EntitySearch'

session = requests.Session()
session.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'

# Step 1: GET search page for cookies + CSRF
r1 = session.get(SEARCH_URL, timeout=15)
soup1 = BeautifulSoup(r1.text, 'lxml')
csrf = soup1.find('input', {'name': '__RequestVerificationToken'})
csrf_token = csrf['value'] if csrf else ''
print(f'CSRF ok, cookies: {list(session.cookies.keys())}')

# Step 2: Solve Turnstile #1
tok1 = capsolver.solve({'type': 'AntiTurnstileTaskProxyLess', 'websiteURL': SEARCH_URL, 'websiteKey': SITEKEY})['token']
print(f'Token1: {tok1[:30]}...')

# Step 3: POST search
session.headers.update({'Referer': SEARCH_URL, 'Origin': BASE, 'Content-Type': 'application/x-www-form-urlencoded'})
r2 = session.post(f'{SEARCH_URL}?searchAction=Search', data={
    '__RequestVerificationToken': csrf_token, 'BusinessName': 'Charm City Veterinary Hospital',
    'SearchType': 'BusinessName', 'cf-turnstile-response': tok1,
    'SearchAction': 'Search', 'ReturnUrl': '', 'CblpLinkId': '0',
    'UserRegistrationId': '0', 'FilingId': '0', 'Subheading': '',
}, timeout=20, allow_redirects=True)
print(f'Search POST: {r2.status_code}')

# Extract GoToBusiness ID
go_re = re.compile(r"GoToBusiness\('([^']+)'")
dept_ids = [(m.group(1), row.get_text()) for row in BeautifulSoup(r2.text, 'lxml').find_all('tr')
            for m in [go_re.search(str(row))] if m]
print(f'GoToBusiness IDs: {dept_ids[:3]}')
dept_id = next((did for did, txt in dept_ids if 'Active' in txt), dept_ids[0][0] if dept_ids else None)
print(f'Using: {dept_id}')

# Step 4: Solve Turnstile #2
tok2 = capsolver.solve({'type': 'AntiTurnstileTaskProxyLess', 'websiteURL': SEARCH_URL, 'websiteKey': SITEKEY})['token']
print(f'Token2: {tok2[:30]}...')

# Step 5: POST to /Business
session.headers['Referer'] = f'{SEARCH_URL}?searchAction=Search'
r3 = session.post(f'{BASE}/BusinessExpress/EntitySearch/Business', data={
    'BusinessDepartmentId': dept_id,
    'TabToShow': '0',
    'cf-turnstile-response': tok2,
}, timeout=20, allow_redirects=True)
print(f'Entity POST: {r3.status_code} URL={r3.url} len={len(r3.text)}')
with open('/tmp/entity_detail.html', 'w') as f:
    f.write(r3.text)
print('Saved /tmp/entity_detail.html')

soup3 = BeautifulSoup(r3.text, 'lxml')
body_txt = soup3.get_text(' ', strip=True)
print(f'Body (0-500): {body_txt[:500]}')
print(f'Body (500-1000): {body_txt[500:1000]}')
print(f'Body (1000-1500): {body_txt[1000:1500]}')

# Look for JS AJAX calls
print('\n--- AJAX patterns in HTML ---')
for m in re.finditer(r'(ajax|fetch|url\s*:|\.get\(|\.post\(|getJSON|XMLHttpRequest)[^\n]{0,150}', r3.text, re.IGNORECASE):
    if 'EntitySearch' in m.group() or 'Business' in m.group() or 'api' in m.group().lower():
        print('  AJAX:', m.group()[:200])

# Look for data- attributes with URLs
print('\n--- data-* attributes ---')
for tag in soup3.find_all(True):
    for attr, val in tag.attrs.items():
        if attr.startswith('data-') and isinstance(val, str) and ('url' in attr.lower() or 'api' in attr.lower() or 'endpoint' in attr.lower()):
            print(f'  {attr}={val}')

# Look for embedded JSON
print('\n--- Script embedded JSON ---')
for sc in soup3.find_all('script'):
    txt = sc.get_text()
    if ('departmentId' in txt or 'registered' in txt.lower() or 'resident' in txt.lower() or 'filingNumber' in txt):
        print(f'  SCRIPT ({len(txt)} chars): {txt[:300]}')

# Check any AJAX calls in the JS bundle
print('\n--- Trying JS bundle ---')
bundle_url = f'{BASE}/BusinessExpress/bundles/Scripts/pages/entitysearch'
rb = session.get(bundle_url, timeout=15)
print(f'Bundle: {rb.status_code} len={len(rb.text)}')
if rb.status_code == 200:
    with open('/tmp/bundle_entitysearch.js', 'w') as f:
        f.write(rb.text)
    # Search for API URLs
    for m in re.finditer(r'["\']([^"\']*(?:Business|Entity|Detail|api)[^"\']{3,50})["\']', rb.text):
        url = m.group(1)
        if '/' in url and not url.startswith('//'):
            print(f'  URL: {url}')
