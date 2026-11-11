# The Colour Archive

A personal archive for miniature paint mixes. Record the paints and drop ratios behind each colour, attach a photo of the result, pick the exact swatch from that photo, group mixes into collections, and share them with a link. Build whole paint schemes as step-by-step recipes, follow models and armies as projects with progress photos, and keep a list of the paints you own so the app can tell you what to buy.

It works straight away in the browser with no account, and can be installed as an app that opens offline. Sign in to sync your archive to the cloud and use it on any device.

## Features

### Mixes and collections

- **Mix records:** a name, a swatch colour, a list of paints (name, brand and number of drops) and notes for each mix.
- **Photo colour sampling:** attach a photo of a painted model and click or drag on it to pick the swatch colour. A magnifier helps you aim, and you can also move the picker with the arrow keys and press Enter. Photos are scaled down to 1200 px and compressed to JPEG before they are saved.
- **Collections:** group mixes into named collections (e.g. "Woodland bases"). Collections have their own tab: each card shows the colours inside, and opens a page where you can share the collection, change its mixes or delete it. Deleting a collection leaves its mixes in the archive.
- **Search, filters and sorting:** search across mix names, notes, paint names and brands. Filter by colour family (reds, blues, browns, greys and so on), by a paint the mix uses, or to favourites only. Sort by newest, oldest, name, or round the colour wheel.
- **Favourites:** star the mixes you use most. Starred mixes always sit at the top.
- **Match a colour:** pick a colour from a reference photo, or choose one, and see your six closest mixes. Closeness is measured with CIEDE2000, which tracks how alike two colours look to the eye rather than how close their numbers are.
- **Real addresses:** every page has its own address (`/collections`, `/collections/:id`, `/recipes`, `/projects/:id`, `/paints`, `/profile` and so on). You can bookmark them, and the browser's Back and Forward buttons work.

### Recipes, projects and My paints

- **Recipes:** a whole paint scheme in order: primer, base, wash, shade, layer, highlight, glaze and so on. Each step uses a saved mix or a single paint, with an optional note. Steps can be reordered.
- **Projects:** a model or an army. Link the recipes and mixes it uses, and keep up to 12 progress photos with captions.
- **My paints:** the paints you own, grouped by brand, each marked as on the shelf, running low or wishlist. One click adds the paints your mixes already use. Paint names autocomplete in the mix form and fill in the brand.
- **Not owned:** once My paints has something on it, mixes and recipes mark any paint you don't own.
- **Shopping list:** paints running low, wishlist paints, and paints your mixes need that aren't on your shelf. **Bought** moves a paint onto the shelf, and **Copy list** copies it as plain text for a note or a message.

### Install as an app

- On a phone, use **Add to Home Screen**. On a desktop, use the install icon in the address bar. The app then opens in its own window with its own icon.
- A service worker keeps the app's files, so it opens without a connection. Signed out, the archive lives in the browser, so everything works offline. Signed in, the account needs a connection to load.
- Releases arrive straight away: pages are fetched from the network first, and the cached copy is only used offline.

### Accounts and sync (optional)

- **Two ways to sign in:** email and password, or a one-time sign-in link sent by email. Includes account creation with email confirmation and password reset.
- **Cloud sync:** when signed in, mixes, collections and photos are saved to [Supabase](https://supabase.com/) and appear on every device. Photos are stored in a private bucket.
- **Moving a browser archive:** the first time you sign in, the app offers to move the mixes already saved in that browser into your account.
- **Profile page:** display name, member-since date, archive statistics, your latest colours, password management, backup export and sign-out.
- **Signed out:** everything works as before, saved in the browser only.

### Sharing

Share a single mix or a whole collection. The share dialog shows a preview, a **Copy** button and, where the device supports it, the system share sheet.

| Link | When | What it holds |
|---|---|---|
| `/s/Ab3xK9q2` | Signed in | A short code for a snapshot saved in Supabase. Photos are included. Later edits don't change the snapshot. |
| `/#s=…` | Signed out, or if a short link can't be created | The recipe itself, compressed (deflate + base64url) into the link. Works with no account or server. |
| `/#share=…` | Older links | The original uncompressed format. Still opens. |

Whoever opens a link can save the recipe to their own archive. Shared photos are embedded in their copy, so it keeps working even if the original share is removed.

### Backup and restore

- **Export** downloads the whole archive (mixes, collections, recipes, projects, paints and every photo) as a JSON file. For signed-in users, photos are embedded in the file. Backups made before recipes existed still import.
- **Import** either adds a backup to your archive, skipping mixes you already have, or replaces your archive with it. Importing the same backup twice doesn't create duplicates.
- **Sample files to try the app:**
  - [`sample-workshop.json`](sample-workshop.json) has a little of everything: 14 mixes (3 of them favourites), 3 collections, 4 recipes, 3 projects with progress photos, and 22 paints that are on the shelf, running low or on the wishlist, so the shopping list fills in too.
  - [`sample-archive.json`](sample-archive.json) has only the mixes and collections (a version 1 backup). The browser tests use it.

### Design

- The "Workbench" look: a cutting-mat green sidebar, primer-grey surfaces and a paint-pot-cap yellow accent, with Barlow Condensed, Barlow and Space Mono.
- **Dark mode:** "the workbench at night", with charcoal-green surfaces and the same yellow accent. It follows the device setting by default; the switch in the top bar cycles between device, light and dark, and remembers your choice. A tiny script (`public/theme.js`) applies a saved choice before the first paint, so the page never flashes the wrong theme.
- Colours are defined as CSS custom properties: light at the top of `src/styles/styles.css`, dark in `src/styles/workshop.css`.
- Text meets WCAG AA contrast, controls have visible focus states, and hover and enter animations respect `prefers-reduced-motion`.
- **Dialogs work from the keyboard:**
  - focus moves into a dialog when it opens, and Tab stays inside it;
  - Escape closes only the top dialog;
  - focus returns to the button that opened the dialog.
- Responsive from phone to desktop: bottom tabs on phones (Mixes, Collections, Recipes, Projects, My paints), an icon rail on tablets, and a full, collapsible sidebar on desktops.

## Tech stack

- [React 18](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/) (strict), built with [Vite 6](https://vite.dev/)
- [React Router 7](https://reactrouter.com/) for addresses: `/`, `/collections`, `/collections/:id`, `/recipes`, `/projects`, `/projects/:id`, `/paints`, `/paints/shopping`, `/profile`, `/s/:code`
- A web app manifest and a hand-written service worker (`public/sw.js`) for installing and offline use
- [Supabase](https://supabase.com/): Auth, Postgres with row-level security, and Storage
- Hand-written CSS with custom properties (`src/styles/`), and [Lucide](https://lucide.dev/) icons
- [Vitest](https://vitest.dev/) unit tests, [Playwright](https://playwright.dev/) browser tests, [ESLint](https://eslint.org/) with the React Hooks rules
- Deployed on [Netlify](https://www.netlify.com/)

## Getting started

You need [Node.js](https://nodejs.org/) 20 or later.

```bash
npm install
npm run dev         # start the dev server at http://localhost:5173
npm run build       # type-check, then build to dist/
npm run preview     # serve the production build locally
```

Without any configuration the app runs in browser-only mode: everything works except signing in and short links.

### Connecting Supabase (for accounts, sync and short links)

1. Create a free project at [supabase.com](https://supabase.com/).
2. In the project's **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). It creates the tables, row-level security policies, the `get_share` function and both storage buckets, and is safe to run again.

   **Updating an existing project:** run the whole file again. It only adds what's missing: the favourite column, and the `paints`, `recipes` and `projects` tables. Until then, signed-in users see a note saying the database needs updating, and mixes and collections keep working.
3. Under **Authentication → URL Configuration**, set the **Site URL** to your deployed address. Then add `http://localhost:5173/**` and `https://<your-site>/**` to **Redirect URLs**, so sign-in and password-reset links can return to the app.
4. Create `.env.local` in the project root with your project's URL and publishable key (from **Project Settings → API Keys**):

   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   The publishable key is meant to be public; the database's row-level security is what protects the data. Never put the secret or `service_role` key in the app. `.env.local` is ignored by git.
5. Restart `npm run dev`.

Supabase's built-in email sender only allows a few emails per hour. That's fine for testing, but before real users rely on sign-in emails, set up custom SMTP (for example [Resend](https://resend.com/) with your own domain) under **Authentication → Emails → SMTP Settings**.

## Testing

```bash
npm run check       # everything below except the live tests
npm run typecheck   # TypeScript, app and tests
npm run lint        # ESLint, including the React Hooks rules
npm test            # Vitest unit tests (validation, backups, share links, both stores)
npm run test:e2e    # Playwright browser tests
npm run test:live   # Playwright tests against the real Supabase project
```

| Suite | Tests | What it covers |
|---|---|---|
| Unit (`src/**/*.test.ts`) | 79 | Validation, backups (old and new versions), compressed links (including a "zip bomb" link), both stores, rollback when browser storage is full, CIEDE2000 against published reference values, colour families, paint matching and the shopping list, both sample files |
| `e2e/archive.spec.ts` | 32 | The whole app signed out: mixes, photo sampling by mouse and keyboard, collections, search, sort, sharing, backups, addresses, phone layout |
| `e2e/workshop.spec.ts` | 23 | Favourites, colour and paint filters, colour matching, My paints, the shopping list, recipes, projects with photos, the theme switch, phone tabs |
| `e2e/account.spec.ts` | 13 | Sign-in dialog, profile page and sign-out against a mocked account; keyboard focus in dialogs; a database without the latest update |
| `e2e/security.spec.ts` | 16 | The production build under the `netlify.toml` headers: script injection (including in recipes, projects and paints), prototype pollution, frame blocking, no policy violations, the manifest, opening offline |
| `e2e/live/cloud.spec.ts` | 10 | Against Supabase: sync, stored photos, short links with photos, imports, export, profile |
| `e2e/live/database-security.spec.ts` | 6 | Against Supabase: row-level security between two users, private photos, SQL injection |
| `e2e/live/workshop.spec.ts` | 6 | Against Supabase: favourites, paints, recipes and projects with photos saved to an account; row-level security and database checks on the new tables |

- **Browser tests** (`e2e/`) start the dev server themselves. The security suite also builds the app and serves the production build.
- **Live tests** (`e2e/live/`) use throwaway anonymous accounts on your Supabase project and delete everything they create.

  Switch on **Authentication → Sign In / Providers → Allow anonymous sign-ins** while they run, and switch it off afterwards.
- **Browser:** the tests use your installed Google Chrome. To use Playwright's own Chromium instead, run `npx playwright install chromium` and set `PLAYWRIGHT_BUNDLED_BROWSER=1`.

## Project structure

```
├── index.html                # HTML entry, fonts, manifest and meta tags
├── public/                   # sw.js (service worker), manifest, icons, theme.js
├── netlify.toml              # Netlify build, SPA redirect, security and cache headers
├── vite.config.ts            # Vite + React; Vitest settings
├── eslint.config.js          # ESLint with TypeScript and React Hooks rules
├── playwright.config.ts      # Browser tests (dev server and production build)
├── playwright.live.config.ts # Browser tests against the real Supabase project
├── sample-workshop.json      # Example archive with everything: mixes to projects and paints
├── sample-archive.json       # Smaller example (mixes and collections), used by the tests
├── supabase/schema.sql       # Tables, row-level security, share lookup, storage buckets
├── e2e/                      # Playwright tests and shared helpers
└── src/
    ├── main.tsx              # React root and router
    ├── App.tsx               # Routes, layout and the one open dialog
    ├── types.ts              # Mix, Collection, Recipe, Project, OwnedPaint, Archive, share types
    ├── pages/                # ArchivePage, CollectionsPage, RecipesPage, ProjectsPage, ProjectPage, PaintsPage, ProfilePage
    ├── components/
    │   ├── Modal.tsx         # Accessible dialog: focus trap, Escape, scroll lock, focus return
    │   ├── ConfirmDialog.tsx # Small confirm dialogs built on Modal
    │   ├── PageHeading.tsx   # The heading and banners every page starts with
    │   ├── layout/           # Sidebar (the Workshop tabs), Topbar
    │   ├── mixes/            # MixCard, MixSwatch, PaintList, MixForm, ColorSampler, MatchDialog
    │   ├── recipes/          # RecipeCard, RecipeForm
    │   ├── projects/         # ProjectForm, PhotoDialog
    │   ├── paints/           # PaintForm
    │   ├── collections/      # CollectionForm
    │   ├── sharing/          # ShareDialog, SharedPage
    │   └── auth/             # SignInDialog, SetPasswordDialog, PasswordField
    ├── hooks/
    │   ├── useAuth.ts        # Supabase session, magic links, password recovery
    │   ├── useArchive.ts     # The archive on screen and every change to it
    │   ├── useSharedLink.ts  # The share in the address (/s/…, #s=…, #share=…)
    │   ├── useTheme.ts       # Device, light or dark
    │   └── useNotice.ts      # Success messages with one shared timer
    ├── lib/
    │   ├── stores/           # ArchiveStore interface, localStore (browser), cloudStore (Supabase)
    │   ├── color.ts          # CIEDE2000 colour difference, colour families, hue sorting
    │   ├── paints.ts         # Which paints you own, which are used, the shopping list
    │   ├── archive.ts        # Empty and partial archives
    │   ├── sharing.ts        # Short, compressed and old share links
    │   ├── validation.ts     # Checks for anything from storage, links or backups
    │   ├── backup.ts         # Backup files: read, write, download
    │   ├── images.ts         # Photo resizing and conversion
    │   ├── errors.ts         # Plain-language error messages
    │   └── supabase.ts       # Supabase client (null when not configured)
    └── styles/
        ├── reset.css         # Base reset (from Tailwind's preflight, MIT)
        ├── styles.css        # Theme variables, layout, components and motion
        └── workshop.css      # Dark mode, Workshop navigation, filters, recipes, projects, paints
```

**How the pieces fit:** `useArchive` picks a store depending on whether you're signed in. `localStore` saves to the browser, and `cloudStore` saves to Supabase. Both implement the same `ArchiveStore` interface, so no component needs to know where data is saved. `App.tsx` holds the routes and a single `dialog` state, because only one dialog is ever open at a time.

## Data and privacy

**Signed out.** Everything is saved in the browser's `localStorage` under `the-colour-archive-mixes`, `-collections`, `-recipes`, `-projects` and `-paints`. Nothing is uploaded. Project photos count towards the browser's storage limit too.
- Your data stays in one browser on one device, and clearing site data deletes it. Use **Export** to keep a backup file.
- Browser storage is limited (usually about 5 MB) and photos take up most of it. If it fills up, the app shows an error instead of failing silently.

**Signed in.** Data is stored in Supabase.
- Every table uses row-level security, so each person can only read or change their own rows. A collection can only link to mixes owned by the same person.
- Mix and project photos are in a private bucket, with one folder per user and a 2 MB, images-only limit. The app shows them through short-lived signed links. The database refuses a project that points at a photo in another person's folder.

**Sharing.**
- Compressed and older links keep the recipe in the URL fragment, which browsers never send to the server.
- Short links store a snapshot that anyone with the exact code can open through `get_share()`, but shares can't be listed or browsed, and only their creator can change them.
- Photos in short links are copies in a public `share-photos` bucket, so the originals stay private.

## Security

- **Netlify security headers** (`netlify.toml`):
  - a Content Security Policy that only allows the site's own scripts, Google Fonts and the Supabase project (the service worker fetches the fonts, so they're also allowed as connections);
  - `X-Frame-Options: DENY`, so the app can't be embedded in another site;
  - `nosniff`, a strict referrer policy and a restrictive permissions policy.
- **Incoming data is checked:** share links and backup files are validated before use. Photos must be JPEG, PNG or WebP data, or a link into the share bucket. Compressed links are size-capped while they're unpacked.
- **The database checks its own data:** colours, name lengths, paint statuses and share codes are checked again by the database. Share snapshots are limited to 100 KB, recipes to 30 steps, projects to 12 photos, and each paint can be listed only once.
- **No SQL is built from text.** Every query goes through Supabase's query builder, which sends values as parameters. The one database function, `get_share`, compares the code as a plain value. Ids are checked to be UUIDs before they're used in list filters.
- **How it's tested:** these protections are checked by the security and live test suites above.
  - Visitors and signed-in users try to read, change, take over or link to someone else's rows and photos.
  - SQL injection is tried through the share lookup, filters, sorting, column lists and saved text, including time-delay payloads.
  - Hostile share links and backups are opened under the real security headers.
- **Dependency audit:** `npm audit --omit=dev` reports no vulnerabilities in what the site ships. A moderate advisory in `minimatch` comes only from the linter (typescript-eslint). It runs on developers' machines, never in the built site or in Netlify's build.

## Deployment

Netlify builds the site from `netlify.toml`. Connect the repository in Netlify and it deploys on every push to `main`. On each build it:
- runs `npm run build`, which type-checks first, so a type error stops the deploy instead of shipping;
- publishes `dist/`;
- sends every address (`/collections/…`, `/profile`, `/s/…` short links) to `index.html`, where React Router takes over.

The build needs the dev dependencies (TypeScript), which Netlify installs by default. Don't set `NODE_ENV=production` in Netlify's environment variables, because npm then skips them.

To turn on accounts in production, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under **Site configuration → Environment variables** and redeploy. If they're missing, the deployed app runs in browser-only mode.
