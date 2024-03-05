import getAnimeInfo from "./getAnimeInfo";
import { loadAnimeInfo } from "./persistence";

export async function decoratePage() {
    const elements = document.querySelectorAll<HTMLElement>('.lc-timetable-anime-block');
    for (let el of elements) {
        await decorateAnimeBlock(el, true);
    }
    for (let el of elements) {
        await decorateAnimeBlock(el);
    }
}

export async function decorateAnimeBlock(el: HTMLElement, disableFetch = false) {
    const id = el.dataset.scheduleAnimeId;
    if (!id) {
        throw new Error('No anime id data attribute found');
    }
    const info = disableFetch ? loadAnimeInfo(id) : await getAnimeInfo(id);
    if (!info) {
        return;
    }
    // console.info(`Anime Info [${id}] "${info.title}"`, info.streams);

    const topStream = info.streams.find(x => x.href.includes('crunchyroll')) ||
        info.streams[0];

    if (topStream) {
        let watchBtnContainer = el.querySelector('.lc-tt-action-button-wrap');
        if (!watchBtnContainer) {
            watchBtnContainer = document.createElement('div');
            watchBtnContainer.classList.add('overflow-hidden', 'lc-tt-action-button-wrap');
            el.append(watchBtnContainer);

            const linkEl = document.createElement('a');
            linkEl.classList.add('lc-tt-action-button', 'lc-release-schedule-action-button', 'lc-btn-xs');
            linkEl.href = topStream.href;
            linkEl.target = '_blank';
            linkEl.rel = 'nofollow noopener';
            linkEl.title = 'Watch';
            watchBtnContainer.append(linkEl);

            const iconEl = document.createElement('img'); // set to topStream.logo
            iconEl.classList.add('h-4');
            iconEl.src = topStream.logo || '';
            linkEl.append(iconEl);
        }
    }
}
