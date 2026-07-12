// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SMYB — SUPABASE + AUTH CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;
const CLOUDINARY_CLOUD_NAME = CONFIG.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = CONFIG.CLOUDINARY_UPLOAD_PRESET;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUPABASE CLIENT (via REST API — no SDK needed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const supabaseHeaders = () => ({
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

// Auth-specific headers (includes user's JWT)
function authHeaders() {
  const session = getSession();
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${session?.access_token || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SESSION MANAGEMENT (localStorage)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function saveSession(session) {
  localStorage.setItem('smyb_session', JSON.stringify(session));
}

function getSession() {
  const raw = localStorage.getItem('smyb_session');
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    // Check if token is expired
    if (session.expires_at && Date.now() / 1000 > session.expires_at) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

function clearSession() {
  localStorage.removeItem('smyb_session');
  localStorage.removeItem('smyb_user');
}

function saveUser(user) {
  localStorage.setItem('smyb_user', JSON.stringify(user));
}

function getUser() {
  const raw = localStorage.getItem('smyb_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function signUp(email, password, username) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify({
      email,
      password,
      data: { username, full_name: username }
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.msg || err.message || 'Sign up failed');
  }

  const data = await res.json();
  saveSession(data.session || data);
  saveUser(data.user);

  return data;
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error_description || err.msg || 'Sign in failed');
  }

  const data = await res.json();
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
  };
  saveSession(session);

  // Fetch user profile
  const user = await fetchUser();
  saveUser(user);

  return { session, user };
}

async function signOut() {
  const session = getSession();
  if (session?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(),
        'Authorization': `Bearer ${session.access_token}`,
      },
    }).catch(() => {});
  }
  clearSession();
}

async function fetchUser() {
  const session = getSession();
  if (!session) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!res.ok) return null;
  return await res.json();
}

async function fetchProfile(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`,
    { headers: supabaseHeaders() }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] || null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH GUARD — Show auth page or app
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkAuth() {
  const session = getSession();
  const authPage = document.getElementById('authPage');
  const app = document.getElementById('appMain');

  if (!session) {
    // Not logged in
    if (authPage) authPage.classList.add('active');
    if (app) app.classList.remove('active');
    return false;
  }

  // Logged in
  if (authPage) authPage.classList.remove('active');
  if (app) app.classList.add('active');
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATA FUNCTIONS (using new schema)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function fetchPosts() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?select=*,profiles!posts_user_id_fkey(username,full_name,avatar_url)&order=created_at.desc`,
      { headers: supabaseHeaders() }
    );
    if (!res.ok) throw new Error('Failed to fetch posts');
    const data = await res.json();

    // Flatten the profile join
    return data.map(post => ({
      ...post,
      poster_name: post.profiles?.full_name || post.profiles?.username || 'Anonymous',
      poster_avatar: post.profiles?.avatar_url || null,
    }));
  } catch (error) {
    console.error('Fetch posts error:', error);
    return [];
  }
}

async function submitPost(imageUrl, caption, venue) {
  const user = getUser();
  if (!user) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      user_id: user.id,
      image_url: imageUrl,
      caption: (caption || '').trim().slice(0, 200),
      venue: (venue || '').trim(),
    }),
  });

  if (!res.ok) throw new Error('Failed to submit post');
  return await res.json();
}

async function fetchVenues() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/venues?select=*&order=name.asc`,
      { headers: supabaseHeaders() }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function fetchUserPosts(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/posts?select=*&user_id=eq.${userId}&order=created_at.desc&limit=20`,
    { headers: supabaseHeaders() }
  );
  if (!res.ok) return [];
  return await res.json();
}

async function searchAll(query) {
  const term = query.toLowerCase().trim();
  if (!term) return { venues: [], users: [] };

  // Search venues
  const venueRes = await fetch(
    `${SUPABASE_URL}/rest/v1/venues?select=*&name=ilike.*${encodeURIComponent(term)}*&limit=10`,
    { headers: supabaseHeaders() }
  );

  // Search profiles
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=*&or=(username.ilike.*${encodeURIComponent(term)}*,full_name.ilike.*${encodeURIComponent(term)}*)&limit=10`,
    { headers: supabaseHeaders() }
  );

  const venues = venueRes.ok ? await venueRes.json() : [];
  const users = profileRes.ok ? await profileRes.json() : [];

  return { venues, users };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CAMERA & UPLOAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let cameraStream = null;
let facingMode = 'environment';
let capturedImageData = null;

async function openCamera() {
  console.log('📷 Opening camera...');
  const modal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraFeed');
  const preview = document.getElementById('cameraPreview');

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: false,
    });
    video.srcObject = cameraStream;
    video.style.display = 'block';
    preview.style.display = 'none';
    capturedImageData = null;
    document.getElementById('cameraCapture').classList.remove('recording');
    console.log('✅ Camera started');
  } catch (error) {
    console.error('Camera error:', error);
    showToast('Unable to access camera. Please check permissions.', 'error');
    closeCamera();
  }
}

function closeCamera() {
  const modal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraFeed');
  const preview = document.getElementById('cameraPreview');

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  if (video) video.srcObject = null;
  modal.classList.remove('active');
  document.body.style.overflow = '';
  if (video) video.style.display = 'block';
  if (preview) preview.style.display = 'none';
  document.getElementById('cameraCapture')?.classList.remove('recording');
  capturedImageData = null;
}

async function capturePhoto() {
  const video = document.getElementById('cameraFeed');
  const preview = document.getElementById('cameraPreview');
  const canvas = document.createElement('canvas');
  let width = video.videoWidth || 1080;
  let height = video.videoHeight || 1920;
  const targetRatio = 9 / 16;
  const currentRatio = width / height;

  if (currentRatio > targetRatio) {
    const newWidth = height * targetRatio;
    const offsetX = (width - newWidth) / 2;
    canvas.width = newWidth;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (facingMode === 'user') { ctx.translate(newWidth, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, offsetX, 0, newWidth, height, 0, 0, newWidth, height);
  } else {
    const newHeight = width / targetRatio;
    const offsetY = (height - newHeight) / 2;
    canvas.width = width;
    canvas.height = newHeight;
    const ctx = canvas.getContext('2d');
    if (facingMode === 'user') { ctx.translate(width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, offsetY, width, newHeight, 0, 0, width, newHeight);
  }

  capturedImageData = canvas.toDataURL('image/jpeg', 0.9);

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  preview.src = capturedImageData;
  preview.style.display = 'block';
  video.style.display = 'none';
  document.getElementById('cameraCapture').classList.add('recording');

  setTimeout(() => openPostPreview(capturedImageData), 150);
}

async function selectFromGallery() {
  document.getElementById('galleryInput').click();
}

async function handleGallerySelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    capturedImageData = e.target.result;
    closeCamera();
    setTimeout(() => openPostPreview(capturedImageData), 300);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function flipCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraFeed');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: false,
    });
    video.srcObject = cameraStream;
    video.style.display = 'block';
    document.getElementById('cameraPreview').style.display = 'none';
  } catch (error) {
    showToast('Unable to switch camera.', 'error');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST PREVIEW (Snapchat style)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openPostPreview(imageData) {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  const modal = document.getElementById('previewModal');
  const preview = document.getElementById('previewImage');
  const caption = document.getElementById('previewCaption');
  const venue = document.getElementById('previewVenue');
  const charCount = document.getElementById('previewCharCount');

  preview.style.backgroundImage = `url(${imageData})`;
  caption.value = '';
  venue.value = '';
  if (charCount) charCount.textContent = '0';

  const user = getUser();
  const nameInput = document.getElementById('previewName');
  if (nameInput && user) {
    const profile = user.user_metadata || {};
    nameInput.value = profile.full_name || profile.username || user.email?.split('@')[0] || '';
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  modal.dataset.imageData = imageData;

  setTimeout(() => caption.focus(), 300);

  caption.addEventListener('input', () => {
    const len = caption.value.length;
    if (charCount) charCount.textContent = len;
    if (len > 200) {
      caption.value = caption.value.slice(0, 200);
      if (charCount) charCount.textContent = '200';
    }
  }, { once: true });
}

function closePostPreview() {
  const modal = document.getElementById('previewModal');
  const previewImage = document.getElementById('previewImage');
  modal.classList.remove('active');
  if (previewImage) previewImage.style.backgroundImage = '';
  document.body.style.overflow = '';
  delete modal.dataset.imageData;
}

async function submitFromPreview() {
  const modal = document.getElementById('previewModal');
  const imageData = modal.dataset.imageData;
  const caption = document.getElementById('previewCaption').value;
  const venue = document.getElementById('previewVenue').value;

  if (!imageData) {
    showToast('Something went wrong. Please try again.', 'error');
    return;
  }

  const sendBtn = document.getElementById('previewSend');
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  try {
    const imageUrl = await uploadToCloudinary(imageData);
    await submitPost(imageUrl, caption, venue);
    closePostPreview();
    showToast('Posted! 🎉', 'success');
    await loadFeed();
    switchPage('home');
  } catch (error) {
    console.error('Submit error:', error);
    showToast('Failed to post. Please try again.', 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fa-regular fa-paper-plane"></i>';
  }
}

async function uploadToCloudinary(imageData) {
  if (imageData.startsWith('http') && !imageData.startsWith('data:')) {
    return imageData;
  }
  const response = await fetch(imageData);
  const blob = await response.blob();
  const formData = new FormData();
  formData.append('file', blob, 'smyb-photo.jpg');
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'smyb_posts');

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );
  if (!uploadRes.ok) throw new Error('Upload to Cloudinary failed');
  const data = await uploadRes.json();
  return data.secure_url;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EVENT SETUP (Camera & Preview)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setupCamera() {
  document.querySelectorAll('[data-page="camera"]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); openCamera(); });
  });
  document.getElementById('cameraClose')?.addEventListener('click', closeCamera);
  document.getElementById('cameraCapture')?.addEventListener('click', capturePhoto);
  document.getElementById('cameraGallery')?.addEventListener('click', selectFromGallery);
  document.getElementById('galleryInput')?.addEventListener('change', handleGallerySelect);
  document.getElementById('cameraFlip')?.addEventListener('click', flipCamera);

  document.getElementById('cameraModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCamera();
  });
}

function setupPreview() {
  document.getElementById('previewBack')?.addEventListener('click', () => {
    closePostPreview();
    setTimeout(() => openCamera(), 400);
  });
  document.getElementById('previewSend')?.addEventListener('click', submitFromPreview);
  document.getElementById('previewCaption')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitFromPreview(); }
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEED RENDERER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let posts = [];
let currentStoryIndex = 0;
let autoTimer = null;

async function loadFeed() {
  posts = await fetchPosts();
  if (posts.length === 0) {
    showEmptyState();
    return;
  }
  renderStories(posts);
  currentStoryIndex = 0;
  showStory(0);
}

function renderStories(postsData) {
  const container = document.querySelector('.feed-container');
  container.innerHTML = '';
  postsData.forEach((post, index) => {
    container.appendChild(createStoryCard(post, index, postsData));
  });
  initStoryNavigation();
}

function createStoryCard(post, index, allPosts) {
  const div = document.createElement('div');
  div.className = `story-card${index === 0 ? ' active' : ''}`;
  div.dataset.index = index;
  div.style.backgroundImage = `url(${post.image_url})`;
  div.style.backgroundSize = 'cover';
  div.style.backgroundPosition = 'center';

  const initial = (post.poster_name || 'A').charAt(0).toUpperCase();
  const timeAgoText = timeAgo(post.created_at);
  const venueName = post.venue || 'Unknown venue';
  const venuePostCount = allPosts.filter(p => p.venue === post.venue).length;

  div.innerHTML = `
    <div class="story-progress">
      ${allPosts.map((_, i) => `
        <div class="bar${i === index ? ' active' : ''}">
          <div class="fill"></div>
        </div>
      `).join('')}
    </div>
    <div class="story-header">
      <div class="story-avatar">${initial}</div>
      <div class="story-meta">
        <span class="story-name">${escapeHtml(post.poster_name)}</span>
        <span class="story-venue"><i class="fa-solid fa-location-dot" style="font-size:11px;color:rgba(255,255,255,0.5);margin-right:2px;"></i>${escapeHtml(venueName)}</span>
      </div>
      <span class="story-time">${timeAgoText}</span>
    </div>
    <div class="story-caption">${escapeHtml(post.caption || '')}</div>
    <div class="story-venue-tag">
      <i class="fa-solid fa-location-dot"></i>
      ${escapeHtml(venueName)} · ${venuePostCount} posts
    </div>
    <div class="story-tap-left"></div>
    <div class="story-tap-right"></div>
  `;
  return div;
}

function showEmptyState() {
  const container = document.querySelector('.feed-container');
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;color:var(--gray-400);">
      <div style="font-size:64px;margin-bottom:16px;">🍸</div>
      <h2 style="font-size:20px;font-weight:700;color:var(--white);margin-bottom:8px;">No posts yet</h2>
      <p style="font-size:14px;max-width:280px;line-height:1.6;">Be the first to share where you're at. Tap the camera to post!</p>
    </div>
  `;
}

function initStoryNavigation() {
  document.querySelectorAll('.story-card').forEach(card => {
    card.querySelector('.story-tap-left')?.addEventListener('click', () => goToStory(currentStoryIndex - 1));
    card.querySelector('.story-tap-right')?.addEventListener('click', () => goToStory(currentStoryIndex + 1));
  });
}

function showStory(index) {
  const cards = document.querySelectorAll('.story-card');
  const bars = document.querySelectorAll('.story-progress .bar');
  if (cards.length === 0) return;
  if (index < 0) index = cards.length - 1;
  if (index >= cards.length) index = 0;

  cards.forEach((c, i) => c.classList.toggle('active', i === index));
  bars.forEach((bar, i) => {
    bar.classList.toggle('active', i === index);
    const fill = bar.querySelector('.fill');
    if (i === index) {
      fill.style.animation = 'none';
      void fill.offsetHeight;
      fill.style.animation = 'progressFill 5s linear forwards';
    } else {
      fill.style.animation = 'none';
      fill.style.width = '0%';
    }
  });

  currentStoryIndex = index;
  resetAutoTimer();
}

function goToStory(index) { showStory(index); }

function resetAutoTimer() {
  if (autoTimer) clearTimeout(autoTimer);
  if (document.getElementById('home')?.classList.contains('active')) {
    autoTimer = setTimeout(() => goToStory(currentStoryIndex + 1), 5000);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NAVIGATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function switchPage(pageId) {
  const pages = {
    home: document.getElementById('home'),
    search: document.getElementById('search'),
    venues: document.getElementById('venues'),
    profile: document.getElementById('profile'),
  };

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });
  Object.entries(pages).forEach(([key, el]) => {
    if (el) el.classList.toggle('active', key === pageId);
  });

  if (pageId === 'home') resetAutoTimer();
  if (pageId === 'profile') renderProfile();
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.page !== 'camera') switchPage(btn.dataset.page);
    });
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENUES RENDERER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function renderVenues() {
  const list = document.querySelector('.venue-list');
  if (!list) return;

  const venues = await fetchVenues();
  const venuePostCounts = {};
  posts.forEach(p => {
    if (p.venue) venuePostCounts[p.venue] = (venuePostCounts[p.venue] || 0) + 1;
  });

  if (venues.length === 0) {
    list.innerHTML = `<div style="padding:40px;text-align:center;color:var(--gray-400);"><div style="font-size:40px;margin-bottom:8px;">📍</div><p style="font-size:13px;">No venues yet.</p></div>`;
    return;
  }

  list.innerHTML = venues.map(v => {
    const count = venuePostCounts[v.name] || 0;
    const emojis = ['🍸', '🥃', '🍺', '🍷', '🍹', '🥂', '🎧', '🪩'];
    return `
      <div class="venue-card">
        <div class="venue-card-header">
          <span class="name">${escapeHtml(v.name)} <span class="type">· ${escapeHtml(v.type || 'Bar')}</span></span>
          <span class="post-count"><span>${count}</span> posts</span>
        </div>
        <div class="venue-stats">
          <span class="stat"><i class="fa-solid fa-location-dot"></i> <span class="num">Nearby</span></span>
          <span class="stat"><i class="fa-solid fa-star"></i> <span class="num">${(4 + Math.random()).toFixed(1)}</span></span>
          <span class="stat">${emojis[Math.floor(Math.random() * emojis.length)]} <span class="num">Popular</span></span>
        </div>
      </div>
    `;
  }).join('');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setupSearchInput() {
  const input = document.querySelector('.search-input');
  if (!input) return;
  let timeout;
  input.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => handleSearch(input.value), 300);
  });
}

async function handleSearch(query) {
  if (!query.trim()) {
    renderSearchSuggestions();
    return;
  }
  const results = await searchAll(query);
  const grid = document.querySelector('.search-grid');
  if (!grid) return;

  const emojis = ['🍸', '🍺', '🥃', '🍷', '🍹', '🍾', '🍻', '🥂', '🧊', '🔥', '🌊', '🏮'];

  const items = [
    ...results.venues.map(v => ({ label: v.name, type: 'venue', emoji: '📍' })),
    ...results.users.map(u => ({ label: u.full_name || u.username, type: 'user', emoji: '👤' })),
  ].slice(0, 12);

  if (items.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>No results found</p></div>`;
    return;
  }

  grid.innerHTML = items.map((item, i) => `
    <div class="search-grid-item">
      <div class="placeholder">${item.emoji}</div>
      <div class="venue-label">${escapeHtml(item.label)}</div>
    </div>
  `).join('');
}

function renderSearchSuggestions() {
  const grid = document.querySelector('.search-grid');
  if (!grid) return;
  const emojis = ['🍸', '🍺', '🥃', '🍷', '🍹', '🍾', '🍻', '🥂', '🧊', '🔥', '🌊', '🏮'];
  const venueNames = [...new Set(posts.map(p => p.venue).filter(Boolean))].slice(0, 12);

  if (venueNames.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>No suggestions yet. Start posting!</p></div>`;
    return;
  }

  grid.innerHTML = venueNames.map((name, i) => `
    <div class="search-grid-item">
      <div class="placeholder">${emojis[i % emojis.length]}</div>
      <div class="venue-label">${escapeHtml(name)}</div>
    </div>
  `).join('');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROFILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function renderProfile() {
  const user = getUser();
  if (!user) return;

  const profile = await fetchProfile(user.id);
  const userPosts = await fetchUserPosts(user.id);

  // Update profile header
  const avatarEl = document.querySelector('.profile-avatar-large');
  const nameEl = document.querySelector('.profile-name');
  const bioEl = document.querySelector('.profile-bio');
  const postsCountEl = document.querySelector('.profile-stats .stat:nth-child(1) .num');
  const venuesCountEl = document.querySelector('.profile-stats .stat:nth-child(2) .num');

  if (avatarEl) {
    const initial = (profile?.full_name || profile?.username || 'U').charAt(0).toUpperCase();
    avatarEl.textContent = initial;
  }
  if (nameEl) {
    const displayName = profile?.full_name || profile?.username || 'User';
    nameEl.innerHTML = `${escapeHtml(displayName)} <span class="handle">@${escapeHtml(profile?.username || 'user')}</span>`;
  }
  if (bioEl) bioEl.textContent = profile?.bio || '🥃 Showing you where the night takes me';
  if (postsCountEl) postsCountEl.textContent = userPosts.length;
  if (venuesCountEl) {
    const uniqueVenues = new Set(userPosts.map(p => p.venue).filter(Boolean));
    venuesCountEl.textContent = uniqueVenues.size;
  }

  // Render post grid
  const grid = document.querySelector('.profile-post-grid');
  if (grid) {
    if (userPosts.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><div style="font-size:40px;margin-bottom:8px;">📸</div><p>No posts yet. Start sharing!</p></div>`;
    } else {
      grid.innerHTML = userPosts.slice(0, 9).map(p => `
        <div class="item" style="background-image:url(${p.image_url});background-size:cover;background-position:center;"></div>
      `).join('');
      if (userPosts.length > 9) {
        grid.innerHTML += `<div class="item" style="background:var(--gray-800);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">+${userPosts.length - 9}</div>`;
      }
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH UI HANDLERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setupAuthUI() {
  // Toggle between sign-in and sign-up forms
  document.getElementById('showSignUp')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('signInForm').style.display = 'none';
    document.getElementById('signUpForm').style.display = 'flex';
  });

  document.getElementById('showSignIn')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('signUpForm').style.display = 'none';
    document.getElementById('signInForm').style.display = 'flex';
  });

  // Sign In
  document.getElementById('signInForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signInEmail').value;
    const password = document.getElementById('signInPassword').value;
    const btn = document.getElementById('signInBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      await signIn(email, password);
      checkAuth();
      await initApp();
      showToast('Welcome back! 🎉', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  // Sign Up
  document.getElementById('signUpForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signUpEmail').value;
    const password = document.getElementById('signUpPassword').value;
    const username = document.getElementById('signUpUsername').value;
    const btn = document.getElementById('signUpBtn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      await signUp(email, password, username);
      checkAuth();
      await initApp();
      showToast('Account created! 🎉', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut();
    checkAuth();
    showToast('Logged out', 'info');
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function timeAgo(timestamp) {
  if (!timestamp) return 'Just now';
  const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
  if (seconds < 0) return 'Just now';
  if (seconds < 60) return seconds + 's ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');
  clearTimeout(toast._hideTimeout);
  toast._hideTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INITIALIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function initApp() {
  console.log('🚀 Initializing SMYB...');
  await loadFeed();
  await renderVenues();
  renderSearchSuggestions();
  await renderProfile();
}

async function init() {
  setupAuthUI();
  setupNavigation();
  setupSearchInput();
  setupCamera();
  setupPreview();

  if (checkAuth()) {
    await initApp();
  }
}

document.addEventListener('DOMContentLoaded', init);