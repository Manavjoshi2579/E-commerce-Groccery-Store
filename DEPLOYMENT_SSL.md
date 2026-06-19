# SSL Deployment

This project is SSL-ready when it runs behind nginx with Let's Encrypt certificates.

## Production Domains

Replace these placeholders everywhere before deploying:

- `yourdomain.com`: customer storefront
- `www.yourdomain.com`: optional storefront alias
- `api.yourdomain.com`: backend API

DNS must point all three hostnames to the server public IP before requesting certificates.

## App Environment

Backend production variables:

```bash
cp backend/.env.production.example backend/.env
```

Set `FRONTEND_ORIGIN` to the HTTPS storefront origins, for example:

```bash
FRONTEND_ORIGIN="https://yourdomain.com,https://www.yourdomain.com"
```

Frontend production variables:

```bash
cp frontend/.env.production.example frontend/.env.local
```

Set:

```bash
NEXT_PUBLIC_API_BASE_URL="https://api.yourdomain.com"
```

## Nginx And Certificates

On the Ubuntu server:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot
```

First copy `deploy/nginx/eagle-mart.http.conf` to `/etc/nginx/sites-available/eagle-mart`, replace the domain placeholders, then enable it:

```bash
sudo ln -s /etc/nginx/sites-available/eagle-mart /etc/nginx/sites-enabled/eagle-mart
sudo nginx -t
sudo systemctl reload nginx
```

Issue certificates:

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d yourdomain.com -d www.yourdomain.com
sudo certbot certonly --webroot -w /var/www/certbot -d api.yourdomain.com
```

Then replace `/etc/nginx/sites-available/eagle-mart` with `deploy/nginx/eagle-mart.conf`, replace the same domain placeholders, and reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Verify renewal:

```bash
sudo certbot renew --dry-run
```

## Runtime Ports

Run the frontend on `127.0.0.1:3000` and backend on `127.0.0.1:4000`; nginx exposes only ports `80` and `443`.

Suggested production commands:

```bash
cd backend
npm install
npm run build
npx prisma migrate deploy
npm start
```

```bash
cd frontend
npm install
npm run build
npm start
```

Use a process manager such as `pm2` or `systemd` so both apps restart after a reboot.

## Final Checks

```bash
curl -I https://yourdomain.com
curl https://api.yourdomain.com/health
```

Login should work over HTTPS because production cookies are `Secure`, `HttpOnly`, and the backend trusts the nginx proxy headers.
