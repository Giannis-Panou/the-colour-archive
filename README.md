# The Colour Archive

A personal archive for miniature paint mixes. Record the paints and drop ratios behind each colour, attach a photo of the result, pick the exact swatch from that photo, group mixes into collections, and share them with a link. No account or server is needed.

## Features

- **Mix records:** a name, a swatch colour, a list of paints (name, brand and number of drops) and notes for each mix.
- **Photo colour sampling:** attach a photo of a painted model and click or drag on it to pick the swatch colour. A magnifier helps you aim, and you can also move the picker with the keyboard. Photos are scaled down to 1200 px and compressed to JPEG before they are saved.
- **Collections:** group mixes into named collections (e.g. "Woodland bases"). Deleting a collection leaves its mixes in the archive.
- **Search and sort:** search across mix names, notes, paint names and brands. Sort by newest or by name.
- **Link sharing:** share a single mix or a whole collection as a URL. Everything is encoded in the link's `#share=` fragment, so no backend is involved. Whoever opens the link can save it to their own archive. If a link would be too long, photos are left out.
- **Local-first storage:** all data is kept in the browser's `localStorage`.
- **Backup and restore:** export the whole archive (mixes, photos and collections) as a JSON file, and import it on another browser or device. When importing, you can either add the backup to your archive, skipping mixes you already have, or replace your archive with it.
- **Responsive layout:** the sidebar can be collapsed, and the collections drawer is mobile-friendly.

## Tech stack

- [React 18](https://react.dev/)
- [Vite 6](https://vite.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/) through `@tailwindcss/vite`, alongside custom CSS in `src/styles.css`
- [Lucide](https://lucide.dev/) icons
- Deployed on [Netlify](https://www.netlify.com/)

## Getting started

You need [Node.js](https://nodejs.org/) 18 or later.

```bash
npm install
npm run dev       # start the dev server at http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the production build locally
```

## Project structure

```
├── index.html          # HTML entry, fonts and meta tags
├── netlify.toml        # Netlify build settings and SPA redirect
├── vite.config.js      # Vite + React + Tailwind plugins
└── src/
    ├── main.jsx        # React root
    ├── App.jsx         # App shell, mix/collection forms, sharing, colour sampler
    └── styles.css      # Global and component styles
```

## Data and privacy

Mixes and collections are saved in `localStorage` under the keys `the-colour-archive-mixes` and `the-colour-archive-collections`. Nothing is uploaded anywhere. This has two consequences:

- Your data stays in one browser on one device, and clearing site data deletes it. Use **Export** in the top bar to keep a backup file.
- Browser storage is limited (usually about 5 MB), and photos take up most of it. If storage fills up, the app shows an error instead of failing silently.

Share links hold their data in the URL fragment. Browsers do not send the fragment to the server, so shared mixes are not sent to the server either.

## Deployment

The site is set up for Netlify through `netlify.toml`: Netlify runs `npm run build`, publishes `dist/`, and rewrites every route to `index.html`. Connect the repository in Netlify and it deploys on every push to `main`.
