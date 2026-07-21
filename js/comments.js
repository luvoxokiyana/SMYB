// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openCommentsModal(postId) {
  const modal = document.getElementById('commentsModal');
  const list = document.getElementById('commentsList');
  
  if (list) {
    list.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner"></div></div>';
  }
  
  const input = document.getElementById('commentInput');
  if (input) input.value = '';
  
  modal.dataset.postId = postId;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  loadComments(postId);
}

function closeCommentsModal() {
  document.getElementById('commentsModal').classList.remove('active');
  document.body.style.overflow = '';
}

async function loadComments(postId) {
  const list = document.getElementById('commentsList');
  if (!list) return;
  
  try {
    const comments = await fetchComments(postId);
    if (comments.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400);"><p>No comments yet</p></div>';
      return;
    }
    
    list.innerHTML = comments.map(c => `
      <div class="comment-item">
        <div class="comment-avatar">${(c.profiles?.full_name || c.profiles?.username || 'U').charAt(0).toUpperCase()}</div>
        <div class="comment-content">
          <div class="comment-header">
            <span class="comment-name">${escapeHtml(c.profiles?.full_name || c.profiles?.username || 'User')}</span>
            <span class="comment-time">${timeAgo(c.created_at)}</span>
          </div>
          <p class="comment-text">${escapeHtml(c.text)}</p>
        </div>
      </div>
    `).join('');
    
    list.scrollTop = list.scrollHeight;
  } catch (e) {
    list.innerHTML = '<p style="text-align:center;color:var(--gray-400);">Failed to load comments</p>';
  }
}

async function submitComment() {
  const modal = document.getElementById('commentsModal');
  const input = document.getElementById('commentInput');
  if (!input) return;
  
  const text = input.value.trim();
  if (!text || isGuest()) {
    if (isGuest()) showToast('Sign in to comment', 'error');
    return;
  }
  
  const btn = document.getElementById('commentSubmit');
  if (btn) btn.disabled = true;
  
  try {
    // Actually wait for the response before doing anything
    const result = await addComment(modal.dataset.postId, text);
    
    // Only clear and reload if successful
    if (result && result.id) {
      input.value = '';
      await loadComments(modal.dataset.postId);
      showToast('Comment added', 'success');
    } else {
      throw new Error('Comment creation failed');
    }
  } catch (e) {
    console.error('Comment error:', e);
    // Only show error if it's a real error (not a success that was misreported)
    showToast('Failed to comment', 'error');
  } finally {
    if (btn) btn.disabled = false;
    input.focus();
  }
}