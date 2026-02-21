const CACHE_NAME = 'ascend-v1';

// Assets to cache on install (app shell)
const PRECACHE_URLS = [
    './',
    './index.html',
    './auth.html',
    './dashboard.html',
    './habits.html',
    './analytics.html',
    './profile.html',
    './manifest.json',
    './favicon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './css/base.css',
    './css/components.css',
    './css/pages/index.css',
    './css/pages/auth.css',
    './css/pages/dashboard.css',
    './css/pages/habits.css',
    './css/pages/analytics.css',
    './js/supabase.js',
    './js/auth.js',
    './js/router.js',
    './js/utils.js',
    './js/habits.js',
    './js/logs.js',
    './js/score.js',
    './js/streak.js',
    './js/identity.js',
    './js/heatmap.js',
    './js/notifications.js',
    './js/charts.js',
];

// Install: pre-cache the app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: cache-first for local assets, network-first for Supabase API calls
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Always go network-first for Supabase (API calls)
    if (url.hostname.includes('supabase.co')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for everything else (local assets + CDN)
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                // Cache successful GET responses
                if (event.request.method === 'GET' && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
