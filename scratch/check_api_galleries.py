import urllib.request
import json

req = urllib.request.Request('http://localhost:5000/api/content')
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())

print('=== Campus photos count:', len(data.get('photos', [])))
for idx, p in enumerate(data.get('photos', [])):
    print(f"  Campus Photo {idx+1}: {p.get('id')} | {p.get('label')} | {p.get('src')}")

print('\n=== Programmes Gallery check:')
for prog in data.get('programmes', []):
    gal = prog.get('gallery', [])
    print(f"  {prog.get('id')} | {prog.get('title')} | Gallery Count: {len(gal)}")
    for item in gal:
        print(f"      - {item.get('id')} | {item.get('label')} | {item.get('src')}")
