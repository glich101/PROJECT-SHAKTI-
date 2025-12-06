/**
 * Service Worker for Offline Map Functionality
 * Provides caching for map tiles, API responses, and static assets
 */

const CACHE_NAME = 'shakti-cdr-map-v1.0.0';
const TILE_CACHE_NAME = 'shakti-map-tiles-v1.0.0';

// Resources to cache immediately
const STATIC_CACHE_URLS = [
    '/',
    '/static/css/main.css',
    '/static/css/base.css',
    '/static/css/components.css',
    '/static/js/map-performance.js',
    '/static/js/map-renderer.js',
    '/static/js/map-app.js',
    '/static/js/map-service-worker.js',
    'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js',
    'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css'
];

// Map tile cache configuration
const TILE_CACHE_LIMIT = 1000; // Maximum number of tiles to cache
const TILE_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

class MapTileCache {
    constructor() {
        this.cache = new Map();
        this.accessOrder = [];
    }

    async get(key) {
        const entry = this.cache.get(key);
        if (entry && Date.now() - entry.timestamp < TILE_CACHE_EXPIRY) {
            // Update access order for LRU
            this._updateAccessOrder(key);
            return entry.response.clone();
        }
        if (entry) {
            this.cache.delete(key);
        }
        return null;
    }

    async put(key, response) {
        // Implement LRU eviction
        if (this.cache.size >= TILE_CACHE_LIMIT) {
            const oldestKey = this.accessOrder.shift();
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(key, {
            response: response.clone(),
            timestamp: Date.now()
        });
        this._updateAccessOrder(key);
    }

    _updateAccessOrder(key) {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
    }

    clear() {
        this.cache.clear();
        this.accessOrder = [];
    }
}

const tileCache = new MapTileCache();

// Install event - cache static resources
self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching static resources...');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('Service Worker installed and static resources cached');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker installation failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== TILE_CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker activated');
            return self.clients.claim();
        })
    );
});

// Fetch event - handle requests
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Handle map tile requests
    if (url.hostname === 'api.mapbox.com' && url.pathname.includes('/tiles/')) {
        event.respondWith(handleMapTileRequest(event.request));
        return;
    }

    // Handle API requests
    if (url.pathname.startsWith('/map_data/') ||
        url.pathname.startsWith('/chart_data/') ||
        url.pathname.startsWith('/data/')) {
        event.respondWith(handleApiRequest(event.request));
        return;
    }

    // Handle static resources
    if (STATIC_CACHE_URLS.includes(url.pathname) ||
        url.pathname.startsWith('/static/')) {
        event.respondWith(handleStaticRequest(event.request));
        return;
    }

    // Default network-first strategy for other requests
    event.respondWith(
        fetch(event.request)
            .catch(() => {
                // Return offline page for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('/');
                }
                return new Response('Offline content not available', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            })
    );
});

// Handle map tile requests with LRU caching
async function handleMapTileRequest(request) {
    const cacheKey = request.url;

    // Try cache first
    const cachedResponse = await tileCache.get(cacheKey);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        // Fetch from network
        const response = await fetch(request);

        if (response.ok) {
            // Cache successful responses
            await tileCache.put(cacheKey, response);
        }

        return response;
    } catch (error) {
        console.warn('Map tile fetch failed:', error);
        // Return a placeholder or cached response if available
        return new Response('', {
            status: 404,
            statusText: 'Tile not available offline'
        });
    }
}

// Handle API requests with cache-first strategy
async function handleApiRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        // Return cached response and update in background
        updateApiCache(request);
        return cachedResponse;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            // Cache successful responses
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.warn('API request failed:', error);
        return new Response(JSON.stringify({
            error: 'Request failed - check your connection',
            offline: true
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Update API cache in background
async function updateApiCache(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response);
        }
    } catch (error) {
        // Silently fail background updates
    }
}

// Handle static resources with cache-first strategy
async function handleStaticRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            // Cache static resources
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.warn('Static resource fetch failed:', error);
        return new Response('Resource not available', {
            status: 404,
            statusText: 'Not Found'
        });
    }
}

// Background sync for failed requests
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
        event.waitUntil(syncFailedRequests());
    }
});

async function syncFailedRequests() {
    // Implementation for syncing failed requests when connection is restored
    console.log('Background sync triggered');
    // This would typically check for stored failed requests and retry them
}

// Message handling for communication with main thread
self.addEventListener('message', event => {
    const { type, data } = event.data;

    switch (type) {
        case 'CLEAR_CACHE':
            clearAllCache();
            break;
        case 'GET_CACHE_STATS':
            getCacheStats().then(stats => {
                event.ports[0].postMessage({ type: 'CACHE_STATS', data: stats });
            });
            break;
        case 'UPDATE_TILE_CACHE_LIMIT':
            // Update cache limit if needed
            break;
        default:
            console.log('Unknown message type:', type);
    }
});

async function clearAllCache() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
    );
    tileCache.clear();
    console.log('All caches cleared');
}

async function getCacheStats() {
    const cacheNames = await caches.keys();
    const stats = {
        staticCaches: cacheNames.length,
        tileCacheSize: tileCache.cache.size,
        tileCacheLimit: TILE_CACHE_LIMIT
    };

    // Calculate cache sizes
    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        stats[`${cacheName}Items`] = keys.length;
    }

    return stats;
}

// Periodic cache cleanup
setInterval(async () => {
    try {
        // Clean up expired tiles
        // Note: The MapTileCache handles expiry internally

        // Clean up old static caches
        const cacheNames = await caches.keys();
        const currentVersion = CACHE_NAME.split('-v')[1];

        for (const cacheName of cacheNames) {
            if (cacheName.includes('shakti') && !cacheName.includes(currentVersion)) {
                await caches.delete(cacheName);
                console.log('Cleaned up old cache:', cacheName);
            }
        }
    } catch (error) {
        console.warn('Cache cleanup failed:', error);
    }
}, 30 * 60 * 1000); // Clean every 30 minutes

console.log('Shakti CDR Map Service Worker loaded');