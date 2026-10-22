# Changelog

All notable changes to LibreTours 360 are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] — Unreleased

First stable release: a local-first editor for 360° virtual tours, in the browser and as a desktop app for macOS and Windows.

### Editor
- Multi-scene tours: drag to reorder, star the start scene, rename scenes in place, see per-scene counts of hotspots, info points and measurements.
- Door, arrow and info hotspots; info popups in Markdown; navigation hotspots can create their return hotspot in the target scene.
- Per-scene default view (yaw, pitch, zoom); zoom from 30° out to a 110° field of view.
- Measurement lines with free-text labels, drawn as great-circle arcs that stay on the edges.
- Multi-floor plans with a minimap, scene positions and a view cone that follows the camera.
- Theme builder: resizable logo with a color or transparent background, image and text overlays, Theme Canvas with responsive preview, preset library and `.lt-theme` files.
- Drag & drop of panoramas, logos and floor plans, with import progress, in the browser and in the desktop app.
- English and Italian interface, switchable at runtime.

### Export
- Web 3D tour (Photo Sphere Viewer, needs a web server).
- Standalone 3D tour (CSS cubemap) that opens from `file://` with a double-click.
- Theme, measurement lines and floor plan minimap in both tours.
- `.ltproj` project package with all images, to back up or move a project between browser and desktop; JSON export of the project data.

### Storage
- One folder per project on desktop, the same layout in IndexedDB in the browser.
- Atomic saves with a backup copy, schema validation with migrations, quarantine of damaged projects, safe file names.

### Desktop
- macOS app; Windows NSIS installer and portable exe, built in CI.
- WebGL crash protection with a WebView2 software rendering fallback on Windows.

### Project
- Started on Lovable, now fully independent: a plain Vite single-page app with no Lovable tooling, libraries or services, and no server-side rendering.
- Unused starter components, packages and sample images removed: the desktop app's frontend dropped from about 10 MB to 1.8 MB.
