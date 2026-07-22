// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEED RENDERER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ✅ Feed mode state (MUST BE AT TOP)
let feedMode = "for-you"; // 'for-you' or 'following'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER FUNCTIONS FOR SMART FEED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Shuffle array (Fisher-Yates)
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SMART "FOR YOU" FEED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getForYouFeed(allPosts) {
  const u = getUser();
  
  // Guest: show all posts in random order
  if (!u || u.is_guest) {
    return shuffleArray(allPosts);
  }
  
  let scoredPosts = [];
  let savedVenueIds = new Set();
  
  // Get user's saved venues
  try {
    const savedVenues = await fetchSavedVenues(u.id);
    savedVenueIds = new Set(savedVenues.map(v => v.id));
  } catch (e) {
    console.warn('Could not fetch saved venues:', e);
  }
  
  // Get user's following list
  let followingIds = new Set();
  try {
    const following = await getFollowing(u.id);
    followingIds = new Set(following.map(f => f.id));
  } catch (e) {
    console.warn('Could not fetch following:', e);
  }
  
  for (const post of allPosts) {
    let score = 0;
    
    // 1. Nearby (location-based)
    if (post.venue_id) {
      const venue = state.venues.find(v => v.id === post.venue_id);
      if (venue && venue.latitude && venue.longitude && state.userLocation) {
        const distance = calculateDistance(
          state.userLocation.lat,
          state.userLocation.lng,
          venue.latitude,
          venue.longitude
        );
        if (distance < 10) {
          score += 10; // Very close
        } else if (distance < 25) {
          score += 5; // Nearby
        }
      }
    }
    
    // 2. Saved venues (user has saved this venue)
    if (post.venue_id && savedVenueIds.has(post.venue_id)) {
      score += 8;
    }
    
    // 3. Followed users
    if (followingIds.has(post.user_id)) {
      score += 10;
    }
    
    // 4. Recently active (likes/comments)
    const engagementScore = (post.likes_count || 0) + (post.comments_count || 0) * 2;
    if (engagementScore > 10) {
      score += 3;
    }
    
    // 5. Random bonus (ensures variety, not just by date)
    score += Math.random() * 2;
    
    scoredPosts.push({ ...post, score });
  }
  
  // Sort by score (highest first)
  scoredPosts.sort((a, b) => b.score - a.score);
  
  // Take top posts + some random ones for discovery
  const topCount = Math.min(30, scoredPosts.length);
  const topPosts = scoredPosts.slice(0, topCount);
  const remaining = scoredPosts.slice(topCount);
  const randomRemaining = shuffleArray(remaining).slice(0, 10);
  
  // Final list: top posts + random recommendations, shuffled
  return shuffleArray([...topPosts, ...randomRemaining]);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOAD FEED (UPDATED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function loadFeed(force = false) {
  const container = document.querySelector(".feed-container");
  if (!container) return;

  try {
    await fetchPosts(force);
    let posts = state.posts;

    if (feedMode === "following") {
      // Following feed: only people you follow
      const u = getUser();
      if (u && !u.is_guest) {
        const following = await getFollowing(u.id);
        const followingIds = new Set(following.map((f) => f.id));
        posts = posts.filter((p) => followingIds.has(p.user_id));
        posts = shuffleArray(posts); // Random order
      } else {
        posts = [];
        showToast("Sign in to see posts from people you follow", "info");
      }
    } else {
      // "For You" feed: smart recommendations
      posts = await getForYouFeed(posts);
    }

    if (posts.length === 0) {
      showEmptyState(
        feedMode === "following"
          ? "No posts from people you follow yet"
          : "No posts yet"
      );
      return;
    }

    renderStories(posts);
  } catch (e) {
    console.error("Load feed error:", e);
    showEmptyState("Failed to load");
  }
}

// ─── Switch Feed Mode ───
function switchFeedMode(mode) {
  feedMode = mode;
  loadFeed(true);

  // Update tab UI
  document.querySelectorAll(".feed-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.feed === mode);
  });
}

// ─── Setup Feed Tabs ───
function setupFeedTabs() {
  document.querySelectorAll(".feed-tab").forEach((tab) => {
    tab.addEventListener("click", function () {
      const mode = this.dataset.feed;
      switchFeedMode(mode);
    });
  });
}

// ═══════════════════════════════════════════════
// REST OF YOUR EXISTING CODE BELOW (showEmptyState, renderStories, createStoryCard, etc.)
// ═══════════════════════════════════════════════

function showEmptyState(msg = "No posts yet") {
  const container = document.querySelector(".feed-container");
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;color:var(--gray-400);">
      <i class="fa-solid fa-wine-glass" style="font-size:48px;margin-bottom:16px;color:var(--gray-600);"></i>
      <h2 style="font-size:20px;font-weight:700;color:var(--white);margin-bottom:8px;">${msg}</h2>
      <p style="font-size:14px;max-width:280px;">Be the first! Tap <i class="fa-solid fa-camera"></i> to post.</p>
    </div>
  `;
}

function renderStories(postsData) {
  const container = document.querySelector(".feed-container");
  if (!container) return;

  // ✅ Remove only the story cards, not the tabs
  const tabsWrapper = container.querySelector('.feed-tabs-wrapper');
  
  // Clear all children except tabs
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  
  // ✅ Re-add tabs if they existed
  if (tabsWrapper) {
    container.appendChild(tabsWrapper);
  }

  // Add story cards
  postsData.forEach((post, i) => {
    container.appendChild(createStoryCard(post, i, postsData));
  });

  state.currentStoryIndex = 0;
  showStory(0);
  requestAnimationFrame(() => {
    initStoryNavigation();
  });
}

function createStoryCard(post, index, allPosts) {
  const div = document.createElement("div");
  div.className = `story-card ${index === 0 ? "active" : ""}`;
  div.dataset.index = index;
  div.dataset.postId = post.id;

  const imageUrl =
    post.image_url ||
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"%3E%3Crect fill="%231a1a1a" width="400" height="400"/%3E%3Ctext x="200" y="200" font-family="Inter" font-size="24" fill="%23666" text-anchor="middle" dy=".3em"%3E🍸%3C/text%3E%3C/svg%3E';

  div.style.backgroundImage = `url(${post.image_url})`;
  div.style.backgroundSize = "cover";
  div.style.backgroundPosition = "center";
  
  // ✅ Add padding-top to make room for tabs (60px for tabs + 44px for status bar)
  div.style.paddingTop = '60px';

  const initial = (post.poster_name || "A").charAt(0).toUpperCase();
  const venueName = post.venue || "Unknown venue";
  const venuePostCount = allPosts.filter((p) => p.venue === post.venue).length;
  const userId = post.user_id;
  const currentUser = getUser();
  const showFollowBtn = userId && userId !== currentUser?.id;

  div.innerHTML = `
    <div class="story-header">
      <div class="story-avatar" onclick="viewUserProfile('${userId}')" style="cursor:pointer;">${initial}</div>
      <div class="story-meta">
        <span class="story-name" onclick="viewUserProfile('${userId}')" style="cursor:pointer;">${escapeHtml(post.poster_name)}</span>
        <span class="story-venue">
          <i class="fa-solid fa-location-dot" style="font-size:11px;color:rgba(255,255,255,0.5);margin-right:2px;"></i>
          ${escapeHtml(venueName)}
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
        ${
          showFollowBtn
            ? `
          <button class="follow-btn-mini" data-user-id="${userId}" onclick="event.stopPropagation(); toggleFollowFromPost('${userId}', this)">
            Follow
          </button>
        `
            : ""
        }
        <span class="story-time">${timeAgo(post.created_at)}</span>
      </div>
    </div>
    <div class="story-caption">${escapeHtml(post.caption || "")}</div>
    <div class="story-actions">
      <button class="action-btn like-btn" data-post-id="${post.id}">
        <i class="fa-regular fa-heart"></i>
        <span>${post.likes_count || 0}</span>
      </button>
      <button class="action-btn comment-btn" data-post-id="${post.id}">
        <i class="fa-regular fa-comment"></i>
        <span>${post.comments_count || 0}</span>
      </button>
      <button class="action-btn share-btn" data-post-id="${post.id}" onclick="handleShare('${post.id}', event)">
        <i class="fa-regular fa-paper-plane"></i>
      </button>
    </div>
    <div class="story-venue-tag" data-venue-id="${post.venue_id || ""}" data-venue="${escapeHtml(venueName)}">
      <i class="fa-solid fa-location-dot"></i> ${escapeHtml(venueName)} · ${venuePostCount} posts
    </div>
  `;
  return div;
}

async function handleShare(postId, event) {
  event.stopPropagation();
  const post = state.posts.find(x => x.id === postId);
  if (!post) return;
  
  const u = getUser();
  
  if (!u || u.is_guest) {
    showSignUpPopup(post);
    return;
  }
  
  sharePost(post);
}

function showSignUpPopup(post) {
  const overlay = document.createElement('div');
  overlay.className = 'signup-popup-overlay';
  overlay.innerHTML = `
    <div class="signup-popup">
      <button class="signup-popup-close">&times;</button>
      <span class="signup-popup-emoji">🍸</span>
      <h3>Join Brev to Share!</h3>
      <p>Sign up to share this post with your friends and discover the night.</p>
      <div class="signup-popup-buttons">
        <a href="/auth/signup" class="signup-popup-btn primary">Sign Up</a>
        <a href="/auth/signin" class="signup-popup-btn secondary">Sign In</a>
      </div>
      <p class="signup-popup-skip" onclick="this.closest('.signup-popup-overlay').remove()">Skip for now</p>
    </div>
  `;
  document.body.appendChild(overlay);
  
  overlay.querySelector('.signup-popup-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

async function sharePost(post) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Check out this post on Brev',
        text: post.caption || 'Check out this venue!',
        url: post.image_url
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share error:', err);
      }
    }
  } else {
    try {
      await navigator.clipboard.writeText(post.image_url);
      showToast('Link copied!', 'success');
    } catch (err) {
      showToast('Copy this: ' + post.image_url, 'info');
    }
  }
}

// Toggle follow from post
async function toggleFollowFromPost(targetUserId, btn) {
  const result = await toggleFollowUser(targetUserId);
  if (result.following) {
    btn.textContent = "✓ Following";
    btn.style.background = "rgba(255,255,255,0.15)";
    btn.style.color = "#4ade80";
    showToast("Followed!", "success");
  } else if (result.following === false && !result.error) {
    btn.textContent = "Follow";
    btn.style.background = "";
    btn.style.color = "";
    showToast("Unfollowed", "info");
  }
}

function setupCardActions(container) {
  // Like Button
  container.querySelectorAll(".like-btn").forEach((btn) => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode?.replaceChild(newBtn, btn);

    newBtn.addEventListener("click", async function (e) {
      e.stopPropagation();
      e.preventDefault();

      if (isGuest()) {
        showToast("Sign in to like", "error");
        return;
      }

      const postId = this.dataset.postId;
      if (!postId) return;

      const icon = this.querySelector("i");
      const countSpan = this.querySelector("span");
      const wasLiked = icon.classList.contains("fa-solid");

      if (wasLiked) {
        icon.className = "fa-regular fa-heart";
        icon.style.color = "";
        if (countSpan)
          countSpan.textContent = Math.max(
            0,
            parseInt(countSpan.textContent) - 1,
          );
      } else {
        icon.className = "fa-solid fa-heart";
        icon.style.color = "#ff3040";
        if (countSpan)
          countSpan.textContent = (parseInt(countSpan.textContent) || 0) + 1;
      }

      try {
        const result = await likePost(postId);
        const post = state.posts.find((p) => p.id === postId);
        if (post && countSpan) {
          countSpan.textContent = post.likes_count || 0;
        }
        if (result.liked) {
          icon.className = "fa-solid fa-heart";
          icon.style.color = "#ff3040";
        } else {
          icon.className = "fa-regular fa-heart";
          icon.style.color = "";
        }
      } catch (error) {
        console.error("Like error:", error);
        const post = state.posts.find((p) => p.id === postId);
        if (post && countSpan) {
          countSpan.textContent = post.likes_count || 0;
        }
        if (wasLiked) {
          icon.className = "fa-solid fa-heart";
          icon.style.color = "#ff3040";
        } else {
          icon.className = "fa-regular fa-heart";
          icon.style.color = "";
        }
        showToast("Failed to like. Try again.", "error");
      }
    });
  });

  // Comment Button
  container.querySelectorAll(".comment-btn").forEach((btn) => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode?.replaceChild(newBtn, btn);

    newBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      const postId = this.dataset.postId;
      if (postId) openCommentsModal(postId);
    });
  });

  // Share Button
  container.querySelectorAll(".share-btn").forEach((btn) => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode?.replaceChild(newBtn, btn);

    newBtn.addEventListener("click", async function (e) {
      e.stopPropagation();
      e.preventDefault();
      const post = state.posts.find((x) => x.id === this.dataset.postId);
      if (!post) return;

      if (navigator.share) {
        try {
          await navigator.share({
            title: "Check out this post on Brev",
            text: post.caption || "Check out this venue!",
            url: post.image_url,
          });
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("Share error:", err);
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(post.image_url);
          showToast("Link copied", "success");
        } catch (err) {
          showToast("Copy this: " + post.image_url, "info");
        }
      }
    });
  });

  // Venue Tag
  container.querySelectorAll(".story-venue-tag").forEach((tag) => {
    const newTag = tag.cloneNode(true);
    tag.parentNode?.replaceChild(newTag, tag);

    newTag.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      const venueId = this.dataset.venueId;
      if (venueId) {
        openVenueProfile(venueId);
      } else {
        showToast("Venue details coming soon", "info");
      }
    });
  });
}


window.setupFeedTabs = setupFeedTabs;
window.switchFeedMode = switchFeedMode;
window.loadFeed = loadFeed;