import re
with open('/tmp/sdat_response.html') as f:
    html = f.read()
sitekeys = re.findall(r'sitekey=["\']?(0x[A-Za-z0-9]+)', html)
print('Sitekeys:', sitekeys)
for m in re.finditer(r'cf-turnstile[^>]{0,200}', html):
    print('Turnstile tag:', m.group()[:150])
idx = html.find('business-info-captcha-form')
if idx > 0:
    print('FORM context:')
    print(html[idx:idx+800])
