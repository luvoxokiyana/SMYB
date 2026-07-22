// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE RENDERERS & NAVIGATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function switchPage(pageId) {
  const pages = {
    home: document.getElementById('home'),
    search: document.getElementById('search'),
    venues: document.getElementById('venues'),
    profile: document.getElementById('profile')
  };
  
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.page === pageId)
  );
  
  Object.entries(pages).forEach(([k, el]) => {
    if (el) el.classList.toggle('active', k === pageId);
  });
  
  clearAutoTimer();
  
  if (pageId === 'home') loadFeed();
  else if (pageId === 'profile') renderProfile();
  else if (pageId === 'venues') renderVenues();
}

// ─── Venues Page ───
async function renderVenues() {
  const list = document.getElementById('venueList');
  if (!list) return;
  
  list.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner"></div></div>';
  
  try {
    const pos = await new Promise((resolve) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(null),
          { timeout: 5000, enableHighAccuracy: false }
        );
      } else {
        resolve(null);
      }
    });
    
    if (pos) {
      const osmVenues = await fetchNearbyVenuesOSM(pos.lat, pos.lng);
      for (const v of osmVenues) {
        await getOrCreateVenue(v).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('Could not fetch nearby venues:', e);
  }
  
  const venues = await fetchVenues();
  
  if (venues.length === 0) {
    list.innerHTML = `
      <div style="padding:60px 20px;text-align:center;color:var(--gray-400);">
        <i class="fa-solid fa-location-dot" style="font-size:40px;margin-bottom:12px;color:var(--gray-600);display:block;"></i>
        <p style="font-size:14px;margin-bottom:8px;">No venues found nearby</p>
        <p style="font-size:12px;">Enable location or search for venues manually</p>
        <button onclick="switchPage('search')" style="margin-top:16px;padding:10px 20px;background:var(--accent);border:none;border-radius:20px;color:white;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">
          <i class="fa-solid fa-magnifying-glass"></i> Search Venues
        </button>
      </div>
    `;
    return;
  }
  
  list.innerHTML = venues.map(v => `
    <div class="venue-card" data-venue-id="${v.id}">
      <div class="venue-card-header">
        <span class="name">${escapeHtml(v.name)} <span class="type">· ${escapeHtml(v.type || 'Bar')}</span></span>
        <span class="post-count"><span>${v.posts_count || 0}</span> posts</span>
      </div>
      ${v.address ? `
        <div style="padding:0 16px 10px;font-size:12px;color:var(--gray-600);">
          <i class="fa-solid fa-location-dot"></i> ${escapeHtml(v.address?.split(',').slice(0, 3).join(',') || '')}
        </div>
      ` : ''}
      <div class="venue-stats">
        <span class="stat"><i class="fa-solid fa-martini-glass"></i> <span class="num">${escapeHtml(v.type || 'Bar')}</span></span>
        <span class="stat"><i class="fa-solid fa-bookmark"></i> <span class="num">${v.followers_count || 0} saved</span></span>
      </div>
    </div>
  `).join('');
  
  list.querySelectorAll('.venue-card').forEach(card => {
    card.addEventListener('click', () => openVenueProfile(card.dataset.venueId));
  });
}

// ─── Search ───
function setupSearchInput() {
  const input = document.querySelector('.search-input');
  if (!input) return;
  
  input.addEventListener('input', () => {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => {
      const query = input.value;
      const activeTab = document.querySelector('.search-tab.active');
      const tabName = activeTab?.dataset.searchTab || 'venues';
      
      if (tabName === 'venues') {
        handleSearch(query);
      } else {
        handleUserSearch(query);
      }
    }, 300);
  });
}

function setupSearchTabs() {
  const tabs = document.querySelectorAll('.search-tab');
  const venueResults = document.getElementById('venueSearchResults');
  const userResults = document.getElementById('userSearchResults');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      const tabName = this.dataset.searchTab;
      if (tabName === 'venues') {
        venueResults.style.display = 'block';
        userResults.style.display = 'none';
        const input = document.querySelector('.search-input');
        if (input?.value.trim()) {
          handleSearch(input.value.trim());
        }
      } else {
        venueResults.style.display = 'none';
        userResults.style.display = 'block';
        const input = document.querySelector('.search-input');
        if (input?.value.trim()) {
          handleUserSearch(input.value.trim());
        }
      }
    });
  });
}

async function handleSearch(query) {
  const grid = document.getElementById('searchGrid');
  if (!grid) return;
  
  if (!query.trim()) {
    renderSearchSuggestions();
    return;
  }
  
  grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;"><div class="spinner"></div></div>';
  
  try {
    const results = await searchVenuesOSM(query);
    if (results.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>No results found</p></div>';
      return;
    }
    
    const icons = ['fa-martini-glass', 'fa-beer-mug-empty', 'fa-whiskey-glass', 'fa-wine-glass', 'fa-champagne-glasses'];
    
    grid.innerHTML = results.slice(0, 12).map((v, i) => `
      <div class="search-grid-item" data-venue='${JSON.stringify(v).replace(/'/g, "&#39;")}'>
        <div class="placeholder"><i class="fa-solid ${icons[i % icons.length]}" style="font-size:24px;color:var(--gray-600);"></i></div>
        <div class="venue-label">${escapeHtml(v.name)}</div>
      </div>
    `).join('');
    
    grid.querySelectorAll('.search-grid-item').forEach(item => {
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
  
  const names = [...new Set(state.posts.map(p => p.venue).filter(Boolean))].slice(0, 12);
  
  if (names.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>No suggestions yet</p></div>';
    return;
  }
  
  const icons = ['fa-martini-glass', 'fa-beer-mug-empty', 'fa-whiskey-glass', 'fa-wine-glass', 'fa-champagne-glasses', 'fa-wine-bottle'];
  
  grid.innerHTML = names.map((n, i) => `
    <div class="search-grid-item" data-venue-name="${escapeHtml(n)}">
      <div class="placeholder"><i class="fa-solid ${icons[i % icons.length]}" style="font-size:24px;color:var(--gray-600);"></i></div>
      <div class="venue-label">${escapeHtml(n)}</div>
    </div>
  `).join('');
  
  grid.querySelectorAll('.search-grid-item').forEach(item => {
    item.addEventListener('click', async () => {
      const v = await getOrCreateVenue({
        name: item.dataset.venueName,
        type: 'Bar',
        address: '',
        osm_id: null
      });
      if (v) openVenueProfile(v.id);
    });
  });
}

// ─── User Search ───
async function handleUserSearch(query) {
  const container = document.getElementById('userResultsList');
  if (!container) return;
  
  if (!query || query.length < 2) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = '<div class="spinner"></div>';
  
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id,username,full_name,avatar_url,bio&or=(username.ilike.%${query}%,full_name.ilike.%${query}%)&limit=20`,
      { headers: supabaseHeaders() }
    );
    
    if (!res.ok) throw new Error('Search failed');
    
    const users = await res.json();
    
    if (users.length === 0) {
      container.innerHTML = '<p class="follow-list-empty">No users found</p>';
      return;
    }
    
    const currentUser = getUser();
    
    container.innerHTML = users.map(user => {
      const isCurrentUser = user.id === currentUser?.id;
      return `
        <div class="user-result" data-user-id="${user.id}">
          <div class="user-avatar" onclick="viewUserProfile('${user.id}')" style="cursor:pointer;">${(user.full_name || user.username || 'U').charAt(0).toUpperCase()}</div>
          <div class="user-info" onclick="viewUserProfile('${user.id}')" style="cursor:pointer;">
            <div class="user-name">${escapeHtml(user.full_name || user.username)}</div>
            <div class="user-handle">@${escapeHtml(user.username)}</div>
            ${user.bio ? `<div class="user-bio">${escapeHtml(user.bio)}</div>` : ''}
          </div>
          ${!isCurrentUser ? `
            <button class="follow-btn" onclick="event.stopPropagation(); handleFollowClick('${user.id}', this)">Follow</button>
          ` : `
            <span class="follow-list-you">You</span>
          `}
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('User search error:', error);
    container.innerHTML = '<p class="follow-list-empty">Failed to search users</p>';
  }
}

// ─── Profile ───
async function renderProfile() {
  const u = getUser();
  if (!u) return;
  
  const profile = await fetchProfile(u.id);
  const counts = await getFollowCounts(u.id);
  
  const avatarEl = document.getElementById('profileAvatar');
  if (avatarEl) {
    avatarEl.textContent = (profile?.full_name || profile?.username || 'U').charAt(0).toUpperCase();
  }
  
  const nameEl = document.getElementById('profileName');
  const handleEl = document.getElementById('profileHandle');
  const bioEl = document.getElementById('profileBio');
  
  if (nameEl) nameEl.textContent = profile?.full_name || profile?.username || 'User';
  if (handleEl) handleEl.textContent = `@${profile?.username || 'user'}`;
  if (bioEl) bioEl.textContent = profile?.bio || '';
  
  const sf = document.getElementById('statFollowers');
  const sg = document.getElementById('statFollowing');
  if (sf) sf.textContent = counts.followers;
  if (sg) sg.textContent = counts.following;
  
  const statFollowers = document.querySelector('.stat:first-child');
  const statFollowing = document.querySelector('.stat:last-child');
  if (statFollowers) {
    statFollowers.style.cursor = 'pointer';
    statFollowers.onclick = () => openFollowList(u.id, 'followers');
  }
  if (statFollowing) {
    statFollowing.style.cursor = 'pointer';
    statFollowing.onclick = () => openFollowList(u.id, 'following');
  }
  
  if (state.profileTab === 'posts') {
    await renderProfilePosts(u.id);
  } else {
    await renderProfileSavedVenues(u.id);
  }
}

async function renderProfilePosts(userId) {
  const posts = await fetchUserPosts(userId);
  const grid = document.getElementById('profilePostGrid');
  const vg = document.getElementById('profileVenuesGrid');
  
  if (grid) grid.style.display = 'grid';
  if (vg) vg.style.display = 'none';
  
  document.querySelectorAll('.profile-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === 'posts')
  );
  
  if (!grid) return;
  
  if (posts.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>No posts yet</p></div>';
    return;
  }
  
  grid.innerHTML = posts.map(p => `
    <div class="item" style="background-image:url(${p.image_url});background-size:cover;background-position:center;" data-post-id="${p.id}">
      <div class="item-overlay">
        <span><i class="fa-solid fa-heart"></i> ${p.likes_count || 0}</span>
        <span><i class="fa-solid fa-comment"></i> ${p.comments_count || 0}</span>
      </div>
    </div>
  `).join('');
  
  grid.querySelectorAll('.item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = state.posts.findIndex(x => x.id === el.dataset.postId);
      if (idx >= 0) {
        switchPage('home');
        setTimeout(() => showStory(idx), 100);
      }
    });
  });
}

async function renderProfileSavedVenues(userId) {
  const venues = await fetchSavedVenues(userId);
  const grid = document.getElementById('profilePostGrid');
  const vg = document.getElementById('profileVenuesGrid');
  
  if (grid) grid.style.display = 'none';
  if (vg) vg.style.display = 'grid';
  
  document.querySelectorAll('.profile-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === 'venues')
  );
  
  if (!vg) return;
  
  if (venues.length === 0) {
    vg.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400);"><p>No saved venues</p></div>';
    return;
  }
  
  vg.innerHTML = venues.map(v => `
    <div class="saved-venue-card" data-venue-id="${v.id}">
      <div class="sv-name">${escapeHtml(v.name)}</div>
      <div class="sv-type">${escapeHtml(v.type || 'Bar')}</div>
      <div class="sv-posts">${v.posts_count || 0} posts</div>
    </div>
  `).join('');
  
  vg.querySelectorAll('.saved-venue-card').forEach(card => {
    card.addEventListener('click', () => openVenueProfile(card.dataset.venueId));
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOLLOW LIST MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function openFollowList(userId, type) {
  console.log('📋 Opening follow list:', userId, type);
  
  const modal = document.createElement('div');
  modal.className = 'follow-list-modal';
  modal.innerHTML = `
    <div class="follow-list-overlay">
      <div class="follow-list-container">
        <div class="follow-list-header">
          <h3>${type === 'followers' ? 'Followers' : 'Following'}</h3>
          <button class="follow-list-close">&times;</button>
        </div>
        <div class="follow-list-content" id="followListContent">
          <div class="spinner"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('.follow-list-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) modal.remove();
  });
  modal.querySelector('.follow-list-close').addEventListener('click', () => modal.remove());
  
  const content = modal.querySelector('#followListContent');
  
  try {
    const users = type === 'followers' 
      ? await getFollowers(userId) 
      : await getFollowing(userId);
    
    console.log('👥 Users found:', users.length);
    
    if (users.length === 0) {
      content.innerHTML = `<p class="follow-list-empty">No ${type} yet</p>`;
      return;
    }
    
    const currentUser = getUser();
    const followStatuses = await Promise.all(
      users.map(u => checkFollowStatus(u.id))
    );
    
    content.innerHTML = users.map((user, index) => `
      <div class="follow-list-item" data-user-id="${user.id}">
        <div class="follow-list-avatar" onclick="viewUserProfile('${user.id}')" style="cursor:pointer;">${(user.full_name || user.username || 'U').charAt(0).toUpperCase()}</div>
        <div class="follow-list-info" onclick="viewUserProfile('${user.id}')" style="cursor:pointer;">
          <div class="follow-list-name">${escapeHtml(user.full_name || user.username)}</div>
          <div class="follow-list-handle">@${escapeHtml(user.username)}</div>
        </div>
        ${user.id !== currentUser?.id ? `
          <button class="follow-list-btn ${followStatuses[index] ? 'following' : ''}" 
                  data-user-id="${user.id}"
                  onclick="event.stopPropagation(); toggleFollowFromList('${user.id}', this)">
            ${followStatuses[index] ? 'Following' : 'Follow'}
          </button>
        ` : `
          <span class="follow-list-you">You</span>
        `}
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Error loading follow list:', error);
    content.innerHTML = `<p class="follow-list-empty">Error loading ${type}</p>`;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOLLOW ACTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function toggleFollowFromList(targetUserId, btn) {
  console.log('🔄 Toggling follow from list:', targetUserId);
  const result = await toggleFollowUser(targetUserId);
  
  if (result.following) {
    btn.textContent = 'Following';
    btn.classList.add('following');
    showToast('Followed!', 'success');
  } else if (result.following === false && !result.error) {
    btn.textContent = 'Follow';
    btn.classList.remove('following');
    showToast('Unfollowed', 'info');
  }
  renderProfile();
}

async function toggleFollowFromProfile(targetUserId, btn) {
  console.log('🔄 Toggling follow from profile:', targetUserId);
  const result = await toggleFollowUser(targetUserId);
  
  if (result.following) {
    btn.textContent = 'Following';
    btn.classList.add('following');
    showToast('Followed!', 'success');
  } else if (result.following === false && !result.error) {
    btn.textContent = 'Follow';
    btn.classList.remove('following');
    showToast('Unfollowed', 'info');
  }
  renderProfile();
}

async function toggleFollowFromPost(targetUserId, btn) {
  console.log('🔄 Toggling follow from post:', targetUserId);
  const result = await toggleFollowUser(targetUserId);
  
  if (result.following) {
    btn.textContent = 'Following';
    btn.classList.add('following');
    showToast('Followed!', 'success');
  } else if (result.following === false && !result.error) {
    btn.textContent = 'Follow';
    btn.classList.remove('following');
    showToast('Unfollowed', 'info');
  }
}

async function handleFollowClick(targetUserId, btn) {
  console.log('🔄 Follow click:', targetUserId);
  const result = await toggleFollowUser(targetUserId);
  
  if (result.following) {
    btn.textContent = 'Following';
    btn.classList.add('following');
    showToast('Followed!', 'success');
  } else if (result.following === false && !result.error) {
    btn.textContent = 'Follow';
    btn.classList.remove('following');
    showToast('Unfollowed', 'info');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USER PROFILE MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function viewUserProfile(userId) {
  console.log('👤 Viewing user profile:', userId);
  
  document.querySelectorAll('.follow-list-modal').forEach(m => m.remove());
  
  const u = getUser();
  if (u?.id === userId) {
    switchPage('profile');
    return;
  }
  
  try {
    const profile = await fetchProfile(userId);
    const counts = await getFollowCounts(userId);
    const isFollowing = await checkFollowStatus(userId);
    
    const modal = document.createElement('div');
    modal.className = 'user-profile-modal';
    modal.innerHTML = `
      <div class="user-profile-overlay">
        <div class="user-profile-container">
          <button class="user-profile-close">&times;</button>
          <div class="user-profile-avatar">${(profile?.full_name || profile?.username || 'U').charAt(0).toUpperCase()}</div>
          <div class="user-profile-name">${escapeHtml(profile?.full_name || profile?.username || 'User')}</div>
          <div class="user-profile-handle">@${escapeHtml(profile?.username || 'user')}</div>
          ${profile?.bio ? `<div class="user-profile-bio">${escapeHtml(profile.bio)}</div>` : ''}
          <div class="user-profile-stats">
            <div onclick="openFollowList('${userId}', 'followers')" style="cursor:pointer;">
              <span class="num">${counts.followers}</span> <span class="label">Followers</span>
            </div>
            <div onclick="openFollowList('${userId}', 'following')" style="cursor:pointer;">
              <span class="num">${counts.following}</span> <span class="label">Following</span>
            </div>
          </div>
          ${userId !== u?.id ? `
            <button class="follow-btn-main ${isFollowing ? 'following' : ''}" 
                    onclick="toggleFollowFromProfile('${userId}', this)">
              ${isFollowing ? 'Following' : 'Follow'}
            </button>
          ` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('.user-profile-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) modal.remove();
    });
    modal.querySelector('.user-profile-close').addEventListener('click', () => modal.remove());
    
  } catch (error) {
    console.error('Error viewing user profile:', error);
    showToast('Could not load user profile', 'error');
  }
}
