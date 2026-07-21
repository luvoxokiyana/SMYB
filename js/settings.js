// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SETTINGS & EDIT PROFILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setupSettingsDropdown() {
  const btn = document.getElementById('profileSettingsBtn');
  const dd = document.getElementById('settingsDropdown');
  if (!btn || !dd) return;
  
  btn.addEventListener('click', e => {
    e.stopPropagation();
    dd.classList.toggle('active');
  });
  
  document.addEventListener('click', e => {
    if (!dd.contains(e.target) && e.target !== btn) {
      dd.classList.remove('active');
    }
  });
  
  document.getElementById('settingsEditProfile')?.addEventListener('click', () => {
    dd.classList.remove('active');
    if (isGuest()) {
      showToast('Sign in', 'error');
      return;
    }
    openEditProfile();
  });
  
  document.getElementById('settingsSaved')?.addEventListener('click', () => {
    dd.classList.remove('active');
    switchPage('profile');
    state.profileTab = 'venues';
    renderProfile();
  });
  
  document.getElementById('settingsHelp')?.addEventListener('click', () => {
    dd.classList.remove('active');
    window.open('help.html', '_blank');
  });
  
  document.getElementById('settingsPrivacy')?.addEventListener('click', () => {
    dd.classList.remove('active');
    window.open('privacy.html', '_blank');
  });
  
  document.getElementById('settingsLogout')?.addEventListener('click', async () => {
    dd.classList.remove('active');
    await signOut();
    resetAuthForms();
    checkAuth();
    showToast('Logged out', 'info');
  });
}

function openEditProfile() {
  const m = document.getElementById('editProfileModal');
  if (!m) return;
  
  document.getElementById('editFullName').value = document.getElementById('profileName')?.textContent || '';
  document.getElementById('editUsername').value = document.getElementById('profileHandle')?.textContent?.replace('@', '') || '';
  document.getElementById('editBio').value = document.getElementById('profileBio')?.textContent || '';
  document.getElementById('editAvatarPreview').textContent = (document.getElementById('editFullName').value || 'U').charAt(0).toUpperCase();
  
  m.classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('editFullName').focus(), 300);
}

function closeEditProfile() {
  const m = document.getElementById('editProfileModal');
  if (m) {
    m.classList.remove('active');
    document.body.style.overflow = '';
  }
}

async function saveProfile() {
  const fn = document.getElementById('editFullName').value.trim();
  const un = document.getElementById('editUsername').value.trim();
  const bio = document.getElementById('editBio').value.trim();
  
  if (!un || un.length < 3) {
    showToast('Username min 3 chars', 'error');
    return;
  }
  
  const btn = document.getElementById('saveProfileBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }
  
  try {
    await updateProfile({
      full_name: fn || un,
      username: un,
      bio: bio || null
    });
    closeEditProfile();
    await renderProfile();
    showToast('Profile updated', 'success');
  } catch (e) {
    showToast('Failed to save', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  }
}