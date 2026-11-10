# Baduriya Media Portal — website files

These files are the whole portal. There is no server and no database, so it can be hosted for free.
Photos, drafts and settings stay on each person's own phone or computer.

## Files
- `index.html` — the portal
- `sw.js` — lets the portal work offline
- `manifest.webmanifest` + `icons/` — let phones install it as an app

## Put it online with GitHub Pages (free)
1. Create a free account at github.com. A Media Unit email is best, so the account stays with the school.
2. Click **+** → **New repository**. Name it `media` and choose **Public**, then click **Create repository**.
3. Click **uploading an existing file**. Drag in **everything inside this folder**, including the `icons` folder. Then click **Commit changes**.
4. Open **Settings** → **Pages**. Under *Build and deployment*, set the source to **Deploy from a branch** and the branch to **main** and **/(root)**. Click **Save**.
5. Wait 1–2 minutes and refresh. The address appears at the top of the page, for example `https://baduriya-media.github.io/media/`.

## Updating later
Upload the new `index.html` (and `sw.js`) the same way, replacing the old files. Phones get the new version the next time the portal opens with internet.

## Install on phones
- **Android (Chrome):** open the address and tap **Install app** at the top. You can also use the ⋮ menu → *Install app* / *Add to Home screen*.
- **iPhone (Safari):** tap Share → **Add to Home Screen**.

After the first visit with internet, the portal works without internet. The fonts and the app are saved on the phone.

## Good to know
- **AI background removal:** choose *Settings → Background removal → Best quality (AI)*. The first time, it downloads about 40 MB, so use Wi-Fi. After that it works offline.
- **Drafts and "My templates":** these are kept on each device. Each phone has its own drafts and templates.
- **Teacher review:** add a teacher's WhatsApp number under *Settings* (unlock first). Then **Send for teacher review** sends the poster and caption to that teacher.
