# Gen Z Conclave — WhatsApp Pass Sender

A small lead-capture form (Name + Mobile). On submit, the server draws the name
and phone onto a base image, hosts it at a public URL, and sends it on WhatsApp
via **SmartPing** as an approved image-template message.

```
Form (Name, Mobile) → server.js → generate image → SmartPing template → WhatsApp
```

## 1. Install & run locally

```bash
npm install
cp .env.example .env      # then edit .env
npm run dev               # starts on http://localhost:3000
```

Open http://localhost:3000 to see the form.

## 2. Add your artwork

Put your base design at `assets/base-template.png` (recommended **1080×1080**).
The name and phone are drawn on top. Tune the position/size/colors in
`src/image.js` (the `<text>` coordinates) to match your design.

## 3. Make the server publicly reachable (required)

WhatsApp/SmartPing **fetches the image from a public URL**, so a local path
won't work. During development, tunnel with ngrok:

```bash
ngrok http 3000
```

Copy the `https://...ngrok...` URL into `PUBLIC_BASE_URL` in `.env` and restart.
In production, set `PUBLIC_BASE_URL` to your real domain (must be HTTPS).

## 4. Set up the SmartPing template (done in the SmartPing dashboard)

You cannot send free-form WhatsApp messages — you must use an **approved
template**. In your SmartPing dashboard:

1. Create a new **WhatsApp Template Message**.
2. **Header:** choose **Media → Image** (this makes the image dynamic per send).
3. **Body:** add your text with one variable, e.g.
   `Hi {{1}}, welcome to the Gen Z Conclave! Your pass is attached. 🎉`
4. Submit for approval. Approval by Meta usually takes a few hours to a day.
5. Note the **template name** and **language code** → put them in `.env`
   (`SMARTPING_TEMPLATE_NAME`, `SMARTPING_TEMPLATE_LANG`).

> The phone number is printed **onto the image** by this app. If you also want it
> as text in the message, add a second body variable `{{2}}` in the template and
> a matching parameter in `src/smartping.js`.

## 5. Confirm the SmartPing API details

`src/smartping.js` uses the standard WhatsApp template JSON shape, but the exact
**endpoint URL, auth header, and field names differ per SmartPing account**.
Open SmartPing → API / Developer docs and confirm:

- Request URL → `SMARTPING_API_URL` in `.env`
- Auth header → the `Authorization` line in `src/smartping.js`
- Body field names → the `body` object in `src/smartping.js`

Everything else in the app stays the same.

## Files

| File                  | Purpose                                            |
|-----------------------|----------------------------------------------------|
| `public/index.html`   | The form                                           |
| `server.js`           | API endpoint, validation, orchestration            |
| `src/image.js`        | Draws name + phone onto the base image (sharp)     |
| `src/smartping.js`    | Sends the WhatsApp template via SmartPing          |
| `assets/base-template.png` | Your artwork (you provide this)               |

## Notes

- Generated images are written to `public/generated/`. Add a cleanup job (cron)
  if you expect high volume, so the folder doesn't grow forever.
- Consider saving each submission (name, mobile, time) to a database or Google
  Sheet if the client wants the leads — right now it only logs to the console.
