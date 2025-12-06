/**
 * Map Performance Optimization Module
 * Handles caching, lazy loading, and performance monitoring
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            fps: 0,
            memory: 0,
            loadTime: 0,
            renderTime: 0
        };
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fpsHistory = [];
        this.isMonitoring = false;
    }

    startMonitoring() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.monitorFPS();
        this.monitorMemory();
        console.log('Performance monitoring started');
    }

    stopMonitoring() {
        this.isMonitoring = false;
        console.log('Performance monitoring stopped');
    }

    monitorFPS() {
        if (!this.isMonitoring) return;

        const now = performance.now();
        this.frameCount++;

        if (now - this.lastTime >= 1000) {
            this.metrics.fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
            this.fpsHistory.push(this.metrics.fps);
            if (this.fpsHistory.length > 60) this.fpsHistory.shift(); // Keep last 60 seconds

            this.frameCount = 0;
            this.lastTime = now;
        }

        requestAnimationFrame(() => this.monitorFPS());
    }

    monitorMemory() {
        if (!this.isMonitoring || !performance.memory) return;

        setInterval(() => {
            this.metrics.memory = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024); // MB
        }, 5000);
    }

    measureLoadTime(startTime) {
        this.metrics.loadTime = performance.now() - startTime;
        console.log(`Map load time: ${this.metrics.loadTime.toFixed(2)}ms`);
    }

    measureRenderTime(callback) {
        const start = performance.now();
        callback();
        this.metrics.renderTime = performance.now() - start;
        console.log(`Render time: ${this.metrics.renderTime.toFixed(2)}ms`);
    }

    getMetrics() {
        return {
            ...this.metrics,
            avgFps: this.fpsHistory.length > 0 ?
                Math.round(this.fpsHistory.reduce((a, b) => a + b) / this.fpsHistory.length) : 0
        };
    }

    logPerformanceIssue(issue, details) {
        console.warn(`Performance Issue: ${issue}`, details);
        // Could send to monitoring service
    }
}

class CacheManager {
    constructor() {
        this.dataCache = new Map();
        this.mapCache = new Map();
        this.visualizationCache = new Map();
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    }

    setData(key, data) {
        data.timestamp = Date.now();
        this.dataCache.set(key, data);
        this.cleanup();
    }

    getData(key) {
        const data = this.dataCache.get(key);
        if (data && Date.now() - data.timestamp < this.CACHE_DURATION) {
            console.log(`Cache hit for ${key}`);
            return data;
        }
        if (data) {
            this.dataCache.delete(key);
        }
        return null;
    }

    setMapInstance(key, mapInstance) {
        this.mapCache.set(key, {
            instance: mapInstance,
            timestamp: Date.now()
        });
    }

    getMapInstance(key) {
        const cached = this.mapCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            return cached.instance;
        }
        if (cached) {
            this.mapCache.delete(key);
        }
        return null;
    }

    setVisualization(key, vizData) {
        this.visualizationCache.set(key, {
            data: vizData,
            timestamp: Date.now()
        });
    }

    getVisualization(key) {
        const cached = this.visualizationCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            return cached.data;
        }
        if (cached) {
            this.visualizationCache.delete(key);
        }
        return null;
    }

    cleanup() {
        const now = Date.now();
        const cutoff = now - this.CACHE_DURATION;

        [this.dataCache, this.mapCache, this.visualizationCache].forEach(cache => {
            for (const [key, value] of cache.entries()) {
                if (value.timestamp < cutoff) {
                    cache.delete(key);
                }
            }
        });
    }

    clear() {
        this.dataCache.clear();
        this.mapCache.clear();
        this.visualizationCache.clear();
    }
}

class LazyLoader {
    constructor() {
        this.loadedModules = new Set();
        this.loadingPromises = new Map();
    }

    async loadModule(moduleName) {
        if (this.loadedModules.has(moduleName)) {
            return Promise.resolve();
        }

        if (this.loadingPromises.has(moduleName)) {
            return this.loadingPromises.get(moduleName);
        }

        const loadPromise = this._loadModuleFile(moduleName);
        this.loadingPromises.set(moduleName, loadPromise);

        try {
            await loadPromise;
            this.loadedModules.add(moduleName);
            this.loadingPromises.delete(moduleName);
        } catch (error) {
            this.loadingPromises.delete(moduleName);
            throw error;
        }
    }

    _loadModuleFile(moduleName) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `/static/js/${moduleName}.js`;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async loadFeature(featureName) {
        switch (featureName) {
            case 'geocoder':
                return this.loadModule('mapbox-gl-geocoder');
            case 'draw':
                return this.loadModule('mapbox-gl-draw');
            case 'timeline':
                return this.loadModule('map-timeline');
            case 'ai-analysis':
                return this.loadModule('map-ai-analysis');
            default:
                console.warn(`Unknown feature: ${featureName}`);
        }
    }
}

class BatchProcessor {
    constructor() {
        this.isProcessing = false;
        this.queue = [];
        this.chunkSize = 1000;
    }

    async processBatch(items, processor, options = {}) {
        const chunkSize = options.chunkSize || this.chunkSize;
        const chunks = this._createChunks(items, chunkSize);
        const results = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            // Yield to main thread every few chunks
            if (i > 0 && i % 10 === 0) {
                await this._yieldToMainThread();
            }

            const chunkResults = await processor(chunk);
            results.push(...chunkResults);

            // Update progress if callback provided
            if (options.onProgress) {
                options.onProgress((i + 1) / chunks.length, results.length);
            }
        }

        return results;
    }

    _createChunks(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    _yieldToMainThread() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    async processLargeDataset(data, processor) {
        if (data.length > 10000) {
            console.log(`Processing large dataset (${data.length} items) in batches`);
            return this.processBatch(data, processor, {
                chunkSize: 1000,
                onProgress: (progress, processed) => {
                    console.log(`Processing progress: ${(progress * 100).toFixed(1)}% (${processed} items)`);
                }
            });
        } else {
            return processor(data);
        }
    }
}

// Global instances
window.PerformanceMonitor = PerformanceMonitor;
window.CacheManager = CacheManager;
window.LazyLoader = LazyLoader;
window.BatchProcessor = BatchProcessor;