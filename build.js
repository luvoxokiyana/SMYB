// build.js - Run this before deployment
const fs = require('fs');
const path = require('path');

// Read environment variables
require('dotenv').config();

const configTemplate = fs.readFileSync('config.template.js', 'utf8');
const configContent = configTemplate
  .replace(/{{SUPABASE_URL}}/g, process.env.SUPABASE_URL)
  .replace(/{{SUPABASE_ANON_KEY}}/g, process.env.SUPABASE_ANON_KEY)
  .replace(/{{CLOUDINARY_CLOUD_NAME}}/g, process.env.CLOUDINARY_CLOUD_NAME)
  .replace(/{{CLOUDINARY_UPLOAD_PRESET}}/g, process.env.CLOUDINARY_UPLOAD_PRESET)
  .replace(/{{NODE_ENV}}/g, 'production');

fs.writeFileSync('config.js', configContent);
console.log('✅ config.js generated');