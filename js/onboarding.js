// js/onboarding.js
const ONBOARDING_KEY = 'brev_onboarding_complete';

function checkOnboarding() {
  const completed = localStorage.getItem(ONBOARDING_KEY);
  if (!completed && !isGuest()) {
    showOnboarding();
  }
}

function showOnboarding() {
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.className = 'onboarding-overlay';
  
  overlay.innerHTML = `
    <div class="onboarding-content">
      <div class="onboarding-slide active" data-slide="0">
        <span class="onboarding-emoji">🍸</span>
        <h2>Welcome to Brev</h2>
        <p>Discover the best nightlife spots through real people, not algorithms.</p>
      </div>
      <div class="onboarding-slide" data-slide="1">
        <span class="onboarding-emoji">📸</span>
        <h2>Share Your Night</h2>
        <p>Take a photo of your drink, add the venue, and share it with the community.</p>
      </div>
      <div class="onboarding-slide" data-slide="2">
        <span class="onboarding-emoji">📍</span>
        <h2>Discover Venues</h2>
        <p>See where others are going and find the best spots in your city.</p>
      </div>
      <div class="onboarding-slide" data-slide="3">
        <span class="onboarding-emoji">👥</span>
        <h2>Connect & Follow</h2>
        <p>Follow people who share your taste and build your nightlife network.</p>
      </div>
      <div class="onboarding-dots">
        <span class="dot active" data-dot="0"></span>
        <span class="dot" data-dot="1"></span>
        <span class="dot" data-dot="2"></span>
        <span class="dot" data-dot="3"></span>
      </div>
      <button class="onboarding-next">Next</button>
      <button class="onboarding-skip">Skip</button>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  let currentSlide = 0;
  const slides = overlay.querySelectorAll('.onboarding-slide');
  const dots = overlay.querySelectorAll('.dot');
  const nextBtn = overlay.querySelector('.onboarding-next');
  const skipBtn = overlay.querySelector('.onboarding-skip');
  
  function goToSlide(index) {
    slides.forEach((s, i) => {
      s.classList.toggle('active', i === index);
    });
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === index);
    });
    currentSlide = index;
    nextBtn.textContent = index === slides.length - 1 ? 'Get Started' : 'Next';
  }
  
  function completeOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    overlay.remove();
  }
  
  nextBtn.addEventListener('click', () => {
    if (currentSlide === slides.length - 1) {
      completeOnboarding();
    } else {
      goToSlide(currentSlide + 1);
    }
  });
  
  skipBtn.addEventListener('click', completeOnboarding);
  
  dots.forEach(dot => {
    dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.dot)));
  });
  
  document.addEventListener('keydown', (e) => {
    if (!overlay) return;
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      if (currentSlide === slides.length - 1) {
        completeOnboarding();
      } else {
        goToSlide(currentSlide + 1);
      }
    }
    if (e.key === 'Escape') completeOnboarding();
  });
}