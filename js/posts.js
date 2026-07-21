// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POSTS, LIKES, COMMENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let fetchPostsPromise = null;

async function fetchPosts(force = false) {
  if (force) {
    if (fetchPostsPromise) {
      await fetchPostsPromise;
    }
    fetchPostsPromise = null;
    state.lastFetch = 0;
  }
  
  if (fetchPostsPromise) {
    return fetchPostsPromise;
  }
  
  if (!force && Date.now() - state.lastFetch < state.fetchCacheTime && state.posts.length > 0) {
    return state.posts;
  }
  
  fetchPostsPromise = (async () => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/posts?select=*,profiles!posts_user_id_fkey(username,full_name,avatar_url)&order=created_at.desc.nullslast&limit=50`,
        { headers: supabaseHeaders() }
      );
      if (!res.ok) throw new Error('Failed');
      
      state.posts = (await res.json()).map(p => ({
        ...p,
        poster_name: p.profiles?.full_name || p.profiles?.username || 'Anonymous',
        poster_avatar: p.profiles?.avatar_url || null,
        likes_count: p.likes_count || 0,
        comments_count: p.comments_count || 0,
      }));
      state.lastFetch = Date.now();
      return state.posts;
    } catch (e) {
      console.error('Fetch posts error:', e);
      return state.posts.length ? state.posts : [];
    } finally {
      fetchPostsPromise = null;
    }
  })();
  
  return fetchPostsPromise;
}

async function submitPost(imageUrl, caption, venueName, venueId) {
  if (!rateLimiters.post.canMakeRequest()) {
    throw new Error('Too many posts. Please wait a moment.');
  }
  
  const u = getUser();
  if (!u || isGuest()) throw new Error('Sign in to post');
  
  const body = {
    user_id: u.id,
    image_url: imageUrl,
    caption: (caption || '').trim().slice(0, 200),
    venue: venueName || null
  };
  if (venueId) body.venue_id = venueId;
  
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const text = await res.text();
    console.error('Post error response:', text);
    throw new Error('Failed to post');
  }
  
  // Handle empty response
  const text = await res.text();
  if (!text || text.trim() === '') {
    return { success: true, id: 'pending' };
  }
  
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn('Could not parse response:', text);
    return { success: true, id: 'pending' };
  }
}

async function likePost(postId) {
  const u = getUser();
  if (!u || isGuest()) {
    showToast('Sign in to like', 'error');
    return { liked: false, error: 'not_authenticated' };
  }
  
  try {
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/likes?post_id=eq.${postId}&user_id=eq.${u.id}`,
      { headers: authHeaders() }
    );
    
    if (!checkRes.ok) {
      console.error('Like check failed:', await checkRes.text());
      throw new Error('Failed to check like status');
    }
    
    const existingLikes = await checkRes.json();
    
    if (existingLikes && existingLikes.length > 0) {
      const deleteRes = await fetch(
        `${SUPABASE_URL}/rest/v1/likes?id=eq.${existingLikes[0].id}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      if (!deleteRes.ok) {
        throw new Error('Failed to unlike');
      }
      const post = state.posts.find(x => x.id === postId);
      if (post) {
        post.likes_count = Math.max(0, (post.likes_count || 0) - 1);
      }
      return { liked: false };
    } else {
      const likeRes = await fetch(
        `${SUPABASE_URL}/rest/v1/likes`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ post_id: postId, user_id: u.id })
        }
      );
      if (!likeRes.ok) {
        const errorText = await likeRes.text();
        console.error('Like failed:', errorText);
        throw new Error('Failed to like');
      }
      const post = state.posts.find(x => x.id === postId);
      if (post) {
        post.likes_count = (post.likes_count || 0) + 1;
      }
      return { liked: true };
    }
  } catch (error) {
    console.error('Like error:', error);
    if (error.message === 'Not authenticated') {
      showToast('Please sign in again', 'error');
    } else {
      showToast('Failed to update like. Please try again.', 'error');
    }
    return { liked: false, error: error.message };
  }
}

async function addComment(postId, text) {
  const u = getUser();
  if (!u || isGuest()) throw new Error('Sign in to comment');
  
  const res = await fetch(`${SUPABASE_URL}/rest/v1/comments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      post_id: postId,
      user_id: u.id,
      text: text.trim().slice(0, 500)
    })
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error('Comment API error:', errorText);
    throw new Error('Failed to comment');
  }
  
  // Get the created comment (for confirmation)
  const responseText = await res.text();
  let createdComment;
  
  if (!responseText || responseText.trim() === '') {
    createdComment = { id: 'pending-' + Date.now(), text, created_at: new Date().toISOString(), user_id: u.id, post_id: postId };
  } else {
    try {
      const data = JSON.parse(responseText);
      createdComment = data[0] || data;
    } catch (e) {
      createdComment = { id: 'pending-' + Date.now(), text, created_at: new Date().toISOString(), user_id: u.id, post_id: postId };
    }
  }
  
  // Update post comment count
  const p = state.posts.find(x => x.id === postId);
  if (p) p.comments_count = (p.comments_count || 0) + 1;
  
  return createdComment;
}

async function fetchComments(postId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/comments?select=*,profiles!comments_user_id_fkey(username,full_name,avatar_url)&post_id=eq.${postId}&order=created_at.asc`,
      { headers: supabaseHeaders() }
    );
    if (!res.ok) {
      console.error('Fetch comments error:', res.status, await res.text());
      return [];
    }
    return await res.json();
  } catch (error) {
    console.error('Fetch comments error:', error);
    return [];
  }
}

async function fetchUserPosts(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/posts?select=*&user_id=eq.${userId}&order=created_at.desc.nullslast&limit=20`,
    { headers: supabaseHeaders() }
  );
  if (!res.ok) return [];
  return await res.json();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOLLOW SYSTEM - CORE FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function toggleFollowUser(targetUserId) {
  console.log('🔄 toggleFollowUser called for:', targetUserId);
  
  const u = getUser();
  if (!u || isGuest()) {
    showToast('Sign in to follow', 'error');
    return { following: false };
  }
  if (u.id === targetUserId) {
    showToast('Cannot follow yourself', 'error');
    return { following: false };
  }
  
  try {
    const check = await fetch(
      `${SUPABASE_URL}/rest/v1/follows?follower_id=eq.${u.id}&following_id=eq.${targetUserId}`,
      { headers: authHeaders() }
    );
    const ex = check.ok ? await check.json() : [];
    
    if (ex.length > 0) {
      // Unfollow
      const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/follows?id=eq.${ex[0].id}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!deleteRes.ok) throw new Error('Failed to unfollow');
      console.log('✅ Unfollowed:', targetUserId);
      return { following: false };
    } else {
      // Follow
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/follows`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          follower_id: u.id,
          following_id: targetUserId
        })
      });
      if (!insertRes.ok) throw new Error('Failed to follow');
      console.log('✅ Followed:', targetUserId);
      return { following: true };
    }
  } catch (error) {
    console.error('Follow error:', error);
    showToast('Failed to update follow status', 'error');
    return { following: false, error: error.message };
  }
}

async function isFollowing(targetUserId) {
  const u = getUser();
  if (!u || isGuest()) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/follows?follower_id=eq.${u.id}&following_id=eq.${targetUserId}`,
      { headers: authHeaders() }
    );
    if (!res.ok) return false;
    const d = await res.json();
    return d.length > 0;
  } catch (error) {
    console.error('isFollowing error:', error);
    return false;
  }
}

async function getFollowCounts(userId) {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${getSession()?.access_token || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  
  try {
    const [followersRes, followingRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/follows?following_id=eq.${userId}&select=id`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/follows?follower_id=eq.${userId}&select=id`, { headers }),
    ]);
    const followers = followersRes.ok ? await followersRes.json() : [];
    const following = followingRes.ok ? await followingRes.json() : [];
    return { followers: (followers || []).length, following: (following || []).length };
  } catch (error) {
    console.error('Get follow counts error:', error);
    return { followers: 0, following: 0 };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOLLOW SYSTEM - ADDITIONAL FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkFollowStatus(targetUserId) {
  const u = getUser();
  if (!u || isGuest()) return false;
  if (u.id === targetUserId) return true;
  
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/follows?follower_id=eq.${u.id}&following_id=eq.${targetUserId}&select=id`,
      { headers: authHeaders() }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.length > 0;
  } catch (error) {
    console.error('Check follow error:', error);
    return false;
  }
}

async function getFollowers(userId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/follows?select=follower_id,profiles!follows_follower_id_fkey(id,username,full_name,avatar_url)&following_id=eq.${userId}`,
      { headers: supabaseHeaders() }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(item => item.profiles).filter(Boolean);
  } catch (error) {
    console.error('Get followers error:', error);
    return [];
  }
}

async function getFollowing(userId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/follows?select=following_id,profiles!follows_following_id_fkey(id,username,full_name,avatar_url)&follower_id=eq.${userId}`,
      { headers: supabaseHeaders() }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(item => item.profiles).filter(Boolean);
  } catch (error) {
    console.error('Get following error:', error);
    return [];
  }
}