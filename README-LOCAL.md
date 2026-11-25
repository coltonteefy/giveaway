# The Giving Board: local development

The site is static files in `public/` plus one Netlify Function, `netlify/functions/api.mjs`. Data lives in Firebase: Firestore for raffles and requests, and Firebase Authentication for organizer sign-in.

## Run on your computer

Requirements: Node.js 20 or newer, and Java 21 or newer (the Firebase emulators need it).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the Firebase emulators for Auth and Firestore from the project folder. `firebase.json` already sets the ports. The API uses the Admin SDK, which ignores `firestore.rules`. Requires Java 21 or newer:

   ```bash
   firebase emulators:start --only auth,firestore --project demo-givingboard
   ```

3. Create a `.env` file in the project root (it is gitignored). `FIREBASE_SERVICE_ACCOUNT` can be any service account JSON whose `private_key` is a valid PEM key, such as one generated with `openssl genrsa`. With the emulator variables set, the key is never used to sign in to Google:

   ```
   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"demo-givingboard", ...}'
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
   SESSION_SECRET=<any long random string>
   ```

4. Seed the sample raffles and make an organizer account. Load the `.env` values into your shell first:

   ```bash
   set -a && . ./.env && set +a
   node scripts/seed-firestore.mjs
   node scripts/seed-super-admin.mjs you@example.com
   ```

   The super-admin script only grants access in Firestore. Create the matching login in the Auth emulator. For example, with the emulator running:

   ```bash
   curl -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-local" \
     -H 'content-type: application/json' \
     -d '{"email":"you@example.com","password":"choose-a-local-password","returnSecureToken":true}'
   ```

5. Start the site with Netlify's local dev server. Netlify CLI 17 runs on Node 20; newer versions need Node 22:

   ```bash
   npx -y netlify-cli@17 dev --port 8888
   ```

Open `http://localhost:8888/` for the participant page, and `http://localhost:8888/organizer` for the organizer dashboard. Sign in with the email and password from step 4. The sample raffle is at `/`, and Angie's raffle is at `/r/angie`.

`admin.js` switches to the Auth emulator only when the page is served from `localhost`, so deployed sites always use production Firebase.

## Never point local tools at production

The `.env` above uses emulator hosts. Do not put a real production service account in a local `.env` unless you mean to change live data. Run the seed scripts only against the emulator.

## How the files fit together

- `public/`: participant and organizer pages, CSS, JavaScript, and QR images. Netlify serves this folder as-is.
- `netlify/functions/api.mjs`: the API for participants and organizers, including personal board links, raffle logic, and admin sign-in.
- `netlify.toml`: maps `/`, `/r/angie`, and `/organizer` to their pages, and sends `/api/*` to the function.
- `scripts/`: seed scripts for raffles and organizer accounts. They use the Firebase Admin SDK and need `FIREBASE_SERVICE_ACCOUNT`.
- `.env.example`: the variables the app reads, with comments on where each one comes from.
