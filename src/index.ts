import { decorateAnimeBlock, decoratePage } from "./decorate";
import getAnimeInfo, { processAnimeInfo } from "./getAnimeInfo";
import { loadAnimeInfo, saveAnimeInfo } from "./persistence";

declare global {
    interface Window {
        livechartToolkit: {
            addStreamOverride: Function;
            [key: string]: unknown;
        };
    }
}

let streamOverrides = JSON.parse(localStorage.getItem(`stream-overrides`) || '{}');

async function addStreamOverride(id: string, href: string, logo = 'https://u.livechart.me/streaming_service/248/logo/e0e43ed5e6191cea23520a1c91808779.png/small.png') {
    streamOverrides[id] = { href, logo };
    localStorage.setItem(`stream-overrides`, JSON.stringify(streamOverrides));
    const info = loadAnimeInfo(id);
    if (info) {
        saveAnimeInfo({ ...info, streams: [{ href, logo }], });
        for (let el of document.querySelectorAll<HTMLElement>('.timetable-anime-block')) {
            await decorateAnimeBlock(el, true);
        }
    }
}

window.livechartToolkit = {
    addStreamOverride,
    getAnimeInfo,
};

if (window.location.pathname.startsWith('/schedule')) {
    console.log('Decorating timetable page...');
    decoratePage();
} else {
    const match = window.location.pathname.match(/\/anime\/(\d+)/);
    if (match) {
        const id = match[1];
        console.log('Extracting info from anime page', id);
        processAnimeInfo(document);
    }
}
