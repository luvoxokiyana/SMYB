// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST PREVIEW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openPostPreview(imageData) {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  
  const modal = document.getElementById('previewModal');
  const container = document.getElementById('previewContainer');
  
  document.getElementById('previewImage').style.backgroundImage = `url(${imageData})`;
  document.getElementById('previewCaption').value = '';
  document.getElementById('previewVenue').value = '';
  document.getElementById('previewCharCount').textContent = '0';
  state.selectedVenueId = null;
  state.selectedVenue = null;
  
  const u = getUser();
  const nameInput = document.getElementById('previewName');
  if (nameInput && u) {
    const p = u.user_metadata || {};
    nameInput.value = p.full_name || p.username || u.email?.split('@')[0] || '';
  }
  
  if (container) {
    container.style.transform = '';
    container.style.transition = '';
  }
  
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  modal.dataset.imageData = imageData;
  
  const overlay = document.querySelector('.swipe-overlay');
  if (overlay) {
    overlay.classList.remove('fading');
    setTimeout(() => overlay.classList.add('fading'), 3000);
  }
  
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
    if (len > 200) {
      this.value = this.value.slice(0, 200);
      document.getElementById('previewCharCount').textContent = '200';
    }
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
    const deltaY = parseFloat(currentTransform.replace('translateY(', '').replace('px)', '') || 0);
    
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
  
  if (container) {
    container.style.transform = '';
    container.style.transition = '';
  }
  
  const overlay = document.querySelector('.swipe-overlay');
  if (overlay) overlay.classList.remove('fading');
  
  delete modal.dataset.imageData;
  state.selectedVenueId = null;
  state.selectedVenue = null;
}

function setupVenueSearch() {
  const input = document.getElementById('previewVenue');
  const suggestions = document.getElementById('venueSuggestions');
  if (!input || !suggestions) return;
  
  let timeout;
  
  input.oninput = function() {
    clearTimeout(timeout);
    const q = this.value.trim();
    if (q.length < 2) {
      suggestions.style.display = 'none';
      return;
    }
    
    timeout = setTimeout(async () => {
      const results = await searchVenuesOSM(q);
      if (results.length === 0) {
        suggestions.style.display = 'none';
        return;
      }
      
      suggestions.innerHTML = results.map(v => `
        <div class="venue-suggestion-item" data-venue='${JSON.stringify(v).replace(/'/g, "&#39;")}'>
          <i class="fa-solid fa-location-dot"></i>
          <div><strong>${escapeHtml(v.name)}</strong><br><small>${escapeHtml(v.address?.split(',').slice(0, 2).join(',') || '')}</small></div>
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
    if (!suggestions.contains(e.target) && e.target !== input) {
      suggestions.style.display = 'none';
    }
  });
}

async function submitFromPreview() {
  if (state.isUploading) return;
  
  const modal = document.getElementById('previewModal');
  const imageData = modal.dataset.imageData;
  const caption = document.getElementById('previewCaption').value.trim();
  const venueInput = document.getElementById('previewVenue').value.trim();
  
  if (!imageData) {
    showToast('No image', 'error');
    return;
  }
  
  state.isUploading = true;
  const btn = document.getElementById('previewSend');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  }
  
  const hint = document.getElementById('swipeHint');
  if (hint) {
    hint.innerHTML = '<div class="swipe-action post-action"><i class="fa-solid fa-spinner fa-spin"></i> Posting...</div>';
    hint.style.opacity = '1';
  }
  
  try {
    let venueId = null, venueName = null;
    
    if (state.selectedVenue || venueInput) {
      const vData = state.selectedVenue || {
        name: venueInput,
        type: 'Bar',
        address: '',
        osm_id: null
      };
      const venue = await getOrCreateVenue(vData);
      if (venue) {
        venueId = venue.id;
        venueName = venue.name;
      }
    }
    
    const imageUrl = await uploadToCloudinary(imageData);
    await submitPost(imageUrl, caption, venueName, venueId);
    
    if (hint) hint.remove();
    closePostPreview();
    showToast('Posted successfully', 'success');
    await loadFeed(true);
    switchPage('home');
  } catch (e) {
    console.error(e);
    showToast('Failed to post. ' + (e.message || ''), 'error');
  } finally {
    state.isUploading = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-regular fa-paper-plane"></i>';
    }
    if (hint) {
      hint.innerHTML = `
        <div class="swipe-hint-up"><i class="fa-solid fa-arrow-up"></i> Post</div>
        <div class="swipe-hint-down"><i class="fa-solid fa-arrow-down"></i> Back</div>
      `;
      setTimeout(() => {
        if (hint) hint.style.opacity = '0';
      }, 2000);
    }
  }
}