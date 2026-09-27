"""
College Website Module
----------------------
Handles all public-facing routes, static assets, dynamic content delivery,
campus media serving, system health checks, and visitor enquiry submissions
for Sri Devi Arts & Science College (Ponneri).
"""

import os
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, send_from_directory

from db import (
    COLLEGE_SITE_DIR,
    PHOTO_DIR,
    UPLOADS_DIR,
    DB_NAME,
    mongo_client,
    mongo_available,
    get_current_content,
    save_enquiry
)

# Blueprint for College Public Website
college_website_bp = Blueprint("college_website", __name__)


# ==================== PUBLIC STATIC & ASSET ROUTES ====================

@college_website_bp.route("/")
def serve_college_site_index():
    """Serves the main homepage of the college website."""
    return send_from_directory(COLLEGE_SITE_DIR, "index.html")


@college_website_bp.route("/assets/<path:path>")
def serve_assets(path):
    """Serves frontend CSS, JS, and image assets from college_site/assets."""
    full_path = os.path.join(COLLEGE_SITE_DIR, "assets", path)
    if os.path.isfile(full_path):
        return send_from_directory(os.path.join(COLLEGE_SITE_DIR, "assets"), path)
    return send_from_directory(COLLEGE_SITE_DIR, "index.html")


@college_website_bp.route("/photo/<path:filename>")
def serve_photos(filename):
    """Serves static campus and infrastructure photos."""
    return send_from_directory(PHOTO_DIR, filename)


@college_website_bp.route("/uploads/<path:filename>")
def serve_uploads(filename):
    """Serves dynamically uploaded media from the admin portal."""
    return send_from_directory(UPLOADS_DIR, filename)


# ==================== PUBLIC API ENDPOINTS ====================

@college_website_bp.route("/api/health", methods=["GET"])
def api_health():
    """
    Public health check endpoint.
    Reports operational status and live database ping.
    """
    is_connected = False
    if mongo_available and mongo_client is not None:
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


@college_website_bp.route("/api/content", methods=["GET"])
def api_get_content():
    """
    Fetches dynamic site content for the college homepage,
    including programmes, notices, photo gallery, stats, and contact info.
    """
    content = get_current_content()
    return jsonify(content)


@college_website_bp.route("/api/enquiries", methods=["POST"])
def api_submit_enquiry():
    """
    Accepts public admission enquiries and contact messages from visitors.
    Validates contact details and persists the enquiry into the database.
    """
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


# ==================== CATCH-ALL ROUTE FOR COLLEGE SITE ====================

@college_website_bp.route("/<path:path>", methods=["GET"])
def serve_college_site_files(path):
    """
    Catch-all router for college website static files and SPA navigation.
    Ensures admin and API routes are not intercepted.
    """
    # Guard against accidental interception of API or Admin routes
    if path.startswith("api/") or path.startswith("admin"):
        from flask import abort
        abort(404)

    full_path = os.path.join(COLLEGE_SITE_DIR, path)
    if os.path.isfile(full_path):
        return send_from_directory(COLLEGE_SITE_DIR, path)
    if path.startswith("photo/"):
        return send_from_directory(PHOTO_DIR, path[6:])
    if path.startswith("assets/"):
        return send_from_directory(os.path.join(COLLEGE_SITE_DIR, "assets"), path[7:])
    return send_from_directory(COLLEGE_SITE_DIR, "index.html")
