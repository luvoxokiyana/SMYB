// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SETUP & INIT
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
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
  }
});

function setupCamera() {
  const cm = document.getElementById('cameraModal');
  const cc = document.querySelector('.camera-container');
  
  document.querySelectorAll('[data-page="camera"]').forEach(b => {
    b.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openCamera();
    });
  });
  
  document.getElementById('cameraCapture')?.addEventListener('click', e => {
    e.preventDefault();
    capturePhoto();
  });
  
  document.getElementById('cameraGallery')?.addEventListener('click', e => {
    e.preventDefault();
    selectFromGallery();
  });
  
  document.getElementById('galleryInput')?.addEventListener('change', handleGallerySelect);
  document.getElementById('cameraFlip')?.addEventListener('click', e => {
    e.preventDefault();
    flipCamera();
  });
  
  // Camera swipe to close
  if (cc) {
    let sy = 0, mv = false;
    cc.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        sy = e.touches[0].clientY;
        mv = false;
      }
    }, { passive: true });
    
    cc.addEventListener('touchmove', e => {
      if (e.touches.length === 1) {
        const d = e.touches[0].clientY - sy;
        if (d > 10) {
          mv = true;
          e.preventDefault();
          cc.style.transform = `translateY(${d}px)`;
          cc.style.transition = 'none';
          cc.style.opacity = Math.max(0, 1 - d / 400);
        }
      }
    }, { passive: false });
    
    cc.addEventListener('touchend', () => {
      const d = mv ? parseFloat(cc.style.transform.replace('translateY(', '').replace('px)', '') || 0) : 0;
      
      if (d > 150) {
        cc.style.transition = 'transform .25s ease,opacity .25s ease';
        cc.style.transform = 'translateY(100%)';
        cc.style.opacity = '0';
        setTimeout(() => {
          cc.style.transform = '';
          cc.style.opacity = '';
          cc.style.transition = '';
          closeCamera();
        }, 250);
      } else {
        cc.style.transition = 'transform .3s ease,opacity .3s ease';
        cc.style.transform = '';
        cc.style.opacity = '';
        setTimeout(() => {
          cc.style.transition = '';
        }, 300);
      }
      sy = 0;
      mv = false;
    });
  }
  
  cm?.addEventListener('click', e => {
    if (e.target === cm) closeCamera();
  });
  
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cm?.classList.contains('active')) {
      e.preventDefault();
      closeCamera();
    }
  });
  
  document.querySelectorAll('.nav-item:not([data-page="camera"])').forEach(b => {
    b.addEventListener('click', () => {
      if (cm?.classList.contains('active')) closeCamera();
    });
  });
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && cm?.classList.contains('active')) closeCamera();
  });
}

function setupPreview() {
  document.getElementById('previewBack')?.addEventListener('click', () => {
    closePostPreview();
    setTimeout(() => openCamera(), 400);
  });
  
  document.getElementById('previewSend')?.addEventListener('click', submitFromPreview);
  
  document.getElementById('previewCaption')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitFromPreview();
    }
  });
  
  document.addEventListener('keydown', e => {
    const modal = document.getElementById('previewModal');
    if (e.key === 'Escape' && modal?.classList.contains('active')) {
      e.preventDefault();
      closePostPreview();
      setTimeout(() => openCamera(), 400);
    }
  });
}

function setupComments() {
  document.getElementById('commentsClose')?.addEventListener('click', closeCommentsModal);
  
  document.getElementById('commentsModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCommentsModal();
  });
  
  document.getElementById('commentSubmit')?.addEventListener('click', submitComment);
  
  document.getElementById('commentInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitComment();
    }
  });
}

function setupVenueProfile() {
  document.getElementById('venueProfileBack')?.addEventListener('click', closeVenueProfile);
  
  document.getElementById('venueProfileModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeVenueProfile();
  });
}

function setupModalKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modals = ['cameraModal', 'previewModal', 'commentsModal', 'venueProfileModal', 'editProfileModal'];
      for (const modalId of modals) {
        const modal = document.getElementById(modalId);
        if (modal?.classList.contains('active')) {
          switch (modalId) {
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

function setupProfileTabs() {
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.profileTab = tab.dataset.tab;
      renderProfile();
    });
  });
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.page !== 'camera') switchPage(b.dataset.page);
    });
  });
}

async function initApp() {
  await loadFeed();
  await renderVenues();
  renderSearchSuggestions();
  await renderProfile();
}

async function init() {
  console.log('Brev initializing...');
  
  try {
    // Check if config loaded properly
    if (typeof CONFIG === 'undefined') {
      console.error('CONFIG is not defined. Make sure config.js loaded properly.');
      showToast('Configuration error. Please check your setup.', 'error');
      hideLoadingScreen();
      return;
    }
    
    // Check for required config values
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
      console.error('Missing Supabase credentials in config.js');
      showToast('Missing Supabase credentials. Please update config.js.', 'error');
      hideLoadingScreen();
      return;
    }
    
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
    setupSearchTabs();
    setupFeedTabs();
    
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
    
    document.getElementById('editAvatarBtn')?.addEventListener('click', () => {
      showToast('Avatar upload coming soon', 'info');
    });
    
    document.getElementById('editProfileModal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeEditProfile();
    });
    
    if (checkAuth()) {
      await initApp();
      checkOnboarding();
    }
    
    hideLoadingScreen();
    
    if (CONFIG.ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('SW registered:', reg))
        .catch(err => console.error('SW registration failed:', err));
    }
    
    console.log('Brev initialized successfully');
  } catch (error) {
    console.error('Init error:', error);
    hideLoadingScreen();
    showToast('Failed to initialize. Please refresh.', 'error');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPOSE FUNCTIONS GLOBALLY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

try {
  window.openFollowList = typeof openFollowList !== 'undefined' ? openFollowList : null;
  window.viewUserProfile = typeof viewUserProfile !== 'undefined' ? viewUserProfile : null;
  window.toggleFollowFromList = typeof toggleFollowFromList !== 'undefined' ? toggleFollowFromList : null;
  window.toggleFollowFromProfile = typeof toggleFollowFromProfile !== 'undefined' ? toggleFollowFromProfile : null;
  window.toggleFollowFromPost = typeof toggleFollowFromPost !== 'undefined' ? toggleFollowFromPost : null;
  window.handleFollowClick = typeof handleFollowClick !== 'undefined' ? handleFollowClick : null;
  window.renderProfile = typeof renderProfile !== 'undefined' ? renderProfile : null;
  window.switchPage = typeof switchPage !== 'undefined' ? switchPage : null;
  window.viewUserPosts = typeof viewUserPosts !== 'undefined' ? viewUserPosts : null;
  window.toggleFollowUser = typeof toggleFollowUser !== 'undefined' ? toggleFollowUser : null;
  window.openVenueProfile = typeof openVenueProfile !== 'undefined' ? openVenueProfile : null;
  window.showToast = typeof showToast !== 'undefined' ? showToast : null;
  window.getUser = typeof getUser !== 'undefined' ? getUser : null;
  window.isGuest = typeof isGuest !== 'undefined' ? isGuest : null;
  window.getSession = typeof getSession !== 'undefined' ? getSession : null;
  window.authHeaders = typeof authHeaders !== 'undefined' ? authHeaders : null;
  window.supabaseHeaders = typeof supabaseHeaders !== 'undefined' ? supabaseHeaders : null;
  
  console.log('✅ Global functions exposed');
} catch (e) {
  console.warn('⚠️ Some functions not available yet:', e.message);
}

document.addEventListener('DOMContentLoaded', init);