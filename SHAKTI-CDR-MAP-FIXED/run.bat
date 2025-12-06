@echo off
echo ===========================================
echo   SHAKTI CDR Map View - FIXED VERSION
echo ===========================================
echo.
echo Starting Flask application...
echo.
echo After starting, open your browser to:
echo http://localhost:5000
echo.
echo Then:
echo 1. Go to Upload page and upload sample_cdr_data.csv
echo 2. Go to Map View and select 'cdr' data type
echo 3. Click 'Generate Map' to see working map!
echo.
echo ===========================================
echo.

python app.py

pause