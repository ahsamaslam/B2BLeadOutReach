import re
with open('/tmp/sdat_response.html') as f:
    html = f.read()
# Find any sitekey mentions in scripts
for m in re.finditer(r'sitekey|SITEKEY|SiteKey|0x4AAAA', html):
    start = max(0, m.start()-50)
    end = min(len(html), m.end()+100)
    print('MATCH:', html[start:end])
    print('---')
# Find all script src= references
import re
for m in re.finditer(r'<script[^>]+src=["\']([^"\']+)', html):
    print('SCRIPT SRC:', m.group(1))
