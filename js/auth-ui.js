// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function resetAuthForms() {
  const su = document.getElementById('signUpForm');
  const si = document.getElementById('signInForm');
  const ec = document.getElementById('emailConfirmation');
  const swu = document.getElementById('authSwitchSignUp');
  const swi = document.getElementById('authSwitchSignIn');
  
  if (su) su.style.display = 'flex';
  if (si) si.style.display = 'none';
  if (ec) ec.style.display = 'none';
  if (swu) swu.style.display = 'block';
  if (swi) swi.style.display = 'none';
}

function showEmailConfirmation(email) {
  const su = document.getElementById('signUpForm');
  const si = document.getElementById('signInForm');
  const ec = document.getElementById('emailConfirmation');
  const swu = document.getElementById('authSwitchSignUp');
  const swi = document.getElementById('authSwitchSignIn');
  const es = document.getElementById('confirmEmailAddress');
  
  if (su) su.style.display = 'none';
  if (si) si.style.display = 'none';
  if (ec) ec.style.display = 'flex';
  if (swu) swu.style.display = 'none';
  if (swi) swi.style.display = 'none';
  if (es) es.textContent = email;
}

function setupAuthUI() {
  // Password toggle
  document.querySelectorAll('.auth-password-toggle').forEach(b => {
    b.addEventListener('click', function(e) {
      e.preventDefault();
      const i = document.getElementById(this.dataset.target);
      const ic = this.querySelector('i');
      if (!i || !ic) return;
      
      if (i.type === 'password') {
        i.type = 'text';
        ic.classList.replace('fa-eye', 'fa-eye-slash');
      } else {
        i.type = 'password';
        ic.classList.replace('fa-eye-slash', 'fa-eye');
      }
    });
  });
  
  // Show sign in
  document.getElementById('showSignIn')?.addEventListener('click', e => {
    e.preventDefault();
    const su = document.getElementById('signUpForm');
    const si = document.getElementById('signInForm');
    const ec = document.getElementById('emailConfirmation');
    const swu = document.getElementById('authSwitchSignUp');
    const swi = document.getElementById('authSwitchSignIn');
    
    if (su) su.style.display = 'none';
    if (si) si.style.display = 'flex';
    if (ec) ec.style.display = 'none';
    if (swu) swu.style.display = 'none';
    if (swi) swi.style.display = 'block';
  });
  
  // Show sign up
  document.getElementById('showSignUp')?.addEventListener('click', e => {
    e.preventDefault();
    resetAuthForms();
  });
  
  // Back to sign in from confirmation
  document.getElementById('backToSignInFromConfirm')?.addEventListener('click', e => {
    e.preventDefault();
    const ec = document.getElementById('emailConfirmation');
    const si = document.getElementById('signInForm');
    const swi = document.getElementById('authSwitchSignIn');
    const swu = document.getElementById('authSwitchSignUp');
    
    if (ec) ec.style.display = 'none';
    if (si) si.style.display = 'flex';
    if (swi) swi.style.display = 'block';
    if (swu) swu.style.display = 'none';
  });
  
  // Resend confirmation
  document.getElementById('resendConfirmation')?.addEventListener('click', async function(e) {
    e.preventDefault();
    const email = document.getElementById('confirmEmailAddress')?.textContent;
    const btn = e.currentTarget;
    const bt = btn?.querySelector('.btn-text');
    const bl = btn?.querySelector('.btn-loader');
    
    btn.disabled = true;
    if (bt) bt.style.display = 'none';
    if (bl) bl.style.display = 'inline-flex';
    
    try {
      await resendConfirmationEmail(email);
      showToast('Email resent', 'success');
    } catch {
      showToast('Failed to resend', 'error');
    } finally {
      btn.disabled = false;
      if (bt) bt.style.display = '';
      if (bl) bl.style.display = 'none';
    }
  });
  
  // Sign up form
  document.getElementById('signUpForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('signUpBtn');
    if (btn?.disabled) return;
    
    const email = document.getElementById('signUpEmail')?.value?.trim();
    const password = document.getElementById('signUpPassword')?.value;
    const username = document.getElementById('signUpUsername')?.value?.trim();
    const fullName = document.getElementById('signUpFullName')?.value?.trim();
    
    if (!email || !password || !username) {
      showToast('Fill all fields', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password 6+ chars', 'error');
      return;
    }
    
    const bt = btn?.querySelector('.btn-text');
    const bl = btn?.querySelector('.btn-loader');
    
    if (btn) btn.disabled = true;
    if (bt) bt.style.display = 'none';
    if (bl) bl.style.display = 'inline-flex';
    
    try {
      await signUp(email, password, username, fullName);
      checkAuth();
      await initApp();
      hideLoadingScreen();
      showToast('Account created', 'success');
    } catch (err) {
      if (err.message === 'EMAIL_CONFIRMATION_REQUIRED') {
        showEmailConfirmation(email);
      } else {
        showToast(err.message || 'Failed', 'error');
      }
      if (btn) btn.disabled = false;
      if (bt) bt.style.display = '';
      if (bl) bl.style.display = 'none';
    }
  });
  
  // Sign in form
  document.getElementById('signInForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('signInEmail')?.value?.trim();
    const password = document.getElementById('signInPassword')?.value;
    
    if (!email || !password) {
      showToast('Enter email and password', 'error');
      return;
    }
    
    const btn = document.getElementById('signInBtn');
    const bt = btn?.querySelector('.btn-text');
    const bl = btn?.querySelector('.btn-loader');
    
    if (btn) btn.disabled = true;
    if (bt) bt.style.display = 'none';
    if (bl) bl.style.display = 'inline-flex';
    
    try {
      await signIn(email, password);
      checkAuth();
      await initApp();
      hideLoadingScreen();
      showToast('Welcome back', 'success');
    } catch (err) {
      showToast(err.message || 'Failed', 'error');
      if (btn) btn.disabled = false;
      if (bt) bt.style.display = '';
      if (bl) bl.style.display = 'none';
    }
  });
  
  // Guest browse
  document.getElementById('guestBrowse')?.addEventListener('click', async function(e) {
    e.preventDefault();
    
    const guestId = getGuestId();
    saveUser({
      id: guestId,
      email: `guest_${guestId}@brev.local`,
      user_metadata: { full_name: 'Guest', username: 'guest' },
      is_guest: true
    });
    
    const ec = document.getElementById('emailConfirmation');
    if (ec) ec.style.display = 'none';
    saveSession({ access_token: null, expires_at: null });
    checkAuth();
    await initApp();
    hideLoadingScreen();
    showToast('Browsing as guest', 'info');
  });
}