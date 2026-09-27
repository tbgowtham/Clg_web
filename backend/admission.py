"""
Admission and Database Push Module
----------------------------------
Handles the admission application pipeline, data validation, standardized
application ID generation, database persistence (MongoDB with JSON fallback),
application lifecycle status tracking, and admissions export for
Sri Devi Arts & Science College (Ponneri).
"""

import os
import io
import csv
import json
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, Response

from db import (
    APPLICATIONS_FILE,
    db,
    mongo_available
)
from admin_page import check_permission

# Blueprint for Admissions
admission_bp = Blueprint("admission", __name__)


# ==================== ADMISSION DATABASE STORAGE HELPERS ====================

def load_applications():
    """
    Loads all student admission applications from MongoDB,
    falling back to applications.json if MongoDB is unavailable.
    """
    apps = []
    if mongo_available and db is not None:
        try:
            apps = list(db.applications.find({}, {"_id": 0}))
        except Exception as e:
            print(f"[PyMongo Error] Failed to load applications: {e}")
    if not apps and os.path.exists(APPLICATIONS_FILE):
        try:
            with open(APPLICATIONS_FILE, "r", encoding="utf-8") as f:
                apps = json.load(f)
        except Exception:
            apps = []
    for a in apps:
        if a.get("status") in ("Pending Review", None, ""):
            a["status"] = "Pending"
    return apps


def push_admission(app_data):
    """
    Pushes a new admission application into the database.
    Persists to MongoDB 'applications' collection with JSON fallback backup.
    
    Returns:
        bool: True if stored successfully in either MongoDB or JSON fallback.
    """
    saved = False
    # 1. Push to MongoDB
    if mongo_available and db is not None:
        try:
            db.applications.insert_one(dict(app_data))
            saved = True
        except Exception as e:
            print(f"[PyMongo Error] Failed to push admission into database: {e}")

    # 2. Persist to local JSON fallback
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
        print(f"[File Error] Failed to write admission to JSON: {e}")

    return saved


# Backward-compatible alias
save_application = push_admission


def remove_application(app_id):
    """Deletes an admission application by its ID from the database and fallback file."""
    removed = False
    if mongo_available and db is not None:
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


def update_application_status(app_id, new_status):
    """
    Updates the lifecycle status of an admission application.
    Valid statuses: 'Pending', 'Joined', 'Rejected'.
    """
    valid_statuses = {"Pending", "Joined", "Rejected"}
    if new_status not in valid_statuses:
        return None

    updated = False
    iso_now = datetime.now().isoformat()

    if mongo_available and db is not None:
        try:
            res = db.applications.update_one(
                {"id": app_id},
                {"$set": {"status": new_status, "statusUpdatedAt": iso_now}}
            )
            if res.matched_count > 0:
                updated = True
        except Exception as e:
            print(f"[PyMongo Error] Failed to update application status: {e}")

    target = None
    try:
        apps = []
        if os.path.exists(APPLICATIONS_FILE):
            with open(APPLICATIONS_FILE, "r", encoding="utf-8") as f:
                apps = json.load(f)
        for a in apps:
            if a.get("id") == app_id:
                a["status"] = new_status
                a["statusUpdatedAt"] = iso_now
                target = a
                updated = True
                break
        if updated:
            with open(APPLICATIONS_FILE, "w", encoding="utf-8") as f:
                json.dump(apps, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[File Error] Failed to update application status in JSON: {e}")

    if updated and mongo_available and db is not None:
        try:
            return db.applications.find_one({"id": app_id}, {"_id": 0})
        except Exception:
            pass
    return target if updated else None


# ==================== ADMISSION API ROUTES ====================

@admission_bp.route("/api/applications", methods=["POST"])
def api_submit_application():
    """
    Public Admission Submission Endpoint.
    Validates candidate fields and pushes the admission into the database.
    """
    data = request.get_json(force=True, silent=True) or {}
    name = data.get("name", "").strip()
    mobile = data.get("mobile", "").strip()
    course = data.get("course", "").strip()

    if not name or not mobile or not course:
        return jsonify({"error": "Student Name, Mobile Number, and Desired Course are required."}), 400

    # Format structured application document
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
        "status": "Pending",
        "submittedAt": datetime.now().strftime("%d %b %Y, %I:%M %p")
    }

    # Push admission into MongoDB / JSON fallback
    success = push_admission(application_entry)
    if not success:
        return jsonify({"error": "Could not store application. Please try again or contact the admissions desk."}), 500

    return jsonify({
        "success": True,
        "message": "Your application has been received successfully! Our admission desk at Ponneri will contact you shortly.",
        "application": application_entry
    }), 201


@admission_bp.route("/api/applications", methods=["GET"])
def api_get_applications():
    """Retrieves all student admission applications (RBAC protected)."""
    is_ok, err_resp, status = check_permission("applications")
    if not is_ok:
        return err_resp, status
    apps = load_applications()
    return jsonify(apps)


@admission_bp.route("/api/applications/<app_id>", methods=["DELETE"])
def api_delete_application(app_id):
    """Deletes an admission application (RBAC protected)."""
    is_ok, err_resp, status = check_permission("applications")
    if not is_ok:
        return err_resp, status
    success = remove_application(app_id)
    if success:
        return jsonify({"success": True, "message": "Application deleted successfully"})
    return jsonify({"error": "Application not found"}), 404


@admission_bp.route("/api/applications/<app_id>/status", methods=["PUT", "PATCH"])
def api_update_application_status(app_id):
    """
    Updates student admission workflow status: Pending, Joined, or Rejected (RBAC protected).
    """
    is_ok, err_resp, status_code = check_permission("applications")
    if not is_ok:
        return err_resp, status_code

    data = request.get_json(force=True, silent=True) or {}
    new_status = (data.get("status") or "").strip()
    if new_status.lower() in ("pending", "pending review"):
        normalized_status = "Pending"
    elif new_status.lower() in ("joined", "admitted"):
        normalized_status = "Joined"
    elif new_status.lower() in ("rejected", "rejects", "declined"):
        normalized_status = "Rejected"
    else:
        return jsonify({"error": "Invalid status. Allowed options: Pending, Joined, Rejected"}), 400

    updated_app = update_application_status(app_id, normalized_status)
    if updated_app:
        return jsonify({
            "success": True,
            "message": f"Application status updated to {normalized_status}",
            "application": updated_app
        })
    return jsonify({"error": "Application not found"}), 404


@admission_bp.route("/api/applications/export", methods=["GET"])
def api_export_applications():
    """
    Exports filtered admission applications to a CSV spreadsheet with UTF-8 BOM encoding
    for Microsoft Excel compatibility (RBAC protected).
    """
    is_ok, err_resp, status_code = check_permission("applications")
    if not is_ok:
        return err_resp, status_code

    status_filter = (request.args.get("status") or "").strip().lower()
    community_filter = (request.args.get("community") or "").strip().lower()
    dept_filter = (request.args.get("department") or "").strip().lower()
    search = (request.args.get("search") or "").strip().lower()

    apps = load_applications()
    filtered = []
    for a in apps:
        curr_status = a.get("status", "Pending")
        if curr_status == "Pending Review":
            curr_status = "Pending"

        if status_filter and status_filter != "all":
            if curr_status.lower() != status_filter:
                continue

        if community_filter and community_filter != "all":
            comm = (a.get("community") or "").lower()
            if community_filter not in comm:
                continue

        if dept_filter and dept_filter != "all":
            crs = (a.get("course") or "").lower()
            if dept_filter not in crs:
                continue

        if search:
            name = (a.get("name") or "").lower()
            mobile = (a.get("mobile") or "").lower()
            course = (a.get("course") or "").lower()
            if search not in name and search not in mobile and search not in course:
                continue

        filtered.append(a)

    output = io.StringIO()
    # Write UTF-8 BOM for Microsoft Excel native encoding compatibility
    output.write("\ufeff")
    writer = csv.writer(output)

    headers = [
        "Application ID",
        "Date Submitted",
        "Status",
        "Candidate Name",
        "Gender",
        "Date of Birth",
        "Mobile Number",
        "Email Address",
        "Course Level",
        "Applied Department / Course",
        "Community",
        "Wants Scholarship",
        "Previous School / College",
        "Marks Total",
        "Percentage",
        "Father's Name",
        "Mother's Name"
    ]
    writer.writerow(headers)

    for a in filtered:
        status_val = a.get("status", "Pending")
        if status_val == "Pending Review":
            status_val = "Pending"
        writer.writerow([
            a.get("id", ""),
            a.get("submittedAt", ""),
            status_val,
            a.get("name", ""),
            a.get("gender", ""),
            a.get("dob", ""),
            a.get("mobile", ""),
            a.get("email", ""),
            a.get("courseType", "UG"),
            a.get("course", ""),
            a.get("community", "General"),
            "Yes" if a.get("needsScholarship") else "No",
            a.get("schoolOrCollege", ""),
            a.get("marksTotal", ""),
            a.get("percentage", ""),
            a.get("fatherName", ""),
            a.get("motherName", "")
        ])

    csv_data = output.getvalue()
    filename = f"SDASC_Admissions_{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        csv_data,
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache"
        }
    )
