// PM2 process config — keeps the app running and auto-restarts on crash/reboot.
// Start with:  pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'gen-z-conclave',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      watch: false,
      env: {
        NODE_ENV: 'production',
        // PORT and all SMARTPING_*/ADMIN_KEY/PUBLIC_BASE_URL come from .env (loaded by the app)
      },
    },
  ],
};
