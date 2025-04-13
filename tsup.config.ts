import { defineConfig } from 'tsup';

const userScriptHeader = `// ==UserScript==
// @name         livechart.me utilities
// @namespace    http://tampermonkey.net/
// @version      0.2.0
// @description  Add watch links to livechart.me timetable
// @author       You
// @match        https://www.livechart.me/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=livechart.me
// @grant        none
// @updateURL    https://raw.githubusercontent.com/olee/livechart.me-decorator/refs/heads/master/build/index.global.js
// @downloadURL  https://raw.githubusercontent.com/olee/livechart.me-decorator/refs/heads/master/build/index.global.js
// ==/UserScript==`;

export default defineConfig({
    entry: ['src/index.ts'],
    bundle: true,
    format: ['iife'],
    outDir: 'build',
    splitting: false,
    sourcemap: false,
    clean: true,
    minify: false,
    env: {
        NODE_ENV: 'development',
    },
    banner: {
        js: userScriptHeader,
    },
});
