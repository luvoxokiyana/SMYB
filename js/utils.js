// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function timeAgo(ts) {
  if (!ts) return 'Just now';
  const s = Math.floor((new Date() - new Date(ts)) / 1000);
  if (s < 0) return 'Just now';
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd';
  return new Date(ts).toLocaleDateString();
}

function escapeHtml(t) {
  if (!t) return '';
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function showToast(msg, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  
  requestAnimationFrame(() => t.classList.add('show'));
  
  const timeout = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  }, 3000);
  
  t.addEventListener('click', () => {
    clearTimeout(timeout);
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  });
}

function validateFile(file) {
  if (file.size > FILE_UPLOAD_CONFIG.maxSize) {
    throw new Error(`File too large. Max ${FILE_UPLOAD_CONFIG.maxSize / 1024 / 1024}MB`);
  }
  if (!FILE_UPLOAD_CONFIG.allowedTypes.includes(file.type)) {
    throw new Error('File type not supported. Use JPEG, PNG, or WebP.');
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width > FILE_UPLOAD_CONFIG.maxWidth || img.height > FILE_UPLOAD_CONFIG.maxHeight) {
        reject(new Error(`Image too large. Max ${FILE_UPLOAD_CONFIG.maxWidth}x${FILE_UPLOAD_CONFIG.maxHeight}`));
      } else {
        resolve(true);
      }
    };
    img.onerror = () => reject(new Error('Invalid image file'));
    img.src = url;
  });
}

function compressImage(file, maxW = 1080, q = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;

        if (w > maxW) {
          h = (maxW / w) * h;
          w = maxW;
        }

        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        const dataUrl = canvas.toDataURL("image/jpeg", q);

        if (!dataUrl || !dataUrl.startsWith("data:image/")) {
          reject(new Error("Compression failed: invalid image data"));
          return;
        }

        resolve(dataUrl);
      };

      img.onerror = () => {
        reject(new Error("Failed to load image for compression"));
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
}

function getGuestId() {
  let guestId = localStorage.getItem('brev_guest_id');
  if (!guestId) {
    guestId = crypto.randomUUID ? crypto.randomUUID() : 'guest_' + Date.now();
    localStorage.setItem('brev_guest_id', guestId);
  }
  return guestId;
}

function isGuest() {
  const user = getUser();
  if (!user) return true;
  return user.id === GUEST_USER_ID || user.is_guest === true;
}

function getOptimizedImageUrl(url, width = 400, quality = 80) {
  if (!url) return '';

  if (url.includes('cloudinary.com')) {
    //Add transformation parametera
    const baseUrl = url.split('/upload/');
    if (baseUrl.length === 2) {
      return `${baseUrl[0]}/upload/w_${width},q_${quality},f_auto/${baseUrl[1]}`
    }
  }
  return url;
}

// Get current user ID
function getCurrentUserId() {
  const u = getUser();
  return u?.id || null;
}