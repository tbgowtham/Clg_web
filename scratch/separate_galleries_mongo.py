from pymongo import MongoClient
import json
import os

client = MongoClient("mongodb://localhost:27017/")
db = client["sridevi_college_cms"]
doc = db.content.find_one({"_id": "site_content"})

if not doc:
    with open("backend/data/content.json", "r", encoding="utf-8") as f:
        doc = json.load(f)
        doc["_id"] = "site_content"

# 1. Separate Campus photos strictly to the 8 campus-wide photos
campus_photos = [
    {
        "id": "photo-1",
        "label": "Awards and Academic Honors Ceremony",
        "src": "photo/IMG20260228131225.jpg"
    },
    {
        "id": "photo-2",
        "label": "Proud Convocation & Graduation Moment",
        "src": "photo/IMG_20260227_142615_304.jpg"
    },
    {
        "id": "photo-3",
        "label": "Vibrant Campus Life at Sridevi College",
        "src": "photo/IMG_20260701_104825_496.jpg"
    },
    {
        "id": "photo-4",
        "label": "Student Recognition & Merit Felicitations",
        "src": "photo/IMG_20260701_104949.jpg"
    },
    {
        "id": "photo-5",
        "label": "Cultural Spirit & Stage Performances",
        "src": "photo/IMG_20260701_110148.jpg"
    },
    {
        "id": "photo-6",
        "label": "Sridevi College Central Auditorium",
        "src": "photo/IMG_20260701_132844.jpg"
    },
    {
        "id": "photo-7",
        "label": "Together on Campus: Student Community",
        "src": "photo/IMG_20260701_133523_953.jpg"
    },
    {
        "id": "photo-8",
        "label": "Interactive Classroom & Lab Learning",
        "src": "photo/IMG_20260723_150208_229.jpg"
    }
]

doc["photos"] = campus_photos

# 2. Assign dedicated, isolated galleries to each department
# Department photo catalogs
dept_galleries = {
    # prog-9: B.Sc (Computer Science with AI) -> User's uploaded photos!
    "prog-9": [
        {
            "id": "dept-photo-ai-1",
            "label": "AI & Deep Learning Computing Lab",
            "src": "uploads/upload_1791053198_9a86e1.png"
        },
        {
            "id": "dept-photo-ai-2",
            "label": "AI Department Student Symposium & Cultural Event",
            "src": "uploads/upload_1791489888_37afba.jpg"
        },
        {
            "id": "dept-photo-ai-3",
            "label": "Computer Science & Machine Intelligence Workstation",
            "src": "assets/sdasc/campus/112226_1625242314.jpeg"
        },
        {
            "id": "dept-photo-ai-4",
            "label": "AI Robotics & Embedded Systems Research Bench",
            "src": "assets/sdasc/departments/112226_1625242329.jpeg"
        }
    ],
    # prog-1: B.Com (General)
    "prog-1": [
        {
            "id": "dept-photo-bcom-1",
            "label": "Department of Commerce Business Lab",
            "src": "assets/sdasc/departments/112226_1625242329.jpeg"
        },
        {
            "id": "dept-photo-bcom-2",
            "label": "Commerce Seminar & Stock Market Trading Simulation",
            "src": "photo/IMG20260228131225.jpg"
        },
        {
            "id": "dept-photo-bcom-3",
            "label": "Accounting & Tally ERP Computer Lab",
            "src": "assets/sdasc/campus/112226_1625242314.jpeg"
        }
    ],
    # prog-2: B.C.A (Computer Applications)
    "prog-2": [
        {
            "id": "dept-photo-bca-1",
            "label": "BCA Advanced Software Development Lab",
            "src": "assets/sdasc/campus/112226_1625242314.jpeg"
        },
        {
            "id": "dept-photo-bca-2",
            "label": "Full-Stack Web Development Workshop",
            "src": "assets/sdasc/departments/112226_1625242329.jpeg"
        },
        {
            "id": "dept-photo-bca-3",
            "label": "Database Systems & Network Administration Lab",
            "src": "photo/IMG_20260723_150208_229.jpg"
        }
    ],
    # prog-3: B.Sc (Computer Science)
    "prog-3": [
        {
            "id": "dept-photo-cs-1",
            "label": "Computer Science Main Computing Laboratory",
            "src": "assets/sdasc/campus/112226_1625242314.jpeg"
        },
        {
            "id": "dept-photo-cs-2",
            "label": "Algorithms & Programming Seminar Hall",
            "src": "assets/sdasc/departments/112226_1625242329.jpeg"
        },
        {
            "id": "dept-photo-cs-3",
            "label": "Cloud Infrastructure & Open Source Lab",
            "src": "photo/IMG_20260723_150208_229.jpg"
        }
    ],
    # prog-4: B.Sc (Mathematics)
    "prog-4": [
        {
            "id": "dept-photo-math-1",
            "label": "Mathematics Statistical Modeling & Analytics Lab",
            "src": "assets/sdasc/departments/112226_1625242329.jpeg"
        },
        {
            "id": "dept-photo-math-2",
            "label": "Mathematical Olympiad & Research Seminar",
            "src": "photo/IMG20260228131225.jpg"
        },
        {
            "id": "dept-photo-math-3",
            "label": "Computational Mathematics Workstation",
            "src": "assets/sdasc/campus/112226_1625242314.jpeg"
        }
    ],
    # prog-5: B.Com (Corporate Secretaryship)
    "prog-5": [
        {
            "id": "dept-photo-cs-corp-1",
            "label": "Corporate Secretaryship Boardroom Simulation",
            "src": "assets/sdasc/departments/112226_1625242329.jpeg"
        },
        {
            "id": "dept-photo-cs-corp-2",
            "label": "Corporate Law & Secretarial Audit Practice Lab",
            "src": "assets/sdasc/campus/112226_1625242314.jpeg"
        }
    ],
    # prog-6: BBA (Business Administration)
    "prog-6": [
        {
            "id": "dept-photo-bba-1",
            "label": "Management Studies Executive Discussion Hall",
            "src": "assets/sdasc/departments/112226_1625242329.jpeg"
        },
        {
            "id": "dept-photo-bba-2",
            "label": "Entrepreneurship Development Cell & Incubation Hub",
            "src": "photo/IMG_20260701_110148.jpg"
        }
    ],
    # prog-7: B.A (English Literature)
    "prog-7": [
        {
            "id": "dept-photo-eng-1",
            "label": "Digital English Language Communication Skills Lab",
            "src": "assets/sdasc/departments/112226_1625242329.jpeg"
        },
        {
            "id": "dept-photo-eng-2",
            "label": "Literary Theatre & Phonetics Audio Suite",
            "src": "photo/IMG_20260701_132844.jpg"
        }
    ],
    # prog-8: B.A (Tamil)
    "prog-8": [
        {
            "id": "dept-photo-tam-1",
            "label": "Tamil Classical Literature Reference Library",
            "src": "assets/sdasc/departments/112226_1625242329.jpeg"
        },
        {
            "id": "dept-photo-tam-2",
            "label": "Tamil Literary Forum & Symposium Hall",
            "src": "photo/IMG_20260701_132844.jpg"
        }
    ],
    # prog-10: M.A (Tamil)
    "prog-10": [
        {
            "id": "dept-photo-matam-1",
            "label": "Postgraduate Tamil Epigraphy & Manuscript Archive",
            "src": "assets/sdasc/departments/112226_1625242329.jpeg"
        }
    ],
    # prog-11: Physical Education & Sports
    "prog-11": [
        {
            "id": "dept-photo-sports-1",
            "label": "College Athletics Grounds & Sports Complex",
            "src": "photo/IMG_20260701_104825_496.jpg"
        },
        {
            "id": "dept-photo-sports-2",
            "label": "Indoor Games Pavilion & Fitness Center",
            "src": "photo/IMG_20260701_133523_953.jpg"
        }
    ],
    # prog-12: Employability & Placement Cell
    "prog-12": [
        {
            "id": "dept-photo-place-1",
            "label": "Corporate Placement & Campus Interview Suites",
            "src": "photo/IMG_20260227_142615_304.jpg"
        },
        {
            "id": "dept-photo-place-2",
            "label": "Pre-Placement Aptitude & Technical Training Hall",
            "src": "photo/IMG_20260723_150208_229.jpg"
        }
    ]
}

# Update all programmes
for prog in doc.get("programmes", []):
    pid = prog.get("id")
    if pid in dept_galleries:
        prog["gallery"] = dept_galleries[pid]
    elif not prog.get("gallery"):
        # Default fallback isolated gallery
        prog["gallery"] = [
            {
                "id": f"dept-photo-{pid}-1",
                "label": f"{prog.get('department', prog.get('title'))} Dedicated Facility",
                "src": prog.get("image", "assets/sdasc/departments/112226_1625242329.jpeg")
            }
        ]

# Save to MongoDB
db.content.replace_one({"_id": "site_content"}, doc, upsert=True)
print("Saved to MongoDB db.content!")

# Save to backend/data/content.json
doc_copy = dict(doc)
doc_copy.pop("_id", None)
with open("backend/data/content.json", "w", encoding="utf-8") as f:
    json.dump(doc_copy, f, indent=2, ensure_ascii=False)
print("Saved to backend/data/content.json!")

print(f"\nVerification:")
print(f"Campus photos: {len(doc['photos'])}")
for p in doc["photos"]:
    print(f"  {p['id']}: {p['label']} -> {p['src']}")

print("\nAI Department (prog-9) gallery:")
p9 = next((p for p in doc["programmes"] if p.get("id") == "prog-9"), None)
if p9:
    for g in p9.get("gallery", []):
        print(f"  {g['id']}: {g['label']} -> {g['src']}")
