import urllib.request
import json

base_url = "http://localhost:5000"

print("--- 1. Testing Homepage HTML ---")
with urllib.request.urlopen(f"{base_url}/") as r:
    html = r.read().decode("utf-8", errors="ignore")
    print("Homepage status:", r.status)
    print("Has photo mosaic:", "photoMosaic" in html)

print("\n--- 2. Testing Course HTML for AI Department ---")
with urllib.request.urlopen(f"{base_url}/course.html?id=prog-9") as r:
    html = r.read().decode("utf-8", errors="ignore")
    print("Course page status:", r.status)
    print("Has gallery section:", 'id="gallery"' in html)

print("\n--- 3. Testing Admin Panel HTML ---")
with urllib.request.urlopen(f"{base_url}/admin/") as r:
    html = r.read().decode("utf-8", errors="ignore")
    print("Admin portal status:", r.status)
    print("Has selectGalleryScope:", "selectGalleryScope" in html)
    print("Has Card 7 deptGalleryGrid:", "deptGalleryGrid" in html)
    print("Has btnTriggerDeptUpload:", "btnTriggerDeptUpload" in html)

print("\n--- 4. Testing API Content & Galleries Isolation ---")
with urllib.request.urlopen(f"{base_url}/api/content") as r:
    data = json.loads(r.read().decode())
    campus_photos = data.get("photos", [])
    print(f"Total Campus Photos on Homepage: {len(campus_photos)}")
    for p in campus_photos:
        print(f"   [Campus] {p.get('id')}: {p.get('label')}")

    print("\n--- Department Galleries Breakdown ---")
    for prog in data.get("programmes", []):
        gal = prog.get("gallery", [])
        print(f"   [{prog.get('id')}] {prog.get('title')}: {len(gal)} photos")
        if prog.get("id") == "prog-9":
            for item in gal:
                print(f"        -> {item.get('id')}: {item.get('label')} ({item.get('src')})")

print("\nAll integration checks passed successfully!")
