# CuzBro Astronomy / Photography v2

## Run locally
1. Install Node.js.
2. In this folder, run: `npm install`
3. Run: `npm run dev`

## Add photos
Edit `public/data/gallery.json`.
For local images, place files in `public/photos/` and use image paths like:

```json
"image": "/photos/m13.jpg"
```

## Deploy on GitHub Pages
For easiest deployment, connect this repository to Cloudflare Pages or Vercel.
Build command: `npm run build`
Output folder: `dist`
