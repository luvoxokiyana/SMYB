// ----------------- Config -----------------

const CONFIG = {
  SUPABASE_URL: 'https://fwmhhujiqyzwizoyjhsa.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3bWhodWppcXl6d2l6b3lqaHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4Njk5OTMsImV4cCI6MjA5OTQ0NTk5M30.K5tHuk4asXy-o823b3yKjYl-DZhRUfIVHJ62RtmgK0I',
  CLOUDINARY_CLOUD_NAME: 'dkarvw3rw',
  CLOUDINARY_UPLOAD_PRESET: 'smyb)unsigned',
  ENV: 'production' // Change to 'production' for deployment
};


const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;
const CLOUDINARY_CLOUD_NAME = CONFIG.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = CONFIG.CLOUDINARY_UPLOAD_PRESET;

// File upload config
const FILE_UPLOAD_CONFIG = {
  maxSize: 10 * 1024 * 1024,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  maxWidth: 4096,
  maxHeight: 4096,
};

// Guest user ID
const GUEST_USER_ID = crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000';

// Log that config loaded (optional)
console.log('Config loaded:', {
  SUPABASE_URL: SUPABASE_URL ? 'Set' : 'Missing',
  SUPABASE_KEY: SUPABASE_KEY ? 'Set' : 'Missing',
  CLOUDINARY_CLOUD_NAME: CLOUDINARY_CLOUD_NAME ? 'Set' : 'Missing',
  CLOUDINARY_UPLOAD_PRESET: CLOUDINARY_UPLOAD_PRESET ? 'Set' : 'Missing',
});