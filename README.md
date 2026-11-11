# Halation

A local-first photo library. This repository is an independent implementation; the Argon/Grok/Replit archives are reference material only and are not copied into this source tree.

## Current milestone

- Import individual photos or a folder in a browser.
- Store original image blobs and library metadata in IndexedDB on the current device.
- Reopen the library after refresh without uploading photos to a server.
- Search filenames and relative paths, sort, switch grid density, preview, favorite, and remove an item from the Halation library.
- Removing an item from the library does not delete the original source file.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run typecheck
npm run build
```

## Privacy boundary

The current build does not transmit image files. It uses the browser's local IndexedDB. A later Android build will use a native media bridge and must retain the same local-only default.
