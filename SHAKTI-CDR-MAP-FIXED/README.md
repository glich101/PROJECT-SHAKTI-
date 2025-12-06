Shakti - Dashboard (CDR module)
================================

What this patch adds/changes
- Shared `templates/base.html` layout and `static/css/site.css` for consistent styling.
- Refactored `templates/dashboard.html` and `templates/graph.html` to extend `base.html`.
- `app.py`: added `/upload/preview` endpoint to parse an uploaded file and return a preview (first 50 rows) without saving.

Run the app (development)
1. Create a virtual environment and install requirements:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
2. Start the Flask app:
   ```powershell
   cd Dashboard
   python app.py
   ```
3. Browse to:
   - http://127.0.0.1:5000/ — Dashboard
   - http://127.0.0.1:5000/graph — Graphs UI
   - http://127.0.0.1:5000/upload — Upload page

Preview upload (API)
- POST a file to `/upload/preview` with form field name `file` to receive a JSON preview.
