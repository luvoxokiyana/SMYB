// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEED RENDERER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function loadFeed(force = false) {
  const container = document.querySelector(".feed-container");
  if (!container) return;

  try {
    await fetchPosts(force);
    if (state.posts.length === 0) {
      showEmptyState();
      return;
    }
    renderStories(state.posts);
  } catch (e) {
    console.error("Load feed error:", e);
    showEmptyState("Failed to load");
  }
}

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

  container.innerHTML = "";
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

  const initial = (post.poster_name || "A").charAt(0).toUpperCase();
  const venueName = post.venue || "Unknown venue";
  const venuePostCount = allPosts.filter((p) => p.venue === post.venue).length;
  const userId = post.user_id;
  const currentUser = getUser();
  const showFollowBtn = userId && userId !== currentUser?.id;

  div.innerHTML = `
    <div class="story-progress">
      ${allPosts
        .map(
          (_, i) => `
        <div class="bar ${i === index ? "active" : ""}">
          <div class="fill" ${i < index ? 'style="width:100%"' : ""}></div>
        </div>
      `,
        )
        .join("")}
    </div>
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
      <button class="action-btn share-btn" data-post-id="${post.id}">
        <i class="fa-regular fa-paper-plane"></i>
      </button>
    </div>
    <div class="story-venue-tag" data-venue-id="${post.venue_id || ""}" data-venue="${escapeHtml(venueName)}">
      <i class="fa-solid fa-location-dot"></i> ${escapeHtml(venueName)} · ${venuePostCount} posts
    </div>
  `;
  return div;
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

      // Optimistic update
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
