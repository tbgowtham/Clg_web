import os
import json
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient
from werkzeug.utils import secure_filename

# Paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COLLEGE_SITE_DIR = os.path.join(BASE_DIR, "college_site")
ADMIN_SITE_DIR = os.path.join(BASE_DIR, "admin_site")
PHOTO_DIR = os.path.join(BASE_DIR, "photo")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
SEED_FILE = os.path.join(os.path.dirname(__file__), "data", "content.json")
APPLICATIONS_FILE = os.path.join(os.path.dirname(__file__), "data", "applications.json")
ENQUIRIES_FILE = os.path.join(os.path.dirname(__file__), "data", "enquiries.json")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(os.path.join(os.path.dirname(__file__), "data"), exist_ok=True)

app = Flask(__name__)
CORS(app)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# MongoDB Connection
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = "sridevi_college_cms"

try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
    mongo_client.admin.command("ping")
    db = mongo_client[DB_NAME]
    mongo_available = True
    print(f"[PyMongo] Connected successfully to MongoDB at {MONGO_URI}, database: {DB_NAME}")
except Exception as e:
    mongo_available = False
    print(f"[PyMongo Warning] Could not connect to MongoDB: {e}. Running with JSON persistence fallback.")


def load_seed_data():
    if os.path.exists(SEED_FILE):
        with open(SEED_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def seed_database_if_empty():
    if not mongo_available:
        return
    try:
        content_doc = db.content.find_one({"_id": "site_content"})
        seed = load_seed_data()
        if not content_doc:
            if seed:
                seed_copy = dict(seed)
                seed_copy["_id"] = "site_content"
                db.content.insert_one(seed_copy)
                print("[PyMongo] Database successfully seeded with Sridevi College Ponneri content.")
        else:
            # Upgrade database if missing new Ponneri courses or address
            progs = content_doc.get("programmes", [])
            contact = content_doc.get("contact", {})
            if len(progs) < 12 or "Coimbatore" in contact.get("address", ""):
                seed_copy = dict(seed)
                seed_copy["_id"] = "site_content"
                db.content.replace_one({"_id": "site_content"}, seed_copy)
                print("[PyMongo] Upgraded database to full 12 Ponneri academic programmes & Ponneri address.")
            else:
                # Merge any missing top-level keys (like management, usps)
                updated = False
                for k, v in seed.items():
                    if k not in content_doc:
                        content_doc[k] = v
                        updated = True
                if updated:
                    db.content.replace_one({"_id": "site_content"}, content_doc)
                    print("[PyMongo] Database updated with new schema fields from content.json.")
    except Exception as e:
        print(f"[PyMongo] Error during seeding: {e}")

# Call seed on startup
seed_database_if_empty()

def get_current_content():
    seed = load_seed_data()
    if mongo_available:
        try:
            doc = db.content.find_one({"_id": "site_content"})
            if doc:
                doc.pop("_id", None)
                for k, v in seed.items():
                    if k not in doc:
                        doc[k] = v
                return doc
        except Exception as e:
            print(f"[PyMongo Error] Failed to read content: {e}")
    return seed

def save_current_content(content):
    if mongo_available:
        try:
            save_doc = dict(content)
            save_doc["_id"] = "site_content"
            db.content.replace_one({"_id": "site_content"}, save_doc, upsert=True)
            return True
        except Exception as e:
            print(f"[PyMongo Error] Failed to save content: {e}")
    try:
        with open(SEED_FILE, "w", encoding="utf-8") as f:
            json.dump(content, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[Fallback Error] Failed to write seed file: {e}")
        return False

# Application Data Helpers
def load_applications():
    if mongo_available:
        try:
            return list(db.applications.find({}, {"_id": 0}))
        except Exception as e:
            print(f"[PyMongo Error] Failed to load applications: {e}")
    if os.path.exists(APPLICATIONS_FILE):
        try:
            with open(APPLICATIONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_application(app_data):
    if mongo_available:
        try:
            db.applications.insert_one(dict(app_data))
            return True
        except Exception as e:
            print(f"[PyMongo Error] Failed to save application: {e}")
    apps = load_applications()
    apps.insert(0, app_data)
    try:
        with open(APPLICATIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(apps, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[File Error] Failed to write applications: {e}")
        return False

def remove_application(app_id):
    if mongo_available:
        try:
            db.applications.delete_one({"id": app_id})
        except Exception as e:
            print(f"[PyMongo Error] Failed to delete application: {e}")
    apps = load_applications()
    new_apps = [a for a in apps if a.get("id") != app_id]
    try:
        with open(APPLICATIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(new_apps, f, indent=2, ensure_ascii=False)
        return True
    except Exception:
        return False

# Enquiries Helpers
def load_enquiries():
    if mongo_available:
        try:
            return list(db.enquiries.find({}, {"_id": 0}))
        except Exception:
            pass
    if os.path.exists(ENQUIRIES_FILE):
        try:
            with open(ENQUIRIES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_enquiry(enquiry_data):
    if mongo_available:
        try:
            db.enquiries.insert_one(dict(enquiry_data))
            return True
        except Exception:
            pass
    enqs = load_enquiries()
    enqs.insert(0, enquiry_data)
    try:
        with open(ENQUIRIES_FILE, "w", encoding="utf-8") as f:
            json.dump(enqs, f, indent=2, ensure_ascii=False)
        return True
    except Exception:
        return False

def remove_enquiry(enq_id):
    if mongo_available:
        try:
            db.enquiries.delete_one({"id": enq_id})
        except Exception:
            pass
    enqs = load_enquiries()
    new_enqs = [e for e in enqs if e.get("id") != enq_id]
    try:
        with open(ENQUIRIES_FILE, "w", encoding="utf-8") as f:
            json.dump(new_enqs, f, indent=2, ensure_ascii=False)
        return True
    except Exception:
        return False


# ==================== EXPLICIT STATIC ROUTES ====================

@app.route("/")
def serve_college_site_index():
    return send_from_directory(COLLEGE_SITE_DIR, "index.html")

@app.route("/admin")
@app.route("/admin/")
def serve_admin_site_index():
    return send_from_directory(ADMIN_SITE_DIR, "index.html")

@app.route("/admin/<path:path>")
def serve_admin_site_files(path):
    full_path = os.path.join(ADMIN_SITE_DIR, path)
    if os.path.isfile(full_path):
        return send_from_directory(ADMIN_SITE_DIR, path)
    return send_from_directory(ADMIN_SITE_DIR, "index.html")

@app.route("/photo/<path:filename>")
def serve_photos(filename):
    return send_from_directory(PHOTO_DIR, filename)

@app.route("/uploads/<path:filename>")
def serve_uploads(filename):
    return send_from_directory(UPLOADS_DIR, filename)

@app.route("/assets/<path:path>")
def serve_assets(path):
    full_path = os.path.join(COLLEGE_SITE_DIR, "assets", path)
    if os.path.isfile(full_path):
        return send_from_directory(os.path.join(COLLEGE_SITE_DIR, "assets"), path)
    return send_from_directory(COLLEGE_SITE_DIR, "index.html")


# ==================== API ENDPOINTS (PRECEDENCE OVER CATCH-ALL) ====================

@app.route("/api/health", methods=["GET"])
def api_health():
    is_connected = False
    if mongo_available:
        try:
            mongo_client.admin.command("ping")
            is_connected = True
        except Exception:
            is_connected = False
    return jsonify({
        "status": "online",
        "college": "Sridevi Arts & Science College Ponneri",
        "mongodb_connected": is_connected,
        "database": DB_NAME,
        "timestamp": datetime.now().isoformat()
    })

@app.route("/api/content", methods=["GET"])
def api_get_content():
    content = get_current_content()
    return jsonify(content)

@app.route("/api/content", methods=["PUT"])
def api_update_content():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid or missing JSON payload"}), 400
    
    current = get_current_content()
    for key, value in data.items():
        if key != "_id":
            current[key] = value
            
    success = save_current_content(current)
    if success:
        return jsonify({"success": True, "message": "Content successfully updated", "content": current})
    return jsonify({"error": "Failed to save content"}), 500

@app.route("/api/upload", methods=["POST"])
def api_upload_image():
    if "file" not in request.files:
        return jsonify({"error": "No file part provided in request"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Allowed file types: png, jpg, jpeg, webp, gif"}), 400

    original_name = secure_filename(file.filename)
    extension = original_name.rsplit(".", 1)[1].lower() if "." in original_name else "jpg"
    unique_filename = f"upload_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}.{extension}"
    save_path = os.path.join(UPLOADS_DIR, unique_filename)
    file.save(save_path)

    label = request.form.get("label", "").strip() or "Campus image"
    section = request.form.get("section", "photos")

    photo_entry = {
        "id": f"photo-{uuid.uuid4().hex[:8]}",
        "src": f"uploads/{unique_filename}",
        "label": label,
        "uploadedAt": datetime.now().isoformat()
    }

    current = get_current_content()
    if section == "photos":
        if "photos" not in current:
            current["photos"] = []
        current["photos"].insert(0, photo_entry)
        save_current_content(current)

    return jsonify({
        "success": True,
        "message": "Image uploaded successfully",
        "photo": photo_entry,
        "url": f"/uploads/{unique_filename}",
        "filename": unique_filename
    }), 201

@app.route("/api/photos/<photo_id>", methods=["DELETE"])
def api_delete_photo(photo_id):
    current = get_current_content()
    photos = current.get("photos", [])
    target = None
    remaining = []

    for p in photos:
        if p.get("id") == photo_id:
            target = p
        else:
            remaining.append(p)

    if not target:
        return jsonify({"error": "Photo not found"}), 404

    src = target.get("src", "")
    if src.startswith("uploads/"):
        filename = src.replace("uploads/", "")
        file_path = os.path.join(UPLOADS_DIR, filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"[File Delete Warning] Could not remove {file_path}: {e}")

    current["photos"] = remaining
    save_current_content(current)
    return jsonify({"success": True, "message": "Photo deleted successfully", "id": photo_id})

# CRUD for Notices
@app.route("/api/notices", methods=["POST"])
def api_add_notice():
    data = request.get_json(force=True, silent=True) or {}
    title = data.get("title", "").strip()
    day = data.get("day", "").strip() or str(datetime.now().day).zfill(2)
    month = data.get("month", "").strip().upper() or datetime.now().strftime("%b").upper()
    link = data.get("link", "#apply-modal").strip()

    if not title:
        return jsonify({"error": "Notice title is required"}), 400

    notice_entry = {
        "id": f"not-{uuid.uuid4().hex[:8]}",
        "day": day,
        "month": month,
        "title": title,
        "link": link
    }

    current = get_current_content()
    if "notices" not in current:
        current["notices"] = []
    current["notices"].insert(0, notice_entry)
    save_current_content(current)
    return jsonify({"success": True, "notice": notice_entry}), 201

@app.route("/api/notices/<notice_id>", methods=["DELETE"])
def api_delete_notice(notice_id):
    current = get_current_content()
    notices = current.get("notices", [])
    new_notices = [n for n in notices if n.get("id") != notice_id]
    if len(new_notices) == len(notices):
        return jsonify({"error": "Notice not found"}), 404
    current["notices"] = new_notices
    save_current_content(current)
    return jsonify({"success": True, "message": "Notice deleted successfully"})

# CRUD for Programmes
@app.route("/api/programmes", methods=["POST"])
def api_add_programme():
    data = request.get_json(force=True, silent=True) or {}
    title = data.get("title", "").strip()
    category = data.get("category", "Undergraduate").strip()
    number = data.get("number", "").strip() or f"{len(get_current_content().get('programmes', [])) + 1:02d} / COURSE"
    department = data.get("department", title).strip()
    seats = data.get("seats", "70 Seats").strip()
    fee = data.get("fee", "₹15,000 / Year").strip()
    duration = data.get("duration", "3 Years (UG)").strip()
    desc = data.get("desc", "").strip()
    image = data.get("image", "assets/sdasc/departments/112226_1625242329.jpeg").strip()
    link = data.get("link", "#apply-modal").strip()

    if not title:
        return jsonify({"error": "Programme title is required"}), 400

    prog_entry = {
        "id": f"prog-{uuid.uuid4().hex[:8]}",
        "number": number,
        "category": category,
        "title": title,
        "department": department,
        "seats": seats,
        "fee": fee,
        "duration": duration,
        "desc": desc,
        "image": image,
        "link": link
    }

    current = get_current_content()
    if "programmes" not in current:
        current["programmes"] = []
    current["programmes"].append(prog_entry)
    save_current_content(current)
    return jsonify({"success": True, "programme": prog_entry}), 201

@app.route("/api/programmes/<prog_id>", methods=["DELETE"])
def api_delete_programme(prog_id):
    current = get_current_content()
    programmes = current.get("programmes", [])
    new_progs = [p for p in programmes if p.get("id") != prog_id]
    if len(new_progs) == len(programmes):
        return jsonify({"error": "Programme not found"}), 404
    current["programmes"] = new_progs
    save_current_content(current)
    return jsonify({"success": True, "message": "Programme deleted successfully"})

# CRUD for Online Admission Applications
@app.route("/api/applications", methods=["GET"])
def api_get_applications():
    apps = load_applications()
    return jsonify(apps)

@app.route("/api/applications", methods=["POST"])
def api_submit_application():
    data = request.get_json(force=True, silent=True) or {}
    name = data.get("name", "").strip()
    mobile = data.get("mobile", "").strip()
    course = data.get("course", "").strip()

    if not name or not mobile or not course:
        return jsonify({"error": "Student Name, Mobile Number, and Desired Course are required."}), 400

    application_entry = {
        "id": f"APP-{datetime.now().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}",
        "name": name,
        "dob": data.get("dob", ""),
        "gender": data.get("gender", "Not Specified"),
        "mobile": mobile,
        "email": data.get("email", "").strip(),
        "fatherName": data.get("fatherName", "").strip(),
        "motherName": data.get("motherName", "").strip(),
        "courseType": data.get("courseType", "UG"),
        "course": course,
        "schoolOrCollege": data.get("schoolOrCollege", "").strip(),
        "marksTotal": data.get("marksTotal", "").strip(),
        "percentage": data.get("percentage", "").strip(),
        "community": data.get("community", "General"),
        "needsScholarship": bool(data.get("needsScholarship", False)),
        "status": "Pending Review",
        "submittedAt": datetime.now().strftime("%d %b %Y, %I:%M %p")
    }

    save_application(application_entry)
    return jsonify({
        "success": True,
        "message": "Your application has been received successfully! Our admission desk at Ponneri will contact you shortly.",
        "application": application_entry
    }), 201

@app.route("/api/applications/<app_id>", methods=["DELETE"])
def api_delete_application(app_id):
    success = remove_application(app_id)
    if success:
        return jsonify({"success": True, "message": "Application deleted successfully"})
    return jsonify({"error": "Application not found"}), 404

# Enquiries / Contact Submissions
@app.route("/api/enquiries", methods=["GET"])
def api_get_enquiries():
    enquiries = load_enquiries()
    return jsonify(enquiries)

@app.route("/api/enquiries", methods=["POST"])
def api_submit_enquiry():
    data = request.get_json(force=True, silent=True) or {}
    name = data.get("name", "").strip()
    phone = data.get("phone", "").strip()
    message = data.get("message", "").strip()

    if not name or not (phone or data.get("email")):
        return jsonify({"error": "Name and contact info are required."}), 400

    enquiry_entry = {
        "id": f"ENQ-{int(datetime.now().timestamp())}-{uuid.uuid4().hex[:4].upper()}",
        "name": name,
        "phone": phone,
        "email": data.get("email", "").strip(),
        "subject": data.get("subject", "General Enquiry").strip(),
        "message": message,
        "submittedAt": datetime.now().strftime("%d %b %Y, %I:%M %p")
    }

    save_enquiry(enquiry_entry)
    return jsonify({
        "success": True,
        "message": "Thank you for contacting Sridevi Arts and Science College. We will reach out to you promptly.",
        "enquiry": enquiry_entry
    }), 201

@app.route("/api/enquiries/<enq_id>", methods=["DELETE"])
def api_delete_enquiry(enq_id):
    success = remove_enquiry(enq_id)
    if success:
        return jsonify({"success": True, "message": "Enquiry removed successfully"})
    return jsonify({"error": "Enquiry not found"}), 404

# CRUD for Stats
@app.route("/api/stats", methods=["POST"])
def api_add_stat():
    data = request.get_json(force=True, silent=True) or {}
    value = data.get("value", "").strip()
    label = data.get("label", "").strip()

    if not value or not label:
        return jsonify({"error": "Stat value and label are required"}), 400

    stat_entry = {
        "id": f"stat-{uuid.uuid4().hex[:8]}",
        "value": value,
        "label": label
    }

    current = get_current_content()
    if "stats" not in current:
        current["stats"] = []
    current["stats"].append(stat_entry)
    save_current_content(current)
    return jsonify({"success": True, "stat": stat_entry}), 201

@app.route("/api/stats/<stat_id>", methods=["DELETE"])
def api_delete_stat(stat_id):
    current = get_current_content()
    stats = current.get("stats", [])
    new_stats = [s for s in stats if s.get("id") != stat_id]
    if len(new_stats) == len(stats):
        return jsonify({"error": "Stat not found"}), 404
    current["stats"] = new_stats
    save_current_content(current)
    return jsonify({"success": True, "message": "Stat deleted successfully"})

@app.route("/api/reset", methods=["POST"])
def api_reset_content():
    seed = load_seed_data()
    if not seed:
        return jsonify({"error": "Seed data not found"}), 500
    save_current_content(seed)
    return jsonify({"success": True, "message": "Database reset to authentic Sri Devi College Ponneri content", "content": seed})

# ==================== CATCH-ALL STATIC ROUTE (MUST BE AT END) ====================
@app.route("/<path:path>", methods=["GET"])
def serve_college_site_files(path):
    full_path = os.path.join(COLLEGE_SITE_DIR, path)
    if os.path.isfile(full_path):
        return send_from_directory(COLLEGE_SITE_DIR, path)
    if path.startswith("photo/"):
        return send_from_directory(PHOTO_DIR, path[6:])
    if path.startswith("assets/"):
        return send_from_directory(os.path.join(COLLEGE_SITE_DIR, "assets"), path[7:])
    return send_from_directory(COLLEGE_SITE_DIR, "index.html")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"==================================================")
    print(f" Sridevi Arts & Science College Ponneri — CMS Server")
    print(f" Backend: Flask + PyMongo (MongoDB: {MONGO_URI})")
    print(f" College Site: http://localhost:{port}/")
    print(f" Admin Portal: http://localhost:{port}/admin/")
    print(f" API Health:   http://localhost:{port}/api/health")
    print(f"==================================================")
    app.run(host="0.0.0.0", port=port, debug=False)
