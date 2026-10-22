# trqsh logo

`trqsh-logo-source.png` is the canonical owner-supplied `trqsh.png`. Preserve its original PNG bytes when replacing the source.

`trqsh-logo-rounded.svg` embeds that PNG and clips only the outer canvas to a rounded square. The mark, color, position, and pixel content are unchanged. The corner radius is 12% of the canvas width, and the exterior corner areas are transparent.

The website and dashboard each use a 256px export at `public/trqsh-logo.png`. Their `components/logo.tsx` components import that PNG so Next.js supplies a versioned asset URL, including when the dashboard has a base path. Their `app/icon.svg` favicons embed the same export and round only the outer canvas. Refresh both exports and favicons whenever the source changes.

The main README and organization-profile draft use `assets/brand/trqsh-logo-rounded.svg` with a version query based on the source PNG's SHA-256 hash (currently `41c1715b161a`). Update that query when replacing the source so image caches load the new logo.

Logo/brand licensing and a trademark policy are part of the separate open-source release plan.
