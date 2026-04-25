"""Test _parse_maryland_detail against the saved entity HTML."""
import sys
sys.path.insert(0, '/app')
from bs4 import BeautifulSoup
from app.services.sos_service import _parse_maryland_detail, _looks_like_person

with open('/tmp/entity_detail.html') as f:
    html = f.read()

soup = BeautifulSoup(html, 'lxml')
result = _parse_maryland_detail(soup, 'https://egov.maryland.gov/BusinessExpress/EntitySearch/Business')

print('=== PARSE RESULTS ===')
print(f'registered_agent : {result.registered_agent!r}')
print(f'entity_type      : {result.entity_type!r}')
print(f'status           : {result.status!r}')
print(f'owner_name       : {result.owner_name!r}')
print(f'raw_names[:8]    : {result.raw_names[:8]}')
print(f'best_owner_name  : {result.best_owner_name()!r}')

print('\n=== LOOKS LIKE PERSON? ===')
for n in result.raw_names[:8]:
    print(f'  {n!r}: {_looks_like_person(n)}')
