import urllib.request
import urllib.parse
import json
import uuid

# First log in as admin to get token
login_data = json.dumps({"username": "doomsday", "password": "ironman"}).encode()
login_req = urllib.request.Request("http://localhost:5000/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(login_req) as resp:
    res = json.loads(resp.read().decode())
    token = res["token"]

print("Logged in as doomsday, token acquired.")

# Test uploading a file via multipart form to prog-9 (AI department)
boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
body = []

# Add prog_id
body.append(f"--{boundary}".encode())
body.append(b'Content-Disposition: form-data; name="prog_id"')
body.append(b'')
body.append(b'prog-9')

# Add label
body.append(f"--{boundary}".encode())
body.append(b'Content-Disposition: form-data; name="label"')
body.append(b'')
body.append(b'AI Robotics Neural Vision Rig')

# Add section
body.append(f"--{boundary}".encode())
body.append(b'Content-Disposition: form-data; name="section"')
body.append(b'')
body.append(b'photos')

# Add dummy image file (1x1 transparent png)
png_1x1 = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
body.append(f"--{boundary}".encode())
body.append(b'Content-Disposition: form-data; name="file"; filename="test_ai_robotics.png"')
body.append(b'Content-Type: image/png')
body.append(b'')
body.append(png_1x1)
body.append(f"--{boundary}--".encode())
body.append(b'')

payload = b"\r\n".join(body)

upload_req = urllib.request.Request(
    "http://localhost:5000/api/upload",
    data=payload,
    headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Authorization": f"Bearer {token}"
    }
)

with urllib.request.urlopen(upload_req) as resp:
    upload_res = json.loads(resp.read().decode())
    print("Upload Response:", upload_res)
    uploaded_photo_id = upload_res.get("photo", {}).get("id")

# Verify GET /api/content
with urllib.request.urlopen("http://localhost:5000/api/content") as resp:
    data = json.loads(resp.read().decode())

print("\n--- Verifying Campus Homepage Photos ---")
print("Campus Photos Count:", len(data.get("photos", [])))
has_leaked = any(p.get("id") == uploaded_photo_id for p in data.get("photos", []))
print("Did new upload leak to homepage? ->", "YES (BUG!)" if has_leaked else "NO! (CLEAN SEPARATION)")

print("\n--- Verifying AI Department Gallery (prog-9) ---")
p9 = next((p for p in data.get("programmes", []) if p.get("id") == "prog-9"), None)
print("prog-9 Gallery Count:", len(p9.get("gallery", [])))
is_in_dept = any(p.get("id") == uploaded_photo_id for p in p9.get("gallery", []))
print("Is new photo in prog-9 gallery? ->", "YES! (CORRECT)" if is_in_dept else "NO (ERROR)")

# Clean up test upload
del_req = urllib.request.Request(
    f"http://localhost:5000/api/photos/{uploaded_photo_id}?prog_id=prog-9",
    headers={"Authorization": f"Bearer {token}"},
    method="DELETE"
)
with urllib.request.urlopen(del_req) as resp:
    del_res = json.loads(resp.read().decode())
    print("\nDelete test photo response:", del_res)

with urllib.request.urlopen("http://localhost:5000/api/content") as resp:
    final_data = json.loads(resp.read().decode())
p9_final = next((p for p in final_data.get("programmes", []) if p.get("id") == "prog-9"), None)
print("prog-9 Gallery Count after delete:", len(p9_final.get("gallery", [])))
print("Campus Photos Count after delete:", len(final_data.get("photos", [])))
