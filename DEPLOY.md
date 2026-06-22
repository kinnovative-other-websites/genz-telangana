# Deploying to AWS EC2

Target: run the app at **https://genz.k-innovative.com** so WhatsApp/AiSensy can
fetch each generated pass image (HTTPS is mandatory).

Stack: **Ubuntu 22.04/24.04 (x86_64)** + Node 20 + PM2 + Nginx + Let's Encrypt.

---

## 1. Launch the EC2 instance
- AMI: **Ubuntu Server 22.04 or 24.04 LTS (64-bit x86)**
- Type: **t3.small** (or t2.micro for free tier — fine for low traffic)
- Storage: 16 GB+
- **Security Group** — allow inbound:
  - SSH (22) — your IP only
  - HTTP (80) — anywhere
  - HTTPS (443) — anywhere
- Allocate an **Elastic IP** and associate it (so the IP survives reboots).

## 2. Point the domain
In your DNS (where k-innovative.com is managed), add an **A record**:
```
genz   →   <your Elastic IP>
```
Wait for it to resolve (check: `ping genz.k-innovative.com`).

## 3. Connect & install prerequisites
```bash
ssh -i your-key.pem ubuntu@<elastic-ip>

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx

# Build tools (fallback for native modules; usually prebuilt binaries are used)
sudo apt-get install -y build-essential python3

# PM2 process manager
sudo npm install -g pm2
```

## 4. Get the code on the server
Option A — git:
```bash
cd /var/www && sudo mkdir -p genz && sudo chown $USER:$USER genz
git clone <your-repo-url> genz && cd genz
```
Option B — no repo: zip the project locally (exclude node_modules) and `scp` it up, then unzip into `/var/www/genz`.

> Make sure `assets/pass.png` and `assets/fonts/*.ttf` are included.

## 5. Install dependencies & create .env
```bash
cd /var/www/genz
npm install --omit=dev

cp .env.example .env
nano .env
```
Set these in `.env`:
```
PORT=3000
ADMIN_KEY=<your strong key>
PUBLIC_BASE_URL=https://genz.k-innovative.com
SMARTPING_API_URL=https://backend.api-wa.co/campaign/smartpingbsp/api/v2
SMARTPING_API_KEY=<your AiSensy api key>
SMARTPING_CAMPAIGN_NAME=namogenzregistration
SMARTPING_USERNAME=K Innovative Hub Private Limited
SMARTPING_SOURCE=new-landing-page form
SMARTPING_COUNTRY_CODE=91
```
**`PUBLIC_BASE_URL` must be the https domain — no trailing path.**

## 6. Start with PM2
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # run the command it prints, to auto-start on reboot
pm2 logs           # verify it's running, Ctrl+C to exit
```
Quick local check on the box: `curl http://localhost:3000/health` → `{"ok":true}`

## 7. Nginx reverse proxy
```bash
sudo cp deploy/nginx-genz.conf /etc/nginx/sites-available/genz
sudo ln -s /etc/nginx/sites-available/genz /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default     # optional: remove default site
sudo nginx -t && sudo systemctl reload nginx
```
Now http://genz.k-innovative.com should show the form.

## 8. HTTPS (Let's Encrypt)
```bash
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d genz.k-innovative.com
```
Choose redirect HTTP→HTTPS. Certbot auto-renews. Done — site is live on HTTPS.

## 9. Verify end to end
1. Open https://genz.k-innovative.com → submit the form with your own number.
2. You should receive the WhatsApp message with your personalized pass.
3. Open the admin: `https://genz.k-innovative.com/admin/#/v2?data=<ADMIN_KEY>`

---

## Updating later (redeploy)
```bash
cd /var/www/genz
git pull                 # or re-upload files
npm install --omit=dev
pm2 restart gen-z-conclave
```
> The SQLite database (`data/`) and generated images (`public/generated/`) live
> on the instance disk and are preserved across restarts. Don't delete them.

## Backups
Back up the leads regularly:
```bash
cp data/registrations.db ~/backup-registrations-$(date +%F).db
```
Or just download the CSV from the admin page.

## Troubleshooting
- **App won't start / native module error:** ensure `build-essential python3` are
  installed, then `rm -rf node_modules && npm install --omit=dev`.
- **Image not delivered on WhatsApp:** `PUBLIC_BASE_URL` must be the public https
  URL and the site must be reachable from the internet (test the image URL in a
  browser). AiSensy fetches it from there.
- **502 Bad Gateway:** the Node app isn't running — `pm2 logs` to see why.
