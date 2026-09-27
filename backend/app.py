"""
Sri Devi Arts & Science College (Ponneri) — Main Application Server
-------------------------------------------------------------------
Assembles and coordinates the modular architecture:
1. college_website.py: Public website routing, content serving, enquiries
2. admin_page.py: Admin portal, authentication, RBAC, content management
3. admission.py: Admission pipeline, student applications, database push & CSV export
"""

import os
from flask import Flask
from flask_cors import CORS

# Import database & configuration
from db import (
    BASE_DIR,
    COLLEGE_SITE_DIR,
    ADMIN_SITE_DIR,
    PHOTO_DIR,
    UPLOADS_DIR,
    SEED_FILE,
    APPLICATIONS_FILE,
    ENQUIRIES_FILE,
    USERS_FILE,
    MONGO_URI,
    DB_NAME,
    mongo_client,
    db,
    mongo_available,
    allowed_file,
    load_seed_data,
    seed_database_if_empty,
    get_current_content,
    save_current_content,
    load_enquiries,
    save_enquiry,
    remove_enquiry
)

# Import scalable modular blueprints
from admin_page import (
    admin_page_bp,
    active_sessions,
    ROLE_PERMISSIONS,
    get_role_info,
    get_current_user_from_request,
    check_permission,
    load_users,
    save_all_users,
    get_user_by_username,
    seed_default_admin
)
from admission import (
    admission_bp,
    load_applications,
    push_admission,
    save_application,
    remove_application,
    update_application_status
)
from college_website import college_website_bp

# Initialize Flask application
app = Flask(__name__)
CORS(app)

# Register modular blueprints
# Note: Admin & Admission are registered first; College website (containing catch-all) is registered last.
app.register_blueprint(admin_page_bp)
app.register_blueprint(admission_bp)
app.register_blueprint(college_website_bp)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print("=" * 60)
    print("  Sri Devi Arts & Science College — Fullstack CMS Server")
    print(f"  Backend: Flask + PyMongo (MongoDB: {MONGO_URI})")
    print(f"  Public Website:   http://localhost:{port}/")
    print(f"  Admin CMS Portal: http://localhost:{port}/admin/")
    print(f"  API Health:       http://localhost:{port}/api/health")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=False)
