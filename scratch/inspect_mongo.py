from pymongo import MongoClient
import json
import os

client = MongoClient("mongodb://localhost:27017/")
db = client["sridevi_college_cms"]
doc = db["site_content"].find_one({"_id": "current_site_content"})

if doc:
    print("MongoDB current_site_content photos count:", len(doc.get("photos", [])))
    for p in doc.get("photos", []):
        print("  Mongo photo:", p.get("id"), p.get("label"), p.get("src"))
    print("\nMongoDB programmes gallery count:")
    for prog in doc.get("programmes", []):
        print(f"  {prog.get('id')} - {prog.get('title')}: gallery count = {len(prog.get('gallery', []))}")
else:
    print("No MongoDB current_site_content doc found!")

with open("backend/data/content.json", "r", encoding="utf-8") as f:
    local_data = json.load(f)

print("\nlocal content.json photos count:", len(local_data.get("photos", [])))
for p in local_data.get("photos", []):
    print("  Local photo:", p.get("id"), p.get("label"), p.get("src"))
