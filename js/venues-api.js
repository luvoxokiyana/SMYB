// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENUES API (Supabase + OpenStreetMap)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let venueSearchPromise = null;
let fetchVenuesPromise = null;

async function searchVenuesOSM(query) {
  if (!query || query.length < 2) return [];
  
  const cacheKey = `venue_search_${query}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }
  
  if (venueSearchPromise) return venueSearchPromise;
  
  venueSearchPromise = (async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}+bar|restaurant|pub|nightclub&format=json&limit=8&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'BrevApp/1.0 (brev.app)' }
      });
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
      const viewbox = `${lng - 0.05},${lat - 0.05},${lng + 0.05},${lat + 0.05}`;
      const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=10&bounded=1&viewbox=${viewbox}&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'BrevApp/1.0 (brev.app)' }
      });
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
    } catch (error) {
      console.warn(`Nominatim failed for "${query}":`, error.message);
    }
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  
  return allVenues.slice(0, 30);
}

async function getOrCreateVenue(venueData) {
  if (!venueData || !venueData.name) return null;
  
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${getSession()?.access_token || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  
  // Check by OSM ID
  if (venueData.osm_id) {
    try {
      const check = await fetch(`${SUPABASE_URL}/rest/v1/venues?osm_id=eq.${venueData.osm_id}&select=*`, { headers });
      if (check.ok) {
        const ex = await check.json();
        if (ex.length > 0) return ex[0];
      }
    } catch {}
  }
  
  // Check by name
  try {
    const nameCheck = await fetch(`${SUPABASE_URL}/rest/v1/venues?name=ilike.${encodeURIComponent(venueData.name)}&select=*`, { headers });
    if (nameCheck.ok) {
      const ex = await nameCheck.json();
      if (ex.length > 0) return ex[0];
    }
  } catch {}
  
  // Create new venue
  try {
    const user = getUser();
    const body = {
      osm_id: venueData.osm_id || null,
      name: venueData.name.trim(),
      type: venueData.type || 'Bar',
      address: venueData.address || '',
      latitude: venueData.latitude || null,
      longitude: venueData.longitude || null,
      photo_url: venueData.photo_url || null,
      posts_count: 0,
      followers_count: 0,
    };
   // if (user && !isGuest()) body.created_by = user.id;
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/venues`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      console.error('Create venue error:', res.status, await res.text());
      return null;
    }
    const created = await res.json();
    return created[0] || created;
  } catch (error) {
    console.error('Create venue error:', error);
    return null;
  }
}

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
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/posts?select=*,profiles!posts_user_id_fkey(username,full_name,avatar_url)&venue_id=eq.${venueId}&order=created_at.desc.nullslast&limit=50`,
    { headers: supabaseHeaders() }
  );
  if (!res.ok) return [];
  return await res.json();
}

async function toggleSaveVenue(venueId) {
  const u = getUser();
  if (!u || isGuest()) {
    showToast('Sign in to save venues', 'error');
    return { saved: false };
  }
  
  const check = await fetch(
    `${SUPABASE_URL}/rest/v1/venue_follows?user_id=eq.${u.id}&venue_id=eq.${venueId}`,
    { headers: authHeaders() }
  );
  const ex = check.ok ? await check.json() : [];
  
  if (ex.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/venue_follows?id=eq.${ex[0].id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return { saved: false };
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/venue_follows`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ user_id: u.id, venue_id: venueId })
    });
    return { saved: true };
  }
}

async function isVenueSaved(venueId) {
  const u = getUser();
  if (!u || isGuest()) return false;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/venue_follows?user_id=eq.${u.id}&venue_id=eq.${venueId}`,
    { headers: authHeaders() }
  );
  if (!res.ok) return false;
  const d = await res.json();
  return d.length > 0;
}

async function fetchSavedVenues(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/venue_follows?select=venue_id,venues(*)&user_id=eq.${userId}`,
    { headers: supabaseHeaders() }
  );
  if (!res.ok) return [];
  const d = await res.json();
  return d.map(r => r.venues).filter(Boolean);
}