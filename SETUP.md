# YPG App — Setup Checklist

## Step 1 — Firebase Project

1. Go to https://console.firebase.google.com
2. Create project → name it `ypg-pcg`
3. **Authentication** → Sign-in methods → Enable:
   - Email/Password ✓
   - Google ✓
4. **Firestore Database** → Create database → Start in **production mode** → Choose region (e.g. `europe-west1`)
5. **Project Settings** → Your apps → Add web app → copy the config object

---

## Step 2 — Fill .env.local

Open `ypg-app/.env.local` and replace all placeholder values:

```
NEXT_PUBLIC_FIREBASE_API_KEY=         ← from Firebase web app config
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=       ← skip for now, needed for push later

FIREBASE_ADMIN_PROJECT_ID=            ← Project Settings → Service Accounts → Generate new private key
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=           ← paste the entire key including -----BEGIN... and -----END...

GMAIL_USER=pcg.saviour@gmail.com
GMAIL_APP_PASSWORD=                   ← 16-char App Password from Google Account
```

---

## Step 3 — Deploy Firestore Security Rules

In the Firebase Console:
1. Firestore Database → Rules tab
2. Paste the contents of `firestore.rules`
3. Click **Publish**

---

## Step 4 — Create the First President Account

1. Open `scripts/setup-president.mjs`
2. Edit the 4 lines at the top (email, password, name, phone)
3. Run:
   ```
   node scripts/setup-president.mjs
   ```
4. Log in to the app with those credentials
5. **Change your password** in Firebase Console → Authentication

---

## Step 5 — Run the App

```bash
cd ypg-app
npm run dev
```

Open http://localhost:3000

---

## Step 6 — Deploy to Vercel (go live)

```bash
npm install -g vercel
vercel
```

When prompted, add all your `.env.local` variables as Environment Variables in the Vercel dashboard.
