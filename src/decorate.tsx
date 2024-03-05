import { createElement, createFragment, createRef } from '@/jsx-factory';
import getAnimeInfo from "./getAnimeInfo";
import { loadAnimeInfo } from "./persistence";

import * as anilist from './anilist';

export async function decoratePage() {
    const headerEl = document.querySelector<HTMLElement>(
        '[data-controller="schedule"] .lc-chip-button.lc-chip-button-outline:last-of-type'
    );
    if (headerEl) {
        const btn = anilist.isAuthenticated() ? (
            <button
                class="lc-chip-button lc-chip-button-outline"
                onClick={() => anilist.logout()}
            >
                Logout from AniList
            </button>
        ) : (
            <a
                class="lc-chip-button lc-chip-button-outline"
                href={anilist.getLoginUrl()}
            >
                Login with AniList
            </a>
        );
        headerEl.after(btn);
    }

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
            // const imgRef = createRef<HTMLImageElement>();
            watchBtnContainer = (
                <div class="overflow-hidden lc-tt-action-button-wrap">
                    <a
                        class="lc-tt-action-button lc-release-schedule-action-button lc-btn-xs"
                        href={topStream.href}
                        target="_blank"
                        rel="nofollow noopener"
                        title="Watch"
                    >
                        <img /*ref={imgRef}*/ class="h-4" src={topStream.logo} />
                    </a>
                </div>
            );
            el.append(watchBtnContainer);
        }
    }
}
