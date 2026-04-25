"""
Full SOS service test with real CapSolver key.
Tests: DDG -> Bing -> CapSolver+requests flow for Maryland SDAT.
"""
import logging
import time

# Show only sos_service debug logs to see which tier is used
logging.basicConfig(level=logging.WARNING, format='%(name)s %(levelname)s: %(message)s')
logging.getLogger('app.services.sos_service').setLevel(logging.DEBUG)

from app.services.sos_service import lookup_owner_from_sos

tests = [
    ('Camp Bow Wow Rockville', 'Maryland, USA'),
    ('Dogtopia of Columbia', 'Maryland, USA'),
    ('Charm City Veterinary Hospital', 'Maryland, USA'),
    ('Veterinary Referral Associates', 'Maryland, USA'),
]

print('=' * 60)
print('SOS OWNER LOOKUP TEST (DDG -> Bing -> CapSolver)')
print('=' * 60)

total_start = time.time()
for name, loc in tests:
    t = time.time()
    print(f'\n{name}:')
    try:
        r = lookup_owner_from_sos(name, loc)
        elapsed = time.time() - t
        if r:
            owner = r.best_owner_name()
            print(f'  owner        = {owner!r}')
            print(f'  agent        = {r.registered_agent!r}')
            print(f'  entity_type  = {r.entity_type!r}')
            print(f'  status       = {r.status!r}')
            print(f'  raw_names    = {r.raw_names[:4]}')
            print(f'  source_url   = {r.source_url}')
            print(f'  time         = {elapsed:.1f}s')
        else:
            print(f'  NOT FOUND ({elapsed:.1f}s)')
    except Exception as e:
        print(f'  ERROR: {e}')

print(f'\nTotal time: {time.time()-total_start:.1f}s')
print('=' * 60)
