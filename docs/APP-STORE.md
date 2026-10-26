# Getting Divina into the App Store

No Mac needed: a cloud Mac (Codemagic) builds the app. You do the account steps
(only you can, they're in your name); everything else is set up already.

Rough timeline: 1–2 days for Apple to approve your developer account, about an
hour of setup, then 1–3 days for App Review.

---

## 1. Join the Apple Developer Program ($99 a year)

1. Go to **developer.apple.com/programs/enroll** and sign in with your Apple ID
   (turn on two-factor authentication if asked).
2. Choose how to enrol:
   - **Individual**: quickest. Your **legal name is shown as the seller** on the
     App Store.
   - **Organisation**: shows "Sweeney Creative" instead, but needs a registered
     company (for example a UK Ltd) and a free **D-U-N-S number**
     (Apple links to where you get one). Takes a few days longer.
   - If you'd rather your own name isn't shown, go Organisation.
3. Pay the $99. Apple emails you when you're approved (usually 1–2 days).

## 2. Set up getting paid (needed for a paid app)

In **appstoreconnect.apple.com → Business**:
1. Accept the **Paid Apps Agreement**.
2. Add your **bank account** and fill in the **tax forms** (UK: you'll usually
   fill in the W-8BEN form).
3. Join the **App Store Small Business Program**
   (developer.apple.com/app-store/small-business-program). Apple then takes
   **15%** instead of 30%.

## 3. Register the app's ID

1. **developer.apple.com/account → Certificates, IDs & Profiles → Identifiers → +**
2. Choose **App IDs → App**, description `Divina`, Bundle ID **Explicit**:
   `co.sweeneycreative.divina`
3. No extra capabilities are needed. Click **Register**.

## 4. Create the app in App Store Connect

1. **appstoreconnect.apple.com → Apps → + → New App**
2. Platform **iOS**, name **Divina** (if it's taken, try *Divina – Spatial AI*),
   language English (UK), Bundle ID `co.sweeneycreative.divina`, SKU `divina-ios`.
3. Open **App Information** and copy the **Apple ID** number (about 10 digits).
   You'll need it in step 6.

## 5. Put Divina's code on GitHub (private)

Codemagic builds from GitHub.
1. Make a free account at **github.com** if you don't have one.
2. Click **+ → New repository**, name it `divina`, choose **Private**, and create it.
3. Tell Claude: "push Divina to my GitHub repo". Claude connects it and uploads
   the code. Nothing private goes up: keys and personal data are never in the code.

## 6. Set up Codemagic (the cloud Mac)

1. Go to **codemagic.io**, sign up **with GitHub**, and add the `divina` repository.
   The free plan includes Mac build minutes each month, which is plenty for Divina.
2. Make an App Store key so Codemagic can upload for you:
   - **App Store Connect → Users and Access → Integrations → App Store Connect API → +**
   - Name `Codemagic`, access **App Manager**, then click **Generate**.
   - Download the **.p8** file (you can only download it once), and note the
     **Issuer ID** and **Key ID**.
3. In Codemagic: **Team settings → Integrations → Developer Portal → Connect**.
   Name it exactly **Divina App Store key**, then paste the Issuer ID and Key ID
   and upload the .p8 file.
4. In Codemagic, open the app → **Environment variables**:
   - Add `APP_STORE_APPLE_ID` = the number from step 4.
   - Set the group name to **divina**.
5. Click **Start new build** and pick the **Divina for iPhone** workflow.
   It takes about 15–20 minutes. Codemagic makes the signing certificate itself,
   builds the app and uploads it.

Keep the .p8 file private, like a password. If it ever leaks, revoke it in
App Store Connect and make a new one.

## 7. Try it on your iPhone first (TestFlight)

1. Install **TestFlight** from the App Store on your iPhone.
2. **App Store Connect → your app → TestFlight**: once the build shows, add
   yourself under **Internal Testing**.
3. Open TestFlight on your phone and install Divina.
4. Check:
   - Tap **Talk** and allow the microphone and speech recognition. Does it
     hear you?
   - Is it smooth? Does the text look sharp?
   - Add an AI key in Settings and ask it something.
   - Try "take me to Saturn", "add milk to my list" and sharing a card.

Tell Claude anything that's wrong before submitting.

## 8. Fill in the App Store page

In **App Store Connect → your app → the version page**:

- **Price:** Pricing and Availability → choose your price.
- **Screenshots:** use the ones in `docs/app-store/screenshots/` (6.9-inch
  iPhone size, 1320 × 2868).
- **Text:** copy from the store listing (kept with the website, not in this repo) (description, keywords,
  promotional text).
- **Support URL:** https://divinaos.site **Privacy policy URL:**
  https://divinaos.site/privacy.html **Support email:** dev@divinaos.site
- **Age rating:** answer the questions honestly. Divina's terms say 18+, so pick
  answers that give **18+** (unrestricted AI chat about any topic).
- **App Privacy (the privacy "nutrition label"):** see the store listing.
  It's written to match what the app really does.
- **App Review information:** paste the review notes from the store listing. Apple's
  reviewers need to try the AI. Make a **Gemini key with a small spending limit**
  just for them, put it in the notes, and delete it after approval.

## 9. Submit

Click **Add for Review → Submit**. Apple usually replies in 1–3 days. If they
reject it, they explain why: paste their message to Claude and we'll fix it.

## Updates later

Ask Claude for the change, then click **Start new build** in Codemagic. Builds
are numbered automatically. For a new version number (1.1 and so on), ask Claude
to bump it. Then add the build to a new version in App Store Connect and submit.

---

### What's different in the iPhone app (and why)

- **No Stocks, Sports, Email, Instagram or Projects cards.** Those only work in
  Divina for Windows, and Apple rejects apps that show features which aren't there.
- **Voice is tap-to-talk** and uses Apple's own speech recognition. iPhone apps
  can't keep listening in the background.
- **No "what's on my screen" and no controlling other apps.** iPhone doesn't let
  apps see the screen or control other apps. Divina says so if asked.
- Everything else works: AI (your own key), voice, notes, agents and the round
  table, memory, routines, timers, worlds and planets, translator, share a card,
  backup and restore, and hand tracking.
