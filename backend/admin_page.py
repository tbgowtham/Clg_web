"""
Admin Page and CMS Management Module
------------------------------------
Handles the administrative portal interface, authentication sessions,
Role-Based Access Control (RBAC), user account management, dynamic website
content updates, announcements/notices, course programmes, campus photo uploads,
and visitor enquiries oversight for Sri Devi Arts & Science College.
"""

import os
import re
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

from db import (
    ADMIN_SITE_DIR,
    UPLOADS_DIR,
    USERS_FILE,
    db,
    mongo_available,
    allowed_file,
    load_seed_data,
    get_current_content,
    save_current_content,
    load_enquiries,
    remove_enquiry
)

# Blueprint for Admin Portal
admin_page_bp = Blueprint("admin_page", __name__)

DEFAULT_ADMIN_USERNAME = "doomsday"
DEFAULT_ADMIN_PASSWORD = "ironman"
active_sessions = {}  # token -> user_dict


# ==================== ROLE-BASED ACCESS CONTROL (RBAC) ====================

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
    """Returns permission configuration and metadata for a specific role."""
    return ROLE_PERMISSIONS.get(role_name, ROLE_PERMISSIONS["Sub-Admin"])


def get_current_user_from_request():
    """Extracts and verifies active session user from headers, args, or cookies."""
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


# ==================== USER STORAGE HELPERS ====================

def load_users():
    """Loads all admin and staff users from MongoDB or fallback users.json."""
    if mongo_available and db is not None:
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
    """Persists all users to MongoDB and fallback users.json."""
    if mongo_available and db is not None:
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
    """Looks up a user record by username (case-insensitive)."""
    uname = (username or "").strip().lower()
    if mongo_available and db is not None:
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
    """Initializes the primary super administrator account if not present."""
    users = load_users()
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
        if mongo_available and db is not None:
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
        pw_hash = admin.get("password_hash", "")
        if not pw_hash or not check_password_hash(pw_hash, DEFAULT_ADMIN_PASSWORD):
            admin["password_hash"] = generate_password_hash(DEFAULT_ADMIN_PASSWORD)
            admin["is_primary_admin"] = True
            if mongo_available and db is not None:
                try:
                    db.users.replace_one({"username": DEFAULT_ADMIN_USERNAME}, dict(admin), upsert=True)
                except Exception:
                    pass
            users = load_users()
            for i, u in enumerate(users):
                if u.get("username") == DEFAULT_ADMIN_USERNAME:
                    users[i] = admin
            save_all_users(users)


# Seed admin account on load
import json
seed_default_admin()


# ==================== ADMIN STATIC ROUTES ====================

@admin_page_bp.route("/admin")
@admin_page_bp.route("/admin/")
def serve_admin_site_index():
    """Serves the Admin CMS dashboard single-page application."""
    return send_from_directory(ADMIN_SITE_DIR, "index.html")


@admin_page_bp.route("/admin/<path:path>")
def serve_admin_site_files(path):
    """Serves static JavaScript, CSS, and asset files for the admin dashboard."""
    full_path = os.path.join(ADMIN_SITE_DIR, path)
    if os.path.isfile(full_path):
        return send_from_directory(ADMIN_SITE_DIR, path)
    return send_from_directory(ADMIN_SITE_DIR, "index.html")


# ==================== AUTHENTICATION & SESSION ROUTES ====================

@admin_page_bp.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    """Authenticates staff/administrator and creates an active session token."""
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


@admin_page_bp.route("/api/auth/me", methods=["GET"])
def api_auth_me():
    """Returns profile and role permissions of the currently authenticated user."""
    curr = get_current_user_from_request()
    if not curr:
        return jsonify({"authenticated": False, "error": "No active session found"}), 401
    return jsonify({"authenticated": True, "user": curr})


@admin_page_bp.route("/api/auth/scope", methods=["POST"])
def api_auth_scope():
    """Allows primary admin (doomsday) to dynamically test different role scopes."""
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


@admin_page_bp.route("/api/auth/logout", methods=["POST"])
def api_auth_logout():
    """Logs out user and invalidates current authentication session token."""
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


# ==================== USER MANAGEMENT ROUTES ====================

@admin_page_bp.route("/api/users", methods=["GET"])
def api_get_users():
    """Lists all user accounts with sanitized credentials (RBAC protected)."""
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


@admin_page_bp.route("/api/users", methods=["POST"])
def api_create_user():
    """Creates a new administrative or staff user account (RBAC protected)."""
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

    if mongo_available and db is not None:
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


@admin_page_bp.route("/api/users/<username>", methods=["DELETE"])
def api_delete_user(username):
    """Deletes a staff user account (prevents self-deletion & primary admin deletion)."""
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
    if mongo_available and db is not None:
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


@admin_page_bp.route("/api/users/<username>", methods=["PUT"])
def api_update_user(username):
    """
    Update user credentials and User ID (username).
    Strict authorization: ONLY Super Admin can rename user IDs and change user credentials.
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

    # If password is provided, validate length and hash
    if password:
        if len(password) < 4:
            return jsonify({"error": "Password must be at least 4 characters long."}), 400
        target["password_hash"] = generate_password_hash(password)
        target.pop("password", None)

    # Phone number
    phone = (data.get("phone") or "").strip()
    if phone:
        target["phone"] = phone

    # Full name
    if name:
        target["name"] = name

    # Role update
    if role and role in ROLE_PERMISSIONS:
        target["role"] = role
        r_info = get_role_info(role)
        target["role_label"] = r_info["label"]
        target["assigned_job"] = r_info["job"]

    is_target_primary = bool(orig_uname == DEFAULT_ADMIN_USERNAME or target.get("is_primary_admin"))
    if is_target_primary:
        target["is_primary_admin"] = True

    # Persist in MongoDB
    if mongo_available and db is not None:
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

    # Sync active sessions
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


# ==================== CMS CONTENT MANAGEMENT ====================

@admin_page_bp.route("/api/content", methods=["PUT"])
def api_update_content():
    """Updates dynamic CMS content (about, contact, programmes, stats)."""
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


@admin_page_bp.route("/api/reset", methods=["POST"])
def api_reset_content():
    """Resets CMS content back to authentic default Ponneri content (Super Admin only)."""
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


# ==================== MEDIA & PHOTO MANAGEMENT ====================

@admin_page_bp.route("/api/upload", methods=["POST"])
def api_upload_image():
    """Uploads a new campus photograph into uploads directory and registers in CMS."""
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


@admin_page_bp.route("/api/photos/<photo_id>", methods=["DELETE"])
def api_delete_photo(photo_id):
    """Removes a photo from gallery and deletes underlying file from disk."""
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


# ==================== NOTICES / ANNOUNCEMENTS MANAGEMENT ====================

@admin_page_bp.route("/api/notices", methods=["POST"])
def api_add_notice():
    """Adds a new official notice or circular."""
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


@admin_page_bp.route("/api/notices/<notice_id>", methods=["DELETE"])
def api_delete_notice(notice_id):
    """Deletes an official campus notice."""
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


# ==================== ACADEMIC PROGRAMMES MANAGEMENT ====================

@admin_page_bp.route("/api/programmes", methods=["POST"])
def api_add_programme():
    """Adds a new degree programme to the college offerings."""
    is_ok, err_resp, status = check_permission("programmes")
    if not is_ok:
        return err_resp, status

    data = request.get_json(force=True, silent=True) or {}
    title = data.get("title", "").strip()
    category = data.get("category", "Undergraduate").strip()
    number = data.get("number", "").strip() or f"{len(get_current_content().get('programmes', [])) + 1:02d} / COURSE"
    department = data.get("department", title).strip()
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


@admin_page_bp.route("/api/programmes/<prog_id>", methods=["DELETE"])
def api_delete_programme(prog_id):
    """Deletes an academic programme."""
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


@admin_page_bp.route("/api/programmes/<prog_id>", methods=["PUT"])
def api_update_programme(prog_id):
    """Updates curriculum, seats, fees, or description for an academic programme."""
    is_ok, err_resp, status = check_permission("programmes")
    if not is_ok:
        return err_resp, status

    data = request.get_json(force=True, silent=True) or {}
    current = get_current_content()
    programmes = current.get("programmes", [])
    target = None

    for p in programmes:
        if p.get("id") == prog_id:
            if "number" in data:
                p["number"] = data["number"].strip()
            if "category" in data:
                p["category"] = data["category"].strip()
            if "title" in data and data["title"].strip():
                p["title"] = data["title"].strip()
            if "department" in data:
                p["department"] = data["department"].strip()
            if "seats" in data:
                p["seats"] = data["seats"].strip()
            if "fee" in data:
                p["fee"] = data["fee"].strip()
            if "duration" in data:
                p["duration"] = data["duration"].strip()
            if "desc" in data:
                p["desc"] = data["desc"].strip()
            if "image" in data and data["image"]:
                p["image"] = data["image"].strip()
            if "link" in data:
                p["link"] = data["link"].strip()
            target = p
            break

    if not target:
        return jsonify({"error": "Programme not found"}), 404

    save_current_content(current)
    return jsonify({"success": True, "message": "Programme updated successfully", "programme": target})


# ==================== STATISTICS MANAGEMENT ====================

@admin_page_bp.route("/api/stats", methods=["POST"])
def api_add_stat():
    """Adds a new key statistic figure."""
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


@admin_page_bp.route("/api/stats/<stat_id>", methods=["DELETE"])
def api_delete_stat(stat_id):
    """Deletes a key statistic figure."""
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


# ==================== PUBLIC ENQUIRIES OVERSIGHT ====================

@admin_page_bp.route("/api/enquiries", methods=["GET"])
def api_get_enquiries():
    """Lists student enquiries and visitor contact submissions (RBAC protected)."""
    is_ok, err_resp, status = check_permission("enquiries")
    if not is_ok:
        return err_resp, status
    enquiries = load_enquiries()
    return jsonify(enquiries)


@admin_page_bp.route("/api/enquiries/<enq_id>", methods=["DELETE"])
def api_delete_enquiry(enq_id):
    """Deletes a student enquiry after resolution."""
    is_ok, err_resp, status = check_permission("enquiries")
    if not is_ok:
        return err_resp, status
    success = remove_enquiry(enq_id)
    if success:
        return jsonify({"success": True, "message": "Enquiry removed successfully"})
    return jsonify({"error": "Enquiry not found"}), 404
