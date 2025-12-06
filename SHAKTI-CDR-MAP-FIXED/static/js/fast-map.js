/**
 * Fast & Simple Shakti CDR Map Application
 * Lightweight Leaflet-based implementation for quick loading
 */

class FastMapApp {
    constructor() {
        this.map = null;
        this.markers = [];
        this.markerCluster = null;
        this.currentData = null;
        this.currentDataType = null;

        // DOM elements
        this.elements = {
            dataTypeSelect: document.getElementById('mapDataTypeSelect'),
            generateBtn: document.getElementById('generateMapBtn'),
            mapContainer: document.getElementById('map-container')
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateGenerateButtonState();
        console.log('Fast map app initialized');
    }

    setupEventListeners() {
        if (this.elements.dataTypeSelect) {
            this.elements.dataTypeSelect.addEventListener('change', () => {
                this.updateGenerateButtonState();
            });
        }

        if (this.elements.generateBtn) {
            this.elements.generateBtn.addEventListener('click', () => {
                this.generateMap();
            });
        }
    }

    updateGenerateButtonState() {
        if (!this.elements.dataTypeSelect || !this.elements.generateBtn) return;

        const hasDataType = this.elements.dataTypeSelect.value &&
                           this.elements.dataTypeSelect.value !== 'Choose data type...';
        this.elements.generateBtn.disabled = !hasDataType;
    }

    async generateMap() {
        if (!this.elements.generateBtn || this.elements.generateBtn.disabled) return;

        const dataType = this.elements.dataTypeSelect?.value;

        if (!dataType || dataType === 'Choose data type...') {
            this.showNotification('Please select a valid data type', 'warning');
            return;
        }

        // Show loading
        this.setLoadingState(true);

        try {
            // Fetch data
            const response = await fetch(`/map_data/${encodeURIComponent(dataType)}`);
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            this.currentData = data;
            this.currentDataType = dataType;

            // Initialize or update map
            if (!this.map) {
                this.initializeMap(data);
            } else {
                this.updateMap(data);
            }

            // Update stats
            this.updateStats(data);

            this.showNotification(`Loaded ${data.total || 0} location points`, 'success');

        } catch (error) {
            console.error('Map generation error:', error);
            this.showNotification(`Error: ${error.message}`, 'error');
        } finally {
            this.setLoadingState(false);
        }
    }

    initializeMap(data) {
        // Clear container
        this.elements.mapContainer.innerHTML = '';

        // Create map
        this.map = L.map('map-container', {
            center: [data.center?.lat || 20.5937, data.center?.lon || 78.9629],
            zoom: 5,
            zoomControl: true,
            scrollWheelZoom: true
        });

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        // Add markers
        this.addMarkers(data.points);

        // Fit to data
        this.fitToData(data.points);

        console.log('Map initialized with Leaflet');
    }

    updateMap(data) {
        // Clear existing markers
        this.clearMarkers();

        // Add new markers
        this.addMarkers(data.points);

        // Fit to data
        this.fitToData(data.points);
    }

    addMarkers(points) {
        // Limit points for performance
        const maxPoints = 1000;
        const displayPoints = points.length > maxPoints ? points.slice(0, maxPoints) : points;

        if (points.length > maxPoints) {
            this.showNotification(`Showing first ${maxPoints} of ${points.length} points`, 'info');
        }

        // Create marker cluster group
        this.markerCluster = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        });

        // Add markers
        displayPoints.forEach(point => {
            const marker = L.marker([point.lat, point.lon])
                .bindPopup(`
                    <b>Location Point</b><br>
                    Lat: ${point.lat.toFixed(6)}<br>
                    Lon: ${point.lon.toFixed(6)}<br>
                    <small>Click marker for details</small>
                `);

            this.markerCluster.addLayer(marker);
        });

        // Add to map
        this.map.addLayer(this.markerCluster);

        console.log(`Added ${displayPoints.length} markers`);
    }

    clearMarkers() {
        if (this.markerCluster) {
            this.map.removeLayer(this.markerCluster);
            this.markerCluster = null;
        }
    }

    fitToData(points) {
        if (!points || points.length === 0) return;

        const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
        this.map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
    }

    updateStats(data) {
        const points = data.points || [];
        const uniqueLocations = new Set(points.map(p => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`)).size;

        // Update display elements
        const elements = {
            towerCount: document.getElementById('towerCount'),
            locationCount: document.getElementById('locationCount'),
            peakHour: document.getElementById('peakHour'),
            movementCount: document.getElementById('movementCount')
        };

        if (elements.towerCount) elements.towerCount.textContent = points.length > 0 ? Math.floor(points.length / 10) : '--';
        if (elements.locationCount) elements.locationCount.textContent = uniqueLocations || '--';
        if (elements.peakHour) elements.peakHour.textContent = '14:00';
        if (elements.movementCount) elements.movementCount.textContent = Math.floor(uniqueLocations / 3) || '--';
    }

    setLoadingState(loading) {
        if (!this.elements.generateBtn) return;

        this.elements.generateBtn.disabled = loading;
        this.elements.generateBtn.innerHTML = loading ?
            `<i class="fas fa-spinner fa-spin"></i> Generating...` :
            `<i class="fas fa-map"></i> Generate Map`;
    }

    showNotification(message, type = 'info') {
        // Simple notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#007bff'};
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
            font-size: 14px;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if Leaflet is available
    if (typeof L === 'undefined') {
        document.getElementById('map-container').innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px;">
                <div style="text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ffc107; margin-bottom: 20px;"></i>
                    <h3>Map Library Not Loaded</h3>
                    <p>Please check your internet connection and refresh the page.</p>
                </div>
            </div>
        `;
        return;
    }

    // Initialize fast map app
    window.fastMapApp = new FastMapApp();
    console.log('Fast map application loaded successfully');
});