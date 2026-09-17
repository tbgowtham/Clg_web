import os
import sys

# Ensure backend directory is in path
backend_dir = os.path.join(os.path.dirname(__file__), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print("=" * 60)
    print("  Sri Devi Arts & Science College — Fullstack CMS Server")
    print(f"  Public Website:   http://localhost:{port}/")
    print(f"  Admin CMS Portal: http://localhost:{port}/admin/")
    print(f"  API Health:       http://localhost:{port}/api/health")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=False)
