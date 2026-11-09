# The Colour Archive

A personal archive for miniature paint mixes. Record the paints and drop ratios behind each colour, attach a photo of the result, pick the exact swatch from that photo, group mixes into collections, and share them with a link.

It works straight away in the browser with no account. Sign in to sync your archive to the cloud and use it on any device.

## Features

### Mixes and collections

- **Mix records:** a name, a swatch colour, a list of paints (name, brand and number of drops) and notes for each mix.
- **Photo colour sampling:** attach a photo of a painted model and click or drag on it to pick the swatch colour. A magnifier helps you aim, and you can also move the picker with the arrow keys and press Enter. Photos are scaled down to 1200 px and compressed to JPEG before they are saved.
- **Collections:** group mixes into named collections (e.g. "Woodland bases"). Deleting a collection leaves its mixes in the archive.
- **Search and sort:** search across mix names, notes, paint names and brands. Sort by newest or by name.

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

- **Export** downloads the whole archive (mixes, photos and collections) as a JSON file. For signed-in users, photos are embedded in the file.
- **Import** either adds a backup to your archive, skipping mixes you already have, or replaces your archive with it. Importing the same backup twice doesn't create duplicates.
- [`sample-archive.json`](sample-archive.json) is a ready-made archive (14 mixes, 3 collections) you can import to try the app.

### Design

- The "Workbench" look: a cutting-mat green sidebar, primer-grey surfaces and a paint-pot-cap yellow accent, with Barlow Condensed, Barlow and Space Mono.
- Colours are defined as CSS custom properties in one block at the top of `src/styles/styles.css`.
- Text meets WCAG AA contrast, controls have visible focus states, and hover and enter animations respect `prefers-reduced-motion`.
- Responsive from phone to desktop: a bottom collections bar on phones, a compact sidebar on tablets and a full, collapsible sidebar on desktops.

## Tech stack

- [React 18](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/) (strict), built with [Vite 6](https://vite.dev/)
- [React Router 7](https://reactrouter.com/) for addresses: `/`, `/collections/:id`, `/profile`, `/s/:code`
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

- **Browser tests** (`e2e/`) start the dev server themselves:
  - `archive.spec.ts` walks through the whole app signed out.
  - `account.spec.ts` covers sign-in and the profile page against a mocked account.
  - `security.spec.ts` builds the app, serves it with the headers from `netlify.toml`, and checks that the security policy holds and that hostile share links and backups do nothing.
- **Live tests** (`e2e/live/`) use throwaway anonymous accounts on your Supabase project and delete everything they create:
  - `cloud.spec.ts` covers sync, photos, short links, imports and the profile.
  - `database-security.spec.ts` attacks the database as a visitor and as another user, including SQL injection.

  Switch on **Authentication → Sign In / Providers → Allow anonymous sign-ins** while they run, and switch it off afterwards.
- **Browser:** the tests use your installed Google Chrome. To use Playwright's own Chromium instead, run `npx playwright install chromium` and set `PLAYWRIGHT_BUNDLED_BROWSER=1`.

## Project structure

```
├── index.html                # HTML entry, fonts and meta tags
├── netlify.toml              # Netlify build, SPA redirect and security headers
├── vite.config.ts            # Vite + React; Vitest settings
├── eslint.config.js          # ESLint with TypeScript and React Hooks rules
├── playwright.config.ts      # Browser tests (dev server and production build)
├── playwright.live.config.ts # Browser tests against the real Supabase project
├── sample-archive.json       # Example archive to import
├── supabase/schema.sql       # Tables, row-level security, share lookup, storage buckets
├── e2e/                      # Playwright tests and shared helpers
└── src/
    ├── main.tsx              # React root and router
    ├── App.tsx               # Routes, layout and the one open dialog
    ├── types.ts              # Mix, Collection, Archive, share types
    ├── pages/                # ArchivePage (archive and collections), ProfilePage
    ├── components/
    │   ├── Modal.tsx         # Accessible dialog: focus trap, Escape, scroll lock, focus return
    │   ├── ConfirmDialog.tsx # Small confirm dialogs built on Modal
    │   ├── layout/           # Sidebar, Topbar
    │   ├── mixes/            # MixCard, MixSwatch, PaintList, MixForm, ColorSampler
    │   ├── collections/      # CollectionForm
    │   ├── sharing/          # ShareDialog, SharedPage
    │   └── auth/             # SignInDialog, SetPasswordDialog, PasswordField
    ├── hooks/
    │   ├── useAuth.ts        # Supabase session, magic links, password recovery
    │   ├── useArchive.ts     # The archive on screen and every change to it
    │   ├── useSharedLink.ts  # The share in the address (/s/…, #s=…, #share=…)
    │   └── useNotice.ts      # Success messages with one shared timer
    ├── lib/
    │   ├── stores/           # ArchiveStore interface, localStore (browser), cloudStore (Supabase)
    │   ├── sharing.ts        # Short, compressed and old share links
    │   ├── validation.ts     # Checks for anything from storage, links or backups
    │   ├── backup.ts         # Backup files: read, write, download
    │   ├── images.ts         # Photo resizing and conversion
    │   ├── errors.ts         # Plain-language error messages
    │   └── supabase.ts       # Supabase client (null when not configured)
    └── styles/
        ├── reset.css         # Base reset (from Tailwind's preflight, MIT)
        └── styles.css        # Theme variables, layout, components and motion
```

**How the pieces fit:** `useArchive` picks a store depending on whether you're signed in. `localStore` saves to the browser, and `cloudStore` saves to Supabase. Both implement the same `ArchiveStore` interface, so no component needs to know where data is saved. `App.tsx` holds the routes and a single `dialog` state, because only one dialog is ever open at a time.

## Data and privacy

**Signed out.** Mixes and collections are saved in the browser's `localStorage` under `the-colour-archive-mixes` and `the-colour-archive-collections`. Nothing is uploaded.
- Your data stays in one browser on one device, and clearing site data deletes it. Use **Export** to keep a backup file.
- Browser storage is limited (usually about 5 MB) and photos take up most of it. If it fills up, the app shows an error instead of failing silently.

**Signed in.** Data is stored in Supabase.
- Every table uses row-level security, so each person can only read or change their own rows. A collection can only link to mixes owned by the same person.
- Mix photos are in a private bucket, with one folder per user and a 2 MB, images-only limit. The app shows them through short-lived signed links.

**Sharing.**
- Compressed and older links keep the recipe in the URL fragment, which browsers never send to the server.
- Short links store a snapshot that anyone with the exact code can open through `get_share()`, but shares can't be listed or browsed, and only their creator can change them.
- Photos in short links are copies in a public `share-photos` bucket, so the originals stay private.

## Security

- **Netlify security headers** (`netlify.toml`):
  - a Content Security Policy that only allows the site's own scripts, Google Fonts and the Supabase project;
  - `X-Frame-Options: DENY`, so the app can't be embedded in another site;
  - `nosniff`, a strict referrer policy and a restrictive permissions policy.
- **Incoming data is checked:** share links and backup files are validated before use. Photos must be JPEG, PNG or WebP data, or a link into the share bucket. Compressed links are size-capped while they're unpacked.
- **The database checks its own data:** colours, name lengths and share codes are checked again by the database, and share snapshots are limited to 100 KB.

## Deployment

Netlify builds the site from `netlify.toml`: it runs `npm run build`, publishes `dist/`, and rewrites every route (including `/s/…` short links) to `index.html`. Connect the repository in Netlify and it deploys on every push to `main`.

To turn on accounts in production, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under **Site configuration → Environment variables** and redeploy. If they're missing, the deployed app runs in browser-only mode.
