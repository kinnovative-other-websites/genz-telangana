import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import rateLimit from 'express-rate-limit';

import { generatePassImage } from './src/image.js';
import { sendWhatsAppTemplate } from './src/smartping.js';
import { saveLead, markSent, markFailed, getAllRegistrations, getLatestByMobile } from './src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
// Strip any trailing slash so image URLs don't end up with a double slash.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

// Behind Nginx + Cloudflare — trust the proxy chain so we can read the real client IP.
app.set('trust proxy', true);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limit submissions per client IP. Generous on purpose: many genuine users
// at an event share one network (NAT), so this stops bot floods without blocking
// real attendees. The per-mobile duplicate check below is the main cost guard.
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,           // 10 minutes
  max: 20,                            // max 20 submissions per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  // Cloudflare always sets CF-Connecting-IP to the real client IP (not spoofable via CF).
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip,
  validate: false,
  message: { ok: false, error: 'Too many attempts from your network. Please try again in a few minutes.' },
});

// Telangana — 33 districts (keep in sync with public/index.html)
const TELANGANA_DISTRICTS = new Set([
  'Adilabad', 'Bhadradri Kothagudem', 'Hanumakonda', 'Hyderabad', 'Jagtial', 'Jangaon',
  'Jayashankar Bhupalpally', 'Jogulamba Gadwal', 'Kamareddy', 'Karimnagar', 'Khammam',
  'Komaram Bheem Asifabad', 'Mahabubabad', 'Mahabubnagar', 'Mancherial', 'Medak',
  'Medchal–Malkajgiri', 'Mulugu', 'Nagarkurnool', 'Nalgonda', 'Narayanpet', 'Nirmal',
  'Nizamabad', 'Peddapalli', 'Rajanna Sircilla', 'Rangareddy', 'Sangareddy', 'Siddipet',
  'Suryapet', 'Vikarabad', 'Wanaparthy', 'Warangal', 'Yadadri Bhuvanagiri',
]);

// Basic validation helpers
const isValidName = (s) => typeof s === 'string' && s.trim().length >= 2 && s.trim().length <= 60;
const isValidMobile = (s) => typeof s === 'string' && /^[6-9]\d{9}$/.test(s.trim());
const isValidDistrict = (s) => typeof s === 'string' && TELANGANA_DISTRICTS.has(s.trim());

app.post('/api/submit', submitLimiter, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const mobile = (req.body.mobile || '').trim();
    const district = (req.body.district || '').trim();

    if (!isValidName(name)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid name.' });
    }
    if (!isValidMobile(mobile)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid 10-digit mobile number.' });
    }
    if (!isValidDistrict(district)) {
      return res.status(400).json({ ok: false, error: 'Please select a valid district.' });
    }

    // Duplicate guard: if this number already received the pass, don't send again
    // (saves WhatsApp cost). A previous *failed* attempt is allowed to retry.
    const existing = getLatestByMobile(mobile);
    if (existing && existing.status === 'sent') {
      return res.status(409).json({
        ok: false,
        error: 'This number is already registered. Please check your WhatsApp for the pass.',
      });
    }

    // 1) Save the lead first (status 'pending') so it's never lost, even if sending fails
    const leadId = saveLead({ name, mobile, district });

    // 2) Generate the personalized image
    const fileId = crypto.randomBytes(8).toString('hex');
    const relPath = await generatePassImage({ id: fileId, name, district });
    const imageUrl = `${PUBLIC_BASE_URL}${relPath}`;

    // 3) Send via SmartPing WhatsApp template
    try {
      const result = await sendWhatsAppTemplate({ toMobile: mobile, name, imageUrl });
      markSent(leadId, imageUrl);
      console.log(`[sent] #${leadId} ${name} | ${mobile} | ${district} -> ${imageUrl}`);
      return res.json({ ok: true, imageUrl, providerResponse: result });
    } catch (sendErr) {
      markFailed(leadId, sendErr.message);
      console.error(`[send failed] #${leadId}`, sendErr);
      // NOTE: return 200 (not 5xx) so Cloudflare doesn't replace the body with its
      // own gateway error page — this lets the form show a real message.
      return res.status(200).json({
        ok: false,
        error: 'We saved your details, but the WhatsApp message could not be sent right now. Please contact the organizers.',
      });
    }
  } catch (err) {
    console.error('[submit error]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to register.' });
  }
});

// ---- Admin: download all registrations as CSV ----
// Protect with ADMIN_KEY in .env. Open:  /export.csv?key=YOUR_ADMIN_KEY
app.get('/export.csv', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.query.key !== adminKey) {
    return res.status(401).send('Unauthorized');
  }
  const rows = getAllRegistrations();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['id', 'name', 'mobile', 'district', 'status', 'created_at'];
  const csv = [
    header.join(','),
    ...rows.map((r) => [r.id, r.name, r.mobile, r.district, r.status, r.created_at].map(esc).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
  res.send(csv);
});

// ---- Admin: JSON list of registrations (for the /admin dashboard) ----
// Key is sent in the 'x-admin-key' header so it stays out of server access logs.
app.get('/api/registrations', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  const provided = req.get('x-admin-key') || req.query.key;
  if (!adminKey || provided !== adminKey) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return res.json({ ok: true, rows: getAllRegistrations() });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Public base URL: ${PUBLIC_BASE_URL}`);
});
