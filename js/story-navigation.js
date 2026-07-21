// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STORY NAVIGATION - FIXED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function initStoryNavigation() {
  const container = document.querySelector('.feed-container');
  if (!container) return;
  
  const newContainer = container.cloneNode(true);
  container.parentNode?.replaceChild(newContainer, container);
  
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let isHorizontalSwipe = false;
  
  // ─── TOUCH EVENTS ───
  newContainer.addEventListener('touchstart', function(e) {
    if (e.target.closest('button') || e.target.closest('input')) {
      isSwiping = false;
      return;
    }
    
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      isSwiping = true;
      isHorizontalSwipe = false;
    }
  }, { passive: true });
  
  newContainer.addEventListener('touchmove', function(e) {
  if (!isSwiping || e.touches.length !== 1) return;
  
  const touch = e.touches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  
  // Only handle horizontal swipes
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 5) {
    isHorizontalSwipe = true;
    currentTranslateX = deltaX;
    
    const activeCard = newContainer.querySelector('.story-card.active');
    if (activeCard) {
      //  Allow full 100% swipe (not limited)
      activeCard.style.transform = `translateX(${deltaX}px)`;
      activeCard.style.opacity = 1 - Math.min(Math.abs(deltaX) / 400, 0.7);
      activeCard.style.transition = 'none';
    }
  }
}, { passive: true });
  
  newContainer.addEventListener('touchend', function(e) {
  if (!isSwiping) {
    isSwiping = false;
    return;
  }
  
  isSwiping = false;
  
  if (!isHorizontalSwipe || Math.abs(currentTranslateX) < 20) {
    // Snap back if swipe was too short
    const activeCard = newContainer.querySelector('.story-card.active');
    if (activeCard) {
      activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      activeCard.style.transform = 'translateX(0px)';
      activeCard.style.opacity = '1';
      setTimeout(() => {
        activeCard.style.transition = '';
      }, 300);
    }
    touchStartX = 0;
    touchStartY = 0;
    currentTranslateX = 0;
    return;
  }
  
  const activeCard = newContainer.querySelector('.story-card.active');
  if (!activeCard) {
    touchStartX = 0;
    touchStartY = 0;
    currentTranslateX = 0;
    return;
  }
  
  const deltaX = currentTranslateX;
  const totalCards = newContainer.querySelectorAll('.story-card').length;
  
  // Swipe right - go to previous
  if (deltaX > 0) {
    const prevIndex = state.currentStoryIndex - 1;
    if (prevIndex >= 0) {
      // Animate card fully off screen to the right
      activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      activeCard.style.transform = 'translateX(100%)';
      activeCard.style.opacity = '0';
      setTimeout(() => {
        goToStory(prevIndex);
        activeCard.style.transform = '';
        activeCard.style.opacity = '';
        activeCard.style.transition = '';
      }, 300);
    } else {
      // At first card - snap back
      activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      activeCard.style.transform = 'translateX(0px)';
      activeCard.style.opacity = '1';
      setTimeout(() => {
        activeCard.style.transition = '';
      }, 300);
    }
  } 
  // Swipe left - go to next
  else {
    const nextIndex = state.currentStoryIndex + 1;
    if (nextIndex < totalCards) {
      // Animate card fully off screen to the left
      activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      activeCard.style.transform = 'translateX(-100%)';
      activeCard.style.opacity = '0';
      setTimeout(() => {
        goToStory(nextIndex);
        activeCard.style.transform = '';
        activeCard.style.opacity = '';
        activeCard.style.transition = '';
      }, 300);
    } else {
      // At last card - snap back
      activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      activeCard.style.transform = 'translateX(0px)';
      activeCard.style.opacity = '1';
      setTimeout(() => {
        activeCard.style.transition = '';
      }, 300);
    }
  }
  
  touchStartX = 0;
  touchStartY = 0;
  currentTranslateX = 0;
}, { passive: true }); 
  
  // ─── MOUSE EVENTS ───
  let mouseStartX = 0;
  let isMouseDown = false;
  let mouseSwiping = false;
  
  newContainer.addEventListener('mousedown', function(e) {
    if (e.target.closest('button') || e.target.closest('input')) return;
    mouseStartX = e.clientX;
    isMouseDown = true;
    mouseSwiping = false;
  });
  
  newContainer.addEventListener('mousemove', function(e) {
    if (!isMouseDown) return;
    const deltaX = e.clientX - mouseStartX;
    if (Math.abs(deltaX) > 10) {
      mouseSwiping = true;
      const activeCard = newContainer.querySelector('.story-card.active');
      if (activeCard) {
        const translateX = deltaX > 0 ? Math.min(deltaX, 100) : Math.max(deltaX, -100);
        activeCard.style.transform = `translateX(${translateX}px)`;
        activeCard.style.opacity = 1 - Math.min(Math.abs(translateX) / 300, 0.5);
        activeCard.style.transition = 'none';
      }
    }
  });
  
  newContainer.addEventListener('mouseup', function(e) {
    if (!isMouseDown) {
      isMouseDown = false;
      return;
    }
    
    isMouseDown = false;
    
    if (!mouseSwiping) {
      mouseSwiping = false;
      return;
    }
    
    const deltaX = e.clientX - mouseStartX;
    const activeCard = newContainer.querySelector('.story-card.active');
    if (!activeCard) {
      mouseSwiping = false;
      return;
    }
    
    if (Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        const prevIndex = state.currentStoryIndex - 1;
        if (prevIndex >= 0) goToStory(prevIndex);
      } else {
        const nextIndex = state.currentStoryIndex + 1;
        const totalCards = newContainer.querySelectorAll('.story-card').length;
        if (nextIndex < totalCards) goToStory(nextIndex);
      }
    }
    
    activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    activeCard.style.transform = 'translateX(0px)';
    activeCard.style.opacity = '1';
    
    setTimeout(() => {
      activeCard.style.transition = '';
    }, 300);
    
    mouseStartX = 0;
    mouseSwiping = false;
  });
  
  setupCardActions(newContainer);
}

function showStory(index) {
  const cards = document.querySelectorAll('.story-card');
  const bars = document.querySelectorAll('.story-progress .bar');
  
  if (cards.length === 0) return;
  if (index < 0) index = 0;
  if (index >= cards.length) index = cards.length - 1;
  
  cards.forEach((c, i) => {
    if (i === index) {
      c.classList.add('active');
      c.style.transform = 'translateX(0px)';
      c.style.opacity = '1';
      c.style.transition = '';
      c.style.display = ''; // ✅ Ensure it's visible
    } else {
      c.classList.remove('active');
      c.style.transform = 'translateX(0px)';
      c.style.opacity = '0';
      c.style.transition = 'none';
      // ✅ Hide completely to prevent flash
      setTimeout(() => {
        if (!c.classList.contains('active')) {
          c.style.display = 'none';
        }
      }, 100);
    }
  });
  
  // ✅ Show the active card
  const activeCard = cards[index];
  if (activeCard) {
    activeCard.style.display = '';
  }
  
  // Update progress bars
  bars.forEach((bar, i) => {
    bar.classList.toggle('active', i === index);
    const fill = bar.querySelector('.fill');
    if (fill) {
      if (i === index) {
        fill.style.animation = 'none';
        void fill.offsetHeight;
        fill.style.animation = 'progressFill 5s linear forwards';
        fill.style.width = '0%';
      } else if (i < index) {
        fill.style.animation = 'none';
        fill.style.width = '100%';
      } else {
        fill.style.animation = 'none';
        fill.style.width = '0%';
      }
    }
  });
  
  state.currentStoryIndex = index;
  if (document.getElementById('home')?.classList.contains('active')) {
    resetAutoTimer();
  }
}

function goToStory(index) {
  clearAutoTimer();
  const totalCards = document.querySelectorAll('.story-card').length;
  if (totalCards === 0) return;
  if (index < 0) index = 0;
  if (index >= totalCards) index = totalCards - 1;
  if (index === state.currentStoryIndex) return;
  
  //  Get the next card and prepare it BEFORE animating out
  const nextCard = document.querySelectorAll('.story-card')[index];
  if (nextCard) {
    // Pre-position the next card (ready to slide in)
    const direction = index > state.currentStoryIndex ? 1 : -1;
    nextCard.style.transition = 'none';
    nextCard.style.transform = `translateX(${direction * 100}%)`;
    nextCard.style.opacity = '0.5';
    nextCard.classList.add('active');
  }
  
  const currentCard = document.querySelector('.story-card.active');
  if (currentCard && nextCard) {
    const direction = index > state.currentStoryIndex ? -1 : 1;
    currentCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    currentCard.style.transform = `translateX(${direction * 100}%)`;
    currentCard.style.opacity = '0';
    
    setTimeout(() => {
      // Slide in the next card
      nextCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      nextCard.style.transform = 'translateX(0px)';
      nextCard.style.opacity = '1';
      
      // Update state after animation
      setTimeout(() => {
        currentCard.classList.remove('active');
        currentCard.style.transform = '';
        currentCard.style.opacity = '';
        currentCard.style.transition = '';
        nextCard.style.transition = '';
        state.currentStoryIndex = index;
      
        
        if (document.getElementById('home')?.classList.contains('active')) {
          resetAutoTimer();
        }
      }, 300);
    }, 50);
  } else {
    // Fallback if something goes wrong
    showStory(index);
  }
}

function resetAutoTimer() {
  clearAutoTimer();
  const homePage = document.getElementById('home');
  if (!homePage?.classList.contains('active')) return;
  
  const cards = document.querySelectorAll('.story-card');
  if (cards.length === 0) return;
  
  state.autoTimer = setTimeout(() => {
    const nextIndex = state.currentStoryIndex + 1;
    if (nextIndex < cards.length) {
      goToStory(nextIndex);
    } else {
      goToStory(0);
    }
  }, 5000);
}

function clearAutoTimer() {
  if (state.autoTimer) {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }
}