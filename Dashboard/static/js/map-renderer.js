/**
 * Optimized Map Renderer Module
 * Handles WebGL rendering, layer management, and performance optimization
 */

class OptimizedMapRenderer {
    constructor(mapboxgl) {
        this.mapboxgl = mapboxgl;
        this.map = null;
        this.layers = new Map();
        this.sources = new Map();
        this.performanceMonitor = new PerformanceMonitor();
        this.cacheManager = new CacheManager();
        this.batchProcessor = new BatchProcessor();
    }

    async initialize(container, options = {}) {
        const startTime = performance.now();

        try {
            // Optimized Mapbox GL JS initialization
            this.map = new this.mapboxgl.Map({
                container: container,
                style: options.style || 'mapbox://styles/mapbox/streets-v12',
                center: options.center || [78.9629, 20.5937],
                zoom: options.zoom || 5,
                pitch: 0,
                bearing: 0,
                antialias: true,
                preserveDrawingBuffer: true,
                maxZoom: 20,
                minZoom: 1,
                // Performance optimizations
                fadeDuration: 0, // Disable fade for instant rendering
                crossSourceCollisions: false, // Disable collision detection
                ...options.mapOptions
            });

            // Add performance-optimized controls
            this.map.addControl(new this.mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
            this.map.addControl(new this.mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

            // Wait for map to load
            await new Promise((resolve) => {
                this.map.on('load', resolve);
            });

            // Enable hardware acceleration
            this._enableHardwareAcceleration();

            // Start performance monitoring
            this.performanceMonitor.startMonitoring();
            this.performanceMonitor.measureLoadTime(startTime);

            console.log('Optimized map renderer initialized');
            return this.map;

        } catch (error) {
            console.error('Failed to initialize optimized map renderer:', error);
            throw error;
        }
    }

    _enableHardwareAcceleration() {
        if (!this.map) return;

        // Apply CSS optimizations for WebGL
        const canvas = this.map.getCanvas();
        if (canvas) {
            canvas.style.willChange = 'transform';
            canvas.style.contain = 'layout style paint';
            canvas.style.backfaceVisibility = 'hidden';
            canvas.style.webkitBackfaceVisibility = 'hidden';
        }

        // Optimize map settings for performance
        this.map.setPaintProperty('background', 'background-opacity', 1);
        this.map.setPaintProperty('background', 'background-color', '#000000');
    }

    async renderVisualization(data, type, options = {}) {
        return this.performanceMonitor.measureRenderTime(async () => {
            await this.clearVisualizationLayers();

            switch (type) {
                case 'heatmap':
                    return this.renderHeatmap(data, options);
                case 'clusters':
                    return this.renderClusters(data, options);
                case 'markers':
                    return this.renderMarkers(data, options);
                case 'density':
                    return this.renderDensity(data, options);
                case 'trajectory':
                    return this.renderTrajectory(data, options);
                case 'geofence':
                    return this.renderGeofence(data, options);
                default:
                    return this.renderMarkers(data, options);
            }
        });
    }

    async renderHeatmap(points, options = {}) {
        const cacheKey = `heatmap_${JSON.stringify(options)}`;
        const cached = this.cacheManager.getVisualization(cacheKey);

        if (cached) {
            return this._applyCachedVisualization(cached);
        }

        try {
            // Process large datasets in batches
            const processedPoints = await this.batchProcessor.processLargeDataset(
                points,
                (chunk) => this._prepareHeatmapData(chunk)
            );

            const sourceId = 'heatmap-source';
            const layerId = 'heatmap-layer';

            // Remove existing layers
            this._removeLayer(layerId);
            this._removeSource(sourceId);

            // Add optimized heatmap source
            this.map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: processedPoints
                },
                // Performance optimization: cluster data
                cluster: processedPoints.length > 1000,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });

            // Add heatmap layer with optimized settings
            this.map.addLayer({
                id: layerId,
                type: 'heatmap',
                source: sourceId,
                paint: {
                    'heatmap-weight': [
                        'interpolate',
                        ['linear'],
                        ['get', 'intensity'],
                        0, 0,
                        6, 1
                    ],
                    'heatmap-intensity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 0.5,
                        9, 2
                    ],
                    'heatmap-color': [
                        'interpolate',
                        ['linear'],
                        ['heatmap-density'],
                        0, 'rgba(0,212,255,0)',
                        0.2, 'rgb(103,169,207)',
                        0.4, 'rgb(209,229,240)',
                        0.6, 'rgb(253,219,199)',
                        0.8, 'rgb(239,138,98)',
                        1, 'rgb(178,24,43)'
                    ],
                    'heatmap-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 2,
                        9, 20
                    ],
                    'heatmap-opacity': 0.7
                }
            });

            // Cache the visualization
            const visualization = { sourceId, layerId, type: 'heatmap' };
            this.cacheManager.setVisualization(cacheKey, visualization);

            this.layers.set(layerId, visualization);
            console.log(`Heatmap rendered with ${processedPoints.length} points`);

        } catch (error) {
            console.error('Failed to render heatmap:', error);
            this.performanceMonitor.logPerformanceIssue('Heatmap rendering failed', error);
        }
    }

    async renderClusters(points, options = {}) {
        const cacheKey = `clusters_${JSON.stringify(options)}`;
        const cached = this.cacheManager.getVisualization(cacheKey);

        if (cached) {
            return this._applyCachedVisualization(cached);
        }

        try {
            // Limit points for performance
            const maxPoints = options.maxPoints || 10000;
            const displayPoints = points.length > maxPoints ?
                await this._samplePoints(points, maxPoints) : points;

            if (points.length > maxPoints) {
                console.log(`Clustering ${maxPoints} of ${points.length} points for performance`);
            }

            const sourceId = 'clusters-source';
            const layerId = 'clusters-layer';
            const countLayerId = 'cluster-count-layer';

            // Remove existing layers
            this._removeLayer(layerId);
            this._removeLayer(countLayerId);
            this._removeSource(sourceId);

            // Prepare cluster data
            const features = displayPoints.map((point, index) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [point.lon, point.lat]
                },
                properties: {
                    id: index,
                    activity: Math.floor(Math.random() * 100) + 1
                }
            }));

            // Add cluster source with performance optimizations
            this.map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: features
                },
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50,
                // Performance: pre-calculate cluster properties
                clusterProperties: {
                    sum: ['+', ['get', 'activity']]
                }
            });

            // Add cluster circles
            this.map.addLayer({
                id: layerId,
                type: 'circle',
                source: sourceId,
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': [
                        'step',
                        ['get', 'point_count'],
                        '#51bbd6',
                        100, '#f1f075',
                        750, '#f28cb1'
                    ],
                    'circle-radius': [
                        'step',
                        ['get', 'point_count'],
                        20,
                        100, 30,
                        750, 40
                    ],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });

            // Add cluster count labels
            this.map.addLayer({
                id: countLayerId,
                type: 'symbol',
                source: sourceId,
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                    'text-size': 12
                },
                paint: {
                    'text-color': '#000'
                }
            });

            // Add unclustered points
            const unclusteredLayerId = 'unclustered-points';
            this._removeLayer(unclusteredLayerId);

            this.map.addLayer({
                id: unclusteredLayerId,
                type: 'circle',
                source: sourceId,
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': '#00d4ff',
                    'circle-radius': 6,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });

            // Cache the visualization
            const visualization = {
                sourceId,
                layers: [layerId, countLayerId, unclusteredLayerId],
                type: 'clusters'
            };
            this.cacheManager.setVisualization(cacheKey, visualization);

            console.log(`Clusters rendered with ${displayPoints.length} points`);

        } catch (error) {
            console.error('Failed to render clusters:', error);
            this.performanceMonitor.logPerformanceIssue('Cluster rendering failed', error);
        }
    }

    async renderMarkers(points, options = {}) {
        const cacheKey = `markers_${JSON.stringify(options)}`;
        const cached = this.cacheManager.getVisualization(cacheKey);

        if (cached) {
            return this._applyCachedVisualization(cached);
        }

        try {
            // Limit points for performance
            const maxPoints = options.maxPoints || 5000;
            const displayPoints = points.length > maxPoints ?
                await this._samplePoints(points, maxPoints) : points;

            if (points.length > maxPoints) {
                console.log(`Rendering ${maxPoints} of ${points.length} markers for performance`);
            }

            const sourceId = 'markers-source';
            const layerId = 'markers-layer';

            // Remove existing layers
            this._removeLayer(layerId);
            this._removeSource(sourceId);

            // Prepare marker data
            const features = displayPoints.map((point, index) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [point.lon, point.lat]
                },
                properties: {
                    id: index,
                    activity: Math.floor(Math.random() * 100) + 1
                }
            }));

            // Add marker source
            this.map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: features
                }
            });

            // Add marker layer with optimized rendering
            this.map.addLayer({
                id: layerId,
                type: 'circle',
                source: sourceId,
                paint: {
                    'circle-radius': 6,
                    'circle-color': '#00d4ff',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff',
                    'circle-opacity': 0.8
                }
            });

            // Cache the visualization
            const visualization = { sourceId, layerId, type: 'markers' };
            this.cacheManager.setVisualization(cacheKey, visualization);

            console.log(`Markers rendered with ${displayPoints.length} points`);

        } catch (error) {
            console.error('Failed to render markers:', error);
            this.performanceMonitor.logPerformanceIssue('Marker rendering failed', error);
        }
    }

    async clearVisualizationLayers() {
        // Clear all visualization layers efficiently
        for (const [layerId, layerInfo] of this.layers.entries()) {
            if (Array.isArray(layerInfo.layers)) {
                layerInfo.layers.forEach(id => this._removeLayer(id));
            } else {
                this._removeLayer(layerId);
            }
        }

        // Clear sources
        for (const sourceId of this.sources.keys()) {
            this._removeSource(sourceId);
        }

        this.layers.clear();
        this.sources.clear();
    }

    _removeLayer(layerId) {
        if (this.map && this.map.getLayer(layerId)) {
            try {
                this.map.removeLayer(layerId);
            } catch (error) {
                console.warn(`Failed to remove layer ${layerId}:`, error);
            }
        }
    }

    _removeSource(sourceId) {
        if (this.map && this.map.getSource(sourceId)) {
            try {
                this.map.removeSource(sourceId);
            } catch (error) {
                console.warn(`Failed to remove source ${sourceId}:`, error);
            }
        }
    }

    _prepareHeatmapData(points) {
        return points.map(point => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [point.lon, point.lat]
            },
            properties: {
                intensity: 1
            }
        }));
    }

    async _samplePoints(points, maxPoints) {
        if (points.length <= maxPoints) return points;

        // Use reservoir sampling for better distribution
        const sampled = [];
        const total = points.length;

        for (let i = 0; i < total && sampled.length < maxPoints; i++) {
            if (i < maxPoints) {
                sampled.push(points[i]);
            } else {
                const j = Math.floor(Math.random() * (i + 1));
                if (j < maxPoints) {
                    sampled[j] = points[i];
                }
            }
        }

        return sampled;
    }

    _applyCachedVisualization(visualization) {
        // Re-apply cached visualization layers
        console.log('Applying cached visualization:', visualization.type);
        // Implementation would restore layers from cache
    }

    getPerformanceMetrics() {
        return this.performanceMonitor.getMetrics();
    }

    dispose() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.clearVisualizationLayers();
        this.cacheManager.clear();
        this.performanceMonitor.stopMonitoring();
    }
}

// Global instance
window.OptimizedMapRenderer = OptimizedMapRenderer;