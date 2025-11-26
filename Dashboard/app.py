import os
import io
from flask import Flask, render_template, request, jsonify, redirect, url_for, Response
import pandas as pd
import csv
from werkzeug.utils import secure_filename
from pandas.errors import ParserError, EmptyDataError

# Check for pyarrow and provide a helpful error message if it's missing.
try:
    import pyarrow.feather
except ImportError:
    raise ImportError("The 'pyarrow' library is required for Feather support. Please install it using 'pip install pyarrow'")

# Check for plotly and provide a helpful error message if it's missing.
try:
    import plotly.express as px
except ImportError:
    raise ImportError("The 'plotly' library is required for creating graphs. Please install it using 'pip install plotly'")

from functools import wraps

app = Flask(__name__)

# ---------------- Configuration ----------------
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}
app.config['CACHE_FOLDER'] = 'instance/cache'

# ---------------- Safe folder creation ----------------
os.makedirs(app.config['CACHE_FOLDER'], exist_ok=True)

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
    return pd.read_csv(file_stream, header='infer', skip_blank_lines=True, encoding=encoding, sep=delimiter, on_bad_lines='skip', engine='python', comment='#')

def _read_excel_from_stream(file_stream):
    """Reads an Excel file from a stream and cleans it."""
    df = pd.read_excel(file_stream, header=0)
    df.dropna(how='all', inplace=True) # Drop rows that are completely empty
    return df

def get_cache_path(data_type):
    """Get the standardized cache path for a data type."""
    return os.path.join(app.config['CACHE_FOLDER'], f"{data_type}.feather")

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
            return "Invalid data type", 400

        cache_path = get_cache_path(data_type)
        if not os.path.exists(cache_path):
            return "No data for this type", 404

        try:
            df = pd.read_feather(cache_path)
            return f(data_type, df=df, *args, **kwargs)
        except Exception as e:
            app.logger.error(f"Failed to read cache for {data_type}. Error: {e}")
            return "Failed to read data.", 500
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
            # Read file directly from the in-memory stream
            if filename.lower().endswith('.csv'):
                df = _read_csv_from_stream(file.stream)
            else:
                df = _read_excel_from_stream(file.stream)

            if df.empty:
                raise EmptyDataError("The file is empty or contains no data after processing.")

            # Convert all columns to string to prevent Feather format errors with mixed types.
            for col in df.columns:
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

@app.route('/data/<data_type>', methods=['GET'])
def get_data(data_type):
    """Fetch stored data for a given data type."""
    if data_type not in SUPPORTED_DATA_TYPES:
        return jsonify({'error': 'Invalid data type'}), 400

    metadata = get_metadata_from_cache(data_type)

    if metadata is None:
        return jsonify({'error': 'No data uploaded yet'}), 404

    # Filename is not stored, but we can report the data type.
    return jsonify(metadata)

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
    top_n = request.args.get('top_n', 50, type=int)

    try:
        if df.empty:
            return jsonify({'error': 'Data is empty'}), 404

        # Calculate cardinality for each column
        cardinality = df.nunique()

        # Filter out columns that are unique identifiers (cardinality == number of rows)
        # and columns with only one unique value.
        potential_columns = cardinality[(cardinality > 1) & (cardinality < len(df))]

        if potential_columns.empty:
            # Fallback to the first column if no suitable column is found
            best_column_name = df.columns[0]
        else:
            # Choose the column with the lowest number of unique values (lowest cardinality)
            best_column_name = potential_columns.idxmin()

        # Get top N most frequent values for the selected column
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
        'labels': value_counts.index.astype(str).tolist(),
        'data': value_counts.values.tolist()  # Y-axis values
    }
    return jsonify(chart_data)

@app.route('/graph/<data_type>', methods=['GET'])
@data_type_and_cache_required
def get_graph(data_type, df):
    """
    Return an interactive Plotly graph as an HTML div.
    Expects a 'column' query parameter, e.g., /graph/cdr?column=some_column_name
    """
    top_n = request.args.get('top_n', 50, type=int)

    column_name = request.args.get('column')
    if not column_name:
        return "Column parameter is required", 400

    if column_name not in df.columns:
        return f'Column "{column_name}" not found', 400

    # Get top N most frequent values
    value_counts = df[column_name].value_counts().head(top_n).reset_index()
    value_counts.columns = [column_name, 'count']

    # Create an interactive bar chart with Plotly
    fig = px.bar(value_counts, x=column_name, y='count', title=f'Top {top_n} Values for {column_name}')

    # Convert the figure to an HTML div
    graph_html = fig.to_html(full_html=False, include_plotlyjs='cdn')
    return graph_html

# ---------------- Main entry ----------------
if __name__ == '__main__':
    # For production, use a production-ready WSGI server like Gunicorn or Waitress.
    # Example with Gunicorn: gunicorn --workers 4 --bind 0.0.0.0:5000 app:app
    # The following is for development only.
    app.run(debug=True, port=5000)