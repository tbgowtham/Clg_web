import os
import json
import re
import time
import secrets
import uuid
import urllib.request
import urllib.parse
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

# Paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COLLEGE_SITE_DIR = os.path.join(BASE_DIR, "college_site")
ADMIN_SITE_DIR = os.path.join(BASE_DIR, "admin_site")
PHOTO_DIR = os.path.join(BASE_DIR, "photo")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
SEED_FILE = os.path.join(os.path.dirname(__file__), "data", "content.json")
APPLICATIONS_FILE = os.path.join(os.path.dirname(__file__), "data", "applications.json")
ENQUIRIES_FILE = os.path.join(os.path.dirname(__file__), "data", "enquiries.json")
USERS_FILE = os.path.join(os.path.dirname(__file__), "data", "users.json")
SMS_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "data", "sms_config.json")

DEFAULT_ADMIN_USERNAME = "doomsday"
DEFAULT_ADMIN_PASSWORD = "ironman"
active_sessions = {}  # token -> user_dict
active_otps = {}      # target_username -> { "otp": "...", "expires_at": float, "attempts": int, "phone": "..." }

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

# ==================== USER & AUTHENTICATION HELPERS ====================
def load_users():
    if mongo_available:
        try:
            users = list(db.users.find({}, {"_id": 0}))
            if users:
                return users
        except Exception as e:
            print(f"[PyMongo Error] Failed to load users: {e}")
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[Fallback Error] Failed to read users.json: {e}")
    return []

def save_all_users(users_list):
    if mongo_available:
        try:
            for u in users_list:
                db.users.replace_one({"username": u["username"]}, dict(u), upsert=True)
        except Exception as e:
            print(f"[PyMongo Error] Failed to save users: {e}")
    try:
        with open(USERS_FILE, "w", encoding="utf-8") as f:
            json.dump(users_list, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[Fallback Error] Failed to write users file: {e}")
        return False

def get_user_by_username(username):
    uname = (username or "").strip().lower()
    if mongo_available:
        try:
            user = db.users.find_one({"username": uname}, {"_id": 0})
            if user:
                return user
        except Exception as e:
            print(f"[PyMongo Error] Failed to get user: {e}")
    users = load_users()
    for u in users:
        if u.get("username", "").lower() == uname:
            return u
    return None

def seed_default_admin():
    users = load_users()
    # Check if a primary administrator already exists in storage
    if any(u.get("is_primary_admin") for u in users):
        return

    admin = get_user_by_username(DEFAULT_ADMIN_USERNAME)
    if not admin:
        admin_user = {
            "username": DEFAULT_ADMIN_USERNAME,
            "password_hash": generate_password_hash(DEFAULT_ADMIN_PASSWORD),
            "name": "Super Administrator",
            "role": "Admin",
            "is_primary_admin": True,
            "created_at": datetime.now().isoformat()
        }
        if mongo_available:
            try:
                db.users.replace_one({"username": DEFAULT_ADMIN_USERNAME}, dict(admin_user), upsert=True)
                print(f"[PyMongo] Seeded default admin account '{DEFAULT_ADMIN_USERNAME}'.")
            except Exception as e:
                print(f"[PyMongo Error] Could not seed admin in MongoDB: {e}")
        users = load_users()
        if not any(u.get("username") == DEFAULT_ADMIN_USERNAME for u in users):
            users.append(admin_user)
            save_all_users(users)
            print(f"[Auth] Initialized default admin account '{DEFAULT_ADMIN_USERNAME}'.")
    else:
        # Ensure password hash is valid for ironman
        pw_hash = admin.get("password_hash", "")
        if not pw_hash or not check_password_hash(pw_hash, DEFAULT_ADMIN_PASSWORD):
            admin["password_hash"] = generate_password_hash(DEFAULT_ADMIN_PASSWORD)
            admin["is_primary_admin"] = True
            if mongo_available:
                try:
                    db.users.replace_one({"username": DEFAULT_ADMIN_USERNAME}, dict(admin), upsert=True)
                except Exception:
                    pass
            users = load_users()
            for i, u in enumerate(users):
                if u.get("username") == DEFAULT_ADMIN_USERNAME:
                    users[i] = admin
            save_all_users(users)

seed_default_admin()

# Role Permissions Definitions for Strict RBAC Segregation
ROLE_PERMISSIONS = {
    "Admin": {
        "label": "Administrator",
        "job": "Administration & User Management",
        "tabs": ["dashboard", "applications", "enquiries", "users", "preview"],
        "apis": ["users", "auth", "applications", "enquiries"]
    },
    "Sub-Admin": {
        "label": "Sub-Admin",
        "job": "Admissions & Public Enquiries Only",
        "tabs": ["applications", "enquiries", "preview"],
        "apis": ["applications", "enquiries"]
    },
    "Admissions Officer": {
        "label": "Admissions Officer",
        "job": "Admissions & Public Enquiries Only",
        "tabs": ["applications", "enquiries", "preview"],
        "apis": ["applications", "enquiries"]
    },
    "Content Editor": {
        "label": "Content Editor",
        "job": "Website Content, Gallery & Notices Only",
        "tabs": ["content", "gallery", "notices", "programmes", "stats", "preview"],
        "apis": ["content", "gallery", "notices", "programmes", "stats"]
    },
    "Super Admin": {
        "label": "Super Administrator",
        "job": "Full System Oversight",
        "tabs": ["dashboard", "gallery", "notices", "programmes", "stats", "content", "applications", "enquiries", "users", "preview"],
        "apis": ["*"]
    }
}

def get_role_info(role_name):
    return ROLE_PERMISSIONS.get(role_name, ROLE_PERMISSIONS["Sub-Admin"])

def get_current_user_from_request():
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "token" in request.args:
        token = request.args.get("token")
    elif request.cookies.get("admin_token"):
        token = request.cookies.get("admin_token")
    
    if not token or token not in active_sessions:
        return None
    return active_sessions[token]

def check_permission(api_group):
    """
    Validates that the current user has permission for `api_group`.
    Returns (True, None, 200) if authorized, or (False, error_json_response, status_code)
    """
    curr = get_current_user_from_request()
    if not curr:
        return False, jsonify({"error": "Authentication required. Please sign in to the Admin Console."}), 401
    
    # Primary admin doomsday always has master access
    if curr.get("is_primary_admin"):
        return True, None, 200
        
    role = curr.get("role", "Sub-Admin")
    perms = get_role_info(role)
    allowed_apis = perms.get("apis", [])
    
    if "*" in allowed_apis or api_group in allowed_apis:
        return True, None, 200
        
    job = perms.get("job", role)
    return False, jsonify({
        "error": f"Access Denied: Your assigned role '{role}' is restricted to '{job}'. You cannot access or modify '{api_group}'."
    }), 403

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
    saved = False
    if mongo_available:
        try:
            db.applications.insert_one(dict(app_data))
            saved = True
        except Exception as e:
            print(f"[PyMongo Error] Failed to save application: {e}")
    try:
        apps = []
        if os.path.exists(APPLICATIONS_FILE):
            with open(APPLICATIONS_FILE, "r", encoding="utf-8") as f:
                apps = json.load(f)
        apps = [a for a in apps if a.get("id") != app_data.get("id")]
        apps.insert(0, dict(app_data))
        with open(APPLICATIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(apps, f, indent=2, ensure_ascii=False)
        saved = True
    except Exception as e:
        print(f"[File Error] Failed to write applications: {e}")
    return saved

def remove_application(app_id):
    removed = False
    if mongo_available:
        try:
            res = db.applications.delete_one({"id": app_id})
            if res.deleted_count > 0:
                removed = True
        except Exception as e:
            print(f"[PyMongo Error] Failed to delete application: {e}")
    try:
        apps = []
        if os.path.exists(APPLICATIONS_FILE):
            with open(APPLICATIONS_FILE, "r", encoding="utf-8") as f:
                apps = json.load(f)
        new_apps = [a for a in apps if a.get("id") != app_id]
        if len(new_apps) < len(apps):
            removed = True
        with open(APPLICATIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(new_apps, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[File Error] Failed to update applications: {e}")
    return removed

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
    saved = False
    if mongo_available:
        try:
            db.enquiries.insert_one(dict(enquiry_data))
            saved = True
        except Exception:
            pass
    try:
        enqs = []
        if os.path.exists(ENQUIRIES_FILE):
            with open(ENQUIRIES_FILE, "r", encoding="utf-8") as f:
                enqs = json.load(f)
        enqs = [e for e in enqs if e.get("id") != enquiry_data.get("id")]
        enqs.insert(0, dict(enquiry_data))
        with open(ENQUIRIES_FILE, "w", encoding="utf-8") as f:
            json.dump(enqs, f, indent=2, ensure_ascii=False)
        saved = True
    except Exception as e:
        print(f"[File Error] Failed to write enquiries: {e}")
    return saved

def remove_enquiry(enq_id):
    removed = False
    if mongo_available:
        try:
            res = db.enquiries.delete_one({"id": enq_id})
            if res.deleted_count > 0:
                removed = True
        except Exception:
            pass
    try:
        enqs = []
        if os.path.exists(ENQUIRIES_FILE):
            with open(ENQUIRIES_FILE, "r", encoding="utf-8") as f:
                enqs = json.load(f)
        new_enqs = [e for e in enqs if e.get("id") != enq_id]
        if len(new_enqs) < len(enqs):
            removed = True
        with open(ENQUIRIES_FILE, "w", encoding="utf-8") as f:
            json.dump(new_enqs, f, indent=2, ensure_ascii=False)
    except Exception:
        pass
    return removed


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

# ==================== AUTHENTICATION & USER MANAGEMENT ROUTES ====================

@app.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = (data.get("password") or "")

    if not username or not password:
        return jsonify({"success": False, "error": "Username and password are required"}), 400

    user = get_user_by_username(username)
    if not user:
        return jsonify({"success": False, "error": "Invalid username or password"}), 401

    pw_hash = user.get("password_hash", "")
    is_valid = False
    if pw_hash:
        try:
            is_valid = check_password_hash(pw_hash, password)
        except Exception:
            is_valid = False
    if not is_valid and user.get("password") == password:
        is_valid = True

    if not is_valid:
        return jsonify({"success": False, "error": "Invalid username or password"}), 401

    token = uuid.uuid4().hex
    is_primary = bool(user.get("is_primary_admin") or user.get("username") == DEFAULT_ADMIN_USERNAME or user.get("role") == "Super Admin")
    raw_role = user.get("role", "Admin" if is_primary else "Sub-Admin")
    role_info = get_role_info(raw_role)

    user_info = {
        "username": user.get("username"),
        "name": user.get("name", user.get("username").title()),
        "role": raw_role,
        "role_label": role_info["label"],
        "assigned_job": role_info["job"],
        "allowed_tabs": role_info["tabs"],
        "is_primary_admin": is_primary,
        "view_scope": raw_role,
        "logged_in_at": datetime.now().isoformat()
    }
    active_sessions[token] = user_info

    resp = jsonify({
        "success": True,
        "token": token,
        "user": user_info,
        "message": f"Welcome back, {user_info['name']}!"
    })
    resp.set_cookie("admin_token", token, httponly=False, samesite="Lax")
    return resp

@app.route("/api/auth/me", methods=["GET"])
def api_auth_me():
    curr = get_current_user_from_request()
    if not curr:
        return jsonify({"authenticated": False, "error": "No active session found"}), 401
    return jsonify({"authenticated": True, "user": curr})

@app.route("/api/auth/scope", methods=["POST"])
def api_auth_scope():
    """Allows primary admin (doomsday) to test and toggle view scopes dynamically"""
    curr = get_current_user_from_request()
    if not curr:
        return jsonify({"error": "Authentication required"}), 401
    if not curr.get("is_primary_admin"):
        return jsonify({"error": "Access Denied: Only the primary administrator can switch view scopes."}), 403

    data = request.get_json(force=True, silent=True) or {}
    requested_scope = data.get("scope", "Admin")
    if requested_scope not in ROLE_PERMISSIONS:
        return jsonify({"error": f"Invalid role scope '{requested_scope}'"}), 400

    role_info = get_role_info(requested_scope)
    curr["view_scope"] = requested_scope
    curr["role"] = requested_scope
    curr["role_label"] = role_info["label"]
    curr["assigned_job"] = role_info["job"]
    curr["allowed_tabs"] = role_info["tabs"]

    return jsonify({
        "success": True,
        "user": curr,
        "message": f"Active role scope set to {role_info['label']}"
    })

@app.route("/api/auth/logout", methods=["POST"])
def api_auth_logout():
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "token" in request.args:
        token = request.args.get("token")
    elif request.cookies.get("admin_token"):
        token = request.cookies.get("admin_token")
    if token and token in active_sessions:
        del active_sessions[token]
    resp = jsonify({"success": True, "message": "Logged out successfully"})
    resp.set_cookie("admin_token", "", expires=0)
    return resp

# ==================== FAST2SMS LIVE SMS GATEWAY INTEGRATION ====================

def load_sms_config():
    cfg = {
        "provider": "fast2sms",
        "fast2sms_api_key": os.environ.get("FAST2SMS_API_KEY", ""),
        "enabled": True
    }
    if os.path.exists(SMS_CONFIG_FILE):
        try:
            with open(SMS_CONFIG_FILE, "r", encoding="utf-8") as f:
                stored = json.load(f)
                if isinstance(stored, dict):
                    cfg.update(stored)
        except Exception as e:
            print(f"[SMS Config Error] Failed to read sms_config.json: {e}")
    return cfg

def save_sms_config(cfg):
    try:
        with open(SMS_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        return True
    except Exception as e:
        print(f"[SMS Config Error] Failed to write sms_config.json: {e}")
        return False

def send_fast2sms_otp(api_key, phone_number, otp_code):
    """
    Sends real SMS text message via Fast2SMS Quick OTP API (https://www.fast2sms.com)
    """
    clean_phone = re.sub(r"\D", "", phone_number)
    if len(clean_phone) > 10:
        clean_phone = clean_phone[-10:]

    url = "https://www.fast2sms.com/dev/bulkV2"
    headers = {
        "authorization": api_key.strip(),
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = urllib.parse.urlencode({
        "variables_values": otp_code,
        "route": "otp",
        "numbers": clean_phone
    }).encode("utf-8")

    try:
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            res_json = json.loads(body) if body else {}
            if res_json.get("return") is True:
                return True, "SMS delivered successfully via Fast2SMS.", res_json
            else:
                raw_msg = res_json.get("message", "Delivery failed")
                msg = " ".join(raw_msg) if isinstance(raw_msg, list) else str(raw_msg)
                return False, msg, res_json
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
            msg = err_json.get("message", f"HTTP {e.code}")
        except Exception:
            msg = f"HTTP {e.code}"
        return False, f"Fast2SMS API error: {msg}", {}
    except Exception as e:
        return False, f"Fast2SMS connection error: {e}", {}

@app.route("/api/auth/otp/send", methods=["POST"])
def api_send_otp():
    """
    Dispatches a 6-digit OTP to a mobile phone number via Fast2SMS or simulation.
    Strictly restricted to Super Administrator for password creation / recreation.
    """
    curr = get_current_user_from_request()
    if not curr:
        return jsonify({"error": "Authentication required. Please sign in to the Admin Console."}), 401

    is_super_admin = bool(curr.get("is_primary_admin") or curr.get("role") == "Super Admin")
    if not is_super_admin:
        return jsonify({"error": "Access Denied: Only Super Administrator can request password reset OTPs."}), 403

    data = request.get_json(force=True, silent=True) or {}
    phone = (data.get("phone") or "").strip()
    target_username = (data.get("target_username") or "").strip().lower()

    if not target_username:
        return jsonify({"error": "Target username is required to request OTP."}), 400

    target = get_user_by_username(target_username)
    if not target:
        return jsonify({"error": f"Target user '{target_username}' not found."}), 404

    # Clean phone number (remove spaces, hyphens, parentheses)
    clean_phone = re.sub(r"[\s\-\(\)\+]", "", phone)
    if not clean_phone or len(clean_phone) < 10 or not clean_phone.isdigit():
        return jsonify({"error": "Please enter a valid 10-digit mobile phone number for OTP verification."}), 400

    # Generate cryptographically secure 6-digit code
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = time.time() + 300  # 5 minutes validity

    active_otps[target_username] = {
        "otp": otp_code,
        "phone": phone,
        "clean_phone": clean_phone,
        "expires_at": expires_at,
        "attempts": 0,
        "requested_by": curr.get("username")
    }

    masked_phone = f"{phone[:2]}******{phone[-4:]}" if len(phone) >= 10 else "******"

    # Attempt Live SMS Dispatch via Fast2SMS if configured
    cfg = load_sms_config()
    api_key = cfg.get("fast2sms_api_key", "").strip()
    is_live_sms = False
    sms_status_msg = ""

    if cfg.get("enabled") and api_key:
        ok, msg, res_json = send_fast2sms_otp(api_key, clean_phone, otp_code)
        if ok:
            is_live_sms = True
            sms_status_msg = f"Live SMS dispatched to +91 {clean_phone[-10:]} via Fast2SMS."
            print(f"[Fast2SMS Gateway] REAL SMS SENT to {clean_phone} with OTP '{otp_code}'")
        else:
            sms_status_msg = f"Fast2SMS API notice: {msg}. (In-app simulation code provided for testing)."
            print(f"[Fast2SMS Warning] {msg}. Generated OTP: {otp_code}")
    else:
        sms_status_msg = f"6-digit security OTP dispatched to mobile {masked_phone}."
        print(f"[SMS Simulator] Dispatched OTP '{otp_code}' to mobile {phone} for account '{target_username}' (Super Admin: {curr.get('username')})")

    return jsonify({
        "success": True,
        "message": sms_status_msg,
        "is_live_sms": is_live_sms,
        "phone_masked": masked_phone,
        "dev_otp": otp_code,
        "expires_in": 300
    })

@app.route("/api/admin/sms-config", methods=["GET"])
def api_get_sms_config():
    curr = get_current_user_from_request()
    if not curr:
        return jsonify({"error": "Authentication required"}), 401
    if not (curr.get("is_primary_admin") or curr.get("role") == "Super Admin"):
        return jsonify({"error": "Access Denied: Only Super Administrator can view SMS gateway configuration."}), 403

    cfg = load_sms_config()
    raw_key = cfg.get("fast2sms_api_key", "").strip()
    masked_key = f"{raw_key[:4]}...{raw_key[-4:]}" if len(raw_key) > 8 else ("••••••••" if raw_key else "")

    return jsonify({
        "provider": "fast2sms",
        "has_api_key": bool(raw_key),
        "masked_api_key": masked_key,
        "enabled": bool(cfg.get("enabled", True))
    })

@app.route("/api/admin/sms-config", methods=["POST"])
def api_save_sms_config():
    curr = get_current_user_from_request()
    if not curr:
        return jsonify({"error": "Authentication required"}), 401
    if not (curr.get("is_primary_admin") or curr.get("role") == "Super Admin"):
        return jsonify({"error": "Access Denied: Only Super Administrator can update SMS gateway configuration."}), 403

    data = request.get_json(force=True, silent=True) or {}
    cfg = load_sms_config()

    new_key = data.get("fast2sms_api_key")
    if new_key is not None:
        cfg["fast2sms_api_key"] = new_key.strip()
    if "enabled" in data:
        cfg["enabled"] = bool(data.get("enabled"))
    cfg["provider"] = "fast2sms"

    saved = save_sms_config(cfg)
    if saved:
        return jsonify({"success": True, "message": "Fast2SMS gateway configuration saved successfully."})
    return jsonify({"error": "Failed to save SMS configuration file."}), 500

@app.route("/api/admin/sms-config/test", methods=["POST"])
def api_test_sms_config():
    curr = get_current_user_from_request()
    if not curr:
        return jsonify({"error": "Authentication required"}), 401
    if not (curr.get("is_primary_admin") or curr.get("role") == "Super Admin"):
        return jsonify({"error": "Access Denied: Only Super Administrator can test SMS gateway."}), 403

    data = request.get_json(force=True, silent=True) or {}
    phone = (data.get("phone") or "").strip()
    clean_phone = re.sub(r"\D", "", phone)
    if len(clean_phone) < 10:
        return jsonify({"error": "Please provide a valid 10-digit mobile number for test delivery."}), 400

    cfg = load_sms_config()
    api_key = cfg.get("fast2sms_api_key", "").strip()
    if not api_key:
        return jsonify({"error": "Fast2SMS API Key is not configured yet. Please enter and save your API key first."}), 400

    test_otp = f"{secrets.randbelow(900000) + 100000}"
    ok, msg, res_json = send_fast2sms_otp(api_key, clean_phone, test_otp)
    if ok:
        return jsonify({
            "success": True,
            "message": f"Real test SMS sent successfully to +91 {clean_phone[-10:]} via Fast2SMS!",
            "test_otp": test_otp,
            "gateway_response": res_json
        })
    else:
        return jsonify({
            "success": False,
            "error": f"Fast2SMS delivery error: {msg}",
            "gateway_response": res_json
        }), 400

@app.route("/api/users", methods=["GET"])
def api_get_users():
    is_ok, err_resp, status = check_permission("users")
    if not is_ok:
        return err_resp, status
    
    users = load_users()
    sanitized = []
    for u in users:
        u_role = u.get("role", "Sub-Admin")
        r_info = get_role_info(u_role)
        sanitized.append({
            "username": u.get("username"),
            "name": u.get("name", u.get("username")),
            "role": u_role,
            "role_label": r_info["label"],
            "assigned_job": r_info["job"],
            "allowed_tabs": r_info["tabs"],
            "created_at": u.get("created_at", datetime.now().isoformat()),
            "phone": u.get("phone", ""),
            "is_primary_admin": bool(u.get("is_primary_admin") or u.get("username") == DEFAULT_ADMIN_USERNAME)
        })
    return jsonify({"users": sanitized})

@app.route("/api/users", methods=["POST"])
def api_create_user():
    is_ok, err_resp, status = check_permission("users")
    if not is_ok:
        return err_resp, status

    curr = get_current_user_from_request()
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = (data.get("password") or "").strip()
    name = (data.get("name") or "").strip()
    role = (data.get("role") or "Sub-Admin").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    if len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters long"}), 400

    existing = get_user_by_username(username)
    if existing:
        return jsonify({"error": f"Username '{username}' already exists. Please choose a different username."}), 409

    if role not in ROLE_PERMISSIONS:
        role = "Sub-Admin"

    role_info = get_role_info(role)

    new_user = {
        "username": username,
        "password_hash": generate_password_hash(password),
        "name": name if name else username.title(),
        "role": role,
        "role_label": role_info["label"],
        "assigned_job": role_info["job"],
        "created_at": datetime.now().isoformat(),
        "created_by": curr.get("username")
    }

    if mongo_available:
        try:
            db.users.replace_one({"username": username}, dict(new_user), upsert=True)
        except Exception as e:
            print(f"[PyMongo Error] Failed to insert user: {e}")

    users = load_users()
    users.append(new_user)
    save_all_users(users)

    return jsonify({
        "success": True,
        "message": f"User '{username}' created successfully with designated role '{role_info['label']}'.",
        "user": {
            "username": new_user["username"],
            "name": new_user["name"],
            "role": new_user["role"],
            "role_label": role_info["label"],
            "assigned_job": role_info["job"],
            "created_at": new_user["created_at"],
            "is_primary_admin": False
        }
    }), 201

@app.route("/api/users/<username>", methods=["DELETE"])
def api_delete_user(username):
    is_ok, err_resp, status = check_permission("users")
    if not is_ok:
        return err_resp, status

    curr = get_current_user_from_request()
    uname = (username or "").strip().lower()
    target = get_user_by_username(uname)
    if not target:
        return jsonify({"error": f"User '{uname}' not found"}), 404

    if target.get("is_primary_admin") or uname == DEFAULT_ADMIN_USERNAME:
        return jsonify({"error": "Cannot delete primary administrator account"}), 400
    if uname == curr.get("username", "").lower():
        return jsonify({"error": "Cannot delete your own active account while logged in"}), 400

    deleted = False
    if mongo_available:
        try:
            res = db.users.delete_one({"username": uname})
            if res.deleted_count > 0:
                deleted = True
        except Exception as e:
            print(f"[PyMongo Error] Failed to delete user: {e}")

    users = load_users()
    initial_len = len(users)
    users = [u for u in users if u.get("username", "").lower() != uname]
    if len(users) < initial_len:
        deleted = True
        save_all_users(users)

    if deleted:
        return jsonify({"success": True, "message": f"User '{uname}' deleted successfully."})
    return jsonify({"error": f"User '{uname}' not found"}), 404

@app.route("/api/users/<username>", methods=["PUT"])
def api_update_user(username):
    """
    Update user credentials and User ID (username).
    Strict authorization: ONLY Super Admin can rename user IDs and change passwords for every user (including himself).
    """
    curr = get_current_user_from_request()
    if not curr:
        return jsonify({"error": "Authentication required. Please sign in to the Admin Console."}), 401

    is_super_admin = bool(curr.get("is_primary_admin") or curr.get("role") == "Super Admin")
    if not is_super_admin:
        return jsonify({"error": "Access Denied: Only Super Administrator can rename user IDs or change user credentials."}), 403

    orig_uname = (username or "").strip().lower()
    target = get_user_by_username(orig_uname)
    if not target:
        return jsonify({"error": f"User '{orig_uname}' not found."}), 404

    data = request.get_json(force=True, silent=True) or {}
    new_uname = (data.get("new_username") or orig_uname).strip().lower()
    password = (data.get("password") or "").strip()
    name = (data.get("name") or "").strip()
    role = (data.get("role") or "").strip()

    # Validate new username format
    if not re.match(r"^[a-zA-Z0-9_.-]{3,30}$", new_uname):
        return jsonify({"error": "User ID must be 3 to 30 characters and contain only letters, numbers, underscores, dashes, or dots."}), 400

    # If username changed, ensure uniqueness
    if new_uname != orig_uname:
        existing = get_user_by_username(new_uname)
        if existing and existing.get("username", "").lower() != orig_uname:
            return jsonify({"error": f"User ID '{new_uname}' is already taken. Please choose a different User ID."}), 409

    # If password is provided, validate length, enforce mobile OTP verification and hash
    if password:
        otp = (data.get("otp") or "").strip()
        if not otp:
            return jsonify({"error": "Mobile OTP verification required. Please enter the 6-digit OTP code sent to your phone."}), 400

        otp_record = active_otps.get(orig_uname)
        if not otp_record or time.time() > otp_record.get("expires_at", 0):
            return jsonify({"error": "OTP has expired or was not requested. Please click 'Send OTP' to receive a new code."}), 400

        otp_record["attempts"] = otp_record.get("attempts", 0) + 1
        if otp_record["attempts"] > 3:
            active_otps.pop(orig_uname, None)
            return jsonify({"error": "Too many invalid OTP attempts. Please request a new OTP code."}), 400

        if otp_record["otp"] != otp:
            remaining = 3 - otp_record["attempts"]
            return jsonify({"error": f"Invalid OTP code ({remaining} attempt{'s' if remaining != 1 else ''} remaining). Please enter the correct code."}), 400

        # OTP verified! Invalidate immediately so it cannot be reused
        active_otps.pop(orig_uname, None)

        if len(password) < 4:
            return jsonify({"error": "Password must be at least 4 characters long."}), 400
        target["password_hash"] = generate_password_hash(password)
        target.pop("password", None)

    # If phone number provided
    phone = (data.get("phone") or "").strip()
    if phone:
        target["phone"] = phone

    # If full name provided
    if name:
        target["name"] = name

    # If role provided and valid
    if role and role in ROLE_PERMISSIONS:
        target["role"] = role
        r_info = get_role_info(role)
        target["role_label"] = r_info["label"]
        target["assigned_job"] = r_info["job"]

    # Retain primary admin privilege if the target is the primary admin
    is_target_primary = bool(orig_uname == DEFAULT_ADMIN_USERNAME or target.get("is_primary_admin"))
    if is_target_primary:
        target["is_primary_admin"] = True

    # Persist in MongoDB
    if mongo_available:
        try:
            if new_uname != orig_uname:
                db.users.delete_one({"username": orig_uname})
            db.users.replace_one({"username": new_uname}, dict(target), upsert=True)
        except Exception as e:
            print(f"[PyMongo Error] Failed to update user: {e}")

    # Persist in JSON file
    users = load_users()
    updated_users = []
    found = False
    for u in users:
        if u.get("username", "").lower() == orig_uname:
            found = True
            target["username"] = new_uname
            updated_users.append(target)
        else:
            updated_users.append(u)
    if not found:
        target["username"] = new_uname
        updated_users.append(target)
    save_all_users(updated_users)

    # Sync active sessions (including if Super Admin renamed himself)
    for tok, sess in list(active_sessions.items()):
        if sess.get("username", "").lower() == orig_uname:
            sess["username"] = new_uname
            if target.get("name"):
                sess["name"] = target["name"]
            if target.get("role"):
                sess["role"] = target["role"]
                sess["role_label"] = target.get("role_label", target["role"])
                sess["assigned_job"] = target.get("assigned_job", "")
                sess["allowed_tabs"] = get_role_info(target["role"]).get("tabs", [])

    role_info = get_role_info(target.get("role", "Sub-Admin"))
    return jsonify({
        "success": True,
        "message": f"User account '{new_uname}' updated successfully.",
        "user": {
            "username": new_uname,
            "name": target.get("name", new_uname.title()),
            "role": target.get("role", "Sub-Admin"),
            "role_label": role_info["label"],
            "assigned_job": role_info["job"],
            "created_at": target.get("created_at", datetime.now().isoformat()),
            "is_primary_admin": is_target_primary
        }
    })

@app.route("/api/content", methods=["GET"])
def api_get_content():
    content = get_current_content()
    return jsonify(content)

@app.route("/api/content", methods=["PUT"])
def api_update_content():
    is_ok, err_resp, status = check_permission("content")
    if not is_ok:
        return err_resp, status

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
    is_ok, err_resp, status = check_permission("gallery")
    if not is_ok:
        return err_resp, status

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
    is_ok, err_resp, status = check_permission("gallery")
    if not is_ok:
        return err_resp, status

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
    is_ok, err_resp, status = check_permission("notices")
    if not is_ok:
        return err_resp, status

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
    is_ok, err_resp, status = check_permission("notices")
    if not is_ok:
        return err_resp, status

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
    is_ok, err_resp, status = check_permission("programmes")
    if not is_ok:
        return err_resp, status

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
    is_ok, err_resp, status = check_permission("programmes")
    if not is_ok:
        return err_resp, status

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
    is_ok, err_resp, status = check_permission("applications")
    if not is_ok:
        return err_resp, status
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
    is_ok, err_resp, status = check_permission("applications")
    if not is_ok:
        return err_resp, status
    success = remove_application(app_id)
    if success:
        return jsonify({"success": True, "message": "Application deleted successfully"})
    return jsonify({"error": "Application not found"}), 404

# Enquiries / Contact Submissions
@app.route("/api/enquiries", methods=["GET"])
def api_get_enquiries():
    is_ok, err_resp, status = check_permission("enquiries")
    if not is_ok:
        return err_resp, status
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
    is_ok, err_resp, status = check_permission("enquiries")
    if not is_ok:
        return err_resp, status
    success = remove_enquiry(enq_id)
    if success:
        return jsonify({"success": True, "message": "Enquiry removed successfully"})
    return jsonify({"error": "Enquiry not found"}), 404

# CRUD for Stats
@app.route("/api/stats", methods=["POST"])
def api_add_stat():
    is_ok, err_resp, status = check_permission("stats")
    if not is_ok:
        return err_resp, status

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
    is_ok, err_resp, status = check_permission("stats")
    if not is_ok:
        return err_resp, status

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
    curr = get_current_user_from_request()
    if not curr:
        return jsonify({"error": "Authentication required"}), 401
    if not (curr.get("is_primary_admin") or curr.get("role") == "Super Admin"):
        return jsonify({"error": "Access Denied: Only Super Administrator can reset database defaults."}), 403

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
