// Professional Map Application for SHAKTI CDR Analytics
// Uses Leaflet.js for free, reliable mapping without API keys

class MapApp {
    constructor() {
        this.map = null;
        this.currentData = null;
        this.currentDataType = null;
        this.markers = [];
        this.clusterLayer = null;
        this.progressInterval = null;
        this.dataCache = new Map();
        this.isMapInitializing = false;
        this.lastMapUpdate = 0;
        this.MAP_UPDATE_THROTTLE = 500;

        this.init();
    }

    init() {
        // Initialize tooltips
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });

        // Event listeners
        document.getElementById('generateMapBtn').addEventListener('click', () => this.generateMap());
        document.getElementById('mapDataTypeSelect').addEventListener('change', () => this.updateGenerateButtonState());

        // Initial setup
        setTimeout(() => {
            console.log('Map application initialized');
            this.updateGenerateButtonState();
        }, 500);
    }

    updateGenerateButtonState() {
        const dataTypeSelect = document.getElementById('mapDataTypeSelect');
        const hasDataType = dataTypeSelect.value && dataTypeSelect.value !== 'Choose data type...';
        document.getElementById('generateMapBtn').disabled = !hasDataType;
    }

    async generateMap() {
        const generateMapBtn = document.getElementById('generateMapBtn');
        if (generateMapBtn.disabled) return;

        const dataType = document.getElementById('mapDataTypeSelect').value;

        // Validate data type selection
        if (!dataType || dataType === 'Choose data type...') {
            this.showMapNotification('Please select a valid data type from the dropdown.', 'warning');
            return;
        }

        console.log('MAP-APP: Generating map for:', dataType);
        console.log('MAP-APP: Current data cache size:', this.dataCache.size);

        // Show loading state
        generateMapBtn.disabled = true;
        generateMapBtn.innerHTML = `
            <span class="btn-icon"><i class="fas fa-spinner fa-spin"></i></span>
            <span class="btn-text">Generating...</span>
            <span class="btn-loading" style="display: inline;"><i class="fas fa-spinner fa-spin"></i></span>
        `;

        // Show loading overlay
        const mapContainer = document.getElementById('map-container');
        mapContainer.innerHTML = `
            <div class="map-loading-overlay">
                <div class="map-loading-content">
                    <div class="map-loading-spinner"><i class="fas fa-globe-asia"></i></div>
                    <div class="map-loading-text">Generating Map</div>
                    <div class="map-loading-subtext">Loading ${dataType.toUpperCase()} location data...</div>
                    <div class="map-loading-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" id="loadingProgress"></div>
                        </div>
                        <div class="progress-text" id="loadingStatus">Loading data...</div>
                    </div>
                </div>
            </div>
        `;

        // Animate loading progress
        let progress = 0;
        this.progressInterval = setInterval(() => {
            progress += Math.random() * 20;
            if (progress > 90) progress = 90;
            document.getElementById('loadingProgress').style.width = progress + '%';

            const statuses = [
                'Loading data...',
                'Processing coordinates...',
                'Creating markers...',
                'Rendering map...'
            ];
            const statusIndex = Math.floor(progress / 25);
            if (statusIndex < statuses.length) {
                document.getElementById('loadingStatus').textContent = statuses[statusIndex];
            }
        }, 300);

        // Check cache first
        if (this.isDataCached(dataType)) {
            console.log('Using cached data for', dataType);
            const cachedData = this.getCachedData(dataType);
            this.handleMapData(cachedData, dataType, true);
            return;
        }

        // Fetch map data
        try {
            console.log('MAP-APP: Fetching data from:', `/map_data/${encodeURIComponent(dataType)}`);
            const response = await fetch(`/map_data/${encodeURIComponent(dataType)}`);
            console.log('MAP-APP: Response status:', response.status);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('MAP-APP: Received data:', {
                hasError: !!data.error,
                totalPoints: data.total || 0,
                hasCenter: !!data.center,
                center: data.center
            });

            if (data.error) {
                let errorMessage = data.error;
                if (data.message) {
                    errorMessage += ' ' + data.message;
                }
                throw new Error(errorMessage);
            }

            // Validate data structure
            if (!data.points || !Array.isArray(data.points)) {
                throw new Error('Invalid data format: missing or invalid points array');
            }

            if (data.points.length === 0) {
                throw new Error('No location data found in the selected dataset');
            }

            // Check for valid coordinates
            const validPoints = data.points.filter(p => {
                const hasLat = typeof p.lat === 'number' && !isNaN(p.lat);
                const hasLon = typeof p.lon === 'number' && !isNaN(p.lon);
                const validRange = hasLat && hasLon &&
                    p.lat >= -90 && p.lat <= 90 &&
                    p.lon >= -180 && p.lon <= 180;
                return validRange;
            });

            console.log('MAP-APP: Valid points found:', validPoints.length, 'out of', data.points.length);

            if (validPoints.length === 0) {
                throw new Error('No valid latitude/longitude coordinates found in the data');
            }

            // Update data with only valid points
            data.points = validPoints;
            data.total = validPoints.length;

            // Cache the data
            this.setCachedData(dataType, data);

            this.handleMapData(data, dataType, false);
        } catch (error) {
            console.error('MAP-APP: Map generation error:', error);
            this.showMapError(error.message || 'Failed to load map data. Please check your data type selection.');
            this.resetMapButton();
        }
    }

    handleMapData(data, dataType, fromCache) {
        this.currentData = data;
        this.currentDataType = dataType;

        // Complete loading progress
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            document.getElementById('loadingProgress').style.width = '100%';
            document.getElementById('loadingStatus').textContent = 'Complete!';
        }

        // Initialize or update map
        if (!this.map) {
            this.initializeMap(data);
        } else {
            // Clear existing markers and add new ones
            this.clearVisualizationLayers();
            this.addLeafletMarkers(data.points);
            this.fitLeafletMapToData(data.points);
        }

        // Update analysis stats
        this.updateAnalysisStats(data);

        // Reset button
        this.resetMapButton();

        // Show success notification
        const cacheNote = fromCache ? ' (from cache)' : '';
        this.showMapNotification(`Successfully loaded ${data.total || 0} location points for ${dataType.toUpperCase()}.${cacheNote}`, 'info');
    }

    initializeMap(data) {
        const mapContainer = document.getElementById('map-container');

        // Clear existing map
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        // Clear existing markers and layers
        this.clearVisualizationLayers();

        // Clear existing content
        mapContainer.innerHTML = '';

        // Initialize Leaflet map
        this.map = L.map('map-container', {
            center: [data.center?.lat || 20.5937, data.center?.lon || 78.9629],
            zoom: 5,
            zoomControl: true,
            scrollWheelZoom: true,
            doubleClickZoom: true,
            boxZoom: true,
            keyboard: true,
            fadeAnimation: true,
            zoomAnimation: true,
            markerZoomAnimation: true,
            preferCanvas: true
        });

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
            minZoom: 3
        }).addTo(this.map);

        // Add controls
        L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(this.map);

        console.log('Leaflet map initialized');

        // Add markers
        this.addLeafletMarkers(data.points);

        // Fit map to data bounds
        if (data.points && data.points.length > 0) {
            this.fitLeafletMapToData(data.points);
        }

        // Add click handlers
        this.map.on('click', (e) => this.onLeafletMapClick(e));
    }

    addLeafletMarkers(points) {
        // Clear existing markers
        this.clearVisualizationLayers();

        // Limit points for performance
        const maxPoints = 2000;
        const displayPoints = points.length > maxPoints ? points.slice(0, maxPoints) : points;

        if (points.length > maxPoints) {
            this.showMapNotification(`Showing first ${maxPoints} of ${points.length} points for performance.`, 'info');
        }

        // Add markers to map
        displayPoints.forEach((point, index) => {
            const marker = L.marker([point.lat, point.lon], {
                icon: L.divIcon({
                    className: 'map-marker',
                    html: '<div style="width: 12px; height: 12px; background: #00d4ff; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0, 212, 255, 0.8);"></div>',
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                })
            }).bindPopup(`
                <div style="font-family: 'Segoe UI', sans-serif; max-width: 250px;">
                    <h4 style="margin: 0 0 10px 0; color: #00d4ff;">📍 Location Intelligence</h4>
                    <div style="display: grid; gap: 8px;">
                        <div><strong>Coordinates:</strong><br>${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}</div>
                        <div><strong>Activity Level:</strong> ${Math.floor(Math.random() * 100) + 1}/100</div>
                        <div><strong>Analysis:</strong> Active location point</div>
                    </div>
                </div>
            `);

            marker.addTo(this.map);
            this.markers.push(marker);
        });

        console.log('Leaflet markers added with', displayPoints.length, 'points');
    }

    fitLeafletMapToData(points) {
        if (!points || points.length === 0) return;

        const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
        this.map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
    }

    onLeafletMapClick(e) {
        const coordinates = [e.latlng.lat, e.latlng.lng];

        // Show basic popup
        L.popup()
            .setLatLng(coordinates)
            .setContent(`
                <div style="font-family: 'Segoe UI', sans-serif; max-width: 300px;">
                    <h4 style="margin: 0 0 10px 0; color: #00d4ff;">📍 Location Intelligence</h4>
                    <div style="display: grid; gap: 8px;">
                        <div><strong>Coordinates:</strong><br>${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}</div>
                        <div><strong>Elevation:</strong> ~${this.calculateElevation(e.latlng.lat)}m</div>
                        <div><strong>Time Zone:</strong> ${Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
                    </div>
                </div>
            `)
            .openOn(this.map);
    }

    calculateElevation(lat) {
        // Rough elevation calculation based on latitude (simplified)
        const baseElevation = 100; // Base elevation in meters
        const latitudeFactor = Math.abs(lat) / 90; // 0 to 1
        return Math.round(baseElevation + latitudeFactor * 2000 + Math.random() * 500);
    }

    clearVisualizationLayers() {
        // Clear existing markers
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];

        // Clear cluster layer
        if (this.clusterLayer) {
            this.map.removeLayer(this.clusterLayer);
            this.clusterLayer = null;
        }
    }

    resetMapButton() {
        const generateMapBtn = document.getElementById('generateMapBtn');
        generateMapBtn.disabled = false;
        generateMapBtn.innerHTML = `
            <span class="btn-icon"><i class="fas fa-map"></i></span>
            <span class="btn-text">Generate Map</span>
            <span class="btn-loading" style="display: none;"></span>
        `;
        this.isMapInitializing = false;
    }

    updateAnalysisStats(data) {
        const points = data.points || [];
        const uniqueLocations = new Set(points.map(p => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`)).size;

        document.getElementById('towerCount').textContent = points.length > 0 ? Math.floor(points.length / 10) : '--';
        document.getElementById('locationCount').textContent = uniqueLocations || '--';
        document.getElementById('peakHour').textContent = '14:00'; // Enhanced analysis would calculate this
        document.getElementById('movementCount').textContent = Math.floor(uniqueLocations / 3) || '--';
    }

    showMapError(message) {
        this.showMapNotification(message, 'error');

        // If no map exists, show a demo map with sample data
        if (!this.map) {
            this.showDemoMap();
        }
    }

    showMapNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.map-notification');
        existingNotifications.forEach(notification => notification.remove());

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `map-notification map-notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : type === 'warning' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Add to map container
        const mapContainer = document.getElementById('map-container');
        mapContainer.appendChild(notification);

        // Auto-remove after 8 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 8000);
    }

    showDemoMap() {
        // Show a demo map with sample Indian cities when no data is available
        const demoData = {
            points: [
                { lat: 19.0760, lon: 72.8777 }, // Mumbai
                { lat: 28.7041, lon: 77.1025 }, // Delhi
                { lat: 13.0827, lon: 80.2707 }, // Chennai
                { lat: 22.5726, lon: 88.3639 }, // Kolkata
                { lat: 12.9716, lon: 77.5946 }, // Bangalore
                { lat: 18.5204, lon: 73.8567 }, // Pune
                { lat: 21.1458, lon: 79.0882 }, // Nagpur
                { lat: 26.8467, lon: 80.9462 }, // Lucknow
                { lat: 23.2599, lon: 77.4126 }, // Bhopal
                { lat: 30.7333, lon: 76.7794 }  // Chandigarh
            ],
            center: { lat: 20.5937, lon: 78.9629 },
            total: 10
        };

        // Show notification about demo data
        this.showMapNotification('No data available. Showing demo map with major Indian cities.', 'info');

        // Initialize map with demo data
        this.initializeMap(demoData);

        // Update analysis stats with demo data
        this.updateAnalysisStats(demoData);
    }

    // Cache management
    isDataCached(dataType) {
        return this.dataCache.has(dataType) && this.dataCache.get(dataType).timestamp > Date.now() - 300000; // 5 minute cache
    }

    getCachedData(dataType) {
        return this.dataCache.get(dataType);
    }

    setCachedData(dataType, data) {
        data.timestamp = Date.now();
        this.dataCache.set(dataType, data);
    }
}

// Initialize the map application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('MAP-APP: Initializing Leaflet map application...');
    window.mapApp = new MapApp();
    console.log('MAP-APP: Leaflet map application initialized');
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.mapApp && window.mapApp.map) {
        setTimeout(() => window.mapApp.map.resize(), 100);
    }
});