# Eagle Mart Hostinger VPS Runbook

## Deploy

1. Pull the verified commit on the VPS.
2. Copy `.env.production.example` to production env files and replace every placeholder with Hostinger, MySQL, Razorpay, and SMTP values.
3. Run backend commands: `npm ci`, `npm run db:migrate:prod`, `npx prisma generate`, `npm run db:prod-bootstrap`, `npm run db:prod-catalog -- ../products.xlsx`, `npm run build`.
4. Run frontend commands: `npm ci`, `npm run build`.
5. Start or reload: `pm2 startOrReload ecosystem.config.cjs --env production`.
6. Check: `pm2 status`, `curl https://api.eaglesclub.in/api/ready`, `curl https://api.eaglesclub.in/api/catalog/home`, `curl https://eaglesclub.in`.
7. Run the production smoke test before handing the site to the client:

```bash
cd /var/www/eagle-mart
node deploy/scripts/prod-smoke.mjs
```

For a full write/login proof, run it with temporary shell variables. Do not paste these values into Git:

```bash
cd /var/www/eagle-mart
SMOKE_ADMIN_EMAIL="admin@example.com" \
SMOKE_ADMIN_PASSWORD="admin-password" \
SMOKE_DELIVERY_EMAIL="delivery@example.com" \
SMOKE_DELIVERY_PASSWORD="delivery-password" \
node deploy/scripts/prod-smoke.mjs --write
```

## SSL

Use Certbot for `eaglesclub.in`, `www.eaglesclub.in`, and `api.eaglesclub.in`. Verify renewal with `certbot renew --dry-run`.

## Logs

Use `pm2 logs`, Nginx access/error logs, and MySQL slow query logs. Configure logrotate for PM2 and Nginx before launch.

## Backups

Run the MySQL backup script before every deployment and keep at least seven daily backups. Test restore on a staging database before launch.
