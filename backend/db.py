"""
Database and Storage Configuration Module
------------------------------------------
Handles MongoDB connectivity, JSON fallback data persistence,
directory paths, and shared data helpers for Sridevi Arts & Science College CMS.
"""

import os
import json
from pymongo import MongoClient

# Base directory definitions
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COLLEGE_SITE_DIR = os.path.join(BASE_DIR, "college_site")
ADMIN_SITE_DIR = os.path.join(BASE_DIR, "admin_site")
PHOTO_DIR = os.path.join(BASE_DIR, "photo")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

SEED_FILE = os.path.join(DATA_DIR, "content.json")
APPLICATIONS_FILE = os.path.join(DATA_DIR, "applications.json")
ENQUIRIES_FILE = os.path.join(DATA_DIR, "enquiries.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")

# Ensure required directories exist
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Allowed image extensions for campus gallery & upload
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}

def allowed_file(filename):
    """Check if the given filename has an allowed image extension."""
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
    mongo_client = None
    db = None
    print(f"[PyMongo Warning] Could not connect to MongoDB: {e}. Running with JSON persistence fallback.")


def load_seed_data():
    """Load default initial website content from content.json."""
    if os.path.exists(SEED_FILE):
        with open(SEED_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def seed_database_if_empty():
    """Seed or update MongoDB with standard Ponneri college content."""
    if not mongo_available or db is None:
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
            progs = content_doc.get("programmes", [])
            contact = content_doc.get("contact", {})
            if len(progs) < 12 or "Coimbatore" in contact.get("address", ""):
                seed_copy = dict(seed)
                seed_copy["_id"] = "site_content"
                db.content.replace_one({"_id": "site_content"}, seed_copy)
                print("[PyMongo] Upgraded database to full 12 Ponneri academic programmes & Ponneri address.")
            else:
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


# Initialize database seeding on module import
seed_database_if_empty()


# ==================== CONTENT HELPERS ====================

def get_current_content():
    """Retrieve site content from MongoDB or JSON fallback."""
    seed = load_seed_data()
    if mongo_available and db is not None:
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
    """Save updated site content to MongoDB and JSON fallback."""
    if mongo_available and db is not None:
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


# ==================== ENQUIRIES HELPERS ====================

def load_enquiries():
    """Load all contact enquiries from MongoDB or JSON fallback."""
    if mongo_available and db is not None:
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
    """Save a new contact enquiry to MongoDB and JSON fallback."""
    saved = False
    if mongo_available and db is not None:
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
    """Remove a contact enquiry by ID from MongoDB and JSON fallback."""
    removed = False
    if mongo_available and db is not None:
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
