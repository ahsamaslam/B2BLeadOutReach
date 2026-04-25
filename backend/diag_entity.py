"""Test different URL formats for SDAT entity detail after getting the dept ID."""
import requests

session = requests.Session()
session.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'

dept_id = 'T00519669'  # Camp Bow Wow Columbia MD (Active)

# Test 1: GET EntityDetail with departmentId param
r = session.get(f'https://egov.maryland.gov/BusinessExpress/EntitySearch/EntityDetail?departmentId={dept_id}', timeout=10)
print(f'Test1 GET ?departmentId: {r.status_code} URL={r.url} len={len(r.text)}')
print(f'  "CAMP BOW" in text: {"CAMP BOW" in r.text.upper()}')

# Test 2: GET the /Business page directly
r2 = session.get(f'https://egov.maryland.gov/BusinessExpress/EntitySearch/Business?BusinessDepartmentId={dept_id}', timeout=10)
print(f'Test2 GET Business: {r2.status_code} URL={r2.url} len={len(r2.text)}')
print(f'  "CAMP BOW" in text: {"CAMP BOW" in r2.text.upper()}')

# Test 3: GET with id param
r3 = session.get(f'https://egov.maryland.gov/BusinessExpress/EntitySearch/EntityDetail?id={dept_id}', timeout=10)
print(f'Test3 GET ?id: {r3.status_code} URL={r3.url} len={len(r3.text)}')
print(f'  "CAMP BOW" in text: {"CAMP BOW" in r3.text.upper()}')

# Test 4: POST to /Business without Turnstile (see if it's required)
from bs4 import BeautifulSoup
r_init = session.get('https://egov.maryland.gov/BusinessExpress/EntitySearch', timeout=10)
soup = BeautifulSoup(r_init.text, 'lxml')
csrf = soup.find('input', {'name': '__RequestVerificationToken'})
csrf_val = csrf['value'] if csrf else ''

r4 = session.post(
    'https://egov.maryland.gov/BusinessExpress/EntitySearch/Business',
    data={
        '__RequestVerificationToken': csrf_val,
        'BusinessDepartmentId': dept_id,
        'TabToShow': '0',
        'cf-turnstile-response': 'test_no_token',
    },
    headers={
        'Referer': 'https://egov.maryland.gov/BusinessExpress/EntitySearch',
        'Origin': 'https://egov.maryland.gov',
        'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout=10,
    allow_redirects=True,
)
print(f'Test4 POST Business (no real token): {r4.status_code} URL={r4.url} len={len(r4.text)}')
body4 = r4.text.upper()
print(f'  "CAMP BOW" in text: {"CAMP BOW" in body4}')
print(f'  "CAPTCHA" / "VERIFY" in text: {"CAPTCHA" in body4 or "UNABLE TO VERIFY" in body4}')
print(f'  First 300 chars of body: {r4.text[:300]}')

# Test 5: Save body of test4 for inspection  
with open('/tmp/business_detail.html', 'w') as f:
    f.write(r4.text)
print('Saved /tmp/business_detail.html')
