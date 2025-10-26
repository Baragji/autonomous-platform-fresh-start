/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '4mb' }
  },
  env: {
    UI_BACKEND_MODE: process.env.UI_BACKEND_MODE || 'evidence',
    UI_GATEWAY_BASE: process.env.UI_GATEWAY_BASE || 'http://localhost:3030',
    UI_EVIDENCE_DIR: process.env.UI_EVIDENCE_DIR || '../../.automation/evidence'
  }
};

module.exports = nextConfig;

