// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SESSION MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function saveSession(s) {
  localStorage.setItem('brev_session', JSON.stringify(s));
}

function getSession() {
  const raw = localStorage.getItem('brev_session');
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (s.expires_at && Date.now() / 1000 > s.expires_at) {
      clearSession();
      return null;
    }
    return s;
  } catch {
    clearSession();
    return null;
  }
}

function clearSession() {
  localStorage.removeItem('brev_session');
  localStorage.removeItem('brev_user');
}

function saveUser(u) {
  localStorage.setItem('brev_user', JSON.stringify(u));
}

function getUser() {
  const raw = localStorage.getItem('brev_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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