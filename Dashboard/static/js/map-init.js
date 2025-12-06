// Optimized Map Initialization for Shakti CDR Analytics
// Performance-focused initialization with lazy loading and caching

document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 Optimized Geospatial Intelligence System initializing...');

    // Set your Mapbox access token here (replace with your actual token for production)
    mapboxgl.accessToken = 'pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJjbGV4YW1wbGUifQ.example'; // Replace with real token

    // Initialize performance monitoring
    const performanceMonitor = new MapPerformanceMonitor();

    // Initialize the optimized map application
    const mapApp = new OptimizedMapApp(performanceMonitor);

    // Start initialization
    mapApp.initialize();

    console.log('✅ Optimized map system ready with performance monitoring');
});

// Performance Monitor Class
class MapPerformanceMonitor {
    constructor() {
        this.metrics = {
            loadTime: 0,
            renderTime: 0,
            memoryUsage: 0,
            layerCount: 0,
            pointCount: 0
        };
        this.startTime = performance.now();
    }

    recordMetric(name, value) {
        this.metrics[name] = value;
        console.log(`📊 Performance: ${name} = ${value}`);
    }

    getMetrics() {
        return { ...this.metrics };
    }

    logPerformance() {
        const totalTime = performance.now() - this.startTime;
        console.log('🎯 Performance Summary:', {
            totalLoadTime: totalTime.toFixed(2) + 'ms',
            ...this.metrics
        });
    }
}

// Optimized Map Application Class
class OptimizedMapApp {
    constructor(performanceMonitor) {
        this.performanceMonitor = performanceMonitor;
        this.map = null;
        this.currentData = null;
        this.isInitialized = false;

        // Lazy-loaded modules
        this.modules = new Map();
        this.modulePromises = new Map();
    }

    async initialize() {
        try {
            // Initialize tooltips
            this.initializeTooltips();

            // Setup event listeners
            this.setupEventListeners();

            // Initialize performance monitoring
            this.performanceMonitor.recordMetric('initializationStart', performance.now());

            console.log('🎯 Map initialization complete');
            this.isInitialized = true;

        } catch (error) {
            console.error('❌ Map initialization failed:', error);
        }
    }

    initializeTooltips() {
        // Initialize Bootstrap tooltips with performance optimization
        const tooltipElements = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        if (tooltipElements.length > 0 && typeof bootstrap !== 'undefined') {
            tooltipElements.forEach(el => new bootstrap.Tooltip(el));
        }
    }

    setupEventListeners() {
        // Data type selection
        const dataTypeSelect = document.getElementById('mapDataTypeSelect');
        if (dataTypeSelect) {
            dataTypeSelect.addEventListener('change', () => this.updateGenerateButtonState());
        }

        // Generate map button
        const generateBtn = document.getElementById('generateMapBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateMap());
        }

        // Other controls with lazy loading
        this.setupLazyEventListeners();
    }

    setupLazyEventListeners() {
        // Lazy load advanced features only when needed
        const controls = [
            { id: 'fullscreenBtn', handler: () => this.loadModule('fullscreen') },
            { id: 'geocodeBtn', handler: () => this.loadModule('geocoding') },
            { id: 'drawBtn', handler: () => this.loadModule('drawing') },
            { id: 'geofenceBtn', handler: () => this.loadModule('geofencing') },
            { id: 'trajectoryBtn', handler: () => this.loadModule('trajectory') },
            { id: 'measureBtn', handler: () => this.loadModule('measurement') },
            { id: 'exportMapBtn', handler: () => this.loadModule('export') },
            { id: 'layersBtn', handler: () => this.loadModule('layers') }
        ];

        controls.forEach(({ id, handler }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', handler);
            }
        });
    }

    async loadModule(moduleName) {
        if (this.modules.has(moduleName)) {
            return this.modules.get(moduleName);
        }

        if (this.modulePromises.has(moduleName)) {
            return this.modulePromises.get(moduleName);
        }

        // Lazy load module
        const promise = this.loadModuleScript(moduleName);
        this.modulePromises.set(moduleName, promise);

        try {
            const module = await promise;
            this.modules.set(moduleName, module);
            return module;
        } catch (error) {
            console.error(`Failed to load module ${moduleName}:`, error);
            throw error;
        }
    }

    async loadModuleScript(moduleName) {
        // Dynamic import simulation - in real implementation, use dynamic imports
        const script = document.createElement('script');
        script.src = `/static/js/modules/map-${moduleName}.js`;
        script.async = true;

        return new Promise((resolve, reject) => {
            script.onload = () => resolve(window[`Map${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Module`]);
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    updateGenerateButtonState() {
        const dataTypeSelect = document.getElementById('mapDataTypeSelect');
        const generateBtn = document.getElementById('generateMapBtn');

        if (dataTypeSelect && generateBtn) {
            const hasDataType = dataTypeSelect.value && dataTypeSelect.value !== 'Choose data type...';
            generateBtn.disabled = !hasDataType;
        }
    }

    async generateMap() {
        const generateBtn = document.getElementById('generateMapBtn');
        if (!generateBtn || generateBtn.disabled) return;

        // Load the core map renderer module
        const mapRenderer = await this.loadModule('renderer');

        // Use the optimized renderer to generate the map
        await mapRenderer.generateMap(this.performanceMonitor);
    }

    // Utility methods
    showNotification(message, type = 'info') {
        // Create and show notification
        const notification = document.createElement('div');
        notification.className = `map-notification map-notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getIconForType(type)}"></i>
                <span>${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        const container = document.getElementById('map-container');
        if (container) {
            container.appendChild(notification);

            // Auto-remove after 8 seconds
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 8000);
        }
    }

    getIconForType(type) {
        const icons = {
            error: 'exclamation-triangle',
            warning: 'exclamation-circle',
            success: 'check-circle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }
}

// Global error handling
window.addEventListener('error', (e) => {
    console.error('🚨 Map application error:', e.error);
});

// Performance monitoring
window.addEventListener('load', () => {
    console.log('🎯 Map page fully loaded');
});

// Export for global access
window.OptimizedMapApp = OptimizedMapApp;
window.MapPerformanceMonitor = MapPerformanceMonitor;