import urllib.request
import urllib.parse
import json
import uuid

# Log in
login_data = json.dumps({"username": "doomsday", "password": "ironman"}).encode()
login_req = urllib.request.Request("http://localhost:5000/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(login_req) as resp:
    res = json.loads(resp.read().decode())
    token = res["token"]

# Upload to prog-4 (Mathematics)
boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
body = []
body.append(f"--{boundary}".encode())
body.append(b'Content-Disposition: form-data; name="prog_id"')
body.append(b'')
body.append(b'prog-4')

body.append(f"--{boundary}".encode())
body.append(b'Content-Disposition: form-data; name="label"')
body.append(b'')
body.append(b'Mathematics Pure Analysis Research Lab')

body.append(f"--{boundary}".encode())
body.append(b'Content-Disposition: form-data; name="section"')
body.append(b'')
body.append(b'photos')

png_1x1 = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
body.append(f"--{boundary}".encode())
body.append(b'Content-Disposition: form-data; name="file"; filename="test_math_lab.png"')
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
    uploaded_photo_id = upload_res.get("photo", {}).get("id")
    print("Mathematics upload response:", upload_res.get("message"))

# Verify GET /api/content
with urllib.request.urlopen("http://localhost:5000/api/content") as resp:
    data = json.loads(resp.read().decode())

p4 = next((p for p in data.get("programmes", []) if p.get("id") == "prog-4"), None)
p9 = next((p for p in data.get("programmes", []) if p.get("id") == "prog-9"), None)
campus_photos = data.get("photos", [])

print("Is photo in Mathematics (prog-4)? ->", any(p.get("id") == uploaded_photo_id for p in p4.get("gallery", [])))
print("Did photo leak to AI department (prog-9)? ->", any(p.get("id") == uploaded_photo_id for p in p9.get("gallery", [])))
print("Did photo leak to Campus Homepage? ->", any(p.get("id") == uploaded_photo_id for p in campus_photos))

# Clean up
del_req = urllib.request.Request(
    f"http://localhost:5000/api/photos/{uploaded_photo_id}?prog_id=prog-4",
    headers={"Authorization": f"Bearer {token}"},
    method="DELETE"
)
with urllib.request.urlopen(del_req) as resp:
    del_res = json.loads(resp.read().decode())
    print("Deleted test photo from Mathematics:", del_res.get("success"))
