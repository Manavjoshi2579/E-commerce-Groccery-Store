# Eagle Mart Rollback Plan

1. Stop traffic-changing work and put the site in maintenance mode at Nginx if needed.
2. Restore the previous code commit: `git checkout <previous_verified_commit>`.
3. Reinstall only if package files changed: `npm ci` in affected app folders.
4. Rebuild affected apps and reload PM2: `pm2 startOrReload ecosystem.config.cjs --env production`.
5. If a database rollback is required, restore the latest verified backup into a fresh database first, then switch `DATABASE_URL`.
6. Verify `/api/ready`, customer login, cart, checkout, admin login, order assignment, invoice view, and payment config before reopening traffic.
