
const state = {
  posts: [],
  venues: [],
  currentStoryIndex: 0,
  autoTimer: null,
  cameraStream: null,
  facingMode: 'environment',
  capturedImageData: null,
  isUploading: false,
  searchTimeout: null,
  lastFetch: 0,
  fetchCacheTime: 30000,
  profileTab: 'posts',
  selectedVenueId: null,
  selectedVenue: null,
  userLocation: null,
};