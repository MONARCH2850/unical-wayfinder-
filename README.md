# UNICAL Wayfinder

A browser-ready University of Calabar land map using Leaflet.js and OpenStreetMap. The viewport is locked to the university extent and includes searchable destinations, pathway overlays, route previews, browser geolocation, and an AR-style compass mode using device orientation when supported.

## Run

Open `index.html` directly for a quick preview. For phone installation, deploy the folder to any static host with HTTPS, then open it in Chrome/Edge/Safari and choose “Install app” or “Add to Home Screen”. The service worker and browser location/device sensors require HTTPS or localhost; `file://` preview cannot install the PWA.

The app is static and can be deployed to GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any ordinary web server. Keep `index.html`, `app.js`, `style.css`, `mobile.css`, `manifest.webmanifest`, `icon.svg`, and `sw.js` at the same public root.

## Add places from a phone

Tap **Add this place**, allow location access, enter a name and category, then save. The place is written directly into the app on that device and becomes searchable immediately, including after reload. The browser must provide HTTPS or localhost for location access. Walking navigation uses the public OSRM routing service when online; if it is unavailable, the app shows a direct preview and explains the limitation.

The location categories include **Church** and **Mosque**. To add worship locations accurately, stand at each location on campus and save it from the phone so its coordinates come from GPS.

This version has no shared server: a place added on one phone is not automatically visible to other users. Shared campus updates require connecting the form to an authenticated backend/database.

Select a place and tap **Start navigation** to open walking turn-by-turn directions in Google Maps using your current position and the saved destination.

For reliable campus navigation, GPS must place you inside the UNICAL campus boundary. Locations detected outside the boundary are not used as route origins and cannot be saved as campus places.

## Data note

This project does not copy Google Maps tiles or proprietary Google map data. It uses OpenStreetMap tiles clipped to the campus viewport and a local overlay for campus pathways and landmarks. Several added facilities are marked `verify` because their coordinates and names must be checked against official University of Calabar GIS data or a current field survey before publishing as an authoritative campus guide.

## Accessibility and backend integration

The sidebar accessibility panel supports wheelchair, step-free, audio, and vibration preferences. Preferences are stored on-device, accessible routes render in green, and standard walking routes render in orange. Starting navigation continues to use `watchPosition()` with permission-denied fallbacks; the AR button opens the camera view with an A-Frame directional overlay when supported.

The optional Django/PostGIS modules are in [`backend/`](backend/). After deploying that API, set `window.UNICAL_API_BASE` before `app.js` loads. The frontend will try `POST /api/routes/` first and retain its OSRM and direct-preview fallbacks when the API is unavailable. The backend documents PostGIS setup, token endpoints, accessibility data, and the additive migration in [`backend/README.md`](backend/README.md).
