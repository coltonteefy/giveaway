# The Giving Board: local source

This is the source for the published sample app, not a screenshot or exported static page. It includes the participant and organizer views, Worker API, and D1 migrations. It does **not** include live raffle entries, archived results, organizer passcodes, or production secrets.

## Run on your computer

1. Install Node.js 20 or newer, then extract this ZIP and open its folder in VS Code.
2. In a terminal inside the folder, create your local secrets file:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Edit `.dev.vars` and replace the three placeholder values with your own passcodes and a long random `SESSION_SECRET`. Both organizer passcodes are required by the current login code. Keep `.dev.vars` private.
3. Build the Worker and initialize its separate local database:

   ```bash
   npm run build
   npx wrangler@latest d1 migrations apply giving-board-local --local
   ```

4. Start the app:

   ```bash
   npx wrangler@latest dev --local
   ```

Open the local URL Wrangler prints, normally `http://localhost:8787/`. Organizer: `http://localhost:8787/organizer`. Enter the first passcode for the original sample raffle, or the second passcode for Angie's raffle at `/r/angie`. The site title still displays **The Giving Board**.

After editing `public/` or `worker/server.js`, run `npm run build` again and restart Wrangler. `npm run validate` checks the build output.

## How the files fit together

- `public/`: participant and organizer HTML, CSS, JavaScript, and QR image.
- `worker/server.js`: API, access codes, raffle logic, and admin authentication.
- `drizzle/`: database schema migrations, applied in order to the local D1 database.
- `scripts/build.sh`: embeds the pages and assets into `dist/server/index.js` for the Worker.
- `wrangler.jsonc`: local Worker and D1 setup. Its D1 ID is a local development placeholder, not the published database ID.
- `.openai/hosting.json`: identifies the existing Sites deployment if you later work with Sites again. Wrangler local development uses `wrangler.jsonc` instead.

The migrations create two sample raffles. Payment checking remains manual. Without Brevo credentials, approval returns a code and formatted email for you to send yourself; it does not send mail automatically. Local D1 starts with no participants and is separate from the published site's database. Never run migrations with `--remote` against the published site's database.

This ZIP is ready to place in a new GitHub repository. Keep `.dev.vars` and local database files out of Git; the included `.gitignore` does that.
