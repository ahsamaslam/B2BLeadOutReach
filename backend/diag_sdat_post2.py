"""
Debug what the SDAT POST actually returns after a successful Turnstile solve.
Captures the HTML and looks for any result patterns.
"""
import requests
import os
from bs4 import BeautifulSoup

# Step 1: Get cookies + CSRF
session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
})
r1 = session.get('https://egov.maryland.gov/BusinessExpress/EntitySearch', timeout=15)
soup = BeautifulSoup(r1.text, 'lxml')
csrf = soup.find('input', {'name': '__RequestVerificationToken'})
csrf_token = csrf['value'] if csrf else ''
print(f'CSRF: {csrf_token[:20]}... Cookies: {list(session.cookies.keys())}')

# Step 2: CapSolver
import capsolver
capsolver.api_key = os.environ['CAPSOLVER_API_KEY']
sol = capsolver.solve({
    'type': 'AntiTurnstileTaskProxyLess',
    'websiteURL': 'https://egov.maryland.gov/BusinessExpress/EntitySearch',
    'websiteKey': '0x4AAAAAACrspThEZJdPCE9i',
})
token = sol['token']
print(f'Token: {token[:30]}...')

# Step 3: POST
session.headers.update({
    'Referer': 'https://egov.maryland.gov/BusinessExpress/EntitySearch',
    'Origin': 'https://egov.maryland.gov',
    'Content-Type': 'application/x-www-form-urlencoded',
})
post_data = {
    '__RequestVerificationToken': csrf_token,
    'SearchAction': 'Search',
    'ReturnUrl': '',
    'CblpLinkId': '0',
    'UserRegistrationId': '0',
    'FilingId': '0',
    'Subheading': '',
    'cf-turnstile-response': token,
    'BusinessName': 'Camp Bow Wow',
    'DepartmentId': '',
    'FEINNumber': '',
    'SearchType': 'BusinessName',
}
r2 = session.post(
    'https://egov.maryland.gov/BusinessExpress/EntitySearch?searchAction=Search',
    data=post_data,
    timeout=20,
    allow_redirects=True,
)
print(f'POST Status: {r2.status_code}  URL: {r2.url}  Len: {len(r2.text)}')

soup2 = BeautifulSoup(r2.text, 'lxml')

# Check for captcha error
body = soup2.get_text(' ', strip=True)
if 'Unable to verify captcha' in body:
    print('ERROR: Captcha rejected!')
elif 'enable Javascript' in body:
    print('WARNING: JS-rendered page - results are in XHR, not this HTML')
    
# Save raw HTML
with open('/tmp/sdat_response.html', 'w') as f:
    f.write(r2.text)
print('Saved HTML to /tmp/sdat_response.html')

# Show all links
all_links = [(a.get('href',''), a.get_text(strip=True)[:60]) for a in soup2.find_all('a', href=True)]
print(f'\nAll links ({len(all_links)}):')
for href, text in all_links[:20]:
    print(f'  {href[:80]} | {text}')

# Also check if there are any script tags that have the search result data embedded
scripts = soup2.find_all('script')
for sc in scripts:
    txt = sc.get_text()
    if 'EntityDetail' in txt or 'filingNumber' in txt or 'businessName' in txt:
        print(f'\nScript with entity data: {txt[:300]}')

# Show key parts of body
print(f'\nBody text (first 500): {body[:500]}')
print(f'Body text (500-1000): {body[500:1000]}')

# Also try a GET to the search URL with params (some ASP.NET apps support both)
print('\n=== Trying GET search ===')
r3 = session.get(
    'https://egov.maryland.gov/BusinessExpress/EntitySearch/Search',
    params={'BusinessName': 'Camp Bow Wow', 'SearchType': 'BusinessName'},
    timeout=15,
    allow_redirects=True,
)
print(f'GET Status: {r3.status_code}  URL: {r3.url}  Len: {len(r3.text)}')
soup3 = BeautifulSoup(r3.text, 'lxml')
entity_links = [a['href'] for a in soup3.find_all('a', href=True) if 'EntityDetail' in a.get('href','')]
print(f'EntityDetail links in GET: {entity_links[:3]}')
