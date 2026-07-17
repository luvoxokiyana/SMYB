// service-worker.js
const CACHE_NAME = 'brev-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/config.js',
  '/help.html',
  '/privacy.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event with network-first strategy for API
self.addEventListener('fetch', (event) => {
  // Skip Supabase API calls (we want fresh data)
  if (event.request.url.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Skip Cloudinary uploads
  if (event.request.url.includes('cloudinary.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Use cache-first for static assets
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(response => {
            // Cache the response for future
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, clone);
            });
            return response;
          });
      })
      .catch(() => {
        // Offline fallback
        return new Response('You are offline', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});