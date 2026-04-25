import os, requests

key = os.getenv('HUNTER_API_KEY', '')
if not key:
    print("NO API KEY")
    exit(1)

domains = [
    ('thedogresort.com', 'The Dog Resort'),
    ('creaturecomfortspetresorts.com', 'Creature Comforts Pet Resorts'),
    ('marylandvetsurgical.com', 'Maryland Veterinary Surgical Services'),
    ('fallsroadanimalhospital.com', 'Falls Road Animal Hospital'),
]

for domain, company in domains:
    r = requests.get(
        f'https://api.hunter.io/v2/domain-search?domain={domain}&api_key={key}&limit=5',
        timeout=10
    )
    d = r.json().get('data', {})
    emails = d.get('emails', [])
    print(f'{company} ({domain}): {len(emails)} emails in Hunter DB')
    for e in emails[:2]:
        print(f'  {e.get("value")} [{e.get("type")}]')
