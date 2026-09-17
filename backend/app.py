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

os.makedirs(UPLOADS_DIR, exist_ok=True)

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
        if not content_doc:
            seed = load_seed_data()
            if seed:
                seed["_id"] = "site_content"
                db.content.insert_one(seed)
                print("[PyMongo] Database successfully seeded with default Sri Devi College content.")
    except Exception as e:
        print(f"[PyMongo] Error during seeding: {e}")

# Call seed on startup
seed_database_if_empty()

def get_current_content():
    if mongo_available:
        try:
            doc = db.content.find_one({"_id": "site_content"})
            if doc:
                doc.pop("_id", None)
                return doc
        except Exception as e:
            print(f"[PyMongo Error] Failed to read content: {e}")
    # Fallback to seed file
    return load_seed_data()

def save_current_content(content):
    if mongo_available:
        try:
            save_doc = dict(content)
            save_doc["_id"] = "site_content"
            db.content.replace_one({"_id": "site_content"}, save_doc, upsert=True)
            return True
        except Exception as e:
            print(f"[PyMongo Error] Failed to save content: {e}")
    # Fallback: save to seed file
    try:
        with open(SEED_FILE, "w", encoding="utf-8") as f:
            json.dump(content, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[Fallback Error] Failed to write seed file: {e}")
        return False

# ==================== STATIC ROUTES ====================

@app.route("/")
def serve_college_site_index():
    return send_from_directory(COLLEGE_SITE_DIR, "index.html")

@app.route("/<path:path>")
def serve_college_site_files(path):
    # Check if file exists in college_site
    full_path = os.path.join(COLLEGE_SITE_DIR, path)
    if os.path.isfile(full_path):
        return send_from_directory(COLLEGE_SITE_DIR, path)
    # Check if requested under photo
    if path.startswith("photo/"):
        rel_photo = path[6:]
        return send_from_directory(PHOTO_DIR, rel_photo)
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

# ==================== API ENDPOINTS ====================

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
    # Merge updates
    for key, value in data.items():
        if key != "_id":
            current[key] = value
            
    success = save_current_content(current)
    if success:
        return jsonify({"success": True, "message": "Content successfully updated in MongoDB", "content": current})
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
    section = request.form.get("section", "photos") # 'photos', 'hero', 'about'

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

    # Remove file if from uploads
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
    link = data.get("link", "#contact").strip()

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
    number = data.get("number", "").strip() or "01 / UNDERGRADUATE"
    desc = data.get("desc", "").strip()
    link = data.get("link", "#contact").strip()

    if not title:
        return jsonify({"error": "Programme title is required"}), 400

    prog_entry = {
        "id": f"prog-{uuid.uuid4().hex[:8]}",
        "number": number,
        "title": title,
        "desc": desc,
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
    return jsonify({"success": True, "message": "Database reset to original Sri Devi College content", "content": seed})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"==================================================")
    print(f" Sri Devi Arts & Science College CMS Server")
    print(f" Backend: Flask + PyMongo (MongoDB: {MONGO_URI})")
    print(f" College Site: http://localhost:{port}/")
    print(f" Admin Portal: http://localhost:{port}/admin/")
    print(f" API Health:   http://localhost:{port}/api/health")
    print(f"==================================================")
    app.run(host="0.0.0.0", port=port, debug=False)
