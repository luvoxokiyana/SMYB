// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CAMERA & UPLOAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function openCamera() {
  if (isGuest()) {
    showToast('Sign in to post', 'error');
    return;
  }
  
  const modal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraFeed');
  const preview = document.getElementById('cameraPreview');
  
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: state.facingMode,
        width: { ideal: 1080 },
        height: { ideal: 1920 }
      },
      audio: false
    });
    video.srcObject = state.cameraStream;
    video.style.display = 'block';
    preview.style.display = 'none';
    state.capturedImageData = null;
    document.getElementById('cameraCapture')?.classList.remove('recording');
  } catch (e) {
    console.error('Camera error:', e);
    showToast('Camera access denied. Use gallery instead.', 'error');
    setTimeout(() => {
      const galleryInput = document.getElementById('galleryInput');
      if (galleryInput) galleryInput.click();
    }, 1500);
  }
}

function closeCamera() {
  const modal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraFeed');
  const preview = document.getElementById('cameraPreview');
  
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  if (video) {
    video.srcObject = null;
    video.style.display = 'block';
  }
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  modal.classList.remove('active');
  document.body.style.overflow = '';
  document.getElementById('cameraCapture')?.classList.remove('recording');
  
}

async function capturePhoto() {
  const video = document.getElementById('cameraFeed');
  const preview = document.getElementById('cameraPreview');
  const canvas = document.createElement('canvas');
  
  let w = video.videoWidth || 1080;
  let h = video.videoHeight || 1920;
  const ratio = 9 / 16;
  const cur = w / h;
  
  if (cur > ratio) {
    const nw = h * ratio;
    const ox = (w - nw) / 2;
    canvas.width = nw;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (state.facingMode === 'user') {
      ctx.translate(nw, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, ox, 0, nw, h, 0, 0, nw, h);
  } else {
    const nh = w / ratio;
    const oy = (h - nh) / 2;
    canvas.width = w;
    canvas.height = nh;
    const ctx = canvas.getContext('2d');
    if (state.facingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, oy, w, nh, 0, 0, w, nh);
  }
  
  state.capturedImageData = canvas.toDataURL('image/jpeg', 0.85);
  
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  
  preview.src = state.capturedImageData;
  preview.style.display = 'block';
  video.style.display = 'none';
  document.getElementById('cameraCapture').classList.add('recording');
  
  setTimeout(() => openPostPreview(state.capturedImageData), 150);
}

async function selectFromGallery() {
  if (isGuest()) {
    showToast('Sign in to post', 'error');
    return;
  }
  document.getElementById('galleryInput').click();
}

async function handleGallerySelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  console.log('📷 File selected:', file.name, file.type, file.size);
  
  try {
    await validateFile(file);
    
    // Don't stop camera stream yet - we'll do it after
    // if (state.cameraStream) {
    //   state.cameraStream.getTracks().forEach(t => t.stop());
    //   state.cameraStream = null;
    // }
    
    const reader = new FileReader();
    
    reader.onload = function(event) {
      const imageData = event.target.result;
      console.log(' FileReader result length:', imageData.length);
      
      //  STORE the image data
      state.capturedImageData = imageData;
      
      //  Close camera AFTER storing
      if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(t => t.stop());
        state.cameraStream = null;
      }
      
      closeCamera(); // This should NOT clear the image data
      
      //  Use the stored data
      console.log(' Calling openPostPreview with state.capturedImageData');
      openPostPreview(state.capturedImageData);
    };
    
    reader.onerror = function(error) {
      console.error(' FileReader error:', error);
      showToast('Failed to read file', 'error');
    };
    
    reader.readAsDataURL(file);
    e.target.value = '';
    
  } catch (error) {
    console.error(' Gallery error:', error);
    showToast(error.message || 'Failed to select image', 'error');
    e.target.value = '';
  }
}

async function flipCamera() {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  
  const video = document.getElementById('cameraFeed');
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: state.facingMode,
        width: { ideal: 1080 },
        height: { ideal: 1920 }
      },
      audio: false
    });
    video.srcObject = state.cameraStream;
    video.style.display = 'block';
    document.getElementById('cameraPreview').style.display = 'none';
  } catch (e) {
    showToast('Cannot switch camera', 'error');
  }
}

async function uploadToCloudinary(imageData) {
  if (imageData.startsWith('http') && !imageData.startsWith('data:')) {
    return imageData;
  }
  
  console.log('Uploading to Cloudinary...');
  const response = await fetch(imageData);
  const blob = await response.blob();
  
  const formData = new FormData();
  formData.append('file', blob, `brev-${Date.now()}.jpg`);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'brev_posts');
  
  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );
  
  const data = await uploadRes.json();
  if (!uploadRes.ok) {
    console.error('Cloudinary error:', data);
    throw new Error(data.error?.message || 'Upload failed');
  }
  
  console.log('Uploaded:', data.secure_url);
  return data.secure_url;
}