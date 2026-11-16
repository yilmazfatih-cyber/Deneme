---
title: Getting started
description: Run the site on your computer in five minutes, make your first change and produce the files that are ready to publish.
group: Getting started
order: 10
translationKey: hizli-baslangic
---

This site foundation lets you publish your own site without programming knowledge. To personalise it you only change **one settings file** and the content files under `src/content/`.

## Requirements

- [Node.js](https://nodejs.org/) 22.23.4 or newer. Run `node --version` in a terminal to check.
- A text editor (for example Visual Studio Code).

## Installation

Open a terminal in the folder and run:

```bash title="Terminal"
npm ci
npm run dev
```

The first command installs the exact package versions from the lock file (needed once). The second starts the development server; open **http://localhost:4410/** in your browser.

## Your first change

Open `src/site.config.ts` and replace the name in the `name: 'Sedir'` line with your own brand. Save the file and the new name appears in the header, the footer and the browser tab.

## Files ready to publish

```bash title="Terminal"
npm run build
npm run preview
```

`npm run build` writes every page to the `dist/` folder, including social images, the sitemap, RSS and the search index. `npm run preview` serves that folder at **http://localhost:4411/**. Site search only works in this built version.

> [!NOTE]
> The full user guide is currently written in Turkish. Switch the language to read the other chapters.
