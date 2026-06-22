// ---------------------------------------------------------------------------
//  SmartPing BSP (AiSensy platform) WhatsApp campaign sender.
//  Endpoint + payload match the dashboard's "API Campaign" format:
//     POST https://backend.api-wa.co/campaign/smartpingbsp/api/v2
//
//  Template body (must be APPROVED in the dashboard):
//     Hi {{1}},
//     ✅ Your registration for the *Namo Gen Z Conclave* has been successfully confirmed.
//     Thank you for registering. We look forward to seeing you at the event!
//
//  {{1}} = name  →  passed via templateParams.
//  The personalized pass image is passed via media.url.
// ---------------------------------------------------------------------------

const COUNTRY_CODE = process.env.SMARTPING_COUNTRY_CODE || '91';

/**
 * Sends the approved image template to one recipient.
 *
 * @param {object} p
 * @param {string} p.toMobile  10-digit number (country code is prefixed below)
 * @param {string} p.name      value for template {{1}}
 * @param {string} p.imageUrl  PUBLIC https url of the personalized pass image
 */
export async function sendWhatsAppTemplate({ toMobile, name, imageUrl }) {
  const {
    SMARTPING_API_URL,
    SMARTPING_API_KEY,
    SMARTPING_CAMPAIGN_NAME,
    SMARTPING_USERNAME,
    SMARTPING_SOURCE = 'registration-form',
  } = process.env;

  if (!SMARTPING_API_URL || !SMARTPING_API_KEY || !SMARTPING_CAMPAIGN_NAME) {
    throw new Error('SmartPing env vars not set. Fill SMARTPING_API_URL, SMARTPING_API_KEY and SMARTPING_CAMPAIGN_NAME in .env');
  }

  const destination = `${COUNTRY_CODE}${toMobile}`;

  const body = {
    apiKey: SMARTPING_API_KEY,
    campaignName: SMARTPING_CAMPAIGN_NAME,
    destination,
    userName: SMARTPING_USERNAME,
    templateParams: [name],            // {{1}} = name
    source: SMARTPING_SOURCE,
    media: { url: imageUrl, filename: 'conclave-pass.png' },
    buttons: [],
    carouselCards: [],
    location: {},
    attributes: {},
    paramsFallbackValue: { FirstName: name || 'Guest' },
  };

  const res = await fetch(SMARTPING_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    throw new Error(`SmartPing error ${res.status}: ${text}`);
  }
  return data;
}
