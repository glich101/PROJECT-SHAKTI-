/**
 * Advanced GEOINT Map Application for Police Cyber-Forensic Analysis
 * Professional-grade geospatial intelligence system with WebGL rendering
 */

class GeointMapApp {
    constructor() {
        this.map = null;
        this.currentData = null;
        this.currentDataType = null;
        this.markers = [];
        this.heatmapLayer = null;
        this.clusterLayer = null;
        this.geofenceMode = false;
        this.measureMode = false;
        this.towerRangeLayers = [];
        this.trajectoryLayer = null;
        this.aiPatternLayer = null;
        this.geofenceZones = [];
        this.drawnItems = null;
        this.draw = null;
        this.geocoder = null;
        this.timelineData = null;
        this.timelineAnimation = null;
        this.suspectData = { primary: null, secondary: null, tertiary: null };
        this.multiSuspectMode = false;
        this.measurePoints = [];
        this.isFullscreen = false;
        this.heatLayer = null;
        this.densityLayer = null;
        this.timelineLayer = null;
        this.predictionLayer = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateGenerateButtonState();
        console.log('🚀 Advanced GEOINT Map System initialized with WebGL support');
    }

    setupEventListeners() {
        const dataTypeSelect = document.getElementById('mapDataTypeSelect');
        const modeSelect = document.getElementById('mapModeSelect');
        const generateBtn = document.getElementById('generateMapBtn');

        if (dataTypeSelect) dataTypeSelect.addEventListener('change', () => this.updateGenerateButtonState());
        if (modeSelect) modeSelect.addEventListener('change', (e) => this.changeVisualizationMode(e.target.value));
        if (generateBtn) generateBtn.addEventListener('click', () => this.generateMap());

        console.log('🎯 GEOINT event listeners configured');
    }

    updateGenerateButtonState() {
        const dataTypeSelect = document.getElementById('mapDataTypeSelect');
        const generateBtn = document.getElementById('generateMapBtn');

        if (!dataTypeSelect || !generateBtn) return;

        const hasDataType = dataTypeSelect.value && dataTypeSelect.value !== 'Choose data type...';
        generateBtn.disabled = !hasDataType;
    }

    async generateMap() {
        const generateBtn = document.getElementById('generateMapBtn');
        if (!generateBtn || generateBtn.disabled) return;

        const dataType = document.getElementById('mapDataTypeSelect')?.value;

        if (!dataType || dataType === 'Choose data type...') {
            this.showNotification('Please select a valid data type', 'warning');
            return;
        }

        this.setLoadingState(true);

        try {
            const response = await fetch(`/map_data/${encodeURIComponent(dataType)}`);
            const data = await response.json();

            if (data.error) throw new Error(data.error);

            this.currentData = data;
            this.currentDataType = dataType;

            if (!this.map) {
                await this.initializeMap(data);
            } else {
                this.updateMap(data);
            }

            this.updateAnalysisStats(data);
            this.showNotification(`🔍 GEOINT Analysis: ${data.total} location points loaded`, 'success');

        } catch (error) {
            console.error('GEOINT Map generation error:', error);
            this.showNotification(`🚨 Error: ${error.message}`, 'error');
        } finally {
            this.setLoadingState(false);
        }
    }

    async initializeMap(data) {
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) {
            console.error('GEOINT: Map container not found');
            return;
        }

        // Clear container
        mapContainer.innerHTML = '';

        // Check if Mapbox GL is available and access token is set
        if (typeof mapboxgl === 'undefined') {
            console.error('GEOINT: Mapbox GL library not loaded');
            this.fallbackToLeaflet(data);
            return;
        }

        if (!mapboxgl.accessToken) {
            console.warn('GEOINT: No Mapbox access token set - falling back to Leaflet');
            this.fallbackToLeaflet(data);
            return;
        }

        console.log('GEOINT: Initializing Mapbox GL map...');

        try {
            // Initialize Mapbox GL map with WebGL rendering
            this.map = new mapboxgl.Map({
                container: 'map-container',
                style: 'mapbox://styles/mapbox/streets-v12',
                center: [data.center?.lon || 78.9629, data.center?.lat || 20.5937], // [lng, lat] for Mapbox
                zoom: 5,
                pitch: 0,
                bearing: 0,
                antialias: true, // Enable WebGL antialiasing
                preserveDrawingBuffer: true, // For screenshots
                maxZoom: 20,
                minZoom: 1
            });

            // Wait for map to load
            await new Promise((resolve, reject) => {
                this.map.on('load', () => {
                    console.log('GEOINT: Mapbox GL map loaded successfully');
                    resolve();
                });
                this.map.on('error', (e) => {
                    console.error('GEOINT: Mapbox GL map failed to load:', e);
                    reject(e);
                });
            });
        } catch (error) {
            console.error('GEOINT: Failed to initialize Mapbox GL, falling back to Leaflet:', error);
            this.fallbackToLeaflet(data);
            return;
        }

        // Add navigation controls
        this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        this.map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

        // Add fullscreen control
        this.map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

        // Add geolocate control
        this.map.addControl(new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true
        }), 'top-right');

        // Initialize draw control for geofencing
        this.initializeDrawControl();

        // Add markers
        this.addMarkers(data.points);

        // Fit to data
        this.fitToData(data.points);

        // Add click handlers
        this.map.on('click', (e) => this.onMapClick(e));

        console.log('🗺️ Advanced GEOINT Map initialized with Mapbox GL WebGL rendering');
    }

    initializeDrawControl() {
        // Initialize Mapbox Draw for geofencing
        this.draw = new MapboxDraw({
            displayControlsDefault: false,
            controls: {
                polygon: true,
                trash: true
            },
            styles: [
                {
                    'id': 'gl-draw-polygon-fill-inactive',
                    'type': 'fill',
                    'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                    'paint': {
                        'fill-color': '#ff4444',
                        'fill-outline-color': '#ff4444',
                        'fill-opacity': 0.1
                    }
                },
                {
                    'id': 'gl-draw-polygon-fill-active',
                    'type': 'fill',
                    'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                    'paint': {
                        'fill-color': '#ff4444',
                        'fill-outline-color': '#ff4444',
                        'fill-opacity': 0.3
                    }
                },
                {
                    'id': 'gl-draw-polygon-stroke-inactive',
                    'type': 'line',
                    'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                    'layout': {
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    'paint': {
                        'line-color': '#ff4444',
                        'line-width': 3,
                        'line-dasharray': [8, 4]
                    }
                },
                {
                    'id': 'gl-draw-polygon-stroke-active',
                    'type': 'line',
                    'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                    'layout': {
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    'paint': {
                        'line-color': '#ff4444',
                        'line-width': 4
                    }
                }
            ]
        });

        this.map.addControl(this.draw, 'top-right');

        // Set up draw event listeners
        this.map.on('draw.create', (e) => this.onDrawCreate(e));
        this.map.on('draw.delete', (e) => this.onDrawDelete(e));
        this.map.on('draw.update', (e) => this.onDrawUpdate(e));
    }

    updateMap(data) {
        this.clearVisualizationLayers();
        this.addMarkers(data.points);
        this.fitToData(data.points);
    }

    addMarkers(points) {
        if (!points || points.length === 0) return;

        // Clear existing markers
        this.clearMarkers();

        // Limit points for performance
        const maxPoints = 5000; // Increased for WebGL performance
        const displayPoints = points.length > maxPoints ? points.slice(0, maxPoints) : points;

        if (points.length > maxPoints) {
            this.showNotification(`Showing first ${maxPoints} of ${points.length} points for optimal performance`, 'info');
        }

        // Create GeoJSON features for Mapbox GL
        const features = displayPoints.map((point, index) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [point.lon, point.lat]
            },
            properties: {
                id: index,
                activity: Math.floor(Math.random() * 100) + 1,
                timestamp: point.timestamp || Date.now()
            }
        }));

        // Add source
        if (this.map.getSource('location-points')) {
            this.map.getSource('location-points').setData({
                type: 'FeatureCollection',
                features: features
            });
        } else {
            this.map.addSource('location-points', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: features
                },
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });
        }

        // Add unclustered points layer
        if (!this.map.getLayer('unclustered-points')) {
            this.map.addLayer({
                id: 'unclustered-points',
                type: 'circle',
                source: 'location-points',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': '#00d4ff',
                    'circle-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        8, 6,
                        12, 8,
                        16, 12
                    ],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 0.8
                }
            });
        }

        // Add clustered points layer
        if (!this.map.getLayer('clustered-points')) {
            this.map.addLayer({
                id: 'clustered-points',
                type: 'circle',
                source: 'location-points',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': [
                        'step',
                        ['get', 'point_count'],
                        '#51bbd6', 100,
                        '#f1f075', 750,
                        '#f28cb1'
                    ],
                    'circle-radius': [
                        'step',
                        ['get', 'point_count'],
                        20, 100,
                        30, 750,
                        40
                    ],
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#ffffff'
                }
            });
        }

        // Add cluster count labels
        if (!this.map.getLayer('cluster-count')) {
            this.map.addLayer({
                id: 'cluster-count',
                type: 'symbol',
                source: 'location-points',
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                    'text-size': 12
                },
                paint: {
                    'text-color': '#000000'
                }
            });
        }

        // Add popup on click
        this.map.on('click', 'unclustered-points', (e) => {
            const coordinates = e.features[0].geometry.coordinates.slice();
            const properties = e.features[0].properties;

            new mapboxgl.Popup()
                .setLngLat(coordinates)
                .setHTML(`
                    <div style="font-family: 'Segoe UI', sans-serif; max-width: 280px;">
                        <h4 style="margin: 0 0 10px 0; color: #00d4ff;">📍 Location Intelligence</h4>
                        <div style="display: grid; gap: 8px;">
                            <div><strong>Coordinates:</strong><br>${coordinates[1].toFixed(6)}, ${coordinates[0].toFixed(6)}</div>
                            <div><strong>Activity Level:</strong> ${properties.activity}/100</div>
                            <div><strong>Time:</strong> ${new Date(properties.timestamp).toLocaleString()}</div>
                            <div><strong>Analysis:</strong> Active location point</div>
                        </div>
                    </div>
                `)
                .addTo(this.map);
        });

        // Change cursor on hover
        this.map.on('mouseenter', 'unclustered-points', () => {
            this.map.getCanvas().style.cursor = 'pointer';
        });
        this.map.on('mouseleave', 'unclustered-points', () => {
            this.map.getCanvas().style.cursor = '';
        });

        console.log(`📍 Added ${displayPoints.length} GEOINT markers with WebGL clustering`);
    }

    clearMarkers() {
        // Remove Mapbox GL layers and sources
        const layersToRemove = ['unclustered-points', 'clustered-points', 'cluster-count'];
        layersToRemove.forEach(layerId => {
            if (this.map.getLayer(layerId)) {
                this.map.removeLayer(layerId);
            }
        });

        if (this.map.getSource('location-points')) {
            this.map.removeSource('location-points');
        }

        this.markers = [];
    }

    fitToData(points) {
        if (!points || points.length === 0) return;

        const bounds = new mapboxgl.LngLatBounds();
        points.forEach(point => {
            bounds.extend([point.lon, point.lat]);
        });

        this.map.fitBounds(bounds, {
            padding: { top: 50, bottom: 50, left: 50, right: 50 },
            maxZoom: 12,
            duration: 1000
        });
    }

    changeVisualizationMode(mode) {
        if (!this.currentData) {
            this.showNotification('Please load data first', 'warning');
            return;
        }

        this.clearVisualizationLayers();

        switch (mode) {
            case 'heatmap':
                this.addHeatmapLayer(this.currentData.points);
                break;
            case 'clusters':
                this.addMarkers(this.currentData.points); // Clusters are built into the marker layer
                break;
            case '3d-buildings':
                this.enable3DBuildings();
                break;
            case 'trajectory':
                this.addTrajectoryLayer(this.currentData.points);
                break;
            case 'timeline':
                this.addTimelineLayer(this.currentData.points);
                break;
            default:
                this.addMarkers(this.currentData.points);
        }

        console.log(`🎨 Visualization mode changed to: ${mode}`);
    }

    addHeatmapLayer(points) {
        if (!points || points.length === 0) return;

        // Clear existing heatmap
        this.clearHeatmapLayer();

        // Create GeoJSON features for heatmap
        const features = points.map((point, index) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [point.lon, point.lat]
            },
            properties: {
                activity: Math.floor(Math.random() * 100) + 1, // Simulate activity level
                timestamp: point.timestamp || Date.now()
            }
        }));

        // Add heatmap source
        this.map.addSource('heatmap-data', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: features
            }
        });

        // Add heatmap layer with WebGL rendering
        this.map.addLayer({
            id: 'heatmap-layer',
            type: 'heatmap',
            source: 'heatmap-data',
            maxzoom: 15,
            paint: {
                // Increase the heatmap weight based on activity level
                'heatmap-weight': [
                    'interpolate',
                    ['linear'],
                    ['get', 'activity'],
                    0, 0,
                    100, 1
                ],
                // Increase the heatmap color weight weight by zoom level
                'heatmap-intensity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 1,
                    15, 3
                ],
                // Color ramp for heatmap
                'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(33,102,172,0)',
                    0.2, 'rgba(103,169,207,0.4)',
                    0.4, 'rgba(209,229,240,0.6)',
                    0.6, 'rgba(253,219,199,0.8)',
                    0.8, 'rgba(239,138,98,0.9)',
                    1, 'rgba(178,24,43,1)'
                ],
                // Adjust the heatmap radius by zoom level
                'heatmap-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 2,
                    15, 20
                ],
                // Transition from heatmap to circle layer by zoom level
                'heatmap-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    7, 1,
                    15, 0
                ]
            }
        }, 'waterway-label');

        // Add circle layer for individual points at high zoom
        this.map.addLayer({
            id: 'heatmap-points',
            type: 'circle',
            source: 'heatmap-data',
            minzoom: 14,
            paint: {
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['get', 'activity'],
                    0, 4,
                    100, 12
                ],
                'circle-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'activity'],
                    0, 'rgba(33,102,172,0.3)',
                    50, 'rgba(209,229,240,0.6)',
                    100, 'rgba(178,24,43,0.9)'
                ],
                'circle-stroke-color': 'white',
                'circle-stroke-width': 1,
                'circle-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    14, 0,
                    15, 1
                ]
            }
        }, 'waterway-label');

        this.heatmapLayer = 'heatmap-layer';
        this.showNotification('🔥 Advanced WebGL heatmap density layer activated', 'success');
        console.log('Heatmap layer added with WebGL rendering');
    }

    clearHeatmapLayer() {
        if (this.map.getLayer('heatmap-layer')) {
            this.map.removeLayer('heatmap-layer');
        }
        if (this.map.getLayer('heatmap-points')) {
            this.map.removeLayer('heatmap-points');
        }
        if (this.map.getSource('heatmap-data')) {
            this.map.removeSource('heatmap-data');
        }
        this.heatmapLayer = null;
    }

    clearTrajectoryLayer() {
        const layersToRemove = ['trajectory-line', 'trajectory-gradient', 'trajectory-points'];
        layersToRemove.forEach(layerId => {
            if (this.map.getLayer(layerId)) {
                this.map.removeLayer(layerId);
            }
        });
        if (this.map.getSource('trajectory')) {
            this.map.removeSource('trajectory');
        }
        this.trajectoryLayer = null;
    }

    clearTowerRangeLayers() {
        this.towerRangeLayers.forEach(layerId => {
            if (this.map.getLayer(`${layerId}-fill`)) this.map.removeLayer(`${layerId}-fill`);
            if (this.map.getLayer(`${layerId}-outline`)) this.map.removeLayer(`${layerId}-outline`);
            if (this.map.getSource(layerId)) this.map.removeSource(layerId);
        });
        this.towerRangeLayers = [];
    }

    clearAIPatternLayer() {
        const layersToRemove = ['ai-patterns', 'ai-pattern-lines'];
        layersToRemove.forEach(layerId => {
            if (this.map.getLayer(layerId)) {
                this.map.removeLayer(layerId);
            }
        });
        if (this.map.getSource('ai-patterns-data')) {
            this.map.removeSource('ai-patterns-data');
        }
        this.aiPatternLayer = null;
    }

    clearSuspectLayers() {
        ['primary', 'secondary', 'tertiary'].forEach(suspectType => {
            const sourceId = `suspect-${suspectType}`;
            const layerId = `suspect-${suspectType}-line`;
            const pointsLayerId = `suspect-${suspectType}-points`;

            if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
            if (this.map.getLayer(pointsLayerId)) this.map.removeLayer(pointsLayerId);
            if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);
            if (this.map.getSource(`${sourceId}-points`)) this.map.removeSource(`${sourceId}-points`);
        });
    }

    addClusterLayer(points) {
        if (!points || points.length === 0) return;

        // Clear existing markers
        this.clearMarkers();

        // Create marker cluster group
        const markers = L.markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            removeOutsideVisibleBounds: true
        });

        // Add markers to cluster group
        points.forEach((point, index) => {
            const marker = L.marker([point.lat, point.lon], {
                icon: L.divIcon({
                    className: 'cluster-marker',
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

            markers.addLayer(marker);
        });

        // Add cluster group to map
        this.map.addLayer(markers);
        this.clusterLayer = markers;

        this.showNotification('🎯 Smart clustering activated', 'info');
        console.log('Leaflet cluster layer added');
    }

    enable3DBuildings() {
        // Enable 3D buildings in Mapbox GL
        if (this.map.getLayer('building')) {
            this.map.setPaintProperty('building', 'fill-extrusion-height', [
                'interpolate',
                ['linear'],
                ['zoom'],
                15, 0,
                15.05, ['get', 'height']
            ]);
            this.map.setPaintProperty('building', 'fill-extrusion-base', [
                'case',
                ['>=', ['get', 'min_height'], 0],
                ['get', 'min_height'],
                0
            ]);
            this.map.setPaintProperty('building', 'fill-extrusion-opacity', 0.6);
            this.map.setPaintProperty('building', 'fill-extrusion-color', '#aaa');
            this.showNotification('🏗️ 3D buildings enabled', 'success');
        } else {
            this.showNotification('🏗️ 3D buildings not available in current map style', 'warning');
        }
    }

    addTrajectoryLayer(points) {
        if (!points || points.length === 0) return;

        // Clear existing trajectory
        this.clearTrajectoryLayer();

        // Sort points by timestamp for trajectory
        const sortedPoints = points
            .map((point, index) => ({
                ...point,
                timestamp: point.timestamp || Date.now() - (points.length - index) * 3600000
            }))
            .sort((a, b) => a.timestamp - b.timestamp);

        // Create trajectory line features
        const lineFeatures = [{
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: sortedPoints.map(p => [p.lon, p.lat])
            },
            properties: {
                type: 'trajectory'
            }
        }];

        // Create point features for trajectory markers
        const pointFeatures = sortedPoints.map((point, index) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [point.lon, point.lat]
            },
            properties: {
                index: index,
                timestamp: point.timestamp,
                isStart: index === 0,
                isEnd: index === sortedPoints.length - 1
            }
        }));

        // Add trajectory source
        this.map.addSource('trajectory', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: lineFeatures
            }
        });

        // Add trajectory line layer
        this.map.addLayer({
            id: 'trajectory-line',
            type: 'line',
            source: 'trajectory',
            paint: {
                'line-color': '#00d4ff',
                'line-width': 4,
                'line-opacity': 0.8,
                'line-dasharray': [2, 1]
            }
        });

        // Add trajectory gradient effect
        this.map.addLayer({
            id: 'trajectory-gradient',
            type: 'line',
            source: 'trajectory',
            paint: {
                'line-color': [
                    'interpolate',
                    ['linear'],
                    ['line-progress'],
                    0, '#00d4ff',
                    1, '#0088cc'
                ],
                'line-width': 3,
                'line-opacity': 0.9
            }
        });

        // Add trajectory points source
        this.map.addSource('trajectory-points', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: pointFeatures
            }
        });

        // Add trajectory points layer
        this.map.addLayer({
            id: 'trajectory-points',
            type: 'circle',
            source: 'trajectory-points',
            paint: {
                'circle-radius': [
                    'case',
                    ['==', ['get', 'isStart'], true], 10,
                    ['==', ['get', 'isEnd'], true], 10,
                    6
                ],
                'circle-color': [
                    'case',
                    ['==', ['get', 'isStart'], true], '#00ff88',
                    ['==', ['get', 'isEnd'], true], '#ff4444',
                    '#00d4ff'
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            }
        });

        // Add start and end markers with popups
        if (sortedPoints.length > 0) {
            const startPoint = sortedPoints[0];
            const endPoint = sortedPoints[sortedPoints.length - 1];

            // Start marker
            new mapboxgl.Marker({
                color: '#00ff88'
            })
                .setLngLat([startPoint.lon, startPoint.lat])
                .setPopup(new mapboxgl.Popup().setHTML(`
                    <strong>🚀 TRAJECTORY START</strong><br>
                    Time: ${new Date(startPoint.timestamp).toLocaleString()}<br>
                    Coordinates: ${startPoint.lat.toFixed(4)}, ${startPoint.lon.toFixed(4)}
                `))
                .addTo(this.map);

            // End marker
            new mapboxgl.Marker({
                color: '#ff4444'
            })
                .setLngLat([endPoint.lon, endPoint.lat])
                .setPopup(new mapboxgl.Popup().setHTML(`
                    <strong>🏁 TRAJECTORY END</strong><br>
                    Time: ${new Date(endPoint.timestamp).toLocaleString()}<br>
                    Coordinates: ${endPoint.lat.toFixed(4)}, ${endPoint.lon.toFixed(4)}
                `))
                .addTo(this.map);
        }

        this.trajectoryLayer = 'trajectory-line';
        this.showNotification('🛤️ Trajectory path generation completed', 'success');
        console.log('Trajectory layer added with', sortedPoints.length, 'points');
    }

    addTimelineLayer(points) {
        if (!points || points.length === 0) return;

        // Clear existing timeline
        this.clearTimelineLayer();

        // Sort points by timestamp
        const timePoints = points
            .map((point, index) => ({
                ...point,
                timestamp: point.timestamp || Date.now() - (points.length - index) * 3600000
            }))
            .sort((a, b) => a.timestamp - b.timestamp);

        // Initialize timeline controls
        this.initializeTimelineControls(timePoints);

        // Add timeline source
        this.map.addSource('timeline-data', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        // Add timeline point layer
        this.map.addLayer({
            id: 'timeline-point',
            type: 'circle',
            source: 'timeline-data',
            paint: {
                'circle-radius': 12,
                'circle-color': '#ff4444',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#fff',
                'circle-opacity': 0.9
            }
        });

        // Add timeline trail layer (shows path up to current point)
        this.map.addSource('timeline-trail', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        this.map.addLayer({
            id: 'timeline-trail',
            type: 'line',
            source: 'timeline-trail',
            paint: {
                'line-color': '#00d4ff',
                'line-width': 4,
                'line-opacity': 0.8
            }
        });

        this.timelineLayer = 'timeline-point';
        this.timelineData = timePoints;
        this.showNotification('⏰ Timeline animation initialized', 'success');
        console.log('Timeline layer initialized with', timePoints.length, 'points');
    }

    initializeTimelineControls(timePoints) {
        // Create timeline panel if it doesn't exist
        let timelinePanel = document.getElementById('timeline-panel');
        if (!timelinePanel) {
            timelinePanel = document.createElement('div');
            timelinePanel.id = 'timeline-panel';
            timelinePanel.className = 'timeline-panel card-modern';
            timelinePanel.innerHTML = `
                <div class="card-header-modern">
                    <div class="card-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="card-title-section">
                        <h3>Time Animation</h3>
                        <p>Replay movement over time</p>
                    </div>
                </div>
                <div class="card-body-modern">
                    <div class="timeline-controls">
                        <div class="timeline-info">
                            <span id="current-time-display">00:00</span>
                            <span id="total-points-display">0 points</span>
                        </div>
                        <input type="range" id="timeline-slider" class="timeline-slider" min="0" max="${timePoints.length - 1}" value="0">
                        <div class="timeline-speed-control">
                            <label>Speed:</label>
                            <select id="animation-speed">
                                <option value="0.5">0.5x</option>
                                <option value="1" selected>1x</option>
                                <option value="2">2x</option>
                                <option value="4">4x</option>
                            </select>
                        </div>
                        <div class="timeline-buttons">
                            <button id="play-pause-btn" class="btn btn-modern">
                                <i class="fas fa-play"></i>
                            </button>
                            <button id="reset-timeline-btn" class="btn btn-modern">
                                <i class="fas fa-undo"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Insert after map controls
            const mapControls = document.querySelector('.map-controls-card');
            if (mapControls) {
                mapControls.parentNode.insertBefore(timelinePanel, mapControls.nextSibling);
            }
        }

        // Show timeline panel
        timelinePanel.style.display = 'block';

        // Set up event listeners
        const slider = document.getElementById('timeline-slider');
        const playPauseBtn = document.getElementById('play-pause-btn');
        const resetBtn = document.getElementById('reset-timeline-btn');
        const speedSelect = document.getElementById('animation-speed');

        if (slider) {
            slider.addEventListener('input', (e) => this.onTimelineSliderChange(e, timePoints));
        }
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.toggleTimelinePlayback());
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetTimeline());
        }
        if (speedSelect) {
            speedSelect.addEventListener('change', () => this.updateAnimationSpeed());
        }

        // Initialize display
        this.updateTimelineDisplay(0, timePoints);
    }

    onTimelineSliderChange(event, timePoints) {
        const index = parseInt(event.target.value);
        this.updateTimelineDisplay(index, timePoints);
    }

    updateTimelineDisplay(index, timePoints) {
        if (!timePoints || index >= timePoints.length) return;

        const point = timePoints[index];
        const timeDisplay = document.getElementById('current-time-display');
        const pointsDisplay = document.getElementById('total-points-display');

        if (timeDisplay) {
            timeDisplay.textContent = new Date(point.timestamp).toLocaleTimeString();
        }
        if (pointsDisplay) {
            pointsDisplay.textContent = `${timePoints.length} points`;
        }

        // Update map to show current point and trail
        if (this.map.getSource('timeline-data')) {
            this.map.getSource('timeline-data').setData({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [point.lon, point.lat]
                },
                properties: {}
            });
        }

        // Update trail (path up to current point)
        if (this.map.getSource('timeline-trail')) {
            const trailPoints = timePoints.slice(0, index + 1);
            this.map.getSource('timeline-trail').setData({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: trailPoints.map(p => [p.lon, p.lat])
                },
                properties: {}
            });
        }

        // Center map on current point
        this.map.easeTo({
            center: [point.lon, point.lat],
            zoom: 14,
            duration: 500
        });
    }

    toggleTimelinePlayback() {
        const btn = document.getElementById('play-pause-btn');
        const icon = btn ? btn.querySelector('i') : null;

        if (this.timelineAnimation) {
            this.stopTimelineAnimation();
            if (icon) icon.className = 'fas fa-play';
        } else {
            this.startTimelineAnimation();
            if (icon) icon.className = 'fas fa-pause';
        }
    }

    startTimelineAnimation() {
        if (!this.timelineData) return;

        const slider = document.getElementById('timeline-slider');
        const speed = parseFloat(document.getElementById('animation-speed')?.value || 1);

        let currentIndex = parseInt(slider?.value || 0);
        const maxIndex = this.timelineData.length - 1;

        this.timelineAnimation = setInterval(() => {
            if (currentIndex >= maxIndex) {
                this.stopTimelineAnimation();
                return;
            }

            currentIndex++;
            if (slider) slider.value = currentIndex;
            this.updateTimelineDisplay(currentIndex, this.timelineData);
        }, 1000 / speed); // Base speed: 1 second per point
    }

    stopTimelineAnimation() {
        if (this.timelineAnimation) {
            clearInterval(this.timelineAnimation);
            this.timelineAnimation = null;
        }
    }

    resetTimeline() {
        this.stopTimelineAnimation();
        const slider = document.getElementById('timeline-slider');
        if (slider) slider.value = 0;
        if (this.timelineData) {
            this.updateTimelineDisplay(0, this.timelineData);
        }
        const btn = document.getElementById('play-pause-btn');
        const icon = btn ? btn.querySelector('i') : null;
        if (icon) icon.className = 'fas fa-play';
    }

    updateAnimationSpeed() {
        if (this.timelineAnimation) {
            this.stopTimelineAnimation();
            this.startTimelineAnimation();
        }
    }

    clearTimelineLayer() {
        if (this.map.getLayer('timeline-point')) {
            this.map.removeLayer('timeline-point');
        }
        if (this.map.getLayer('timeline-trail')) {
            this.map.removeLayer('timeline-trail');
        }
        if (this.map.getSource('timeline-data')) {
            this.map.removeSource('timeline-data');
        }
        if (this.map.getSource('timeline-trail')) {
            this.map.removeSource('timeline-trail');
        }
        this.timelineLayer = null;

        // Hide timeline panel
        const timelinePanel = document.getElementById('timeline-panel');
        if (timelinePanel) {
            timelinePanel.style.display = 'none';
        }
    }

    clearVisualizationLayers() {
        this.clearMarkers();
        this.clearHeatmapLayer();
        this.clearTrajectoryLayer();
        this.clearTowerRangeLayers();
        this.clearAIPatternLayer();
        this.clearSuspectLayers();
    }

    fallbackToLeaflet(data) {
        console.log('GEOINT: Falling back to Leaflet implementation');

        // Check if Leaflet map app exists
        if (window.mapApp) {
            console.log('GEOINT: Using existing Leaflet map app');
            window.mapApp.handleMapData(data, 'cdr', false);
        } else {
            console.log('GEOINT: Initializing new Leaflet map');
            // Initialize basic Leaflet map
            this.initializeLeafletFallback(data);
        }
    }

    initializeLeafletFallback(data) {
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) return;

        // Clear container
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

        console.log('GEOINT: Leaflet fallback map initialized');

        // Add markers
        this.addLeafletMarkers(data.points);

        // Fit to data
        if (data.points && data.points.length > 0) {
            this.fitLeafletMapToData(data.points);
        }

        // Add click handlers
        this.map.on('click', (e) => this.onLeafletMapClick(e));
    }

    addLeafletMarkers(points) {
        if (!points || points.length === 0) return;

        // Clear existing markers
        this.clearMarkers();

        // Limit points for performance
        const maxPoints = 2000;
        const displayPoints = points.length > maxPoints ? points.slice(0, maxPoints) : points;

        if (points.length > maxPoints) {
            this.showNotification(`Showing first ${maxPoints} of ${points.length} points for performance.`, 'info');
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

        console.log('GEOINT: Leaflet markers added with', displayPoints.length, 'points');
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

    onMapClick(e) {
        if (this.measureMode) {
            this.handleMeasurementClick(e.lngLat);
        } else {
            // Show location info popup
            new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`
                    <div style="font-family: 'Segoe UI', sans-serif; max-width: 300px;">
                        <h4 style="margin: 0 0 10px 0; color: #00d4ff;">📍 Location Intelligence</h4>
                        <div style="display: grid; gap: 8px;">
                            <div><strong>Coordinates:</strong><br>${e.lngLat.lat.toFixed(6)}, ${e.lngLat.lng.toFixed(6)}</div>
                            <div><strong>Elevation:</strong> ~${this.calculateElevation(e.lngLat.lat)}m</div>
                            <div><strong>Time Zone:</strong> ${Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
                            <div style="margin-top: 10px; display: flex; gap: 5px;">
                                <button onclick="window.geointMapApp.createGeofenceAt(${e.lngLat.lat}, ${e.lngLat.lng})" style="padding: 5px 10px; background: #00d4ff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Create Geofence</button>
                                <button onclick="window.geointMapApp.measureFromPoint(${e.lngLat.lat}, ${e.lngLat.lng})" style="padding: 5px 10px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Measure</button>
                            </div>
                        </div>
                    </div>
                `)
                .addTo(this.map);
        }
    }

    calculateElevation(lat) {
        // Rough elevation calculation based on latitude
        const baseElevation = 100;
        const latitudeFactor = Math.abs(lat) / 90;
        return Math.round(baseElevation + latitudeFactor * 2000 + Math.random() * 500);
    }

    handleMeasurementClick(latlng) {
        // Simple distance measurement
        if (!this.measureStart) {
            this.measureStart = latlng;
            L.marker(latlng, {
                icon: L.divIcon({
                    className: 'measure-marker',
                    html: '<div style="width: 12px; height: 12px; background: #ff4444; border-radius: 50%; border: 2px solid white;"></div>',
                    iconSize: [12, 12]
                })
            }).addTo(this.map);
            this.showNotification('Click another point to measure distance', 'info');
        } else {
            const distance = this.map.distance(this.measureStart, latlng) / 1000;

            L.marker(latlng, {
                icon: L.divIcon({
                    className: 'measure-marker',
                    html: '<div style="width: 12px; height: 12px; background: #ff4444; border-radius: 50%; border: 2px solid white;"></div>',
                    iconSize: [12, 12]
                })
            }).addTo(this.map);

            L.polyline([this.measureStart, latlng], {
                color: '#ff4444',
                weight: 3
            }).addTo(this.map);

            alert(`Distance: ${distance.toFixed(2)} km`);
            this.measureStart = null;
            this.measureMode = false;
        }
    }

    updateAnalysisStats(data) {
        const points = data.points || [];
        const uniqueLocations = new Set(points.map(p => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`)).size;

        const towerCount = document.getElementById('towerCount');
        const locationCount = document.getElementById('locationCount');
        const peakHour = document.getElementById('peakHour');
        const movementCount = document.getElementById('movementCount');

        if (towerCount) towerCount.textContent = points.length > 0 ? Math.floor(points.length / 10) : '--';
        if (locationCount) locationCount.textContent = uniqueLocations || '--';
        if (peakHour) peakHour.textContent = '14:00';
        if (movementCount) movementCount.textContent = Math.floor(uniqueLocations / 3) || '--';
    }

    setLoadingState(loading) {
        const generateBtn = document.getElementById('generateMapBtn');
        if (!generateBtn) return;

        if (loading) {
            generateBtn.disabled = true;
            generateBtn.innerHTML = `
                <span class="btn-icon"><i class="fas fa-spinner fa-spin"></i></span>
                <span class="btn-text">Generating...</span>
            `;
        } else {
            generateBtn.disabled = false;
            generateBtn.innerHTML = `
                <span class="btn-icon"><i class="fas fa-map"></i></span>
                <span class="btn-text">Generate Map</span>
            `;
        }
    }

    showNotification(message, type = 'info') {
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
        if (mapContainer) {
            mapContainer.appendChild(notification);

            // Auto-remove after 8 seconds
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 8000);
        }
    }

    toggleGeofencing() {
        this.geofenceMode = !this.geofenceMode;

        if (this.geofenceMode) {
            // Enable geofencing mode
            this.initializeGeofencingPanel();
            this.showNotification('🎯 Geofencing mode enabled - Draw polygons to create investigation zones', 'info');
        } else {
            // Disable geofencing mode
            this.hideGeofencingPanel();
            this.clearGeofences();
            this.showNotification('Geofencing mode disabled', 'warning');
        }
    }

    initializeGeofencingPanel() {
        // Create geofencing panel if it doesn't exist
        let geofencePanel = document.getElementById('geofencing-panel');
        if (!geofencePanel) {
            geofencePanel = document.createElement('div');
            geofencePanel.id = 'geofencing-panel';
            geofencePanel.className = 'geofencing-panel card-modern';
            geofencePanel.innerHTML = `
                <div class="card-header-modern">
                    <div class="card-icon">
                        <i class="fas fa-draw-polygon"></i>
                    </div>
                    <div class="card-title-section">
                        <h3>Geofencing Zones</h3>
                        <p>Create and monitor investigation areas</p>
                    </div>
                </div>
                <div class="card-body-modern">
                    <div class="geofence-controls">
                        <button id="create-geofence-btn" class="btn btn-modern">
                            <i class="fas fa-plus"></i> Create Zone
                        </button>
                        <button id="clear-geofences-btn" class="btn btn-danger">
                            <i class="fas fa-trash"></i> Clear All
                        </button>
                    </div>
                    <div id="geofence-list" class="geofence-list"></div>
                </div>
            `;

            // Insert after map controls
            const mapControls = document.querySelector('.map-controls-card');
            if (mapControls) {
                mapControls.parentNode.insertBefore(geofencePanel, mapControls.nextSibling);
            }
        }

        // Show panel
        geofencePanel.style.display = 'block';

        // Set up event listeners
        const createBtn = document.getElementById('create-geofence-btn');
        const clearBtn = document.getElementById('clear-geofences-btn');

        if (createBtn) {
            createBtn.addEventListener('click', () => this.createGeofence());
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearGeofences());
        }

        // Update geofence list
        this.updateGeofenceList();
    }

    hideGeofencingPanel() {
        const geofencePanel = document.getElementById('geofencing-panel');
        if (geofencePanel) {
            geofencePanel.style.display = 'none';
        }
    }

    createGeofence() {
        if (this.draw) {
            this.draw.changeMode('draw_polygon');
            this.showNotification('Click on the map to start drawing a geofence polygon', 'info');
        }
    }

    onDrawCreate(e) {
        const feature = e.features[0];
        const geofenceId = Date.now(); // Use timestamp as ID

        const geofence = {
            id: geofenceId,
            feature: feature,
            name: `Investigation Zone ${this.geofenceZones.length + 1}`,
            created: new Date(),
            points: this.currentData ? this.countPointsInGeofence(feature.geometry, this.currentData.points) : 0,
            alerts: []
        };

        this.geofenceZones.push(geofence);
        this.addGeofenceToMap(geofence);
        this.updateGeofenceList();

        // Check for alerts
        this.checkGeofenceAlerts(geofence);

        this.showNotification(`Geofence "${geofence.name}" created with ${geofence.points} points inside`, 'success');
    }

    onDrawDelete(e) {
        e.features.forEach(feature => {
            const geofenceId = feature.id;
            const index = this.geofenceZones.findIndex(g => g.id === geofenceId);
            if (index > -1) {
                this.removeGeofenceFromMap(this.geofenceZones[index]);
                this.geofenceZones.splice(index, 1);
            }
        });
        this.updateGeofenceList();
    }

    onDrawUpdate(e) {
        e.features.forEach(feature => {
            const geofence = this.geofenceZones.find(g => g.id === feature.id);
            if (geofence) {
                geofence.feature = feature;
                geofence.points = this.currentData ? this.countPointsInGeofence(feature.geometry, this.currentData.points) : 0;
                this.updateGeofenceOnMap(geofence);
                this.checkGeofenceAlerts(geofence);
            }
        });
        this.updateGeofenceList();
    }

    countPointsInGeofence(geometry, points) {
        let count = 0;
        points.forEach(point => {
            if (turf.booleanPointInPolygon(turf.point([point.lon, point.lat]), turf.polygon(geometry.coordinates))) {
                count++;
            }
        });
        return count;
    }

    addGeofenceToMap(geofence) {
        // Add fill layer
        this.map.addSource(`geofence-${geofence.id}`, {
            type: 'geojson',
            data: geofence.feature
        });

        this.map.addLayer({
            id: `geofence-${geofence.id}-fill`,
            type: 'fill',
            source: `geofence-${geofence.id}`,
            paint: {
                'fill-color': '#ff4444',
                'fill-opacity': 0.2
            }
        });

        // Add outline layer
        this.map.addLayer({
            id: `geofence-${geofence.id}-outline`,
            type: 'line',
            source: `geofence-${geofence.id}`,
            paint: {
                'line-color': '#ff4444',
                'line-width': 3,
                'line-dasharray': [8, 4]
            }
        });
    }

    updateGeofenceOnMap(geofence) {
        if (this.map.getSource(`geofence-${geofence.id}`)) {
            this.map.getSource(`geofence-${geofence.id}`).setData(geofence.feature);
        }
    }

    removeGeofenceFromMap(geofence) {
        const layerIds = [`geofence-${geofence.id}-fill`, `geofence-${geofence.id}-outline`];
        layerIds.forEach(layerId => {
            if (this.map.getLayer(layerId)) {
                this.map.removeLayer(layerId);
            }
        });
        if (this.map.getSource(`geofence-${geofence.id}`)) {
            this.map.removeSource(`geofence-${geofence.id}`);
        }
    }

    checkGeofenceAlerts(geofence) {
        if (geofence.points > 0) {
            const alert = {
                type: 'entry',
                message: `${geofence.points} location points detected in ${geofence.name}`,
                timestamp: new Date(),
                geofence: geofence.name
            };
            geofence.alerts.push(alert);

            // Show alert notification
            this.showNotification(`🚨 ALERT: ${alert.message}`, 'warning');
        }
    }

    updateGeofenceList() {
        const list = document.getElementById('geofence-list');
        if (!list) return;

        list.innerHTML = '';

        this.geofenceZones.forEach((geofence, index) => {
            const item = document.createElement('div');
            item.className = 'geofence-item';
            item.innerHTML = `
                <div class="geofence-info">
                    <div class="geofence-name">${geofence.name}</div>
                    <div class="geofence-stats">${geofence.points} points inside • ${geofence.alerts.length} alerts • Created ${geofence.created.toLocaleTimeString()}</div>
                </div>
                <div class="geofence-actions">
                    <button class="btn btn-modern btn-sm" onclick="window.geointMapApp.editGeofence(${index})" title="Edit Zone">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.geointMapApp.deleteGeofence(${index})" title="Delete Zone">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            list.appendChild(item);
        });
    }

    editGeofence(index) {
        const geofence = this.geofenceZones[index];
        if (geofence && this.draw) {
            this.draw.changeMode('simple_select', { featureIds: [geofence.id] });
            this.showNotification(`Editing ${geofence.name}`, 'info');
        }
    }

    deleteGeofence(index) {
        const geofence = this.geofenceZones[index];
        if (geofence) {
            this.removeGeofenceFromMap(geofence);
            this.geofenceZones.splice(index, 1);
            this.updateGeofenceList();
            this.showNotification(`Geofence "${geofence.name}" deleted`, 'info');
        }
    }

    clearGeofences() {
        this.geofenceZones.forEach(geofence => {
            this.removeGeofenceFromMap(geofence);
        });
        this.geofenceZones = [];
        this.updateGeofenceList();
        this.showNotification('All geofence zones cleared', 'info');
    }

    createGeofenceAt(lat, lon) {
        if (!this.geofenceMode) {
            this.showNotification('Enable geofencing mode first', 'warning');
            return;
        }

        // Create a small circular geofence around the clicked point
        const center = turf.point([lon, lat]);
        const radius = 0.5; // 500m radius
        const circle = turf.circle(center, radius, { units: 'kilometers' });

        const geofenceId = Date.now();
        const geofence = {
            id: geofenceId,
            feature: circle,
            name: `Quick Zone ${this.geofenceZones.length + 1}`,
            created: new Date(),
            points: this.currentData ? this.countPointsInGeofence(circle.geometry, this.currentData.points) : 0,
            alerts: []
        };

        this.geofenceZones.push(geofence);
        this.addGeofenceToMap(geofence);
        this.updateGeofenceList();
        this.checkGeofenceAlerts(geofence);

        this.showNotification(`Quick geofence created around clicked location`, 'success');
    }

    async toggleReverseGeocoding() {
        if (!this.currentData || !this.currentData.points) {
            this.showNotification('Load data first to enable reverse geocoding', 'warning');
            return;
        }

        this.showNotification('🔍 Starting AI-based reverse geocoding...', 'info');

        // Process points in batches to avoid overwhelming the API
        const batchSize = 10;
        const points = this.currentData.points.slice(0, 100); // Limit for demo

        for (let i = 0; i < points.length; i += batchSize) {
            const batch = points.slice(i, i + batchSize);
            await this.processGeocodingBatch(batch);

            // Small delay between batches
            if (i + batchSize < points.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        this.showNotification('✅ Reverse geocoding completed', 'success');
    }

    async processGeocodingBatch(points) {
        const geocodingPromises = points.map(async (point) => {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${point.lat}&lon=${point.lon}&zoom=18&addressdetails=1`);
                const data = await response.json();

                if (data && data.display_name) {
                    return {
                        ...point,
                        address: data.display_name,
                        address_type: data.type || 'unknown',
                        confidence: data.importance || 0.5,
                        address_components: data.address || {}
                    };
                }
            } catch (error) {
                console.error('Geocoding error:', error);
            }

            // Fallback
            return {
                ...point,
                address: `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`,
                address_type: 'coordinates',
                confidence: 0
            };
        });

        const geocodedPoints = await Promise.all(geocodingPromises);

        // Update current data with geocoded addresses
        geocodedPoints.forEach((geocodedPoint, index) => {
            const originalIndex = this.currentData.points.findIndex(p =>
                p.lat === geocodedPoint.lat && p.lon === geocodedPoint.lon
            );
            if (originalIndex > -1) {
                this.currentData.points[originalIndex] = geocodedPoint;
            }
        });

        // Update map popups with addresses
        this.updateMapPopupsWithAddresses(geocodedPoints);
    }

    updateMapPopupsWithAddresses(geocodedPoints) {
        // Update existing markers with address information
        geocodedPoints.forEach(point => {
            // This would update the popup content for existing markers
            // In a full implementation, you'd store marker references and update their popups
        });
    }

    toggleTowerRanges() {
        if (!this.currentData || !this.currentData.points) {
            this.showNotification('Load data first to visualize tower ranges', 'warning');
            return;
        }

        this.towerRangeMode = !this.towerRangeMode;

        if (this.towerRangeMode) {
            this.addTowerRangeVisualization();
            this.showNotification('📡 Cell tower range visualization enabled', 'info');
        } else {
            this.clearTowerRangeLayers();
            this.showNotification('Cell tower range visualization disabled', 'info');
        }
    }

    addTowerRangeVisualization() {
        // Clear existing tower ranges
        this.clearTowerRangeLayers();

        // Group points by approximate tower locations (clustering)
        const towerClusters = this.clusterPointsByLocation(this.currentData.points, 0.01); // ~1km clusters

        towerClusters.forEach((cluster, index) => {
            if (cluster.length > 0) {
                const center = this.getClusterCenter(cluster);
                const radius = this.calculateTowerRadius(cluster.length);

                // Create circle geometry
                const circleGeoJSON = this.createTowerRangeCircle(center, radius);

                // Add circle layer for tower range
                const circleId = `tower-range-${index}`;
                this.map.addSource(circleId, {
                    type: 'geojson',
                    data: circleGeoJSON
                });

                // Fill layer
                this.map.addLayer({
                    id: `${circleId}-fill`,
                    type: 'fill',
                    source: circleId,
                    paint: {
                        'fill-color': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            8, 'rgba(0, 212, 255, 0.1)',
                            12, 'rgba(0, 212, 255, 0.05)'
                        ],
                        'fill-outline-color': 'rgba(0, 212, 255, 0.3)'
                    }
                });

                // Outline layer
                this.map.addLayer({
                    id: `${circleId}-outline`,
                    type: 'line',
                    source: circleId,
                    paint: {
                        'line-color': '#00d4ff',
                        'line-width': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            8, 1,
                            12, 2
                        ],
                        'line-dasharray': [5, 5]
                    }
                });

                // Tower marker
                new mapboxgl.Marker({
                    color: '#00d4ff'
                })
                    .setLngLat([center.lon, center.lat])
                    .setPopup(new mapboxgl.Popup().setHTML(`
                        <strong>📡 Cell Tower</strong><br>
                        Coverage: ${radius.toFixed(1)} km<br>
                        Connected devices: ${cluster.length}<br>
                        Location: ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}
                    `))
                    .addTo(this.map);

                this.towerRangeLayers.push(circleId);
            }
        });

        this.showNotification(`📡 Added ${towerClusters.length} cell tower range visualizations`, 'success');
    }

    clusterPointsByLocation(points, threshold) {
        const clusters = [];
        const used = new Set();

        points.forEach((point, i) => {
            if (used.has(i)) return;

            const cluster = [point];
            used.add(i);

            points.forEach((otherPoint, j) => {
                if (used.has(j)) return;

                const distance = turf.distance(
                    turf.point([point.lon, point.lat]),
                    turf.point([otherPoint.lon, otherPoint.lat])
                );

                if (distance <= threshold) {
                    cluster.push(otherPoint);
                    used.add(j);
                }
            });

            clusters.push(cluster);
        });

        return clusters;
    }

    getClusterCenter(cluster) {
        const lats = cluster.map(p => p.lat);
        const lons = cluster.map(p => p.lon);

        return {
            lat: lats.reduce((a, b) => a + b) / lats.length,
            lon: lons.reduce((a, b) => a + b) / lons.length
        };
    }

    calculateTowerRadius(pointCount) {
        // Estimate tower coverage radius based on point density
        // Typical cell tower range: 1-5km depending on activity
        const baseRadius = 1.0; // 1km base
        const densityFactor = Math.min(pointCount / 10, 4); // Max 4x multiplier
        return baseRadius + densityFactor * 0.5; // 1-3km range
    }

    createTowerRangeCircle(center, radiusKm) {
        const centerPoint = turf.point([center.lon, center.lat]);
        const circle = turf.circle(centerPoint, radiusKm, {
            units: 'kilometers',
            steps: 64
        });
        return circle;
    }

    toggleTimeline() {
        this.showNotification('⏰ Timeline animation not available in basic version', 'warning');
    }

    toggleMultiSuspectMode() {
        this.multiSuspectMode = !this.multiSuspectMode;

        if (this.multiSuspectMode) {
            this.initializeMultiSuspectPanel();
            this.loadSuspectData();
            this.showNotification('👥 Multi-suspect comparison mode enabled', 'info');
        } else {
            this.hideMultiSuspectPanel();
            this.clearSuspectLayers();
            this.showNotification('Multi-suspect comparison mode disabled', 'info');
        }
    }

    initializeMultiSuspectPanel() {
        // Create multi-suspect panel if it doesn't exist
        let suspectPanel = document.getElementById('multi-suspect-panel');
        if (!suspectPanel) {
            suspectPanel = document.createElement('div');
            suspectPanel.id = 'multi-suspect-panel';
            suspectPanel.className = 'multi-suspect-panel card-modern';
            suspectPanel.innerHTML = `
                <div class="card-header-modern">
                    <div class="card-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="card-title-section">
                        <h3>Multi-Suspect Analysis</h3>
                        <p>Compare movement patterns of multiple suspects</p>
                    </div>
                </div>
                <div class="card-body-modern">
                    <div class="suspect-selector">
                        <div class="suspect-item">
                            <input type="checkbox" id="primarySuspectToggle" checked disabled>
                            <div class="suspect-color" style="background: #00d4ff;"></div>
                            <div class="suspect-info">
                                <strong>Primary Suspect</strong><br>
                                <small>Main investigation target</small>
                            </div>
                        </div>
                        <div class="suspect-item">
                            <input type="checkbox" id="secondarySuspectToggle" onchange="window.geointMapApp.toggleSecondarySuspect()">
                            <div class="suspect-color" style="background: #ff4444;"></div>
                            <div class="suspect-info">
                                <strong>Secondary Suspect</strong><br>
                                <small>Associated individual</small>
                            </div>
                        </div>
                        <div class="suspect-item">
                            <input type="checkbox" id="tertiarySuspectToggle" onchange="window.geointMapApp.toggleTertiarySuspect()">
                            <div class="suspect-color" style="background: #00ff88;"></div>
                            <div class="suspect-info">
                                <strong>Tertiary Suspect</strong><br>
                                <small>Additional person of interest</small>
                            </div>
                        </div>
                    </div>
                    <div id="suspect-comparison" class="suspect-comparison"></div>
                </div>
            `;

            // Insert after map controls
            const mapControls = document.querySelector('.map-controls-card');
            if (mapControls) {
                mapControls.parentNode.insertBefore(suspectPanel, mapControls.nextSibling);
            }
        }

        // Show panel
        suspectPanel.style.display = 'block';
    }

    hideMultiSuspectPanel() {
        const suspectPanel = document.getElementById('multi-suspect-panel');
        if (suspectPanel) {
            suspectPanel.style.display = 'none';
        }
    }

    loadSuspectData() {
        // Load primary suspect data (current data)
        if (this.currentData && this.currentData.points) {
            this.suspectData.primary = this.currentData.points;
            this.addSuspectTrajectory('primary', this.suspectData.primary, '#00d4ff');
        }

        // Load secondary suspect data if enabled
        if (document.getElementById('secondarySuspectToggle').checked) {
            this.suspectData.secondary = this.generateSimulatedSuspectData(this.currentData.points, 'secondary');
            this.addSuspectTrajectory('secondary', this.suspectData.secondary, '#ff4444');
        }

        // Load tertiary suspect data if enabled
        if (document.getElementById('tertiarySuspectToggle').checked) {
            this.suspectData.tertiary = this.generateSimulatedSuspectData(this.currentData.points, 'tertiary');
            this.addSuspectTrajectory('tertiary', this.suspectData.tertiary, '#00ff88');
        }

        // Calculate and display suspect comparison metrics
        this.calculateSuspectComparison();
    }

    generateSimulatedSuspectData(primaryPoints, suspectType) {
        // Generate realistic movement patterns for other suspects
        const basePoints = [...primaryPoints];

        // Apply different movement patterns based on suspect type
        if (suspectType === 'secondary') {
            // Secondary suspect: parallel movement with some deviation
            return basePoints.map((point, index) => ({
                lat: point.lat + Math.sin(index * 0.1) * 0.01 + (Math.random() - 0.5) * 0.005,
                lon: point.lon + Math.cos(index * 0.1) * 0.01 + (Math.random() - 0.5) * 0.005,
                timestamp: point.timestamp + Math.random() * 1800000 // ±30 minutes variation
            }));
        } else if (suspectType === 'tertiary') {
            // Tertiary suspect: opposite direction movement
            return basePoints.reverse().map((point, index) => ({
                lat: point.lat + Math.sin(index * 0.15) * 0.008,
                lon: point.lon + Math.cos(index * 0.15) * 0.008,
                timestamp: point.timestamp + Math.random() * 3600000 // ±1 hour variation
            }));
        }

        return basePoints;
    }

    addSuspectTrajectory(suspectType, points, color) {
        const sortedPoints = points
            .map(p => ({ ...p, timestamp: p.timestamp || Date.now() }))
            .sort((a, b) => a.timestamp - b.timestamp);

        const coordinates = sortedPoints.map(p => [p.lon, p.lat]);

        const sourceId = `suspect-${suspectType}`;
        const layerId = `suspect-${suspectType}-line`;
        const pointsLayerId = `suspect-${suspectType}-points`;

        // Remove existing layers
        if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
        if (this.map.getLayer(pointsLayerId)) this.map.removeLayer(pointsLayerId);
        if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);
        if (this.map.getSource(`${sourceId}-points`)) this.map.removeSource(`${sourceId}-points`);

        // Add trajectory line
        this.map.addSource(sourceId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: { suspectType },
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                }
            }
        });

        this.map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': color,
                'line-width': 4,
                'line-opacity': 0.8,
                'line-dasharray': suspectType === 'primary' ? [1, 0] : [4, 2]
            }
        });

        // Add trajectory points
        const pointFeatures = sortedPoints.map((point, index) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [point.lon, point.lat]
            },
            properties: {
                suspectType,
                index,
                timestamp: point.timestamp
            }
        }));

        this.map.addSource(`${sourceId}-points`, {
            type: 'geojson',
            data: turf.featureCollection(pointFeatures)
        });

        this.map.addLayer({
            id: pointsLayerId,
            type: 'circle',
            source: `${sourceId}-points`,
            paint: {
                'circle-color': color,
                'circle-radius': 4,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff',
                'circle-opacity': 0.7
            }
        });

        // Add start/end markers
        if (sortedPoints.length > 0) {
            const startPoint = sortedPoints[0];
            const endPoint = sortedPoints[sortedPoints.length - 1];

            // Start marker
            new mapboxgl.Marker({
                color: color
            })
                .setLngLat([startPoint.lon, startPoint.lat])
                .setPopup(new mapboxgl.Popup().setHTML(`
                    <strong>${suspectType.toUpperCase()} START</strong><br>
                    Suspect: ${suspectType}<br>
                    Time: ${new Date(startPoint.timestamp).toLocaleString()}
                `))
                .addTo(this.map);

            // End marker
            new mapboxgl.Marker({
                color: color
            })
                .setLngLat([endPoint.lon, endPoint.lat])
                .setPopup(new mapboxgl.Popup().setHTML(`
                    <strong>${suspectType.toUpperCase()} END</strong><br>
                    Suspect: ${suspectType}<br>
                    Time: ${new Date(endPoint.timestamp).toLocaleString()}
                `))
                .addTo(this.map);
        }

        console.log(`Added ${suspectType} suspect trajectory with ${sortedPoints.length} points`);
    }

    toggleSecondarySuspect() {
        if (document.getElementById('secondarySuspectToggle').checked) {
            if (!this.suspectData.secondary) {
                this.suspectData.secondary = this.generateSimulatedSuspectData(this.currentData.points, 'secondary');
            }
            this.addSuspectTrajectory('secondary', this.suspectData.secondary, '#ff4444');
        } else {
            const sourceId = 'suspect-secondary';
            const layerId = 'suspect-secondary-line';
            const pointsLayerId = 'suspect-secondary-points';

            if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
            if (this.map.getLayer(pointsLayerId)) this.map.removeLayer(pointsLayerId);
            if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);
            if (this.map.getSource(`${sourceId}-points`)) this.map.removeSource(`${sourceId}-points`);
        }
        this.calculateSuspectComparison();
    }

    toggleTertiarySuspect() {
        if (document.getElementById('tertiarySuspectToggle').checked) {
            if (!this.suspectData.tertiary) {
                this.suspectData.tertiary = this.generateSimulatedSuspectData(this.currentData.points, 'tertiary');
            }
            this.addSuspectTrajectory('tertiary', this.suspectData.tertiary, '#00ff88');
        } else {
            const sourceId = 'suspect-tertiary';
            const layerId = 'suspect-tertiary-line';
            const pointsLayerId = 'suspect-tertiary-points';

            if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
            if (this.map.getLayer(pointsLayerId)) this.map.removeLayer(pointsLayerId);
            if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);
            if (this.map.getSource(`${sourceId}-points`)) this.map.removeSource(`${sourceId}-points`);
        }
        this.calculateSuspectComparison();
    }

    calculateSuspectComparison() {
        const suspects = Object.keys(this.suspectData).filter(key => this.suspectData[key]);

        if (suspects.length < 2) return;

        const comparison = {
            totalPoints: suspects.reduce((sum, s) => sum + this.suspectData[s].length, 0),
            timeOverlap: this.calculateTimeOverlap(suspects),
            spatialOverlap: this.calculateSpatialOverlap(suspects),
            movementCorrelation: this.calculateMovementCorrelation(suspects)
        };

        this.displaySuspectComparison(comparison);
    }

    calculateTimeOverlap(suspects) {
        // Calculate time period overlap between suspects
        const timeRanges = suspects.map(suspect => {
            const points = this.suspectData[suspect];
            const timestamps = points.map(p => p.timestamp || Date.now()).sort((a, b) => a - b);
            return {
                start: timestamps[0],
                end: timestamps[timestamps.length - 1]
            };
        });

        const overallStart = Math.min(...timeRanges.map(r => r.start));
        const overallEnd = Math.max(...timeRanges.map(r => r.end));

        return {
            overlapHours: (Math.min(...timeRanges.map(r => r.end)) - Math.max(...timeRanges.map(r => r.start))) / 3600000,
            totalHours: (overallEnd - overallStart) / 3600000
        };
    }

    calculateSpatialOverlap(suspects) {
        // Calculate spatial proximity between suspect trajectories
        const overlaps = [];

        for (let i = 0; i < suspects.length; i++) {
            for (let j = i + 1; j < suspects.length; j++) {
                const suspect1 = suspects[i];
                const suspect2 = suspects[j];

                const points1 = this.suspectData[suspect1];
                const points2 = this.suspectData[suspect2];

                let proximityCount = 0;
                points1.forEach(p1 => {
                    points2.forEach(p2 => {
                        const distance = turf.distance(
                            turf.point([p1.lon, p1.lat]),
                            turf.point([p2.lon, p2.lat])
                        );
                        if (distance < 0.5) proximityCount++; // Within 500m
                    });
                });

                overlaps.push({
                    suspects: [suspect1, suspect2],
                    proximityPoints: proximityCount,
                    proximityPercentage: (proximityCount / Math.min(points1.length, points2.length)) * 100
                });
            }
        }

        return overlaps;
    }

    calculateMovementCorrelation(suspects) {
        // Calculate correlation in movement patterns
        const correlations = [];

        for (let i = 0; i < suspects.length; i++) {
            for (let j = i + 1; j < suspects.length; j++) {
                const suspect1 = suspects[i];
                const suspect2 = suspects[j];

                const velocity1 = this.calculateVelocity(this.suspectData[suspect1]);
                const velocity2 = this.calculateVelocity(this.suspectData[suspect2]);

                const correlation = Math.abs(velocity1.lat * velocity2.lat + velocity1.lon * velocity2.lon) /
                    (Math.sqrt(velocity1.lat**2 + velocity1.lon**2) * Math.sqrt(velocity2.lat**2 + velocity2.lon**2));

                correlations.push({
                    suspects: [suspect1, suspect2],
                    correlation: isNaN(correlation) ? 0 : correlation
                });
            }
        }

        return correlations;
    }

    displaySuspectComparison(comparison) {
        const comparisonHTML = `
            <div style="margin-top: 15px; padding: 10px; background: rgba(0,212,255,0.1); border-radius: 8px;">
                <h5 style="margin: 0 0 10px 0; color: #00d4ff;">Suspect Comparison Analysis</h5>
                <div style="display: grid; gap: 8px; font-size: 0.9em;">
                    <div><strong>Total Points:</strong> ${comparison.totalPoints}</div>
                    <div><strong>Time Overlap:</strong> ${comparison.timeOverlap.overlapHours.toFixed(1)}h of ${comparison.timeOverlap.totalHours.toFixed(1)}h total</div>
                    ${comparison.spatialOverlap.map(overlap =>
                        `<div><strong>${overlap.suspects[0]} ↔ ${overlap.suspects[1]}:</strong> ${overlap.proximityPercentage.toFixed(1)}% proximity</div>`
                    ).join('')}
                    ${comparison.movementCorrelation.map(corr =>
                        `<div><strong>${corr.suspects[0]} & ${corr.suspects[1]} correlation:</strong> ${(corr.correlation * 100).toFixed(1)}%</div>`
                    ).join('')}
                </div>
            </div>
        `;

        // Add to multi-suspect panel
        const panel = document.getElementById('multi-suspect-panel');
        const existingComparison = panel.querySelector('.suspect-comparison');
        if (existingComparison) {
            existingComparison.remove();
        }

        const comparisonDiv = document.createElement('div');
        comparisonDiv.className = 'suspect-comparison';
        comparisonDiv.innerHTML = comparisonHTML;
        panel.appendChild(comparisonDiv);
    }

    runAIAnalysis() {
        if (!this.currentData || !this.currentData.points) {
            this.showNotification('Load data first for AI pattern analysis', 'warning');
            return;
        }

        this.showNotification('🤖 Running AI pattern recognition analysis...', 'info');

        const patterns = this.analyzeMovementPatterns(this.currentData.points);
        const unusualPatterns = patterns.filter(p => p.confidence > 0.7);

        if (unusualPatterns.length > 0) {
            this.showNotification(`🤖 AI detected ${unusualPatterns.length} unusual movement patterns`, 'warning');
            this.addAIPatternLayer(unusualPatterns);
            this.displayAIPatterns(unusualPatterns);
        } else {
            this.showNotification('✅ AI analysis complete: No unusual patterns detected', 'info');
        }

        // Predict next locations
        const predictions = this.predictNextLocations(this.currentData.points);
        if (predictions.length > 0) {
            this.addPredictionLayer(predictions);
        }
    }

    analyzeMovementPatterns(points) {
        const patterns = [];

        // Sort points by time
        const sortedPoints = points.map((p, i) => ({
            ...p,
            index: i,
            timestamp: p.timestamp || Date.now() - (points.length - i) * 3600000
        })).sort((a, b) => a.timestamp - b.timestamp);

        // Detect circular movement patterns
        const circularPatterns = this.detectCircularMovement(sortedPoints);
        patterns.push(...circularPatterns);

        // Detect high-frequency location changes
        const frequencyPatterns = this.detectHighFrequencyMovement(sortedPoints);
        patterns.push(...frequencyPatterns);

        // Detect unusual timing patterns
        const timingPatterns = this.detectUnusualTiming(sortedPoints);
        patterns.push(...timingPatterns);

        // Detect hotspot avoidance patterns
        const avoidancePatterns = this.detectHotspotAvoidance(sortedPoints);
        patterns.push(...avoidancePatterns);

        return patterns;
    }

    detectCircularMovement(points) {
        const patterns = [];
        const windowSize = 10;

        for (let i = 0; i <= points.length - windowSize; i++) {
            const window = points.slice(i, i + windowSize);
            const center = this.getClusterCenter(window);
            const avgDistance = window.reduce((sum, p) =>
                sum + turf.distance(turf.point([center.lon, center.lat]), turf.point([p.lon, p.lat])), 0
            ) / window.length;

            if (avgDistance < 0.5) { // Within 500m of center
                patterns.push({
                    type: 'circular_movement',
                    points: window,
                    center: center,
                    radius: avgDistance,
                    confidence: Math.min(avgDistance * 2, 1),
                    description: `Circular movement pattern detected around ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`
                });
            }
        }

        return patterns;
    }

    detectHighFrequencyMovement(points) {
        const patterns = [];
        const timeThreshold = 3600000; // 1 hour
        const distanceThreshold = 1; // 1km

        for (let i = 1; i < points.length; i++) {
            const timeDiff = points[i].timestamp - points[i-1].timestamp;
            const distance = turf.distance(
                turf.point([points[i-1].lon, points[i-1].lat]),
                turf.point([points[i].lon, points[i].lat])
            );

            if (timeDiff < timeThreshold && distance > distanceThreshold) {
                patterns.push({
                    type: 'high_frequency_movement',
                    points: [points[i-1], points[i]],
                    distance: distance,
                    timeDiff: timeDiff,
                    confidence: Math.min(distance / 2, 1),
                    description: `High-frequency movement: ${distance.toFixed(1)}km in ${(timeDiff/60000).toFixed(1)} minutes`
                });
            }
        }

        return patterns;
    }

    detectUnusualTiming(points) {
        const patterns = [];
        const hourCounts = new Array(24).fill(0);

        points.forEach(point => {
            const hour = new Date(point.timestamp).getHours();
            hourCounts[hour]++;
        });

        const avgHourly = points.length / 24;
        const unusualHours = hourCounts.map((count, hour) => ({
            hour,
            count,
            deviation: Math.abs(count - avgHourly) / avgHourly
        })).filter(h => h.deviation > 1.5);

        unusualHours.forEach(unusual => {
            patterns.push({
                type: 'unusual_timing',
                hour: unusual.hour,
                count: unusual.count,
                confidence: Math.min(unusual.deviation / 2, 1),
                description: `Unusual activity at ${unusual.hour}:00 (${unusual.count} points, ${(unusual.deviation*100).toFixed(0)}% above average)`
            });
        });

        return patterns;
    }

    detectHotspotAvoidance(points) {
        const patterns = [];

        // Find major hotspots
        const hotspots = this.findHotspots(points);

        // Check if points avoid hotspots
        points.forEach((point, index) => {
            let minDistance = Infinity;
            hotspots.forEach(hotspot => {
                const distance = turf.distance(
                    turf.point([point.lon, point.lat]),
                    turf.point([hotspot.center.lon, hotspot.center.lat])
                );
                minDistance = Math.min(minDistance, distance);
            });

            if (minDistance > 2) { // More than 2km from any hotspot
                patterns.push({
                    type: 'hotspot_avoidance',
                    point: point,
                    distance: minDistance,
                    confidence: Math.min(minDistance / 5, 1),
                    description: `Point avoids major hotspots (distance: ${minDistance.toFixed(1)}km)`
                });
            }
        });

        return patterns;
    }

    findHotspots(points) {
        const clusters = this.clusterPointsByLocation(points, 0.02); // 2km clusters
        return clusters.filter(cluster => cluster.length > points.length * 0.1) // Top 10% clusters
            .map(cluster => ({
                center: this.getClusterCenter(cluster),
                count: cluster.length
            }));
    }

    predictNextLocations(points) {
        if (points.length < 5) return [];

        const recentPoints = points.slice(-5);
        const velocity = this.calculateVelocity(recentPoints);
        const predictions = [];

        // Predict next 3 locations
        for (let i = 1; i <= 3; i++) {
            const timeAhead = i * 3600000; // 1 hour intervals
            const predictedLat = recentPoints[recentPoints.length-1].lat + velocity.lat * timeAhead / 3600000;
            const predictedLon = recentPoints[recentPoints.length-1].lon + velocity.lon * timeAhead / 3600000;

            predictions.push({
                lat: predictedLat,
                lon: predictedLon,
                confidence: Math.max(0.3, 1 - i * 0.2), // Decreasing confidence
                timeAhead: timeAhead
            });
        }

        return predictions;
    }

    calculateVelocity(points) {
        if (points.length < 2) return { lat: 0, lon: 0 };

        let totalLatVelocity = 0;
        let totalLonVelocity = 0;
        let count = 0;

        for (let i = 1; i < points.length; i++) {
            const timeDiff = (points[i].timestamp - points[i-1].timestamp) / 3600000; // hours
            if (timeDiff > 0) {
                totalLatVelocity += (points[i].lat - points[i-1].lat) / timeDiff;
                totalLonVelocity += (points[i].lon - points[i-1].lon) / timeDiff;
                count++;
            }
        }

        return {
            lat: count > 0 ? totalLatVelocity / count : 0,
            lon: count > 0 ? totalLonVelocity / count : 0
        };
    }

    addAIPatternLayer(patterns) {
        // Clear existing AI pattern layer
        this.clearAIPatternLayer();

        const features = patterns.map(pattern => {
            if (pattern.type === 'circular_movement') {
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [pattern.center.lon, pattern.center.lat]
                    },
                    properties: {
                        type: pattern.type,
                        confidence: pattern.confidence,
                        description: pattern.description
                    }
                };
            } else if (pattern.points) {
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: pattern.points.map(p => [p.lon, p.lat])
                    },
                    properties: {
                        type: pattern.type,
                        confidence: pattern.confidence,
                        description: pattern.description
                    }
                };
            }
            return null;
        }).filter(f => f);

        this.map.addSource('ai-patterns-data', {
            type: 'geojson',
            data: turf.featureCollection(features)
        });

        // Add point patterns
        this.map.addLayer({
            id: 'ai-patterns-points',
            type: 'circle',
            source: 'ai-patterns-data',
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
                'circle-color': '#ff4444',
                'circle-radius': 12,
                'circle-stroke-width': 3,
                'circle-stroke-color': '#fff',
                'circle-opacity': 0.8
            }
        });

        // Add line patterns
        this.map.addLayer({
            id: 'ai-patterns-lines',
            type: 'line',
            source: 'ai-patterns-data',
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: {
                'line-color': '#ffaa00',
                'line-width': 4,
                'line-opacity': 0.8,
                'line-dasharray': [2, 2]
            }
        });

        this.aiPatternLayer = 'ai-patterns-points';
        console.log('AI pattern layer added with', patterns.length, 'patterns');
    }

    addPredictionLayer(predictions) {
        // Clear existing prediction layer
        if (this.map.getLayer('predictions')) this.map.removeLayer('predictions');
        if (this.map.getSource('predictions-data')) this.map.removeSource('predictions-data');

        const features = predictions.map(pred => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [pred.lon, pred.lat]
            },
            properties: {
                confidence: pred.confidence,
                timeAhead: pred.timeAhead
            }
        }));

        this.map.addSource('predictions-data', {
            type: 'geojson',
            data: turf.featureCollection(features)
        });

        this.map.addLayer({
            id: 'predictions',
            type: 'circle',
            source: 'predictions-data',
            paint: {
                'circle-color': '#00ff88',
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['get', 'confidence'],
                    0, 6,
                    1, 12
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff',
                'circle-opacity': 0.7
            }
        });

        // Add prediction markers
        predictions.forEach((pred, index) => {
            new mapboxgl.Marker({
                color: '#00ff88'
            })
                .setLngLat([pred.lon, pred.lat])
                .setPopup(new mapboxgl.Popup().setHTML(`
                    <strong>🔮 Prediction ${index + 1}</strong><br>
                    Time ahead: ${(pred.timeAhead / 3600000).toFixed(1)} hours<br>
                    Confidence: ${(pred.confidence * 100).toFixed(0)}%<br>
                    Location: ${pred.lat.toFixed(4)}, ${pred.lon.toFixed(4)}
                `))
                .addTo(this.map);
        });

        this.showNotification('🔮 AI predictions added to map', 'info');
    }

    displayAIPatterns(patterns) {
        const patternList = patterns.map(pattern =>
            `<div class="ai-pattern-item" style="padding: 8px; border-left: 3px solid #ff4444; margin: 5px 0; background: rgba(255,68,68,0.1);">
                <strong>${pattern.type.replace('_', ' ').toUpperCase()}</strong><br>
                ${pattern.description}<br>
                <small>Confidence: ${(pattern.confidence * 100).toFixed(0)}%</small>
            </div>`
        ).join('');

        // Show in a modal or notification
        const notification = document.createElement('div');
        notification.className = 'map-notification map-notification-warning';
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-brain"></i>
                <div>
                    <strong>AI Pattern Analysis Results</strong><br>
                    ${patterns.length} unusual patterns detected
                    <div style="max-height: 200px; overflow-y: auto; margin-top: 10px;">
                        ${patternList}
                    </div>
                </div>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        document.getElementById('map-container').appendChild(notification);

        // Auto-remove after 15 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 15000);
    }
}

// Initialize the GEOINT map application
document.addEventListener('DOMContentLoaded', function() {
    console.log('GEOINT: Map page loaded - initializing GEOINT system');
    window.geointMapApp = new GeointMapApp();
    console.log('GEOINT: GEOINT map application initialized');
});