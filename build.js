// build.js
const fs = require('fs');

console.log('✅ Building config.js...');

// Read environment variables from Vercel (or use fallbacks)
const config = `// Auto-generated config.js
const CONFIG = {
  SUPABASE_URL: '${process.env.PUBLIC_SUPABASE_URL || ''}',
  SUPABASE_KEY: '${process.env.PUBLIC_SUPABASE_ANON_KEY || ''}',
  CLOUDINARY_CLOUD_NAME: '${process.env.PUBLIC_CLOUDINARY_CLOUD_NAME || ''}',
  CLOUDINARY_UPLOAD_PRESET: '${process.env.PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'brev_posts'}',
  ENV: 'production',
};

const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;
const CLOUDINARY_CLOUD_NAME = CONFIG.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = CONFIG.CLOUDINARY_UPLOAD_PRESET;
`;

fs.writeFileSync('js/config.js', config);
console.log('✅ config.js generated successfully!');