from pymongo import MongoClient
import json

client = MongoClient("mongodb://localhost:27017/")
db = client["sridevi_college_cms"]
doc = db.content.find_one({"_id": "site_content"})

if doc:
    print("Found site_content in db.content!")
    photos = doc.get("photos", [])
    print("Photos count:", len(photos))
    for p in photos:
        print(" ", p.get("id"), p.get("label"), p.get("src"))
else:
    print("Not found in db.content either!")
