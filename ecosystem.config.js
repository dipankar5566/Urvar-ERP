// PM2 supervision for the ERP. erp.urvarindia.com is a Cloudflare tunnel
// pointing at port 3001 on this machine, so this process IS production.
//
// IMPORTANT: cwd must be spelled "D:/Urvar-ERP" exactly. Windows treats path
// casing as insignificant, Turbopack does not — building or running from
// "D:/urvar-erp" loads two copies of Next's work-async-storage.external and
// every prerender dies with "Expected workStore to be initialized".
//
//   npx pm2 start ecosystem.config.js     start under supervision
//   npx pm2 logs urvar-erp                tail output
//   npx pm2 restart urvar-erp             restart after a code change
//   npx pm2 save                          persist across reboot
module.exports = {
  apps: [
    {
      name: "urvar-erp",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      cwd: "D:/Urvar-ERP",
      // Next's dev server manages its own workers; PM2 clustering would try to
      // bind 3001 more than once.
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      // A crash-loop should back off rather than hammer the port.
      min_uptime: "30s",
      max_restarts: 10,
      restart_delay: 4000,
      // Never restart on file changes: this is a live site, and dev mode
      // already recompiles edited routes in place.
      watch: false,
      max_memory_restart: "2G",
      env: {
        NODE_ENV: "production",
      },
      error_file: "D:/urvar-erp/logs/erp-error.log",
      out_file: "D:/urvar-erp/logs/erp-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
