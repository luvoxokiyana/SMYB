// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENUE PROFILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function openVenueProfile(venueId) {
  const modal = document.getElementById('venueProfileModal');
  if (!modal) return;
  
  let venue = state.venues.find(v => v.id == venueId);
  if (!venue) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/venues?id=eq.${venueId}&select=*`, {
        headers: supabaseHeaders()
      });
      const data = res.ok ? await res.json() : [];
      venue = data[0] || null;
    } catch {}
  }
  
  if (!venue) {
    showToast('Venue not found', 'error');
    return;
  }
  
  const titleEl = document.getElementById('venueProfileTitle');
  const addrEl = document.getElementById('venueProfileAddress');
  
  if (titleEl) titleEl.textContent = venue.name;
  if (addrEl) {
    addrEl.innerHTML = venue.address ?
      `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(venue.address)}` :
      '';
  }
  
  const posts = await getVenuePosts(venueId);
  const vpPostCount = document.getElementById('vpPostCount');
  const vpFollowerCount = document.getElementById('vpFollowerCount');
  
  if (vpPostCount) vpPostCount.textContent = posts.length;
  if (vpFollowerCount) vpFollowerCount.textContent = venue.followers_count || 0;
  
  const saved = !isGuest() ? await isVenueSaved(venueId) : false;
  const saveBtn = document.getElementById('venueProfileSave');
  
  if (saveBtn) {
    saveBtn.className = saved ? 'venue-profile-save saved' : 'venue-profile-save';
    saveBtn.innerHTML = saved ?
      '<i class="fa-solid fa-bookmark"></i>' :
      '<i class="fa-regular fa-bookmark"></i>';
    
    saveBtn.onclick = async () => {
      const r = await toggleSaveVenue(venueId);
      saveBtn.className = r.saved ? 'venue-profile-save saved' : 'venue-profile-save';
      saveBtn.innerHTML = r.saved ?
        '<i class="fa-solid fa-bookmark"></i>' :
        '<i class="fa-regular fa-bookmark"></i>';
      showToast(r.saved ? 'Venue saved' : 'Venue removed', 'info');
    };
  }
  
  const postsGrid = document.getElementById('venueProfilePosts');
  if (postsGrid) {
    if (posts.length === 0) {
      postsGrid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray-400);">No posts at this venue yet</div>';
    } else {
      postsGrid.innerHTML = posts.map(p =>
        `<div class="vp-post" style="background-image:url(${p.image_url})" data-post-id="${p.id}"></div>`
      ).join('');
      
      postsGrid.querySelectorAll('.vp-post').forEach(el => {
        el.addEventListener('click', () => {
          closeVenueProfile();
          const idx = state.posts.findIndex(x => x.id === el.dataset.postId);
          if (idx >= 0) {
            switchPage('home');
            setTimeout(() => showStory(idx), 100);
          }
        });
      });
    }
  }
  
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeVenueProfile() {
  const m = document.getElementById('venueProfileModal');
  if (m) {
    m.classList.remove('active');
    document.body.style.overflow = '';
  }
}