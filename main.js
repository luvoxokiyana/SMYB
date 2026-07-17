// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG & STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;
const CLOUDINARY_CLOUD_NAME = CONFIG.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = CONFIG.CLOUDINARY_UPLOAD_PRESET;

const state = {
  posts: [],
  venues: [],
  currentStoryIndex: 0,
  autoTimer: null,
  cameraStream: null,
  facingMode: 'environment',
  capturedImageData: null,
  isUploading: false,
  searchTimeout: null,
  lastFetch: 0,
  fetchCacheTime: 30000,
  profileTab: 'posts',
  selectedVenueId: null,
  selectedVenue: null,
  userLocation: null,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE UPLOAD VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const FILE_UPLOAD_CONFIG = {
  maxSize: 10 * 1024 * 1024,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  maxWidth: 4096,
  maxHeight: 4096,
};

function validateFile(file) {
  if (file.size > FILE_UPLOAD_CONFIG.maxSize) {
    throw new Error(`File too large. Max ${FILE_UPLOAD_CONFIG.maxSize / 1024 / 1024}MB`);
  }
  if (!FILE_UPLOAD_CONFIG.allowedTypes.includes(file.type)) {
    throw new Error('File type not supported. Use JPEG, PNG, or WebP.');
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width > FILE_UPLOAD_CONFIG.maxWidth || img.height > FILE_UPLOAD_CONFIG.maxHeight) {
        reject(new Error(`Image too large. Max ${FILE_UPLOAD_CONFIG.maxWidth}x${FILE_UPLOAD_CONFIG.maxHeight}`));
      } else {
        resolve(true);
      }
    };
    img.onerror = () => reject(new Error('Invalid image file'));
    img.src = url;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RATE LIMITER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class RateLimiter {
  constructor(maxRequests, timeWindow) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
  }
  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }
    return false;
  }
}

const rateLimiters = {
  search: new RateLimiter(10, 60000),
  post: new RateLimiter(5, 60000),
  comment: new RateLimiter(10, 60000),
  like: new RateLimiter(20, 60000),
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GLOBAL ERROR HANDLING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupErrorHandling() {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
    showToast('Something went wrong. Please try again.', 'error');
  });
  window.addEventListener('error', (event) => {
    console.error('Runtime error:', event.message, event.filename, event.lineno);
    showToast('An unexpected error occurred.', 'error');
  });
}

window.addEventListener('beforeunload', () => {
  clearAutoTimer();
  if (state.cameraStream) state.cameraStream.getTracks().forEach(t => t.stop());
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUPABASE HEADERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function supabaseHeaders() {
  const session = getSession();
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${session?.access_token || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

function authHeaders() {
  const session = getSession();
  // If no session or guest, use anon key
  if (!session?.access_token) {
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    };
  }
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SESSION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function saveSession(s) { localStorage.setItem('brev_session', JSON.stringify(s)); }
function getSession() {
  const raw = localStorage.getItem('brev_session');
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (s.expires_at && Date.now()/1000 > s.expires_at) { clearSession(); return null; }
    return s;
  } catch { clearSession(); return null; }
}
function clearSession() { localStorage.removeItem('brev_session'); localStorage.removeItem('brev_user'); }
function saveUser(u) { localStorage.setItem('brev_user', JSON.stringify(u)); }
function getUser() {
  const raw = localStorage.getItem('brev_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const GUEST_USER_ID = crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000';

function getGuestId() {
  let guestId = localStorage.getItem('brev_guest_id');
  if (!guestId) {
    guestId = crypto.randomUUID ? crypto.randomUUID() : 'guest_' + Date.now();
    localStorage.setItem('brev_guest_id', guestId);
  }
  return guestId;
}

function isGuest() {
  const user = getUser();
  if (!user) return true;
  return user.id === GUEST_USER_ID || user.is_guest === true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOADING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function hideLoadingScreen() {
  const l = document.getElementById('loadingScreen');
  if (l) { 
    l.classList.add('hidden'); 
    setTimeout(() => {
      if (l.parentNode) l.style.display = 'none';
    }, 500); 
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function signUp(email, password, username, fullName) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { username, full_name: fullName || username } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.message || 'Sign up failed');
  if (data.user && !data.session) throw new Error('EMAIL_CONFIRMATION_REQUIRED');
  if (data.session) { saveSession(data.session); saveUser(data.user); }
  return data;
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Invalid credentials');
  const session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now()/1000)+(data.expires_in||3600) };
  saveSession(session);
  const user = await fetchUser();
  if (!user) throw new Error('Failed to fetch user');
  saveUser(user);
  return { session, user };
}

async function signOut() {
  const s = getSession();
  if (s?.access_token) await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${s.access_token}` } }).catch(()=>{});
  clearSession();
  state.posts = []; state.venues = []; state.currentStoryIndex = 0; clearAutoTimer();
}

async function resendConfirmationEmail(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
    method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'signup', email }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.msg||'Failed'); }
}

async function fetchUser() {
  const s = getSession();
  if (!s?.access_token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${s.access_token}` } });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchProfile(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, { headers: supabaseHeaders() });
  if (!res.ok) return null;
  const d = await res.json();
  return d[0] || null;
}

async function updateProfile(updates) {
  const u = getUser();
  if (!u || isGuest()) throw new Error('Cannot update');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${u.id}`, {
    method: 'PATCH', headers: authHeaders(),
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error('Failed');
  const profile = await fetchProfile(u.id);
  if (profile) saveUser({ ...getUser(), user_metadata: { ...getUser().user_metadata, full_name: profile.full_name, username: profile.username } });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH GUARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function checkAuth() {
  const s = getSession();
  const auth = document.getElementById('authPage');
  const app = document.getElementById('appMain');
  if (!s) { if(auth)auth.classList.add('active'); if(app)app.classList.remove('active'); return false; }
  if(auth)auth.classList.remove('active'); if(app)app.classList.add('active'); return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OPENSTREETMAP VENUES 
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let venueSearchPromise = null;

async function searchVenuesOSM(query) {
  if (!query || query.length < 2) return [];
  const cacheKey = `venue_search_${query}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  if (venueSearchPromise) return venueSearchPromise;
  venueSearchPromise = (async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}+bar|restaurant|pub|nightclub&format=json&limit=8&addressdetails=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'BrevApp/1.0 (brev.app)' } });
      if (!res.ok) return [];
      const data = await res.json();
      const results = data.map(p => ({
        osm_id: p.osm_id,
        name: p.display_name?.split(',')[0] || p.name || 'Unknown',
        type: p.type === 'nightclub' ? 'Night Club' : p.type === 'restaurant' ? 'Restaurant' : 'Bar',
        address: p.display_name || '',
        latitude: parseFloat(p.lat),
        longitude: parseFloat(p.lon),
        photo_url: null,
      }));
      sessionStorage.setItem(cacheKey, JSON.stringify(results));
      setTimeout(() => sessionStorage.removeItem(cacheKey), 300000);
      return results;
    } catch (error) {
      console.error('Venue search error:', error);
      return [];
    } finally {
      venueSearchPromise = null;
    }
  })();
  return venueSearchPromise;
}

async function fetchNearbyVenuesOSM(lat, lng) {
  const queries = ['bar', 'pub', 'nightclub', 'restaurant'];
  const allVenues = [];
  for (const query of queries) {
    try {
      const viewbox = `${lng-0.05},${lat-0.05},${lng+0.05},${lat+0.05}`;
      const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=10&bounded=1&viewbox=${viewbox}&addressdetails=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'BrevApp/1.0 (brev.app)' } });
      if (!res.ok) continue;
      const data = await res.json();
      data.forEach(place => {
        const exists = allVenues.find(v => v.osm_id === place.osm_id);
        if (!exists) {
          allVenues.push({
            osm_id: place.osm_id,
            name: place.display_name?.split(',')[0] || place.name || query,
            type: query === 'nightclub' ? 'Night Club' : query === 'restaurant' ? 'Restaurant' : query === 'pub' ? 'Pub' : 'Bar',
            address: place.display_name || '',
            latitude: parseFloat(place.lat),
            longitude: parseFloat(place.lon),
            photo_url: null,
          });
        }
      });
    } catch (error) { console.warn(`Nominatim failed for "${query}":`, error.message); }
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  return allVenues.slice(0, 30);
}

async function getOrCreateVenue(venueData) {
  if (!venueData || !venueData.name) return null;
  const session = getSession();
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${session?.access_token || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  if (venueData.osm_id) {
    try {
      const check = await fetch(`${SUPABASE_URL}/rest/v1/venues?osm_id=eq.${venueData.osm_id}&select=*`, { headers });
      if (check.ok) { const ex = await check.json(); if (ex.length > 0) return ex[0]; }
    } catch {}
  }
  try {
    const nameCheck = await fetch(`${SUPABASE_URL}/rest/v1/venues?name=ilike.${encodeURIComponent(venueData.name)}&select=*`, { headers });
    if (nameCheck.ok) { const ex = await nameCheck.json(); if (ex.length > 0) return ex[0]; }
  } catch {}
  try {
    const user = getUser();
    const body = {
      osm_id: venueData.osm_id || null, name: venueData.name.trim(),
      type: venueData.type || 'Bar', address: venueData.address || '',
      latitude: venueData.latitude || null, longitude: venueData.longitude || null,
      photo_url: venueData.photo_url || null, posts_count: 0, followers_count: 0,
    };
    if (user && !isGuest()) body.created_by = user.id;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/venues`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) { console.error('Create venue error:', res.status, await res.text()); return null; }
    const created = await res.json();
    return created[0] || created;
  } catch (error) { console.error('Create venue error:', error); return null; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FETCH VENUES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let fetchVenuesPromise = null;

async function fetchVenues() {
  if (fetchVenuesPromise) return fetchVenuesPromise;
  fetchVenuesPromise = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/venues?select=*&order=posts_count.desc.nullslast&limit=50`, { 
        headers: supabaseHeaders() 
      });
      if (!res.ok) {
        console.error('Fetch venues error:', res.status, await res.text());
        return state.venues || [];
      }
      state.venues = await res.json();
      return state.venues;
    } catch (error) {
      console.error('Fetch venues error:', error);
      return state.venues || [];
    } finally {
      fetchVenuesPromise = null;
    }
  })();
  return fetchVenuesPromise;
}

async function getVenuePosts(venueId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*,profiles!posts_user_id_fkey(username,full_name,avatar_url)&venue_id=eq.${venueId}&order=created_at.desc.nullslast&limit=50`, { headers: supabaseHeaders() });
  if (!res.ok) return [];
  return await res.json();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENUE SAVE/FOLLOW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function toggleSaveVenue(venueId) {
  const u = getUser();
  if (!u || isGuest()) { showToast('Sign in to save venues','error'); return { saved: false }; }
  const check = await fetch(`${SUPABASE_URL}/rest/v1/venue_follows?user_id=eq.${u.id}&venue_id=eq.${venueId}`, { headers: authHeaders() });
  const ex = check.ok ? await check.json() : [];
  if (ex.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/venue_follows?id=eq.${ex[0].id}`, { method: 'DELETE', headers: authHeaders() });
    return { saved: false };
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/venue_follows`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ user_id: u.id, venue_id: venueId }) });
    return { saved: true };
  }
}

async function isVenueSaved(venueId) {
  const u = getUser();
  if (!u || isGuest()) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/venue_follows?user_id=eq.${u.id}&venue_id=eq.${venueId}`, { headers: authHeaders() });
  if (!res.ok) return false;
  const d = await res.json();
  return d.length > 0;
}

async function fetchSavedVenues(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/venue_follows?select=venue_id,venues(*)&user_id=eq.${userId}`, { headers: supabaseHeaders() });
  if (!res.ok) return [];
  const d = await res.json();
  return d.map(r => r.venues).filter(Boolean);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USER FOLLOWS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function toggleFollowUser(targetUserId) {
  const u = getUser();
  if (!u || isGuest()) { showToast('Sign in to follow','error'); return { following: false }; }
  if (u.id === targetUserId) { showToast('Cannot follow yourself','error'); return { following: false }; }
  const check = await fetch(`${SUPABASE_URL}/rest/v1/follows?follower_id=eq.${u.id}&following_id=eq.${targetUserId}`, { headers: authHeaders() });
  const ex = check.ok ? await check.json() : [];
  if (ex.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/follows?id=eq.${ex[0].id}`, { method: 'DELETE', headers: authHeaders() });
    return { following: false };
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/follows`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ follower_id: u.id, following_id: targetUserId }) });
    return { following: true };
  }
}

async function isFollowing(targetUserId) {
  const u = getUser();
  if (!u || isGuest()) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/follows?follower_id=eq.${u.id}&following_id=eq.${targetUserId}`, { headers: authHeaders() });
  if (!res.ok) return false;
  const d = await res.json();
  return d.length > 0;
}

async function getFollowCounts(userId) {
  const session = getSession();
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${session?.access_token || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  try {
    const [followersRes, followingRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/follows?following_id=eq.${userId}&select=id`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/follows?follower_id=eq.${userId}&select=id`, { headers }),
    ]);
    const followers = followersRes.ok ? await followersRes.json() : [];
    const following = followingRes.ok ? await followingRes.json() : [];
    return { followers: (followers || []).length, following: (following || []).length };
  } catch (error) { console.error('Get follow counts error:', error); return { followers: 0, following: 0 }; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POSTS, LIKES, COMMENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let fetchPostsPromise = null; 

async function fetchPosts(force = false) {
  if (force) {
    if (fetchPostsPromise) {
      await fetchPostsPromise;
    }
    fetchPostsPromise = null;
    state.lastFetch = 0;
  }
  if (fetchPostsPromise) {
    return fetchPostsPromise;
  }
  if (!force && Date.now() - state.lastFetch < state.fetchCacheTime && state.posts.length > 0) {
    return state.posts;
  }
  fetchPostsPromise = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*,profiles!posts_user_id_fkey(username,full_name,avatar_url)&order=created_at.desc.nullslast&limit=50`, { 
        headers: supabaseHeaders() 
      });
      if (!res.ok) throw new Error('Failed');
      state.posts = (await res.json()).map(p => ({
        ...p, 
        poster_name: p.profiles?.full_name || p.profiles?.username || 'Anonymous',
        poster_avatar: p.profiles?.avatar_url || null,
        likes_count: p.likes_count || 0, 
        comments_count: p.comments_count || 0,
      }));
      state.lastFetch = Date.now();
      return state.posts;
    } catch(e) {
      console.error('Fetch posts error:', e);
      return state.posts.length ? state.posts : [];
    } finally {
      fetchPostsPromise = null;
    }
  })();
  return fetchPostsPromise;
}

async function submitPost(imageUrl, caption, venueName, venueId) {
  if (!rateLimiters.post.canMakeRequest()) {
    throw new Error('Too many posts. Please wait a moment.');
  }
  const u = getUser();
  if (!u || isGuest()) throw new Error('Sign in to post');
  const body = { user_id: u.id, image_url: imageUrl, caption: (caption||'').trim().slice(0,200), venue: venueName||null };
  if (venueId) body.venue_id = venueId;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.message||'Failed to post'); }
  return await res.json();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LIKES - FIXED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function likePost(postId) {
  const u = getUser();
  if (!u || isGuest()) {
    showToast('Sign in to like ❤️', 'error');
    return { liked: false, error: 'not_authenticated' };
  }
  
  try {
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/likes?post_id=eq.${postId}&user_id=eq.${u.id}`,
      { headers: authHeaders() }
    );
    
    if (!checkRes.ok) {
      console.error('Like check failed:', await checkRes.text());
      throw new Error('Failed to check like status');
    }
    
    const existingLikes = await checkRes.json();
    
    if (existingLikes && existingLikes.length > 0) {
      const deleteRes = await fetch(
        `${SUPABASE_URL}/rest/v1/likes?id=eq.${existingLikes[0].id}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      if (!deleteRes.ok) {
        throw new Error('Failed to unlike');
      }
      const post = state.posts.find(x => x.id === postId);
      if (post) {
        post.likes_count = Math.max(0, (post.likes_count || 0) - 1);
      }
      return { liked: false };
    } else {
      const likeRes = await fetch(
        `${SUPABASE_URL}/rest/v1/likes`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ post_id: postId, user_id: u.id })
        }
      );
      if (!likeRes.ok) {
        const errorText = await likeRes.text();
        console.error('Like failed:', errorText);
        throw new Error('Failed to like');
      }
      const post = state.posts.find(x => x.id === postId);
      if (post) {
        post.likes_count = (post.likes_count || 0) + 1;
      }
      return { liked: true };
    }
  } catch (error) {
    console.error('Like error:', error);
    if (error.message === 'Not authenticated') {
      showToast('Please sign in again', 'error');
    } else {
      showToast('Failed to update like. Please try again.', 'error');
    }
    return { liked: false, error: error.message };
  }
}

async function addComment(postId, text) {
  const u = getUser();
  if (!u || isGuest()) throw new Error('Sign in to comment');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/comments`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ post_id: postId, user_id: u.id, text: text.trim().slice(0,500) }) });
  if (!res.ok) throw new Error('Failed');
  const p = state.posts.find(x => x.id === postId);
  if (p) p.comments_count = (p.comments_count||0)+1;
  return await res.json();
}

async function fetchComments(postId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/comments?select=*,profiles!comments_user_id_fkey(username,full_name,avatar_url)&post_id=eq.${postId}&order=created_at.asc`,
      { headers: supabaseHeaders() }
    );
    if (!res.ok) {
      console.error('Fetch comments error:', res.status, await res.text());
      return [];
    }
    return await res.json();
  } catch (error) {
    console.error('Fetch comments error:', error);
    return [];
  }
}

async function fetchUserPosts(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*&user_id=eq.${userId}&order=created_at.desc.nullslast&limit=20`, { headers: supabaseHeaders() });
  if (!res.ok) return [];
  return await res.json();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CAMERA & UPLOAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function openCamera() {
  if (isGuest()) { showToast('Sign in to post','error'); return; }
  const modal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraFeed');
  const preview = document.getElementById('cameraPreview');
  if (state.cameraStream) { 
    state.cameraStream.getTracks().forEach(t=>t.stop()); 
    state.cameraStream = null; 
  }
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: state.facingMode, 
        width: { ideal: 1080 }, 
        height: { ideal: 1920 } 
      }, 
      audio: false 
    });
    video.srcObject = state.cameraStream;
    video.style.display = 'block';
    preview.style.display = 'none';
    state.capturedImageData = null;
    document.getElementById('cameraCapture')?.classList.remove('recording');
  } catch(e) {
    console.error('Camera error:', e);
    showToast('Camera access denied. Use gallery instead 📸', 'error');
    setTimeout(() => {
      const galleryInput = document.getElementById('galleryInput');
      if (galleryInput) galleryInput.click();
    }, 1500);
  }
}

function closeCamera() {
  const modal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraFeed');
  const preview = document.getElementById('cameraPreview');
  if (state.cameraStream) { state.cameraStream.getTracks().forEach(t=>t.stop()); state.cameraStream = null; }
  if (video) { video.srcObject = null; video.style.display = 'block'; }
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  modal.classList.remove('active'); document.body.style.overflow = '';
  document.getElementById('cameraCapture')?.classList.remove('recording');
  state.capturedImageData = null;
}

async function capturePhoto() {
  const video = document.getElementById('cameraFeed');
  const preview = document.getElementById('cameraPreview');
  const canvas = document.createElement('canvas');
  let w = video.videoWidth||1080, h = video.videoHeight||1920;
  const ratio = 9/16, cur = w/h;
  if (cur > ratio) {
    const nw = h*ratio, ox = (w-nw)/2;
    canvas.width = nw; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (state.facingMode==='user') { ctx.translate(nw,0); ctx.scale(-1,1); }
    ctx.drawImage(video, ox, 0, nw, h, 0, 0, nw, h);
  } else {
    const nh = w/ratio, oy = (h-nh)/2;
    canvas.width = w; canvas.height = nh;
    const ctx = canvas.getContext('2d');
    if (state.facingMode==='user') { ctx.translate(w,0); ctx.scale(-1,1); }
    ctx.drawImage(video, 0, oy, w, nh, 0, 0, w, nh);
  }
  state.capturedImageData = canvas.toDataURL('image/jpeg',0.85);
  if (state.cameraStream) { state.cameraStream.getTracks().forEach(t=>t.stop()); state.cameraStream = null; }
  preview.src = state.capturedImageData; preview.style.display = 'block'; video.style.display = 'none';
  document.getElementById('cameraCapture').classList.add('recording');
  setTimeout(() => openPostPreview(state.capturedImageData), 150);
}

async function selectFromGallery() {
  if (isGuest()) { showToast('Sign in to post','error'); return; }
  document.getElementById('galleryInput').click();
}

async function handleGallerySelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await validateFile(file);
    if (state.cameraStream) { state.cameraStream.getTracks().forEach(t=>t.stop()); state.cameraStream = null; }
    const compressed = await compressImage(file);
    state.capturedImageData = compressed;
    closeCamera();
    setTimeout(() => openPostPreview(state.capturedImageData), 300);
    e.target.value = '';
  } catch (error) {
    showToast(error.message, 'error');
    e.target.value = '';
  }
}

function compressImage(file, maxW=1080, q=0.8) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w=img.width, h=img.height;
        if (w>maxW) { h = (maxW/w)*h; w = maxW; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg',q));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function flipCamera() {
  state.facingMode = state.facingMode==='environment'?'user':'environment';
  if (state.cameraStream) { state.cameraStream.getTracks().forEach(t=>t.stop()); state.cameraStream = null; }
  const video = document.getElementById('cameraFeed');
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: state.facingMode, width:{ideal:1080}, height:{ideal:1920} }, audio: false });
    video.srcObject = state.cameraStream; video.style.display = 'block';
    document.getElementById('cameraPreview').style.display = 'none';
  } catch(e) { showToast('Cannot switch camera','error'); }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST PREVIEW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function openPostPreview(imageData) {
  if (state.cameraStream) { state.cameraStream.getTracks().forEach(t=>t.stop()); state.cameraStream = null; }
  const modal = document.getElementById('previewModal');
  const container = document.getElementById('previewContainer');
  document.getElementById('previewImage').style.backgroundImage = `url(${imageData})`;
  document.getElementById('previewCaption').value = '';
  document.getElementById('previewVenue').value = '';
  document.getElementById('previewCharCount').textContent = '0';
  state.selectedVenueId = null; state.selectedVenue = null;
  const u = getUser();
  const nameInput = document.getElementById('previewName');
  if (nameInput && u) { const p = u.user_metadata||{}; nameInput.value = p.full_name||p.username||u.email?.split('@')[0]||''; }
  if (container) { container.style.transform = ''; container.style.transition = ''; }
  modal.classList.add('active'); 
  document.body.style.overflow = 'hidden';
  modal.dataset.imageData = imageData;
  const overlay = document.querySelector('.swipe-overlay');
  if (overlay) { overlay.classList.remove('fading'); setTimeout(() => overlay.classList.add('fading'), 3000); }
  setupSwipeToPost();
  setupVenueSearch();
  setupCaptionInput();
}

function setupCaptionInput() {
  const caption = document.getElementById('previewCaption');
  if (!caption) return;
  caption.oninput = function() {
    const len = this.value.length;
    document.getElementById('previewCharCount').textContent = len;
    if (len > 200) { this.value = this.value.slice(0, 200); document.getElementById('previewCharCount').textContent = '200'; }
  };
}

function setupSwipeToPost() {
  const container = document.getElementById('previewContainer');
  if (!container) return;
  let startY = 0, startX = 0, swiping = false;
  container.addEventListener('touchstart', handleSwipeStart, { passive: true });
  container.addEventListener('touchmove', handleSwipeMove, { passive: false });
  container.addEventListener('touchend', handleSwipeEnd);
  container.addEventListener('mousedown', handleSwipeStart);
  container.addEventListener('mousemove', handleSwipeMove);
  container.addEventListener('mouseup', handleSwipeEnd);
  container.addEventListener('mouseleave', handleSwipeEnd);
  
  function handleSwipeStart(e) {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    if (!e.target.closest('input')) {
      startY = clientY;
      startX = clientX;
      swiping = true;
    }
  }
  function handleSwipeMove(e) {
    if (!swiping) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const deltaY = clientY - startY;
    const deltaX = clientX - startX;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      e.preventDefault();
      container.style.transform = `translateY(${deltaY}px)`;
      container.style.transition = 'none';
      const overlay = document.querySelector('.swipe-overlay');
      if (overlay) overlay.style.opacity = Math.max(0, 1 - Math.abs(deltaY) / 200);
    }
  }
  function handleSwipeEnd(e) {
    if (!swiping) return;
    swiping = false;
    const currentTransform = container.style.transform || '';
    const deltaY = parseFloat(currentTransform.replace('translateY(','').replace('px)','') || 0);
    if (deltaY < -120) {
      container.style.transition = 'transform 0.3s ease';
      container.style.transform = 'translateY(-120%)';
      setTimeout(() => {
        container.style.transform = '';
        container.style.transition = '';
        submitFromPreview();
      }, 300);
    } else if (deltaY > 120) {
      container.style.transition = 'transform 0.3s ease';
      container.style.transform = 'translateY(120%)';
      setTimeout(() => {
        container.style.transform = '';
        container.style.transition = '';
        closePostPreview();
        setTimeout(() => openCamera(), 400);
      }, 300);
    } else {
      container.style.transition = 'transform 0.3s ease';
      container.style.transform = '';
      const overlay = document.querySelector('.swipe-overlay');
      if (overlay) { 
        overlay.style.opacity = '1'; 
        overlay.classList.remove('fading');
        setTimeout(() => overlay.classList.add('fading'), 3000);
      }
    }
    startY = 0;
    startX = 0;
  }
}

function closePostPreview() {
  const modal = document.getElementById('previewModal');
  const container = document.getElementById('previewContainer');
  modal.classList.remove('active');
  document.getElementById('previewImage').style.backgroundImage = '';
  document.body.style.overflow = '';
  const sug = document.getElementById('venueSuggestions');
  if (sug) sug.style.display = 'none';
  if (container) { container.style.transform = ''; container.style.transition = ''; }
  const overlay = document.querySelector('.swipe-overlay');
  if (overlay) overlay.classList.remove('fading');
  delete modal.dataset.imageData;
  state.selectedVenueId = null; state.selectedVenue = null;
}

function setupVenueSearch() {
  const input = document.getElementById('previewVenue');
  const suggestions = document.getElementById('venueSuggestions');
  if (!input || !suggestions) return;
  let timeout;
  input.oninput = function() {
    clearTimeout(timeout);
    const q = this.value.trim();
    if (q.length < 2) { suggestions.style.display = 'none'; return; }
    timeout = setTimeout(async () => {
      const results = await searchVenuesOSM(q);
      if (results.length === 0) { suggestions.style.display = 'none'; return; }
      suggestions.innerHTML = results.map(v => `
        <div class="venue-suggestion-item" data-venue='${JSON.stringify(v).replace(/'/g,"&#39;")}'>
          <i class="fa-solid fa-location-dot"></i>
          <div><strong>${escapeHtml(v.name)}</strong><br><small>${escapeHtml(v.address?.split(',').slice(0,2).join(',')||'')}</small></div>
        </div>
      `).join('');
      suggestions.style.display = 'block';
      suggestions.querySelectorAll('.venue-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const v = JSON.parse(item.dataset.venue);
          input.value = v.name;
          state.selectedVenue = v;
          state.selectedVenueId = null;
          suggestions.style.display = 'none';
        });
      });
    }, 300);
  };
  document.addEventListener('click', e => {
    if (!suggestions.contains(e.target) && e.target !== input) suggestions.style.display = 'none';
  });
}

async function submitFromPreview() {
  if (state.isUploading) return;
  const modal = document.getElementById('previewModal');
  const imageData = modal.dataset.imageData;
  const caption = document.getElementById('previewCaption').value.trim();
  const venueInput = document.getElementById('previewVenue').value.trim();
  if (!imageData) { showToast('No image','error'); return; }
  state.isUploading = true;
  const btn = document.getElementById('previewSend');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
  const hint = document.getElementById('swipeHint');
  if (hint) { hint.innerHTML = '<div class="swipe-action post-action"><i class="fa-solid fa-spinner fa-spin"></i> Posting...</div>'; hint.style.opacity = '1'; }
  try {
    let venueId = null, venueName = null;
    if (state.selectedVenue || venueInput) {
      const vData = state.selectedVenue || { name: venueInput, type: 'Bar', address: '', osm_id: null };
      const venue = await getOrCreateVenue(vData);
      if (venue) { venueId = venue.id; venueName = venue.name; }
    }
    const imageUrl = await uploadToCloudinary(imageData);
    await submitPost(imageUrl, caption, venueName, venueId);
    if (hint) hint.remove();
    closePostPreview();
    showToast('Posted! 🎉','success');
    await loadFeed(true);
    switchPage('home');
  } catch(e) {
    console.error(e);
    showToast('Failed to post. '+(e.message||''),'error');
  } finally {
    state.isUploading = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-regular fa-paper-plane"></i>'; }
    if (hint) {
      hint.innerHTML = '<div class="swipe-hint-up"><i class="fa-solid fa-arrow-up"></i> Post</div><div class="swipe-hint-down"><i class="fa-solid fa-arrow-down"></i> Back</div>';
      setTimeout(() => { if (hint) hint.style.opacity = '0'; }, 2000);
    }
  }
}

async function uploadToCloudinary(imageData) {
  if (imageData.startsWith('http') && !imageData.startsWith('data:')) return imageData;
  console.log('📤 Uploading to Cloudinary...');
  const response = await fetch(imageData);
  const blob = await response.blob();
  const formData = new FormData();
  formData.append('file', blob, `brev-${Date.now()}.jpg`);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'brev_posts');
  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
  const data = await uploadRes.json();
  if (!uploadRes.ok) { console.error('Cloudinary error:', data); throw new Error(data.error?.message||'Upload failed'); }
  console.log('✅ Uploaded:', data.secure_url);
  return data.secure_url;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEED RENDERER - FIXED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function loadFeed(force = false) {
  const container = document.querySelector('.feed-container');
  if (!container) return;
  try {
    await fetchPosts(force);
    if (state.posts.length === 0) { 
      showEmptyState(); 
      return; 
    }
    renderStories(state.posts);
  } catch(e) { 
    console.error('Load feed error:', e);
    showEmptyState('Failed to load'); 
  }
}

function showEmptyState(msg = 'No posts yet') {
  const container = document.querySelector('.feed-container');
  if (!container) return;
  container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;color:var(--gray-400);"><i class="fa-solid fa-wine-glass" style="font-size:48px;margin-bottom:16px;color:var(--gray-600);"></i><h2 style="font-size:20px;font-weight:700;color:var(--white);margin-bottom:8px;">${msg}</h2><p style="font-size:14px;max-width:280px;">Be the first! Tap <i class="fa-solid fa-camera"></i> to post.</p></div>`;
}

function lazyLoadImages() {
  const images = document.querySelectorAll('img[data-src]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        observer.unobserve(img);
      }
    });
  });
  images.forEach(img => observer.observe(img));
}

function renderStories(postsData) {
  const container = document.querySelector('.feed-container');
  if (!container) return;
  container.innerHTML = '';
  postsData.forEach((post, i) => {
    container.appendChild(createStoryCard(post, i, postsData));
  });
  state.currentStoryIndex = 0;
  showStory(0);
  requestAnimationFrame(() => {
    initStoryNavigation();
  });
}

function createStoryCard(post, index, allPosts) {
  const div = document.createElement('div');
  div.className = `story-card ${index === 0 ? 'active' : ''}`;
  div.dataset.index = index;
  div.dataset.postId = post.id;
  div.style.backgroundImage = `url(${post.image_url})`;
  div.style.backgroundSize = 'cover';
  div.style.backgroundPosition = 'center';
  const initial = (post.poster_name || 'A').charAt(0).toUpperCase();
  const venueName = post.venue || 'Unknown venue';
  const venuePostCount = allPosts.filter(p => p.venue === post.venue).length;
  div.innerHTML = `
    <div class="story-progress">
      ${allPosts.map((_, i) => `
        <div class="bar ${i === index ? 'active' : ''}">
          <div class="fill" ${i < index ? 'style="width:100%"' : ''}></div>
        </div>
      `).join('')}
    </div>
    <div class="story-header">
      <div class="story-avatar">${initial}</div>
      <div class="story-meta">
        <span class="story-name">${escapeHtml(post.poster_name)}</span>
        <span class="story-venue">
          <i class="fa-solid fa-location-dot" style="font-size:11px;color:rgba(255,255,255,0.5);margin-right:2px;"></i>
          ${escapeHtml(venueName)}
        </span>
      </div>
      <span class="story-time">${timeAgo(post.created_at)}</span>
    </div>
    <div class="story-caption">${escapeHtml(post.caption || '')}</div>
    <div class="story-actions">
      <button class="action-btn like-btn" data-post-id="${post.id}">
        <i class="fa-regular fa-heart"></i>
        <span>${post.likes_count || 0}</span>
      </button>
      <button class="action-btn comment-btn" data-post-id="${post.id}">
        <i class="fa-regular fa-comment"></i>
        <span>${post.comments_count || 0}</span>
      </button>
      <button class="action-btn share-btn" data-post-id="${post.id}">
        <i class="fa-regular fa-paper-plane"></i>
      </button>
    </div>
    <div class="story-venue-tag" data-venue-id="${post.venue_id || ''}" data-venue="${escapeHtml(venueName)}">
      <i class="fa-solid fa-location-dot"></i> ${escapeHtml(venueName)} · ${venuePostCount} posts
    </div>
  `;
  return div;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STORY NAVIGATION - FULLY FIXED (No scroll blocking)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function initStoryNavigation() {
  const container = document.querySelector('.feed-container');
  if (!container) return;
  
  const newContainer = container.cloneNode(true);
  container.parentNode?.replaceChild(newContainer, container);
  
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let isHorizontalSwipe = false;
  
  // ─── TOUCH EVENTS ───
  newContainer.addEventListener('touchstart', function(e) {
    // Ignore if touching buttons or inputs
    if (e.target.closest('button') || e.target.closest('input')) {
      isSwiping = false;
      return;
    }
    
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      isSwiping = true;
      isHorizontalSwipe = false;
    }
  }, { passive: true });
  
  newContainer.addEventListener('touchmove', function(e) {
    if (!isSwiping || e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    // Only handle horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 15) {
      e.preventDefault();
      isHorizontalSwipe = true;
      
      const activeCard = newContainer.querySelector('.story-card.active');
      if (activeCard) {
        const translateX = deltaX > 0 ? Math.min(deltaX, 100) : Math.max(deltaX, -100);
        activeCard.style.transform = `translateX(${translateX}px)`;
        activeCard.style.opacity = 1 - Math.min(Math.abs(translateX) / 300, 0.5);
        activeCard.style.transition = 'none';
      }
    }
    // If it's a vertical swipe, we do nothing - allow scrolling
  }, { passive: false });
  
  newContainer.addEventListener('touchend', function(e) {
    if (!isSwiping) {
      isSwiping = false;
      return;
    }
    
    isSwiping = false;
    
    // Only process if we actually did a horizontal swipe
    if (!isHorizontalSwipe) {
      touchStartX = 0;
      touchStartY = 0;
      return;
    }
    
    const activeCard = newContainer.querySelector('.story-card.active');
    if (!activeCard) {
      touchStartX = 0;
      touchStartY = 0;
      return;
    }
    
    const transform = activeCard.style.transform || 'translateX(0px)';
    const match = transform.match(/translateX\(([-\d.]+)px\)/);
    const deltaX = match ? parseFloat(match[1]) : 0;
    
    if (Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        const prevIndex = state.currentStoryIndex - 1;
        if (prevIndex >= 0) {
          goToStory(prevIndex);
        }
      } else {
        const nextIndex = state.currentStoryIndex + 1;
        const totalCards = newContainer.querySelectorAll('.story-card').length;
        if (nextIndex < totalCards) {
          goToStory(nextIndex);
        }
      }
    }
    
    activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    activeCard.style.transform = 'translateX(0px)';
    activeCard.style.opacity = '1';
    
    setTimeout(() => {
      activeCard.style.transition = '';
    }, 300);
    
    touchStartX = 0;
    touchStartY = 0;
    isHorizontalSwipe = false;
  }, { passive: true });
  
  // ─── MOUSE EVENTS ───
  let mouseStartX = 0;
  let isMouseDown = false;
  let mouseSwiping = false;
  
  newContainer.addEventListener('mousedown', function(e) {
    if (e.target.closest('button') || e.target.closest('input')) return;
    mouseStartX = e.clientX;
    isMouseDown = true;
    mouseSwiping = false;
  });
  
  newContainer.addEventListener('mousemove', function(e) {
    if (!isMouseDown) return;
    const deltaX = e.clientX - mouseStartX;
    if (Math.abs(deltaX) > 15) {
      mouseSwiping = true;
      const activeCard = newContainer.querySelector('.story-card.active');
      if (activeCard) {
        const translateX = deltaX > 0 ? Math.min(deltaX, 100) : Math.max(deltaX, -100);
        activeCard.style.transform = `translateX(${translateX}px)`;
        activeCard.style.opacity = 1 - Math.min(Math.abs(translateX) / 300, 0.5);
        activeCard.style.transition = 'none';
      }
    }
  });
  
  newContainer.addEventListener('mouseup', function(e) {
    if (!isMouseDown) {
      isMouseDown = false;
      return;
    }
    
    isMouseDown = false;
    
    if (!mouseSwiping) {
      mouseSwiping = false;
      return;
    }
    
    const deltaX = e.clientX - mouseStartX;
    const activeCard = newContainer.querySelector('.story-card.active');
    if (!activeCard) {
      mouseSwiping = false;
      return;
    }
    
    if (Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        const prevIndex = state.currentStoryIndex - 1;
        if (prevIndex >= 0) goToStory(prevIndex);
      } else {
        const nextIndex = state.currentStoryIndex + 1;
        const totalCards = newContainer.querySelectorAll('.story-card').length;
        if (nextIndex < totalCards) goToStory(nextIndex);
      }
    }
    
    activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    activeCard.style.transform = 'translateX(0px)';
    activeCard.style.opacity = '1';
    
    setTimeout(() => {
      activeCard.style.transition = '';
    }, 300);
    
    mouseStartX = 0;
    mouseSwiping = false;
  });
  
  setupCardActions(newContainer);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SETUP CARD ACTIONS - FIXED (Like button now works)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupCardActions(container) {
  // ─── LIKE BUTTON ───
  container.querySelectorAll('.like-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode?.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', async function(e) {
      e.stopPropagation();
      e.preventDefault();
      
      // Check if user is guest
      if (isGuest()) {
        showToast('Sign in to like ❤️', 'error');
        return;
      }
      
      const postId = this.dataset.postId;
      if (!postId) return;
      
      const icon = this.querySelector('i');
      const countSpan = this.querySelector('span');
      const wasLiked = icon.classList.contains('fa-solid');
      
      // Optimistic update
      if (wasLiked) {
        icon.className = 'fa-regular fa-heart';
        icon.style.color = '';
        if (countSpan) countSpan.textContent = Math.max(0, parseInt(countSpan.textContent) - 1);
      } else {
        icon.className = 'fa-solid fa-heart';
        icon.style.color = '#ff3040';
        if (countSpan) countSpan.textContent = (parseInt(countSpan.textContent) || 0) + 1;
      }
      
      try {
        const result = await likePost(postId);
        const post = state.posts.find(p => p.id === postId);
        if (post && countSpan) {
          countSpan.textContent = post.likes_count || 0;
        }
        if (result.liked) {
          icon.className = 'fa-solid fa-heart';
          icon.style.color = '#ff3040';
        } else {
          icon.className = 'fa-regular fa-heart';
          icon.style.color = '';
        }
      } catch (error) {
        console.error('Like error:', error);
        const post = state.posts.find(p => p.id === postId);
        if (post && countSpan) {
          countSpan.textContent = post.likes_count || 0;
        }
        if (wasLiked) {
          icon.className = 'fa-solid fa-heart';
          icon.style.color = '#ff3040';
        } else {
          icon.className = 'fa-regular fa-heart';
          icon.style.color = '';
        }
        showToast('Failed to like. Try again.', 'error');
      }
    });
  });
  
  // ─── COMMENT BUTTON ───
  container.querySelectorAll('.comment-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode?.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      const postId = this.dataset.postId;
      if (postId) openCommentsModal(postId);
    });
  });
  
  // ─── SHARE BUTTON ───
  container.querySelectorAll('.share-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode?.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', async function(e) {
      e.stopPropagation();
      e.preventDefault();
      const post = state.posts.find(x => x.id === this.dataset.postId);
      if (!post) return;
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Check out this post on Brev',
            text: post.caption || 'Check out this venue!',
            url: post.image_url
          });
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('Share error:', err);
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(post.image_url);
          showToast('Link copied! 📋', 'success');
        } catch (err) {
          showToast('Copy this: ' + post.image_url, 'info');
        }
      }
    });
  });
  
  // ─── VENUE TAG ───
  container.querySelectorAll('.story-venue-tag').forEach(tag => {
    const newTag = tag.cloneNode(true);
    tag.parentNode?.replaceChild(newTag, tag);
    
    newTag.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      const venueId = this.dataset.venueId;
      if (venueId) {
        openVenueProfile(venueId);
      } else {
        showToast('Venue details coming soon', 'info');
      }
    });
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHOW STORY - FIXED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function showStory(index) {
  const cards = document.querySelectorAll('.story-card');
  const bars = document.querySelectorAll('.story-progress .bar');
  if (cards.length === 0) return;
  if (index < 0) index = 0;
  if (index >= cards.length) index = cards.length - 1;
  cards.forEach((c, i) => {
    c.classList.toggle('active', i === index);
    c.style.transform = 'translateX(0px)';
    c.style.opacity = '1';
    c.style.transition = '';
  });
  bars.forEach((bar, i) => {
    bar.classList.toggle('active', i === index);
    const fill = bar.querySelector('.fill');
    if (fill) {
      if (i === index) {
        fill.style.animation = 'none';
        void fill.offsetHeight;
        fill.style.animation = 'progressFill 5s linear forwards';
      } else if (i < index) {
        fill.style.animation = 'none';
        fill.style.width = '100%';
      } else {
        fill.style.animation = 'none';
        fill.style.width = '0%';
      }
    }
  });
  state.currentStoryIndex = index;
  if (document.getElementById('home')?.classList.contains('active')) {
    resetAutoTimer();
  }
}

function goToStory(index) {
  clearAutoTimer();
  const totalCards = document.querySelectorAll('.story-card').length;
  if (totalCards === 0) return;
  if (index < 0) index = 0;
  if (index >= totalCards) index = totalCards - 1;
  if (index === state.currentStoryIndex) return;
  const currentCard = document.querySelector('.story-card.active');
  if (currentCard) {
    const direction = index > state.currentStoryIndex ? -1 : 1;
    currentCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    currentCard.style.transform = `translateX(${direction * 60}px)`;
    currentCard.style.opacity = '0.5';
    setTimeout(() => {
      showStory(index);
    }, 300);
  } else {
    showStory(index);
  }
}

function resetAutoTimer() {
  clearAutoTimer();
  const homePage = document.getElementById('home');
  if (!homePage?.classList.contains('active')) return;
  const cards = document.querySelectorAll('.story-card');
  if (cards.length === 0) return;
  state.autoTimer = setTimeout(() => {
    const nextIndex = state.currentStoryIndex + 1;
    if (nextIndex < cards.length) {
      goToStory(nextIndex);
    } else {
      goToStory(0);
    }
  }, 5000);
}

function clearAutoTimer() {
  if (state.autoTimer) {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function openCommentsModal(postId) {
  const modal = document.getElementById('commentsModal');
  const list = document.getElementById('commentsList');
  if (list) list.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner"></div></div>';
  const input = document.getElementById('commentInput');
  if (input) input.value = '';
  modal.dataset.postId = postId;
  modal.classList.add('active'); document.body.style.overflow = 'hidden';
  loadComments(postId);
}

function closeCommentsModal() { 
  document.getElementById('commentsModal').classList.remove('active'); 
  document.body.style.overflow = ''; 
}

async function loadComments(postId) {
  const list = document.getElementById('commentsList');
  if (!list) return;
  try {
    const comments = await fetchComments(postId);
    if (comments.length === 0) { 
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400);"><p>No comments yet</p></div>'; 
      return; 
    }
    list.innerHTML = comments.map(c => `
      <div class="comment-item">
        <div class="comment-avatar">${(c.profiles?.full_name||c.profiles?.username||'U').charAt(0).toUpperCase()}</div>
        <div class="comment-content">
          <div class="comment-header">
            <span class="comment-name">${escapeHtml(c.profiles?.full_name||c.profiles?.username||'User')}</span>
            <span class="comment-time">${timeAgo(c.created_at)}</span>
          </div>
          <p class="comment-text">${escapeHtml(c.text)}</p>
        </div>
      </div>
    `).join('');
    list.scrollTop = list.scrollHeight;
  } catch(e) { 
    list.innerHTML = '<p style="text-align:center;color:var(--gray-400);">Failed to load comments</p>'; 
  }
}

async function submitComment() {
  const modal = document.getElementById('commentsModal');
  const input = document.getElementById('commentInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text || isGuest()) { 
    if(isGuest()) showToast('Sign in to comment','error'); 
    return; 
  }
  const btn = document.getElementById('commentSubmit');
  if (btn) btn.disabled = true;
  try { 
    await addComment(modal.dataset.postId, text); 
    input.value = ''; 
    await loadComments(modal.dataset.postId); 
  }
  catch(e) { 
    showToast('Failed to comment','error'); 
  }
  finally { 
    if (btn) btn.disabled = false; 
    input.focus(); 
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENUE PROFILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function openVenueProfile(venueId) {
  const modal = document.getElementById('venueProfileModal');
  if (!modal) return;
  const venue = state.venues.find(v=>v.id==venueId) || await fetch(`${SUPABASE_URL}/rest/v1/venues?id=eq.${venueId}&select=*`,{headers:supabaseHeaders()}).then(r=>r.ok?r.json():[]).then(d=>d[0]||null);
  if (!venue) { showToast('Venue not found','error'); return; }
  const titleEl = document.getElementById('venueProfileTitle');
  const addrEl = document.getElementById('venueProfileAddress');
  if (titleEl) titleEl.textContent = venue.name;
  if (addrEl) addrEl.innerHTML = venue.address ? `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(venue.address)}` : '';
  const posts = await getVenuePosts(venueId);
  const vpPostCount = document.getElementById('vpPostCount');
  const vpFollowerCount = document.getElementById('vpFollowerCount');
  if (vpPostCount) vpPostCount.textContent = posts.length;
  if (vpFollowerCount) vpFollowerCount.textContent = venue.followers_count || 0;
  const saved = !isGuest() ? await isVenueSaved(venueId) : false;
  const saveBtn = document.getElementById('venueProfileSave');
  if (saveBtn) {
    saveBtn.className = saved ? 'venue-profile-save saved' : 'venue-profile-save';
    saveBtn.innerHTML = saved ? '<i class="fa-solid fa-bookmark"></i>' : '<i class="fa-regular fa-bookmark"></i>';
    saveBtn.onclick = async () => {
      const r = await toggleSaveVenue(venueId);
      saveBtn.className = r.saved ? 'venue-profile-save saved' : 'venue-profile-save';
      saveBtn.innerHTML = r.saved ? '<i class="fa-solid fa-bookmark"></i>' : '<i class="fa-regular fa-bookmark"></i>';
      showToast(r.saved ? 'Venue saved! 📌' : 'Venue removed','info');
    };
  }
  const postsGrid = document.getElementById('venueProfilePosts');
  if (postsGrid) {
    if (posts.length===0) { postsGrid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray-400);">No posts at this venue yet</div>'; }
    else {
      postsGrid.innerHTML = posts.map(p => `<div class="vp-post" style="background-image:url(${p.image_url})" data-post-id="${p.id}"></div>`).join('');
      postsGrid.querySelectorAll('.vp-post').forEach(el => el.addEventListener('click', () => {
        closeVenueProfile();
        const idx = state.posts.findIndex(x=>x.id===el.dataset.postId);
        if (idx>=0) { switchPage('home'); setTimeout(()=>showStory(idx),100); }
      }));
    }
  }
  modal.classList.add('active'); document.body.style.overflow = 'hidden';
}

function closeVenueProfile() { 
  const m=document.getElementById('venueProfileModal'); 
  if(m){m.classList.remove('active');document.body.style.overflow='';} 
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NAVIGATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function switchPage(pageId) {
  const pages = { home:document.getElementById('home'), search:document.getElementById('search'), venues:document.getElementById('venues'), profile:document.getElementById('profile') };
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===pageId));
  Object.entries(pages).forEach(([k,el])=>{ if(el)el.classList.toggle('active',k===pageId); });
  clearAutoTimer();
  if (pageId==='home') loadFeed();
  else if (pageId==='profile') renderProfile();
  else if (pageId==='venues') renderVenues();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENUES PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function renderVenues() {
  const list = document.getElementById('venueList');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner"></div></div>';
  try {
    const pos = await new Promise((resolve) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude}),()=>resolve(null),{timeout:5000,enableHighAccuracy:false});
      } else resolve(null);
    });
    if (pos) {
      const osmVenues = await fetchNearbyVenuesOSM(pos.lat, pos.lng);
      for (const v of osmVenues) { await getOrCreateVenue(v).catch(()=>{}); }
    }
  } catch(e) { console.warn('Could not fetch nearby venues:', e); }
  const venues = await fetchVenues();
  if (venues.length===0) {
    list.innerHTML = `<div style="padding:60px 20px;text-align:center;color:var(--gray-400);"><i class="fa-solid fa-location-dot" style="font-size:40px;margin-bottom:12px;color:var(--gray-600);display:block;"></i><p style="font-size:14px;margin-bottom:8px;">No venues found nearby</p><p style="font-size:12px;">Enable location or search for venues manually</p><button onclick="switchPage('search')" style="margin-top:16px;padding:10px 20px;background:var(--accent);border:none;border-radius:20px;color:white;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;"><i class="fa-solid fa-magnifying-glass"></i> Search Venues</button></div>`;
    return;
  }
  list.innerHTML = venues.map(v => `
    <div class="venue-card" data-venue-id="${v.id}">
      <div class="venue-card-header"><span class="name">${escapeHtml(v.name)} <span class="type">· ${escapeHtml(v.type||'Bar')}</span></span><span class="post-count"><span>${v.posts_count||0}</span> posts</span></div>
      ${v.address?`<div style="padding:0 16px 10px;font-size:12px;color:var(--gray-600);"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(v.address?.split(',').slice(0,3).join(',')||'')}</div>`:''}
      <div class="venue-stats"><span class="stat"><i class="fa-solid fa-martini-glass"></i> <span class="num">${escapeHtml(v.type||'Bar')}</span></span><span class="stat"><i class="fa-solid fa-bookmark"></i> <span class="num">${v.followers_count||0} saved</span></span></div>
    </div>
  `).join('');
  list.querySelectorAll('.venue-card').forEach(card=>card.addEventListener('click',()=>openVenueProfile(card.dataset.venueId)));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupSearchInput() {
  const input = document.querySelector('.search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => {
      handleSearch(input.value);
    }, 300);
  });
}

async function handleSearch(query) {
  const grid = document.getElementById('searchGrid');
  if (!grid) return;
  if (!query.trim()) { renderSearchSuggestions(); return; }
  grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;"><div class="spinner"></div></div>';
  try {
    const results = await searchVenuesOSM(query);
    if (results.length === 0) { 
      grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>No results found</p></div>'; 
      return; 
    }
    const icons = ['fa-martini-glass','fa-beer-mug-empty','fa-whiskey-glass','fa-wine-glass','fa-champagne-glasses'];
    grid.innerHTML = results.slice(0,12).map((v,i)=>`<div class="search-grid-item" data-venue='${JSON.stringify(v).replace(/'/g,"&#39;")}'><div class="placeholder"><i class="fa-solid ${icons[i%icons.length]}" style="font-size:24px;color:var(--gray-600);"></i></div><div class="venue-label">${escapeHtml(v.name)}</div></div>`).join('');
    grid.querySelectorAll('.search-grid-item').forEach(item=>{
      item.addEventListener('click', async () => {
        try {
          const v = JSON.parse(item.dataset.venue);
          const venue = await getOrCreateVenue(v);
          if (venue) openVenueProfile(venue.id);
        } catch (e) {
          console.error('Venue click error:', e);
          showToast('Could not load venue', 'error');
        }
      });
    });
  } catch (error) {
    console.error('Search error:', error);
    grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>Search failed. Please try again.</p></div>';
  }
}

function renderSearchSuggestions() {
  const grid = document.getElementById('searchGrid');
  if (!grid) return;
  const names = [...new Set(state.posts.map(p=>p.venue).filter(Boolean))].slice(0,12);
  if (names.length===0) { grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>No suggestions yet</p></div>'; return; }
  const icons = ['fa-martini-glass','fa-beer-mug-empty','fa-whiskey-glass','fa-wine-glass','fa-champagne-glasses','fa-wine-bottle'];
  grid.innerHTML = names.map((n,i)=>`<div class="search-grid-item" data-venue-name="${escapeHtml(n)}"><div class="placeholder"><i class="fa-solid ${icons[i%icons.length]}" style="font-size:24px;color:var(--gray-600);"></i></div><div class="venue-label">${escapeHtml(n)}</div></div>`).join('');
  grid.querySelectorAll('.search-grid-item').forEach(item=>item.addEventListener('click',async()=>{const v=await getOrCreateVenue({name:item.dataset.venueName,type:'Bar',address:'',osm_id:null});if(v)openVenueProfile(v.id);}));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROFILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function renderProfile() {
  const u = getUser();
  if (!u) return;
  const profile = await fetchProfile(u.id);
  const counts = await getFollowCounts(u.id);
  const avatarEl = document.getElementById('profileAvatar');
  if (avatarEl) avatarEl.textContent = (profile?.full_name||profile?.username||'U').charAt(0).toUpperCase();
  const nameEl=document.getElementById('profileName'),handleEl=document.getElementById('profileHandle'),bioEl=document.getElementById('profileBio');
  if(nameEl)nameEl.textContent=profile?.full_name||profile?.username||'User';
  if(handleEl)handleEl.textContent=`@${profile?.username||'user'}`;
  if(bioEl)bioEl.textContent=profile?.bio||'';
  const sf=document.getElementById('statFollowers'),sg=document.getElementById('statFollowing');
  if(sf)sf.textContent=counts.followers;
  if(sg)sg.textContent=counts.following;
  if (state.profileTab==='posts') await renderProfilePosts(u.id);
  else await renderProfileSavedVenues(u.id);
}

async function renderProfilePosts(userId) {
  const posts=await fetchUserPosts(userId);
  const grid=document.getElementById('profilePostGrid'),vg=document.getElementById('profileVenuesGrid');
  if(grid)grid.style.display='grid';if(vg)vg.style.display='none';
  document.querySelectorAll('.profile-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='posts'));
  if(!grid)return;
  if(posts.length===0){grid.innerHTML='<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>No posts yet</p></div>';return;}
  grid.innerHTML=posts.map(p=>`<div class="item" style="background-image:url(${p.image_url});background-size:cover;background-position:center;" data-post-id="${p.id}"><div class="item-overlay"><span><i class="fa-solid fa-heart"></i> ${p.likes_count||0}</span><span><i class="fa-solid fa-comment"></i> ${p.comments_count||0}</span></div></div>`).join('');
  grid.querySelectorAll('.item').forEach(el=>el.addEventListener('click',()=>{const idx=state.posts.findIndex(x=>x.id===el.dataset.postId);if(idx>=0){switchPage('home');setTimeout(()=>showStory(idx),100);}}));
}

async function renderProfileSavedVenues(userId) {
  const venues=await fetchSavedVenues(userId);
  const grid=document.getElementById('profilePostGrid'),vg=document.getElementById('profileVenuesGrid');
  if(grid)grid.style.display='none';if(vg)vg.style.display='grid';
  document.querySelectorAll('.profile-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='venues'));
  if(!vg)return;
  if(venues.length===0){vg.innerHTML='<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>No saved venues</p></div>';return;}
  vg.innerHTML=venues.map(v=>`<div class="saved-venue-card" data-venue-id="${v.id}"><div class="sv-name">${escapeHtml(v.name)}</div><div class="sv-type">${escapeHtml(v.type||'Bar')}</div><div class="sv-posts">${v.posts_count||0} posts</div></div>`).join('');
  vg.querySelectorAll('.saved-venue-card').forEach(card=>card.addEventListener('click',()=>openVenueProfile(card.dataset.venueId)));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SETTINGS & EDIT PROFILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupSettingsDropdown() {
  const btn=document.getElementById('profileSettingsBtn'),dd=document.getElementById('settingsDropdown');
  if(!btn||!dd)return;
  btn.addEventListener('click',e=>{e.stopPropagation();dd.classList.toggle('active');});
  document.addEventListener('click',e=>{if(!dd.contains(e.target)&&e.target!==btn)dd.classList.remove('active');});
  document.getElementById('settingsEditProfile')?.addEventListener('click',()=>{dd.classList.remove('active');if(isGuest()){showToast('Sign in','error');return;}openEditProfile();});
  document.getElementById('settingsSaved')?.addEventListener('click',()=>{dd.classList.remove('active');switchPage('profile');state.profileTab='venues';renderProfile();});
  document.getElementById('settingsHelp')?.addEventListener('click',()=>{dd.classList.remove('active');window.open('help.html','_blank');});
  document.getElementById('settingsPrivacy')?.addEventListener('click',()=>{dd.classList.remove('active');window.open('privacy.html','_blank');});
  document.getElementById('settingsLogout')?.addEventListener('click',async()=>{dd.classList.remove('active');await signOut();resetAuthForms();checkAuth();showToast('Logged out','info');});
}

function openEditProfile() {
  const m=document.getElementById('editProfileModal');if(!m)return;
  document.getElementById('editFullName').value=document.getElementById('profileName')?.textContent||'';
  document.getElementById('editUsername').value=document.getElementById('profileHandle')?.textContent?.replace('@','')||'';
  document.getElementById('editBio').value=document.getElementById('profileBio')?.textContent||'';
  document.getElementById('editAvatarPreview').textContent=(document.getElementById('editFullName').value||'U').charAt(0).toUpperCase();
  m.classList.add('active');document.body.style.overflow='hidden';
  setTimeout(()=>document.getElementById('editFullName').focus(),300);
}

function closeEditProfile(){const m=document.getElementById('editProfileModal');if(m){m.classList.remove('active');document.body.style.overflow='';}}

async function saveProfile(){
  const fn=document.getElementById('editFullName').value.trim(),un=document.getElementById('editUsername').value.trim(),bio=document.getElementById('editBio').value.trim();
  if(!un||un.length<3){showToast('Username min 3 chars','error');return;}
  const btn=document.getElementById('saveProfileBtn');if(btn){btn.disabled=true;btn.textContent='Saving...';}
  try{await updateProfile({full_name:fn||un,username:un,bio:bio||null});closeEditProfile();await renderProfile();showToast('Profile updated!','success');}
  catch(e){showToast('Failed to save','error');}
  finally{if(btn){btn.disabled=false;btn.textContent='Save';}}
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function resetAuthForms(){
  const su=document.getElementById('signUpForm'),si=document.getElementById('signInForm'),ec=document.getElementById('emailConfirmation'),swu=document.getElementById('authSwitchSignUp'),swi=document.getElementById('authSwitchSignIn');
  if(su)su.style.display='flex';if(si)si.style.display='none';if(ec)ec.style.display='none';if(swu)swu.style.display='block';if(swi)swi.style.display='none';
}

function showEmailConfirmation(email){
  const su=document.getElementById('signUpForm'),si=document.getElementById('signInForm'),ec=document.getElementById('emailConfirmation'),swu=document.getElementById('authSwitchSignUp'),swi=document.getElementById('authSwitchSignIn'),es=document.getElementById('confirmEmailAddress');
  if(su)su.style.display='none';if(si)si.style.display='none';if(ec)ec.style.display='flex';if(swu)swu.style.display='none';if(swi)swi.style.display='none';if(es)es.textContent=email;
}

function setupAuthUI(){
  document.querySelectorAll('.auth-password-toggle').forEach(b=>b.addEventListener('click',function(e){e.preventDefault();const i=document.getElementById(this.dataset.target),ic=this.querySelector('i');if(!i||!ic)return;if(i.type==='password'){i.type='text';ic.classList.replace('fa-eye','fa-eye-slash');}else{i.type='password';ic.classList.replace('fa-eye-slash','fa-eye');}}));
  document.getElementById('showSignIn')?.addEventListener('click',e=>{e.preventDefault();const su=document.getElementById('signUpForm'),si=document.getElementById('signInForm'),ec=document.getElementById('emailConfirmation'),swu=document.getElementById('authSwitchSignUp'),swi=document.getElementById('authSwitchSignIn');if(su)su.style.display='none';if(si)si.style.display='flex';if(ec)ec.style.display='none';if(swu)swu.style.display='none';if(swi)swi.style.display='block';});
  document.getElementById('showSignUp')?.addEventListener('click',e=>{e.preventDefault();resetAuthForms();});
  document.getElementById('backToSignInFromConfirm')?.addEventListener('click',e=>{e.preventDefault();const ec=document.getElementById('emailConfirmation'),si=document.getElementById('signInForm'),swi=document.getElementById('authSwitchSignIn'),swu=document.getElementById('authSwitchSignUp');if(ec)ec.style.display='none';if(si)si.style.display='flex';if(swi)swi.style.display='block';if(swu)swu.style.display='none';});
  document.getElementById('resendConfirmation')?.addEventListener('click',async function(e){e.preventDefault();const email=document.getElementById('confirmEmailAddress')?.textContent,btn=e.currentTarget,bt=btn?.querySelector('.btn-text'),bl=btn?.querySelector('.btn-loader');btn.disabled=true;if(bt)bt.style.display='none';if(bl)bl.style.display='inline-flex';try{await resendConfirmationEmail(email);showToast('Email resent! 📧','success');}catch{showToast('Failed to resend','error');}finally{btn.disabled=false;if(bt)bt.style.display='';if(bl)bl.style.display='none';}});
  document.getElementById('signUpForm')?.addEventListener('submit',async function(e){e.preventDefault();const btn=document.getElementById('signUpBtn');if(btn?.disabled)return;const email=document.getElementById('signUpEmail')?.value?.trim(),password=document.getElementById('signUpPassword')?.value,username=document.getElementById('signUpUsername')?.value?.trim(),fullName=document.getElementById('signUpFullName')?.value?.trim();if(!email||!password||!username){showToast('Fill all fields','error');return;}if(password.length<6){showToast('Password 6+ chars','error');return;}const bt=btn?.querySelector('.btn-text'),bl=btn?.querySelector('.btn-loader');if(btn)btn.disabled=true;if(bt)bt.style.display='none';if(bl)bl.style.display='inline-flex';try{await signUp(email,password,username,fullName);checkAuth();await initApp();hideLoadingScreen();showToast('Account created! 🎉','success');}catch(err){if(err.message==='EMAIL_CONFIRMATION_REQUIRED')showEmailConfirmation(email);else showToast(err.message||'Failed','error');if(btn)btn.disabled=false;if(bt)bt.style.display='';if(bl)bl.style.display='none';}});
  document.getElementById('signInForm')?.addEventListener('submit',async function(e){e.preventDefault();const email=document.getElementById('signInEmail')?.value?.trim(),password=document.getElementById('signInPassword')?.value;if(!email||!password){showToast('Enter email and password','error');return;}const btn=document.getElementById('signInBtn'),bt=btn?.querySelector('.btn-text'),bl=btn?.querySelector('.btn-loader');if(btn)btn.disabled=true;if(bt)bt.style.display='none';if(bl)bl.style.display='inline-flex';try{await signIn(email,password);checkAuth();await initApp();hideLoadingScreen();showToast('Welcome back!','success');}catch(err){showToast(err.message||'Failed','error');if(btn)btn.disabled=false;if(bt)bt.style.display='';if(bl)bl.style.display='none';}});
  document.getElementById('guestBrowse')?.addEventListener('click',async function(e){e.preventDefault();
    const guestId = getGuestId();
    saveUser({
      id: guestId,
      email: `guest_${guestId}@brev.local`,
      user_metadata: { full_name: 'Guest', username: 'guest' },
      is_guest: true
    });
    const ec=document.getElementById('emailConfirmation');if(ec)ec.style.display='none';saveSession({access_token:null,expires_at:null});checkAuth();await initApp();hideLoadingScreen();showToast('Browsing as guest 👀','info');
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function timeAgo(ts){if(!ts)return'Just now';const s=Math.floor((new Date()-new Date(ts))/1000);if(s<0)return'Just now';if(s<60)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m';const h=Math.floor(m/60);if(h<24)return h+'h';const d=Math.floor(h/24);if(d<7)return d+'d';return new Date(ts).toLocaleDateString();}

function escapeHtml(t){if(!t)return'';const d=document.createElement('div');d.textContent=t;return d.innerHTML;}

function showToast(msg,type='info'){const existing=document.querySelector('.toast');if(existing)existing.remove();const t=document.createElement('div');t.className=`toast ${type}`;t.textContent=msg;document.body.appendChild(t);requestAnimationFrame(()=>t.classList.add('show'));const timeout=setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),350);},3000);t.addEventListener('click',()=>{clearTimeout(timeout);t.classList.remove('show');setTimeout(()=>t.remove(),350);});}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SETUP & INIT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupCamera(){
  const cm=document.getElementById('cameraModal'),cc=document.querySelector('.camera-container');
  document.querySelectorAll('[data-page="camera"]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openCamera();}));
  document.getElementById('cameraCapture')?.addEventListener('click',e=>{e.preventDefault();capturePhoto();});
  document.getElementById('cameraGallery')?.addEventListener('click',e=>{e.preventDefault();selectFromGallery();});
  document.getElementById('galleryInput')?.addEventListener('change',handleGallerySelect);
  document.getElementById('cameraFlip')?.addEventListener('click',e=>{e.preventDefault();flipCamera();});
  if(cc){let sy=0,mv=false;cc.addEventListener('touchstart',e=>{if(e.touches.length===1){sy=e.touches[0].clientY;mv=false;}},{passive:true});cc.addEventListener('touchmove',e=>{if(e.touches.length===1){const d=e.touches[0].clientY-sy;if(d>10){mv=true;e.preventDefault();cc.style.transform=`translateY(${d}px)`;cc.style.transition='none';cc.style.opacity=Math.max(0,1-d/400);}}},{passive:false});cc.addEventListener('touchend',()=>{const d=mv?parseFloat(cc.style.transform.replace('translateY(','').replace('px)','')||0):0;if(d>150){cc.style.transition='transform .25s ease,opacity .25s ease';cc.style.transform='translateY(100%)';cc.style.opacity='0';setTimeout(()=>{cc.style.transform='';cc.style.opacity='';cc.style.transition='';closeCamera();},250);}else{cc.style.transition='transform .3s ease,opacity .3s ease';cc.style.transform='';cc.style.opacity='';setTimeout(()=>{cc.style.transition='';},300);}sy=0;mv=false;});}
  cm?.addEventListener('click',e=>{if(e.target===cm)closeCamera();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&cm?.classList.contains('active')){e.preventDefault();closeCamera();}});
  document.querySelectorAll('.nav-item:not([data-page="camera"])').forEach(b=>b.addEventListener('click',()=>{if(cm?.classList.contains('active'))closeCamera();}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&cm?.classList.contains('active'))closeCamera();});
}

function setupPreview(){
  document.getElementById('previewBack')?.addEventListener('click',()=>{closePostPreview();setTimeout(()=>openCamera(),400);});
  document.getElementById('previewSend')?.addEventListener('click',submitFromPreview);
  document.getElementById('previewCaption')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitFromPreview();}});
  document.addEventListener('keydown',e=>{const modal=document.getElementById('previewModal');if(e.key==='Escape'&&modal?.classList.contains('active')){e.preventDefault();closePostPreview();setTimeout(()=>openCamera(),400);}});
}

function setupComments(){
  document.getElementById('commentsClose')?.addEventListener('click',closeCommentsModal);
  document.getElementById('commentsModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeCommentsModal();});
  document.getElementById('commentSubmit')?.addEventListener('click',submitComment);
  document.getElementById('commentInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitComment();}});
}

function setupVenueProfile(){
  document.getElementById('venueProfileBack')?.addEventListener('click',closeVenueProfile);
  document.getElementById('venueProfileModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeVenueProfile();});
}

function setupModalKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modals = ['cameraModal','previewModal','commentsModal','venueProfileModal','editProfileModal'];
      for (const modalId of modals) {
        const modal = document.getElementById(modalId);
        if (modal?.classList.contains('active')) {
          switch(modalId) {
            case 'cameraModal': closeCamera(); break;
            case 'previewModal': closePostPreview(); break;
            case 'commentsModal': closeCommentsModal(); break;
            case 'venueProfileModal': closeVenueProfile(); break;
            case 'editProfileModal': closeEditProfile(); break;
          }
          e.preventDefault();
          break;
        }
      }
    }
  });
}

function setupProfileTabs(){document.querySelectorAll('.profile-tab').forEach(tab=>{tab.addEventListener('click',()=>{state.profileTab=tab.dataset.tab;renderProfile();});});}

function setupNavigation(){document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.page!=='camera')switchPage(b.dataset.page);}));}

async function initApp(){
  await loadFeed();
  await renderVenues();
  renderSearchSuggestions();
  await renderProfile();
}

async function init(){
  console.log('🚀 Initializing Brev...');
  try {
    setupErrorHandling();
    setupAuthUI();
    setupNavigation();
    setupSearchInput();
    setupCamera();
    setupPreview();
    setupComments();
    setupVenueProfile();
    setupSettingsDropdown();
    setupProfileTabs();
    setupModalKeyboardNavigation();
    document.getElementById('editProfileCancel')?.addEventListener('click', closeEditProfile);
    document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfile);
    document.getElementById('editProfileBtn')?.addEventListener('click', () => {
      if (isGuest()) {
        showToast('Sign in to edit profile', 'error');
        return;
      }
      openEditProfile();
    });
    document.getElementById('editBio')?.addEventListener('input', e => {
      const c = document.querySelector('.edit-bio-count');
      if (c) c.textContent = `${e.target.value.length}/150`;
    });
    document.getElementById('editFullName')?.addEventListener('input', e => {
      const p = document.getElementById('editAvatarPreview');
      if (p) p.textContent = (e.target.value || 'U').charAt(0).toUpperCase();
    });
    document.getElementById('editAvatarBtn')?.addEventListener('click', () => showToast('Avatar upload coming soon','info'));
    document.getElementById('editProfileModal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeEditProfile();
    });
    if (checkAuth()) {
      await initApp();
    }
    hideLoadingScreen();
    if (CONFIG.ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('✅ SW registered:', reg))
        .catch(err => console.error('❌ SW registration failed:', err));
    }
    console.log('✅ Brev initialized successfully');
  } catch (error) {
    console.error('❌ Init error:', error);
    hideLoadingScreen();
    showToast('Failed to initialize. Please refresh.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);