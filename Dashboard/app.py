import os

# Check for matplotlib/seaborn (optional for charts)
try:
    import matplotlib
    matplotlib.use('Agg')  # Use non-interactive backend
    import matplotlib.pyplot as plt
    plt.ioff()  # Turn off interactive mode
    import seaborn as sns
    MATPLOTLIB_AVAILABLE = True
    print("Matplotlib and seaborn loaded successfully for chart generation.")
except ImportError as e:
    MATPLOTLIB_AVAILABLE = False
    print(f"Warning: matplotlib/seaborn not available. Chart generation in reports will be disabled. Error: {e}")
    plt = None
    sns = None
except Exception as e:
    MATPLOTLIB_AVAILABLE = False
    print(f"Warning: Failed to configure matplotlib backend. Chart generation in reports will be disabled. Error: {e}")
    plt = None
    sns = None

import io
from flask import Flask, render_template, request, jsonify, redirect, url_for, Response
import pandas as pd
import csv
import numpy as np
from werkzeug.utils import secure_filename
from pandas.errors import ParserError, EmptyDataError

# Check for pyarrow and provide a helpful error message if it's missing.
try:
    import pyarrow.feather
except ImportError:
    raise ImportError("The 'pyarrow' library is required for Feather support. Please install it using 'pip install pyarrow'")

# Check for plotly and provide a helpful error message if it's missing.
try:
    import plotly.express as px  # noqa: F401
except ImportError:
    raise ImportError("The 'plotly' library is required for creating graphs. Please install it using 'pip install plotly'")

# Check for reportlab (optional for PDF reports)
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    print("Warning: reportlab not available. PDF report generation will be disabled.")

from functools import wraps
from flask import session, flash

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # Change this in production

# ---------------- Configuration ----------------
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}
app.config['CACHE_FOLDER'] = 'instance/cache'

# ---------------- Safe folder creation (use absolute path relative to app root) ----------------
CACHE_DIR = os.path.join(app.root_path, app.config['CACHE_FOLDER'])
os.makedirs(CACHE_DIR, exist_ok=True)

# ---------------- Data Types ----------------
SUPPORTED_DATA_TYPES = {'cdr', 'tower_dump', 'ipdr', 'sdr'}

# Define relationships between data types for UI hints
DATA_RELATIONSHIPS = {
    'cdr': ['ipdr'],
    'tower_dump': [],
    'ipdr': ['cdr'],
    'sdr': []
}

# ---------------- Helper functions ----------------
def allowed_file(filename):
    """Check if the uploaded file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def _read_csv_from_stream(file_stream):
    """Reads a CSV from a file stream, handling encoding and delimiter."""
    # Read a small portion to sniff delimiter and check encoding
    file_stream.seek(0)
    sample = file_stream.read(2048)
    file_stream.seek(0)

    delimiter = ','  # Default delimiter
    encoding = 'utf-8' # Default encoding
    try:
        # Try decoding with utf-8 to sniff
        delimiter = csv.Sniffer().sniff(sample.decode(encoding)).delimiter
    except (csv.Error, UnicodeDecodeError):
        # If utf-8 fails, try latin-1 for sniffing
        try:
            encoding = 'latin1'
            delimiter = csv.Sniffer().sniff(sample.decode(encoding)).delimiter
        except (csv.Error, UnicodeDecodeError):
            # If all sniffing fails, stick with defaults (comma, latin1)
            pass

    file_stream.seek(0)
    # Try to find the header row automatically by skipping initial junk rows
    try:
        # Read lines until we find one that looks like a header (not just delimiters/whitespace)
        for i, line in enumerate(file_stream):
            if len(line.strip().replace(delimiter, '')) > 2:
                file_stream.seek(0)
                return pd.read_csv(file_stream, header=i, skip_blank_lines=True, encoding=encoding, sep=delimiter, on_bad_lines='skip', engine='python', comment='#')
        # If no suitable header is found, read without one
        file_stream.seek(0)
        return pd.read_csv(file_stream, header=None, skip_blank_lines=True, encoding=encoding, sep=delimiter, on_bad_lines='skip', engine='python', comment='#')
    except Exception:
        # Fallback to simple read if advanced logic fails
        file_stream.seek(0)
        return pd.read_csv(file_stream, header='infer', skip_blank_lines=True, encoding=encoding, sep=delimiter, on_bad_lines='skip', engine='python', comment='#')

def _read_excel_from_stream(file_stream):
    """Reads an Excel file from a stream and cleans it."""
    # Read the excel file, allowing pandas to find the header by skipping empty rows
    xls = pd.ExcelFile(file_stream)
    if not xls.sheet_names:
        return pd.DataFrame()
    
    # Find the first non-empty row and use it as the header
    df = pd.read_excel(xls, sheet_name=0) # Read first sheet
    df.dropna(how='all', inplace=True) # Drop rows that are completely empty
    df.dropna(axis=1, how='all', inplace=True) # Drop columns that are completely empty
    return df

def get_cache_path(data_type):
    """Get the standardized cache path for a data type."""
    # Use the absolute cache dir to avoid issues with working directory changes
    return os.path.join(CACHE_DIR, f"{data_type}.feather")

def get_metadata_from_cache(data_type):
    """Reads metadata by inspecting the cached Feather file."""
    cache_path = get_cache_path(data_type)
    if not os.path.exists(cache_path):
        return None

    # pyarrow.feather.read_table is efficient for metadata
    table = pyarrow.feather.read_table(cache_path)
    return {
        'rows': table.num_rows,
        'columns': table.num_columns,
        'column_names': table.column_names
    }

def data_type_and_cache_required(f):
    """
    A decorator to handle boilerplate checks for data_type and cache existence.
    It passes the dataframe and metadata to the decorated function.
    """
    @wraps(f)
    def decorated_function(data_type, *args, **kwargs):
        if data_type not in SUPPORTED_DATA_TYPES:
            return jsonify({'error': f'Invalid data type: {data_type}. Supported types: {", ".join(SUPPORTED_DATA_TYPES)}'}), 400

        cache_path = get_cache_path(data_type)
        if not os.path.exists(cache_path):
            return jsonify({
                'error': f'No data uploaded for {data_type}',
                'message': f'Please upload {data_type.upper()} data first using the Upload page.',
                'data_type': data_type,
                'available_types': list(SUPPORTED_DATA_TYPES)
            }), 404

        try:
            df = pd.read_feather(cache_path)
            return f(data_type, df=df, *args, **kwargs)
        except Exception as e:
            app.logger.error(f"Failed to read cache for {data_type}. Error: {e}")
            return jsonify({'error': f'Failed to read {data_type} data from cache.', 'details': str(e)}), 500
    return decorated_function
# ---------------- Auth & Core Routes ----------------
@app.route('/')
def index():
    """Render the main dashboard page."""
    # Check if a specific data type should be shown
    show_only_type = request.args.get('show')
    is_filtered_view = show_only_type in SUPPORTED_DATA_TYPES

    # Get metadata for all available data types to show on the dashboard
    available_data_summary = []
    
    # Determine which data types to check for
    types_to_check = [show_only_type] if is_filtered_view else SUPPORTED_DATA_TYPES

    for data_type in types_to_check:
        metadata = get_metadata_from_cache(data_type)
        if metadata:
            available_data_summary.append({
                'type': data_type,
                'metadata': metadata
            })
    return render_template('dashboard.html', 
                           available_data=available_data_summary, 
                           is_filtered_view=is_filtered_view)

@app.route('/dashboard')
def dashboard():
    """Redirect to the root, which is the dashboard."""
    return redirect(url_for('index'))

@app.route('/homepage')
def homepage():
    """Render the modern homepage."""
    return render_template('homepage.html')

@app.route('/login', methods=['POST'])
def login():
    """Handle user login."""
    officer_id = request.form.get('officer_id')
    password = request.form.get('password')

    # Simple authentication - in production, use proper user management
    if officer_id == 'admin' and password == 'admin123':
        session['user'] = {'officer_id': officer_id, 'role': 'admin'}
        flash('Login successful!', 'success')
        return redirect(url_for('index'))
    else:
        flash('Invalid credentials. Try officer_id: admin, password: admin123', 'error')
        return redirect(url_for('homepage'))

@app.route('/register', methods=['POST'])
def register():
    """Handle user registration."""
    officer_id = request.form.get('new_officer_id')
    password = request.form.get('new_password')
    confirm_password = request.form.get('confirm_password')

    if password != confirm_password:
        flash('Passwords do not match!', 'error')
        return redirect(url_for('homepage'))

    # Simple registration - in production, store in database
    session['user'] = {'officer_id': officer_id, 'role': 'officer'}
    flash('Registration successful! Welcome to SHAKTI.', 'success')
    return redirect(url_for('index'))

@app.route('/logout')
def logout():
    """Handle user logout."""
    session.pop('user', None)
    flash('Logged out successfully.', 'info')
    return redirect(url_for('homepage'))

@app.route('/upload')
def upload_page():
    """Render the dedicated file upload page."""
    return render_template('upload.html', data_types=SUPPORTED_DATA_TYPES)

@app.route('/graph')
def graph_page():
    """Render a page to display a specific graph."""
    return render_template('graph.html', data_types=SUPPORTED_DATA_TYPES)

@app.route('/error')
def error_page():
    """Display a generic error page."""
    message = request.args.get('msg', 'An unknown error occurred.')
    return render_template('error.html', error_message=message)

@app.route('/map')
def map_page():
    """Render a page to display geographic data for datasets."""
    # Get metadata for all available data types to show on the map page
    available_data_summary = []

    for data_type in SUPPORTED_DATA_TYPES:
        metadata = get_metadata_from_cache(data_type)
        if metadata:
            available_data_summary.append({
                'type': data_type,
                'metadata': metadata
            })

    return render_template('map.html', data_types=SUPPORTED_DATA_TYPES, available_data=available_data_summary)

@app.route('/reports')
def reports_page():
    """Render the reports page for generating forensic reports."""
    return render_template('reports.html', data_types=SUPPORTED_DATA_TYPES)

@app.route('/settings')
def settings_page():
    """Render the settings page for system configuration."""
    return render_template('settings.html')

@app.route('/user-management')
def user_management_page():
    """Render the user management page for managing users."""
    return render_template('user_management.html')

@app.route('/role-management')
def role_management_page():
    """Render the role management page for managing roles and permissions."""
    return render_template('role_management.html')

@app.route('/report/<data_type>', methods=['GET', 'POST'])
@data_type_and_cache_required
def generate_report(data_type, df):
    """Generate a forensic report for the specified data type."""
    try:
        # Check if required libraries are available
        if not REPORTLAB_AVAILABLE:
            return "PDF report generation requires the 'reportlab' library. Please install it using 'pip install reportlab'", 500

        if not MATPLOTLIB_AVAILABLE:
            return "Chart generation requires 'matplotlib' and 'seaborn'. Please install using 'pip install matplotlib seaborn'", 500

        import io

        # Set up the PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        styles = getSampleStyleSheet()
        story = []

        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=1,  # Center alignment
            textColor=colors.darkblue
        )

        story.append(Paragraph("SHAKTI CDR FORENSIC ANALYSIS REPORT", title_style))
        story.append(Spacer(1, 12))

        # Officer Information (Mock data - in real app, get from session/database)
        officer_info = [
            ["Officer ID:", "GJ-2024-001"],
            ["Officer Name:", "Inspector Rajesh Kumar"],
            ["Department:", "Cyber Crime Unit - Gujarat Police"],
            ["Report Date:", pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")],
            ["Data Type:", data_type.upper()],
            ["Total Records:", f"{len(df):,}"]
        ]

        officer_table = Table(officer_info, colWidths=[2*inch, 4*inch])
        officer_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))

        story.append(officer_table)
        story.append(Spacer(1, 20))

        # Data Summary
        story.append(Paragraph("DATA SUMMARY", styles['Heading2']))
        story.append(Spacer(1, 12))

        # Basic statistics
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        summary_data = []

        if len(numeric_cols) > 0:
            summary_stats = df[numeric_cols].describe()
            for col in numeric_cols[:5]:  # Limit to first 5 numeric columns
                summary_data.append([
                    col,
                    f"{df[col].count():,}",
                    f"{df[col].mean():.2f}",
                    f"{df[col].min():.2f}",
                    f"{df[col].max():.2f}"
                ])

            summary_table = Table([["Column", "Count", "Mean", "Min", "Max"]] + summary_data,
                                colWidths=[1.5*inch, 1*inch, 1*inch, 1*inch, 1*inch])
            summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))

            story.append(summary_table)
            story.append(Spacer(1, 20))

        # Generate charts
        story.append(Paragraph("VISUAL ANALYSIS", styles['Heading2']))
        story.append(Spacer(1, 12))

        # Create a simple bar chart for top values
        if len(df.columns) > 0:
            first_col = df.columns[0]
            if df[first_col].dtype in ['object', 'string']:
                # Categorical data - show top 10 values
                value_counts = df[first_col].value_counts().head(10)

                plt.figure(figsize=(8, 6))
                sns.barplot(x=value_counts.values, y=value_counts.index, palette='Blues_r')
                plt.title(f'Top 10 Values in {first_col}')
                plt.xlabel('Count')
                plt.ylabel(first_col)
                plt.tight_layout()

                # Save plot to buffer
                chart_buffer = io.BytesIO()
                plt.savefig(chart_buffer, format='png', dpi=150, bbox_inches='tight')
                plt.close()
                chart_buffer.seek(0)

                # Add to PDF
                chart_img = Image(chart_buffer)
                chart_img.drawHeight = 3*inch
                chart_img.drawWidth = 6*inch
                story.append(chart_img)
                story.append(Spacer(1, 20))

        # Location Analysis (if coordinates exist)
        lat_cols = [col for col in df.columns if 'lat' in col.lower()]
        lon_cols = [col for col in df.columns if 'lon' in col.lower() or 'long' in col.lower()]

        if lat_cols and lon_cols:
            story.append(Paragraph("GEOSPATIAL ANALYSIS", styles['Heading2']))
            story.append(Spacer(1, 12))

            lat_col, lon_col = lat_cols[0], lon_cols[0]

            # Location statistics
            location_stats = [
                ["Total Location Records:", f"{df[lat_col].count():,}"],
                ["Unique Locations:", f"{len(df[[lat_col, lon_col]].drop_duplicates()):,}"],
                ["Latitude Range:", f"{df[lat_col].min():.4f} to {df[lat_col].max():.4f}"],
                ["Longitude Range:", f"{df[lon_col].min():.4f} to {df[lon_col].max():.4f}"]
            ]

            location_table = Table(location_stats, colWidths=[2.5*inch, 3.5*inch])
            location_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.lightblue),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
            ]))

            story.append(location_table)
            story.append(Spacer(1, 20))

        # Conclusions
        story.append(Paragraph("CONCLUSIONS & RECOMMENDATIONS", styles['Heading2']))
        story.append(Spacer(1, 12))

        conclusions = [
            "• Data analysis completed successfully for forensic investigation.",
            f"• Dataset contains {len(df):,} records across {len(df.columns)} columns.",
            "• All data validation checks passed.",
            "• Report generated automatically by SHAKTI CDR Analytics System.",
            "• For detailed investigation, refer to the interactive dashboard."
        ]

        for conclusion in conclusions:
            story.append(Paragraph(conclusion, styles['Normal']))
            story.append(Spacer(1, 6))

        # Footer
        story.append(Spacer(1, 30))
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=1
        )
        story.append(Paragraph("This report was generated by SHAKTI CDR Forensic Analytics System<br/>Gujarat Police Cyber Crime Unit", footer_style))

        # Build PDF
        doc.build(story)
        buffer.seek(0)

        # Return PDF
        return Response(
            buffer,
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename=shakti_forensic_report_{data_type}_{pd.Timestamp.now().strftime("%Y%m%d_%H%M%S")}.pdf'
            }
        )

    except Exception as e:
        app.logger.error(f"Failed to generate report for {data_type}. Error: {e}", exc_info=True)
        return f"Failed to generate report: {str(e)}", 500



@app.route('/reset', methods=['POST'])
def reset_data():
    """Clear all in-memory data."""
    for data_type in SUPPORTED_DATA_TYPES:
        cache_path = get_cache_path(data_type)
        if os.path.exists(cache_path):
            os.remove(cache_path)

    return jsonify({'success': True, 'message': 'All data has been cleared.'})

# ---------------- API Routes ----------------

@app.route('/upload/<data_type>', methods=['POST'])
def upload_file(data_type):
    """Handle file uploads for each data type."""
    if data_type not in SUPPORTED_DATA_TYPES:
        return jsonify({'error': 'Invalid data type'}), 400

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        try:
            # Read a small sample of the stream to sniff its content type
            try:
                file.stream.seek(0)
                header = file.stream.read(2048)
            except Exception:
                header = b''

            # Detect common Excel/ZIP signatures: PK.. for .xlsx (zip), D0CF11E0 for old .xls
            is_zip_like = False
            try:
                if isinstance(header, bytes):
                    is_zip_like = header.startswith(b'PK') or header.startswith(b'\xd0\xcf')
                else:
                    # header may be str in some cases; fall back to checking for PK
                    is_zip_like = str(header).startswith('PK')
            except Exception:
                is_zip_like = False

            # Prefer Excel parsing when the file content looks like an Excel file,
            # regardless of the file extension. This handles cases where files are
            # misnamed (e.g., .csv extension but actually .xlsx content).
            if is_zip_like or filename.lower().endswith(('.xls', '.xlsx')):
                file.stream.seek(0)
                df = _read_excel_from_stream(file.stream)
            elif filename.lower().endswith('.csv'):
                file.stream.seek(0)
                df = _read_csv_from_stream(file.stream)
            else:
                # Try CSV first, then Excel as fallback
                file.stream.seek(0)
                try:
                    df = _read_csv_from_stream(file.stream)
                except Exception:
                    file.stream.seek(0)
                    df = _read_excel_from_stream(file.stream)

            # If initial parsing produced an empty DataFrame, attempt a few
            # fallback parsing strategies to be more forgiving and provide
            # helpful diagnostics to the user.
            if df.empty:
                # Ensure stream is at start for fallback attempts
                try:
                    file.stream.seek(0)
                except Exception:
                    pass

                # 1) Try inference-based read (header=None, sep=None) with python engine
                try:
                    file.stream.seek(0)
                    df_alt = pd.read_csv(file.stream, header=None, sep=None, engine='python', on_bad_lines='skip')
                    if not df_alt.empty:
                        df = df_alt
                    else:
                        # 2) Try reading as Excel (in case file extension was misleading)
                        try:
                            file.stream.seek(0)
                            df_x = _read_excel_from_stream(file.stream)
                            if not df_x.empty:
                                df = df_x
                            else:
                                file.stream.seek(0)
                                sample = file.stream.read(2048)
                                try:
                                    sample_text = sample.decode('utf-8', errors='replace')
                                except Exception:
                                    sample_text = str(sample)
                                raise EmptyDataError(f"The file is empty or contains no data after processing. File sample (first 1024 chars): {sample_text[:1024]}")
                        except Exception:
                            file.stream.seek(0)
                            sample = file.stream.read(2048)
                            sample_text = sample.decode('utf-8', errors='replace')
                            raise EmptyDataError(f"The file is empty or contains no data after processing. File sample (first 1024 chars): {sample_text[:1024]}")
                except Exception as e:
                    # If fallback parsing fails, include a small sample of the file
                    try:
                        file.stream.seek(0)
                        sample = file.stream.read(2048)
                        sample_text = sample.decode('utf-8', errors='replace')
                    except Exception:
                        sample_text = '<unable to read sample>'
                    raise EmptyDataError(f"The file appears empty or could not be parsed. Sample (first 1024 chars): {sample_text[:1024]} -- Fallback error: {e}")

            # --- Post-load Cleansing ---
            # 1. Drop columns that are entirely empty (often from formatting issues)
            df.dropna(axis=1, how='all', inplace=True)
            # 2. Trim whitespace from column headers
            df.columns = df.columns.str.strip()
            # Intelligently convert columns to preserve numeric accuracy while handling mixed types.
            for col in df.columns:
                # Attempt to convert to numeric, but ignore columns that can't be fully converted.
                numeric_col = pd.to_numeric(df[col], errors='coerce')
                if numeric_col.notna().sum() > 0: # If at least one value is numeric
                    df[col] = numeric_col
                else: # Otherwise, convert to string to be safe
                    df[col] = df[col].astype(str)

            # Save DataFrame to a standardized cache file path, overwriting if it exists.
            cache_path = get_cache_path(data_type)
            df.to_feather(cache_path)

            # On success, return a JSON response with the redirect URL.
            return jsonify({'success': True, 'redirect_url': url_for('index', show=data_type)})

        except (ParserError, ValueError) as e:
            app.logger.error(f"File parsing error for {filename}. Error: {e}")
            return jsonify({'error': f"File is malformed or has an incorrect format. Details: {str(e)}"}), 400
        except EmptyDataError as e:
            app.logger.error(f"Empty data error for {filename}. Error: {e}")
            return jsonify({'error': str(e)}), 400
        except Exception as e:
            app.logger.error(f"Failed to process file {filename}. Error: {e}")
            # On unexpected error, return a more descriptive JSON response.
            error_message = f"An unexpected server error occurred: {str(e)}"
            return jsonify({'success': False, 'error': error_message}), 500

    return jsonify({'error': 'Invalid file type'}), 400


@app.route('/upload/preview', methods=['POST'])
def upload_preview():
    """Parse an uploaded file and return the first N rows as JSON without saving."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # allow any of the allowed types
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400

    filename = secure_filename(file.filename)
    try:
        try:
            file.stream.seek(0)
            header = file.stream.read(2048)
        except Exception:
            header = b''

        is_zip_like = False
        try:
            if isinstance(header, bytes):
                is_zip_like = header.startswith(b'PK') or header.startswith(b'\xd0\xcf')
            else:
                is_zip_like = str(header).startswith('PK')
        except Exception:
            is_zip_like = False

        if is_zip_like or filename.lower().endswith(('.xls', '.xlsx')):
            file.stream.seek(0)
            df = _read_excel_from_stream(file.stream)
        else:
            file.stream.seek(0)
            df = _read_csv_from_stream(file.stream)

        if df is None or df.empty:
            return jsonify({'error': 'No data parsed from file'}), 400

        # Convert to simple JSON-serializable preview
        preview_rows = df.head(50).fillna('').astype(str)
        result = {
            'columns': preview_rows.columns.tolist(),
            'rows': preview_rows.values.tolist()
        }
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Preview parse failed for {filename}: {e}")
        return jsonify({'error': f'Failed to parse file for preview: {str(e)}'}), 500

@app.route('/data/<data_type>', methods=['GET'])
def get_data(data_type):
    """Fetch stored data for a given data type."""
    if data_type not in SUPPORTED_DATA_TYPES:
        return jsonify({'error': 'Invalid data type', 'available_types': list(SUPPORTED_DATA_TYPES)}), 400

    metadata = get_metadata_from_cache(data_type)

    if metadata is None:
        return jsonify({
            'error': f'No data uploaded for {data_type}',
            'data_type': data_type,
            'available_types': list(SUPPORTED_DATA_TYPES),
            'column_names': [],
            'rows': 0,
            'columns': 0
        }), 200  # Return 200 with empty data instead of 404

    # Return metadata with proper structure
    return jsonify({
        'data_type': data_type,
        'column_names': metadata.get('column_names', []),
        'rows': metadata.get('rows', 0),
        'columns': metadata.get('columns', 0)
    })

@app.route('/data/preview/<data_type>', methods=['GET'])
def get_data_preview(data_type):
    """Fetch the first 100 rows of data for preview."""
    if data_type not in SUPPORTED_DATA_TYPES:
        return jsonify({'error': 'Invalid data type'}), 400

    cache_path = get_cache_path(data_type)
    if not os.path.exists(cache_path):
        return jsonify({'error': 'No data for this type'}), 404

    try:
        df = pd.read_feather(cache_path)

        # Pagination logic
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int) # Default to 50 rows per page

        total_rows = len(df)
        total_pages = (total_rows + per_page - 1) // per_page # Integer ceiling division

        start_index = (page - 1) * per_page
        end_index = start_index + per_page
        df_page = df.iloc[start_index:end_index]

        paginated_data = {
            'columns': df_page.columns.tolist(),
            'data': df_page.values.tolist(),
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_pages': total_pages,
                'total_rows': total_rows
            }
        }
        return jsonify(paginated_data)
    except Exception as e:
        app.logger.error(f"Failed to read preview for {data_type}. Error: {e}")
        return jsonify({'error': 'Failed to read data preview.'}), 500

@app.route('/data/download/<data_type>', methods=['GET'])
@data_type_and_cache_required
def download_data(data_type, df):
    """Download the full dataset as a CSV file."""
    try:
        # Convert DataFrame to CSV in-memory
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_buffer.seek(0)

        return Response(
            csv_buffer,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename={data_type}.csv"}
        )
    except Exception as e:
        app.logger.error(f"Failed to generate download for {data_type}. Error: {e}")
        return "Failed to generate download file.", 500

@app.route('/data/relations/<data_type>', methods=['GET'])
def get_data_relations(data_type):
    """Fetch a list of data types related to the given one."""
    if data_type not in SUPPORTED_DATA_TYPES:
        return jsonify({'error': 'Invalid data type'}), 400

    related_types = DATA_RELATIONSHIPS.get(data_type, [])

    return jsonify({'related_types': related_types})


@app.route('/chart_data/best/<data_type>', methods=['GET'])
@data_type_and_cache_required
def get_best_chart_data(data_type, df):
    """
    Analyzes the data to find the best column for a summary chart and returns its data.
    The "best" column is determined by finding a column with low cardinality (few unique values)
    that is not a unique identifier column.
    """
    top_n = request.args.get('top_n', 15, type=int)

    try:
        if df.empty:
            return jsonify({'error': 'Data is empty'}), 404

        # Calculate cardinality for each column
        cardinality = df.nunique()

        # Filter out columns that are unique identifiers or have only one value.
        potential_columns = cardinality[(cardinality > 1) & (cardinality < len(df))]

        if potential_columns.empty:
            # Fallback to the first column if no suitable one is found
            if not df.columns.empty:
                best_column_name = df.columns[0]
            else:
                return jsonify({'error': 'Dataset contains no columns.'}), 404

        else:
            # Choose the column with the lowest number of unique values
            best_column_name = potential_columns.idxmin()

        value_counts = df[best_column_name].value_counts().head(top_n)

        chart_data = {
            'column_name': best_column_name,
            'labels': value_counts.index.astype(str).tolist(),
            'data': value_counts.values.tolist()
        }
        return jsonify(chart_data)
    except Exception as e:
        app.logger.error(f"Failed to get best chart data for {data_type}. Error: {e}")
        return jsonify({'error': 'Failed to generate chart data.'}), 500

@app.route('/chart_data/<data_type>', methods=['GET'])
@data_type_and_cache_required
def get_chart_data(data_type, df):
    """
    Return aggregated data for charting.
    Expects a 'column' query parameter, e.g., /chart_data/cdr?column=some_column_name
    """
    top_n = request.args.get('top_n', 50, type=int)

    column_name = request.args.get('column')
    if not column_name:
        return jsonify({'error': 'Column parameter is required'}), 400

    if column_name not in df.columns:
        return jsonify({'error': f'Column "{column_name}" not found'}), 400

    # Get top N most frequent values for the selected column
    value_counts = df[column_name].value_counts().head(top_n)

    # Prepare data in a format suitable for charting libraries (e.g., Chart.js)
    chart_data = {
        'column_name': column_name,
        'labels': value_counts.index.astype(str).tolist(),
        'data': value_counts.values.tolist()  # Y-axis values
    }
    return jsonify(chart_data)

@app.route('/graph/<data_type>', methods=['GET'])
@data_type_and_cache_required
def get_graph(data_type, df):
    """
    Return an interactive Plotly graph as an HTML div. Supports different chart types.
    Query Parameters:
    - column: The column name(s) to plot. Can be provided multiple times for a map.
    - chart_type: (Optional) 'bar', 'pie', 'histogram'. If not provided, it's auto-detected.
    - top_n: (Optional) The number of top values to show for bar/pie charts.
    - filter_column: (Optional) The column to filter data on.
    - filter_value: (Optional) The value(s) to include from the filter_column. Can be provided multiple times.
    """
    app.logger.info(f"Graph request for {data_type}: {dict(request.args)}")
    app.logger.info(f"Available columns in {data_type}: {df.columns.tolist()}")

    top_n = request.args.get('top_n', 50, type=int)
    column_names = request.args.getlist('column') # Use getlist to handle multiple columns
    chart_type = request.args.get('chart_type') # e.g., 'bar', 'pie', 'histogram'
    filter_column = request.args.get('filter_column')
    filter_values = request.args.getlist('filter_value')

    app.logger.info(f"Parsed parameters: columns={column_names}, chart_type={chart_type}, top_n={top_n}")

    if not column_names:
        app.logger.error(f"No column parameter provided for {data_type}")
        return "At least one 'column' parameter is required", 400

    for col in column_names:
        if col not in df.columns:
            app.logger.error(f"Column '{col}' not found in {data_type}. Available: {df.columns.tolist()}")
            return f'Column "{col}" not found. Available columns: {df.columns.tolist()}', 400

    # --- Apply Row Filtering ---
    if filter_column and filter_values:
        if filter_column not in df.columns:
            return f'Filter column "{filter_column}" not found', 400
        
        # If the column in the DataFrame is numeric, try to convert filter values to numbers.
        if pd.api.types.is_numeric_dtype(df[filter_column]):
            # Coerce filter values to numeric, dropping any that fail conversion.
            numeric_filter_values = pd.to_numeric(pd.Series(filter_values), errors='coerce').dropna().tolist()
            if numeric_filter_values:
                df = df[df[filter_column].isin(numeric_filter_values)]
        else:
            # Otherwise, perform a string-based comparison.
            df = df[df[filter_column].astype(str).isin(filter_values)]

        if df.empty:
            return "No data remains after applying the filter.", 404

    fig = None

    # --- Map View (requires 2 columns) ---
    if chart_type == 'map':
        if len(column_names) != 2:
            return "For map view, please select exactly two columns (latitude and longitude).", 400

        lat_col, lon_col = column_names[0], column_names[1]

        df_coords = df[[lat_col, lon_col]].copy()
        df_coords[lat_col] = pd.to_numeric(df_coords[lat_col], errors='coerce')
        df_coords[lon_col] = pd.to_numeric(df_coords[lon_col], errors='coerce')
        df_coords.dropna(inplace=True)

        if df_coords.empty:
            return f"No valid coordinates found in columns '{lat_col}' and '{lon_col}'.", 400

        fig = px.scatter_mapbox(df_coords.head(5000), # Limit points for performance
                                lat=lat_col,
                                lon=lon_col,
                                title=f'Map of {lat_col} vs {lon_col}',
                                zoom=10)
        fig.update_layout(mapbox_style="open-street-map", margin={"r":0,"t":40,"l":0,"b":0})

    # --- Scatter plot for two numeric columns ---
    elif len(column_names) == 2:
        col1, col2 = column_names[0], column_names[1]

        # Ensure both columns are numeric
        df_scatter = df[[col1, col2]].copy()
        df_scatter[col1] = pd.to_numeric(df_scatter[col1], errors='coerce')
        df_scatter[col2] = pd.to_numeric(df_scatter[col2], errors='coerce')
        df_scatter.dropna(inplace=True)

        if df_scatter.empty:
            return f"No valid numeric data found for both '{col1}' and '{col2}' to create a scatter plot.", 400

        # Calculate correlation if possible
        correlation = df_scatter[col1].corr(df_scatter[col2]) if len(df_scatter) > 1 else 0

        fig = px.scatter(df_scatter.head(5000), # Limit points for performance
                          x=col1,
                          y=col2,
                          title=f'📈 Correlation Analysis: {col1} vs {col2}<br><sup>Sample: {len(df_scatter):,} points | Correlation: {correlation:.3f} | Trend: {"Positive" if correlation > 0.3 else "Negative" if correlation < -0.3 else "Weak/None"}</sup>',
                          labels={'x': f'{col1} Values', 'y': f'{col2} Values'},
                          color_discrete_sequence=['#00d4ff'],
                          opacity=0.7,
                          trendline="ols" if len(df_scatter) > 10 else None)
        fig.update_layout(
            title_font_size=16,
            title_x=0.5,
            xaxis_title_font_size=14,
            yaxis_title_font_size=14,
            font_family='Segoe UI, sans-serif'
        )

    # --- Multi-Column Advanced Charts ---
    if len(column_names) >= 2 and chart_type in ['heatmap', 'bubble']:
        col1, col2 = column_names[0], column_names[1]

        if chart_type == 'heatmap':
            # Create correlation heatmap for numeric columns
            numeric_cols = []
            for col in column_names[:min(10, len(column_names))]:  # Limit to 10 columns for performance
                numeric_data = pd.to_numeric(df[col], errors='coerce')
                if numeric_data.notna().sum() > 0:
                    numeric_cols.append(col)

            if len(numeric_cols) >= 2:
                # Calculate correlation matrix
                corr_matrix = df[numeric_cols].corr()
                fig = px.imshow(corr_matrix,
                              title=f'🔥 Correlation Matrix Heatmap<br><sup>Variable relationships | {len(numeric_cols)} numeric features analyzed</sup>',
                              labels=dict(x="Features", y="Features", color="Correlation Coefficient"),
                              x=numeric_cols, y=numeric_cols,
                              color_continuous_scale='RdBu_r',
                              aspect='auto')
                fig.update_layout(
                    title_font_size=16,
                    title_x=0.5,
                    xaxis_title_font_size=14,
                    yaxis_title_font_size=14,
                    font_family='Segoe UI, sans-serif'
                )
            else:
                # Fallback: create a simple heatmap from value counts
                pivot_data = df.pivot_table(index=column_names[0], columns=column_names[1],
                                          values=column_names[0], aggfunc='count', fill_value=0)
                fig = px.imshow(pivot_data,
                              title=f'📊 Cross-Tabulation Heatmap<br><sup>{column_names[0]} vs {column_names[1]} | Frequency distribution</sup>',
                              labels=dict(x=column_names[1], y=column_names[0], color="Count"),
                              aspect='auto')
                fig.update_layout(
                    title_font_size=16,
                    title_x=0.5,
                    xaxis_title_font_size=14,
                    yaxis_title_font_size=14,
                    font_family='Segoe UI, sans-serif'
                )

        elif chart_type == 'bubble':
            # For bubble chart, need at least 3 columns (x, y, size)
            if len(column_names) >= 3:
                x_col, y_col, size_col = column_names[0], column_names[1], column_names[2]

                # Convert to numeric where possible
                x_data = pd.to_numeric(df[x_col], errors='coerce')
                y_data = pd.to_numeric(df[y_col], errors='coerce')
                size_data = pd.to_numeric(df[size_col], errors='coerce')

                # Filter valid data
                valid_mask = x_data.notna() & y_data.notna() & size_data.notna()
                if valid_mask.sum() > 0:
                    fig = px.scatter(df[valid_mask].head(500), x=x_col, y=y_col, size=size_col,
                                   title=f'🔵 Multi-Dimensional Bubble Analysis<br><sup>X: {x_col} | Y: {y_col} | Size: {size_col} | Points: {valid_mask.sum():,}</sup>',
                                   labels={x_col: f'{x_col} Values', y_col: f'{y_col} Values', size_col: f'{size_col} Magnitude'},
                                   color_discrete_sequence=['#00d4ff'],
                                   size_max=60,
                                   opacity=0.7)
                    fig.update_layout(
                        title_font_size=16,
                        title_x=0.5,
                        xaxis_title_font_size=14,
                        yaxis_title_font_size=14,
                        font_family='Segoe UI, sans-serif'
                    )
                else:
                    # Fallback to regular scatter
                    fig = px.scatter(df.head(500), x=col1, y=col2,
                                   title=f'📈 Scatter Plot Analysis<br><sup>{col1} vs {col2} | Sample: 500 points</sup>',
                                   labels={col1: f'{col1} Values', col2: f'{col2} Values'},
                                   color_discrete_sequence=['#00d4ff'])
                    fig.update_layout(
                        title_font_size=16,
                        title_x=0.5,
                        xaxis_title_font_size=14,
                        yaxis_title_font_size=14,
                        font_family='Segoe UI, sans-serif'
                    )
            else:
                # Fallback to scatter plot
                fig = px.scatter(df.head(500), x=col1, y=col2,
                               title=f'📈 Scatter Plot Analysis<br><sup>{col1} vs {col2} | Sample: 500 points</sup>',
                               labels={col1: f'{col1} Values', col2: f'{col2} Values'},
                               color_discrete_sequence=['#00d4ff'])
                fig.update_layout(
                    title_font_size=16,
                    title_x=0.5,
                    xaxis_title_font_size=14,
                    yaxis_title_font_size=14,
                    font_family='Segoe UI, sans-serif'
                )

    # --- Single Column Chart View (must be exactly one column) ---
    elif len(column_names) == 1:
        column_name = column_names[0]

        # Auto-detect chart type if not specified
        if not chart_type:
            numeric_col = pd.to_numeric(df[column_name], errors='coerce')
            if numeric_col.notna().all() and df[column_name].nunique() > 15:
                chart_type = 'histogram'
            else:
                chart_type = 'bar'

        # Generate Plotly Figure based on chart type
        if chart_type == 'histogram':
            # For histogram, try to use numeric data
            numeric_data = pd.to_numeric(df[column_name], errors='coerce').dropna()
            if len(numeric_data) > 0:
                fig = px.histogram(x=numeric_data,
                                 title=f'📊 Distribution Analysis: {column_name}<br><sup>Sample Size: {len(numeric_data):,} | Mean: {numeric_data.mean():.2f}</sup>',
                                 labels={'x': f'{column_name} Values', 'y': 'Frequency Count'},
                                 color_discrete_sequence=['#00d4ff'])
                fig.update_layout(
                    title_font_size=16,
                    title_x=0.5,
                    xaxis_title_font_size=14,
                    yaxis_title_font_size=14,
                    font_family='Segoe UI, sans-serif'
                )
            else:
                # Fallback to bar chart for non-numeric data
                value_counts = df[column_name].value_counts().head(top_n)
                fig = px.bar(x=value_counts.index.astype(str), y=value_counts.values,
                           title=f'📊 Categorical Distribution: {column_name}<br><sup>Top {len(value_counts)} categories shown</sup>',
                           labels={'x': column_name, 'y': 'Count'},
                           color_discrete_sequence=['#00d4ff'])
                fig.update_layout(
                    title_font_size=16,
                    title_x=0.5,
                    xaxis_title_font_size=14,
                    yaxis_title_font_size=14,
                    font_family='Segoe UI, sans-serif'
                )

        elif chart_type == 'pie':
            value_counts = df[column_name].value_counts().head(top_n)
            total = value_counts.sum()
            fig = px.pie(names=value_counts.index.astype(str), values=value_counts.values,
                        title=f'🥧 Proportional Distribution: {column_name}<br><sup>Total Records: {total:,} | Categories: {len(value_counts)}</sup>',
                        color_discrete_sequence=px.colors.qualitative.Set3)
            fig.update_layout(
                title_font_size=16,
                title_x=0.5,
                font_family='Segoe UI, sans-serif',
                showlegend=True,
                legend_title_text=f'{column_name} Categories'
            )

        elif chart_type == 'bar':
            value_counts = df[column_name].value_counts().head(top_n)
            fig = px.bar(x=value_counts.index.astype(str), y=value_counts.values,
                        title=f'📊 Frequency Analysis: {column_name}<br><sup>Top {len(value_counts)} categories | Total: {value_counts.sum():,}</sup>',
                        labels={'x': f'{column_name} Categories', 'y': 'Frequency Count'},
                        color_discrete_sequence=['#00d4ff'],
                        text=value_counts.values)
            fig.update_layout(
                title_font_size=16,
                title_x=0.5,
                xaxis_title_font_size=14,
                yaxis_title_font_size=14,
                font_family='Segoe UI, sans-serif'
            )
            fig.update_traces(textposition='outside', textfont_size=10)

        elif chart_type == 'line':
            value_counts = df[column_name].value_counts().head(top_n)
            fig = px.line(x=value_counts.index.astype(str), y=value_counts.values,
                         title=f'📈 Trend Analysis: {column_name}<br><sup>Frequency distribution across categories</sup>',
                         labels={'x': f'{column_name} Categories', 'y': 'Frequency Count'},
                         color_discrete_sequence=['#00d4ff'],
                         markers=True)
            fig.update_layout(
                title_font_size=16,
                title_x=0.5,
                xaxis_title_font_size=14,
                yaxis_title_font_size=14,
                font_family='Segoe UI, sans-serif'
            )

        elif chart_type == 'area':
            value_counts = df[column_name].value_counts().head(top_n)
            fig = px.area(x=value_counts.index.astype(str), y=value_counts.values,
                         title=f'🌊 Area Distribution: {column_name}<br><sup>Cumulative frequency visualization</sup>',
                         labels={'x': f'{column_name} Categories', 'y': 'Frequency Count'},
                         color_discrete_sequence=['#00d4ff'])
            fig.update_layout(
                title_font_size=16,
                title_x=0.5,
                xaxis_title_font_size=14,
                yaxis_title_font_size=14,
                font_family='Segoe UI, sans-serif'
            )

        elif chart_type == 'box':
            # For box plot, try to use numeric data
            numeric_data = pd.to_numeric(df[column_name], errors='coerce').dropna()
            if len(numeric_data) > 0:
                fig = px.box(y=numeric_data,
                           title=f'📦 Statistical Distribution: {column_name}<br><sup>Sample Size: {len(numeric_data):,} | Median: {numeric_data.median():.2f} | IQR: {numeric_data.quantile(0.75) - numeric_data.quantile(0.25):.2f}</sup>',
                           labels={'y': f'{column_name} Values'},
                           color_discrete_sequence=['#00d4ff'],
                           points='outliers')
                fig.update_layout(
                    title_font_size=16,
                    title_x=0.5,
                    xaxis_title_font_size=14,
                    yaxis_title_font_size=14,
                    font_family='Segoe UI, sans-serif',
                    showlegend=False
                )
            else:
                # Fallback to bar chart for categorical data
                value_counts = df[column_name].value_counts().head(top_n)
                fig = px.bar(x=value_counts.index.astype(str), y=value_counts.values,
                           title=f'📊 Categorical Distribution: {column_name}<br><sup>Top {len(value_counts)} categories shown</sup>',
                           labels={'x': column_name, 'y': 'Count'},
                           color_discrete_sequence=['#00d4ff'])
                fig.update_layout(
                    title_font_size=16,
                    title_x=0.5,
                    xaxis_title_font_size=14,
                    yaxis_title_font_size=14,
                    font_family='Segoe UI, sans-serif'
                )

        elif chart_type == 'violin':
            # For violin plot, try to use numeric data
            numeric_data = pd.to_numeric(df[column_name], errors='coerce').dropna()
            if len(numeric_data) > 0:
                fig = px.violin(y=numeric_data,
                              title=f'🎻 Density Distribution: {column_name}<br><sup>Kernel density estimation with quartiles | Sample: {len(numeric_data):,}</sup>',
                              labels={'y': f'{column_name} Values'},
                              color_discrete_sequence=['#00d4ff'],
                              box=True, points='all')
                fig.update_layout(
                    title_font_size=16,
                    title_x=0.5,
                    xaxis_title_font_size=14,
                    yaxis_title_font_size=14,
                    font_family='Segoe UI, sans-serif',
                    showlegend=False
                )
            else:
                # Fallback to bar chart for categorical data
                value_counts = df[column_name].value_counts().head(top_n)
                fig = px.bar(x=value_counts.index.astype(str), y=value_counts.values,
                           title=f'📊 Categorical Distribution: {column_name}<br><sup>Top {len(value_counts)} categories shown</sup>',
                           labels={'x': column_name, 'y': 'Count'},
                           color_discrete_sequence=['#00d4ff'])
                fig.update_layout(
                    title_font_size=16,
                    title_x=0.5,
                    xaxis_title_font_size=14,
                    yaxis_title_font_size=14,
                    font_family='Segoe UI, sans-serif'
                )

        elif chart_type == 'radar':
            # For radar chart, use top categories as dimensions
            value_counts = df[column_name].value_counts().head(min(8, top_n))  # Limit to 8 for readability
            fig = px.line_polar(r=value_counts.values, theta=value_counts.index.astype(str),
                              line_close=True,
                              title=f'🕸️ Multi-Dimensional Comparison: {column_name}<br><sup>Top {len(value_counts)} categories | Polar coordinate visualization</sup>',
                              color_discrete_sequence=['#00d4ff'])
            fig.update_traces(fill='toself')
            fig.update_layout(
                title_font_size=16,
                title_x=0.5,
                font_family='Segoe UI, sans-serif',
                polar=dict(
                    radialaxis=dict(visible=True, showticklabels=True),
                    angularaxis=dict(showticklabels=True)
                )
            )

        elif chart_type == 'funnel':
            # For funnel chart, show top categories
            value_counts = df[column_name].value_counts().head(min(10, top_n))
            fig = px.funnel(y=value_counts.index.astype(str), x=value_counts.values,
                          title=f'🔽 Process Flow Analysis: {column_name}<br><sup>Conversion funnel | {len(value_counts)} stages</sup>',
                          labels={'x': 'Frequency Count', 'y': f'{column_name} Categories'},
                          color_discrete_sequence=['#00d4ff'])
            fig.update_layout(
                title_font_size=16,
                title_x=0.5,
                xaxis_title_font_size=14,
                yaxis_title_font_size=14,
                font_family='Segoe UI, sans-serif'
            )

        elif chart_type == 'waterfall':
            # For waterfall chart, show cumulative changes
            value_counts = df[column_name].value_counts().head(min(15, top_n))
            fig = px.waterfall(x=value_counts.index.astype(str), y=value_counts.values,
                             title=f'💧 Cumulative Impact Analysis: {column_name}<br><sup>Waterfall decomposition | {len(value_counts)} components</sup>',
                             labels={'x': f'{column_name} Categories', 'y': 'Frequency Count'},
                             color_discrete_sequence=['#00d4ff'])
            fig.update_layout(
                title_font_size=16,
                title_x=0.5,
                xaxis_title_font_size=14,
                yaxis_title_font_size=14,
                font_family='Segoe UI, sans-serif'
            )

        else:
            # Default to bar chart
            value_counts = df[column_name].value_counts().head(top_n)
            fig = px.bar(x=value_counts.index.astype(str), y=value_counts.values,
                        title=f'📊 Frequency Distribution: {column_name}<br><sup>Top {len(value_counts)} categories | Total: {value_counts.sum():,}</sup>',
                        labels={'x': f'{column_name} Categories', 'y': 'Frequency Count'},
                        color_discrete_sequence=['#00d4ff'],
                        text=value_counts.values)
            fig.update_layout(
                title_font_size=16,
                title_x=0.5,
                xaxis_title_font_size=14,
                yaxis_title_font_size=14,
                font_family='Segoe UI, sans-serif'
            )
            fig.update_traces(textposition='outside', textfont_size=10)

    else:
        # This case handles invalid numbers of columns for the selected chart type
        return f"Invalid number of columns ({len(column_names)}) selected for the chosen chart type.", 400

    if fig is None:
        return "Could not generate a graph for the selected options.", 500

    # Return the figure as JSON for client-side rendering
    fig_dict = fig.to_dict()
    # Convert numpy arrays to lists for JSON serialization
    def convert_numpy(obj):
        if hasattr(obj, 'tolist'):
            return obj.tolist()
        elif isinstance(obj, dict):
            return {k: convert_numpy(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_numpy(item) for item in obj]
        else:
            return obj

    return jsonify(convert_numpy(fig_dict))

@app.route('/map_data/<data_type>', methods=['GET'])
@data_type_and_cache_required
def map_data(data_type, df):
    """Return geo points and aggregated percentages for a dataset.

    The endpoint looks for latitude/longitude-like columns (case-insensitive
    names containing 'lat' and 'lon' or 'long'). It returns raw points and
    aggregated groups (rounded coordinates) with counts and percentages.
    """
    try:
        # Get selected columns from query params (new multi-select approach)
        selected_columns = request.args.getlist('columns')

        # Allow overrides from query params (legacy support)
        lat_col = request.args.get('lat_col')
        lon_col = request.args.get('lon_col')

        # If using new multi-select approach
        if selected_columns and len(selected_columns) > 0:
            # Filter out empty selections
            selected_columns = [col for col in selected_columns if col.strip()]

            if len(selected_columns) >= 2:
                # Use first two columns as potential lat/lon, or try to detect
                potential_lat_cols = []
                potential_lon_cols = []

                lat_keywords = ['lat', 'latitude', 'ycoord', 'start_lat', 'end_lat', 'cell_lat', 'lat_start', 'lat_end', 'latitude_start', 'latitude_end', 'y', 'coord_y']
                lon_keywords = ['lon', 'long', 'longitude', 'xcoord', 'start_lon', 'end_lon', 'cell_lon', 'lon_start', 'lon_end', 'longitude_start', 'longitude_end', 'x', 'coord_x']

                for col in selected_columns:
                    cl = col.lower()
                    is_lat = any(keyword in cl for keyword in lat_keywords)
                    is_lon = any(keyword in cl for keyword in lon_keywords)

                    if is_lat and not is_lon:
                        potential_lat_cols.append(col)
                    elif is_lon and not is_lat:
                        potential_lon_cols.append(col)

                # If we found clear lat/lon columns, use them
                if potential_lat_cols and potential_lon_cols:
                    lat_col = potential_lat_cols[0]
                    lon_col = potential_lon_cols[0]
                else:
                    # Otherwise, use first two columns as lat/lon
                    lat_col = selected_columns[0]
                    lon_col = selected_columns[1] if len(selected_columns) > 1 else selected_columns[0]
            elif len(selected_columns) == 1:
                # Single column selected - try to auto-detect lat/lon from it
                col = selected_columns[0]
                # This will fall through to auto-detection below
            else:
                return jsonify({'error': 'Please select at least one column for mapping.', 'available_columns': df.columns.tolist()}), 400

        # If not provided via new method or legacy method, attempt to find latitude and longitude columns by name
        if not lat_col or not lon_col: # Attempt auto-detection if not fully specified
            found_lat = lat_col
            found_lon = lon_col

            # Common variations for latitude and longitude column names
            lat_keywords = ['lat', 'latitude', 'ycoord', 'start_lat', 'end_lat', 'cell_lat', 'lat_start', 'lat_end', 'latitude_start', 'latitude_end', 'y', 'coord_y']
            lon_keywords = ['lon', 'long', 'longitude', 'xcoord', 'start_lon', 'end_lon', 'cell_lon', 'lon_start', 'lon_end', 'longitude_start', 'longitude_end', 'x', 'coord_x']

            app.logger.info(f"Auto-detecting lat/lon columns from: {df.columns.tolist()}")

            for c in df.columns:
                cl = c.lower()
                if not found_lat:
                    for keyword in lat_keywords:
                        if keyword in cl:
                            found_lat = c
                            app.logger.info(f"Found lat column: {c}")
                            break
                if not found_lon:
                    for keyword in lon_keywords:
                        if keyword in cl:
                            found_lon = c
                            app.logger.info(f"Found lon column: {c}")
                            break
                if found_lat and found_lon: # Stop early if both are found
                    break

            # Only assign if both are found and they are not the same column
            if found_lat and found_lon and found_lat != found_lon:
                lat_col, lon_col = found_lat, found_lon
                app.logger.info(f"Auto-detected lat_col='{lat_col}', lon_col='{lon_col}'")
            else:
                app.logger.warning(f"Auto-detection failed: found_lat={found_lat}, found_lon={found_lon}")

        if lat_col is None or lon_col is None:
            app.logger.warning(f"Map data for {data_type}: Could not auto-detect latitude/longitude columns. lat_col={lat_col}, lon_col={lon_col}. Available: {df.columns.tolist()}")
            return jsonify({'error': 'Could not auto-detect latitude/longitude columns. Please specify them manually if needed.', 'available_columns': df.columns.tolist()}), 400

        app.logger.info(f"Map data for {data_type}: Using lat_col='{lat_col}', lon_col='{lon_col}'")

        # Convert to numeric and drop invalid rows
        df_coords = df[[lat_col, lon_col]].copy()
        df_coords[lat_col] = pd.to_numeric(df_coords[lat_col], errors='coerce')
        df_coords[lon_col] = pd.to_numeric(df_coords[lon_col], errors='coerce')
        df_coords = df_coords.dropna()

        # Validate coordinate ranges (latitude: -90 to 90, longitude: -180 to 180)
        df_coords = df_coords[
            (df_coords[lat_col] >= -90) & (df_coords[lat_col] <= 90) &
            (df_coords[lon_col] >= -180) & (df_coords[lon_col] <= 180)
        ]

        total = len(df_coords)
        if total == 0:
            app.logger.warning(f"Map data for {data_type}: No valid coordinate rows found after cleaning and validation.")
            return jsonify({'error': 'No valid coordinate rows found in the selected columns. Ensure latitude is between -90 and 90, and longitude is between -180 and 180.'}), 400

        # Raw points with additional data fields (limit to first 5000 to avoid huge payloads)
        points = []
        for idx, row in df_coords.head(5000).iterrows():
            point_data = {
                'lat': float(row[lat_col]),
                'lon': float(row[lon_col]),
                'index': int(idx)
            }

            # Add relevant data fields based on column names
            # Common CDR fields to include
            field_mappings = {
                'msisdn': ['msisdn', 'phone', 'mobile', 'number', 'caller', 'callee'],
                'timestamp': ['timestamp', 'time', 'date', 'datetime', 'start_time', 'end_time'],
                'duration': ['duration', 'call_duration', 'length'],
                'location': ['location', 'place', 'area', 'cell_id', 'lac', 'cell'],
                'imei': ['imei', 'device_id'],
                'imsi': ['imsi', 'subscriber_id']
            }

            # Add available fields to point data
            for field_name, possible_names in field_mappings.items():
                for col in df.columns:
                    if col.lower() in possible_names:
                        value = row[col]
                        if pd.notna(value):
                            point_data[field_name] = str(value)
                        break

            # Add any other numeric or string columns that might be relevant
            for col in df.columns:
                if col not in [lat_col, lon_col] and col.lower() not in ['latitude', 'longitude']:
                    value = row[col]
                    if pd.notna(value) and isinstance(value, (str, int, float)):
                        # Limit string length to avoid huge tooltips
                        str_value = str(value)
                        if len(str_value) <= 100:  # Reasonable limit for tooltip display
                            point_data[col.lower().replace(' ', '_')] = str_value

            points.append(point_data)

        # Provide a center estimate for initial map view
        center_lat = float(df_coords[lat_col].median())
        center_lon = float(df_coords[lon_col].median())

        return jsonify({'points': points, 'total': total, 'center': {'lat': center_lat, 'lon': center_lon}})
    except Exception as e:
        app.logger.error(f"Failed to generate map data for {data_type} with lat_col='{lat_col}', lon_col='{lon_col}'. Error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to generate map data due to an internal server error.'}), 500

# ---------------- Main entry ----------------
if __name__ == '__main__':
    # For production, use a production-ready WSGI server like Gunicorn or Waitress.
    # Example with Gunicorn: gunicorn --workers 4 --bind 0.0.0.0:5000 app:app
    # The following is for development only.
    app.run(debug=True, port=5000)