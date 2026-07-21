// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTHENTICATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function signUp(email, password, username, fullName) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password,
      data: { username, full_name: fullName || username }
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.message || 'Sign up failed');
  if (data.user && !data.session) throw new Error('EMAIL_CONFIRMATION_REQUIRED');
  if (data.session) {
    saveSession(data.session);
    saveUser(data.user);
  }
  return data;
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Invalid credentials');
  
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600)
  };
  saveSession(session);
  const user = await fetchUser();
  if (!user) throw new Error('Failed to fetch user');
  saveUser(user);
  return { session, user };
}

async function signOut() {
  const s = getSession();
  if (s?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${s.access_token}`
      }
    }).catch(() => {});
  }
  clearSession();
  state.posts = [];
  state.venues = [];
  state.currentStoryIndex = 0;
  clearAutoTimer();
}

async function resendConfirmationEmail(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: 'signup', email }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.msg || 'Failed to resend');
  }
}

async function fetchUser() {
  const s = getSession();
  if (!s?.access_token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${s.access_token}`
    }
  });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchProfile(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
    headers: supabaseHeaders()
  });
  if (!res.ok) return null;
  const d = await res.json();
  return d[0] || null;
}

async function updateProfile(updates) {
  const u = getUser();
  if (!u || isGuest()) throw new Error('Cannot update');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${u.id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error('Failed to update');
  const profile = await fetchProfile(u.id);
  if (profile) {
    const currentUser = getUser();
    saveUser({
      ...currentUser,
      user_metadata: {
        ...currentUser.user_metadata,
        full_name: profile.full_name,
        username: profile.username
      }
    });
  }
}

function checkAuth() {
  const s = getSession();
  const auth = document.getElementById('authPage');
  const app = document.getElementById('appMain');
  if (!s) {
    if (auth) auth.classList.add('active');
    if (app) app.classList.remove('active');
    return false;
  }
  if (auth) auth.classList.remove('active');
  if (app) app.classList.add('active');
  return true;
}