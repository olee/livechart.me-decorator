import { createElement, createFragment, createRef } from '@/jsx-factory';
import getAnimeInfo from "./getAnimeInfo";
import { loadAnimeInfo } from "./persistence";

import * as anilist from './anilist';
import { delay, getShortName } from './utils';

const anilistStatusRef = createRef<HTMLElement>();

export async function decoratePage() {
    const headerEl = document.querySelector<HTMLElement>(
        '[data-controller="schedule"] .lc-chip-button.lc-chip-button-outline:last-of-type'
    );
    if (headerEl) {
        const btn = anilist.isAuthenticated() ? (
            <>
                <button
                    class="lc-chip-button lc-chip-button-outline"
                    onClick={() => anilist.logout()}
                >
                    <img class='w-5 mr-2' src='https://anilist.co/img/icons/favicon-32x32.png' />
                    Logout
                </button>
                <div class='h-8 px-2 rounded-full border border-base-content/20 flex items-center min-w-0'>
                    <img class='w-5 mr-2' src='https://anilist.co/img/icons/favicon-32x32.png' />
                    <span ref={anilistStatusRef} class='truncate'>Logged in</span>
                </div>
            </>
        ) : (
            <a
                class="lc-chip-button lc-chip-button-outline"
                href={anilist.getLoginUrl()}
                title='Login with AniList'
            >
                <img class='w-5' src='https://anilist.co/img/icons/favicon-32x32.png' />
            </a>
        );
        headerEl.after(...Array.isArray(btn) ? btn : [btn]);
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

    const progressBtn = el.querySelector<HTMLElement>(
        '[data-schedule-anime-target=progressJumpButton]'
    );
    if (progressBtn && !progressBtn.dataset.decorated) {
        const title = progressBtn.title;
        // pattern of title should be "Progress to \d+"
        const episode = Number(title.match(/\d+/)?.[0]);
        if (!Number.isNaN(episode)) {
            progressBtn.addEventListener('click', async () => {
                // Delay to complete website interaction
                await delay(100);

                // get first 2 words from title
                const shortTitle = getShortName(info.title);

                // AniList
                if (info.anilistId && anilist.isAuthenticated()) {
                    let setWatching = true;
                    let status = await anilist.getStatus(info.anilistId);
                    if (status) {
                        if (status.status === 'COMPLETED') {
                            setStatus(`Status already complete: "${shortTitle}`);
                            return;
                        }
                        if (status.progress && status.progress >= episode) {
                            setStatus(`Episode already watched: "${shortTitle}`);
                            return;
                        }
                        setWatching = Boolean(
                            status.status !== 'CURRENT' &&
                            status.media?.episodes && episode < status.media.episodes
                        );
                        setStatus(`Updating "${shortTitle}"...`);
                    } else {
                        // console.error(`Failed to get AniList status for anime ${info.anilistId}`);
                        // return;
                        setStatus(`Adding "${shortTitle}"...`);
                    }
                    try {
                        await anilist.updateProgress(info.anilistId, episode, setWatching);
                        setStatus(`Updated "${shortTitle}" to episode ${episode}`);
                    } catch (error) {
                        console.error('Failed to update progress on AniList', error);
                        setStatus(`Error updating "${shortTitle}"`, true);
                    }
                    await delay(5_000);
                }
            });
            progressBtn.dataset.decorated = 'true';
        }
    }
}

function setStatus(status: string, error?: boolean) {
    if (!anilistStatusRef.current) {
        return;
    }
    anilistStatusRef.current.textContent = status;
    if (error) {
        anilistStatusRef.current.classList.add('text-error');
    } else {
        anilistStatusRef.current.classList.remove('text-error');
    }
}
