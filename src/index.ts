
export { };

declare global {
    interface Window {
        addStreamOverride: Function;
    }
}

interface AnimeInfo {
    id: string;
    title: string;
    streams: StreamInfo[];
    updatedAt: number;
}

interface StreamInfo {
    href: string;
    logo?: string;
}

const ONE_HOUR = 1000 * 60 * 60;

const ANIME_INFO_STREAMS_SELECTOR = '[data-controller="anime-details"] .grid.md\\:grid-cols-2 .card.bg-base-300 .flex .flex-1 a';

let streamOverrides = JSON.parse(localStorage.getItem(`stream-overrides`) || '{}');

function getAnimeUrl(id: string) {
    return `https://www.livechart.me/anime/${id}`;
}

function extractAnimeInfo(id: string, pageEl: ParentNode) {
    const title = pageEl.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
    const streams = streamOverrides[id] ? [streamOverrides[id]] :
        Array.from(pageEl.querySelectorAll<HTMLAnchorElement>(ANIME_INFO_STREAMS_SELECTOR))
            .map<StreamInfo>(x => ({
                href: x.href,
                logo: (x.parentElement?.previousSibling as HTMLImageElement | undefined)?.src,
            }))
            .filter(x => !x.href.includes('crunchyroll.com/videos'));
    if (!title) {
        console.info(`Could not fetch anime ${getAnimeUrl(id)}. Rate limit exceeded?`);
        return;
    }
    const info: AnimeInfo = {
        id,
        title,
        streams,
        updatedAt: Date.now(),
    };
    console.debug(`Fetched anime info [${id}] "${info.title}"`, info);
    saveAnimeInfo(info);
    return info;
}

async function fetchAnimeInfo(id: string) {
    const templateId = `anime-${id}`;
    let templateEl = document.querySelector<HTMLTemplateElement>(`#${templateId}`);
    if (!templateEl) {
        const html = await fetch(getAnimeUrl(id)).then(x => x.text());
        templateEl = document.createElement('template');
        templateEl.innerHTML = html;
        templateEl.id = templateId;
        // document.body.append(templateEl);
        await new Promise(r => setTimeout(r, 2000));
    }
    return extractAnimeInfo(id, templateEl.content);
}

function getAnimeInfoFromLocalStorage(id: string): AnimeInfo {
    return JSON.parse(localStorage.getItem(`info-${id}`) || 'null') || undefined;
}

function saveAnimeInfo(info: AnimeInfo) {
    localStorage.setItem(`info-${info.id}`, JSON.stringify(info));
}

async function addStreamOverride(id: string, href: string, logo = 'https://u.livechart.me/streaming_service/248/logo/e0e43ed5e6191cea23520a1c91808779.png/small.png') {
    streamOverrides[id] = { href, logo };
    localStorage.setItem(`stream-overrides`, JSON.stringify(streamOverrides));
    const info = getAnimeInfoFromLocalStorage(id);
    if (info) {
        saveAnimeInfo({ ...info, streams: [{ href, logo }], });
        for (let el of document.querySelectorAll<HTMLElement>('.timetable-anime-block')) {
            await handleElement(el, true);
        }
    }
}

function isInfoOutdated(info: AnimeInfo) {
    if (!info) {
        return true;
    }
    const lastUpdatedSince = Date.now() - (info.updatedAt || 0);
    return (
        lastUpdatedSince > ONE_HOUR * (info.streams.length === 0 ? 6 : 24 * 2)
    );
}

async function getAnimeInfo(id: string) {
    let info = getAnimeInfoFromLocalStorage(id);
    if (!isInfoOutdated(info)) {
        return info;
    }
    return fetchAnimeInfo(id);
}

async function handleElement(el: HTMLElement, disableFetch = false) {
    const id = el.dataset.scheduleAnimeId;
    if (!id) {
        throw new Error('No anime id data attribute found');
    }
    const info = disableFetch ? getAnimeInfoFromLocalStorage(id) : await getAnimeInfo(id);
    if (!info) {
        return;
    }
    // console.info(`Anime Info [${id}] "${info.title}"`, info.streams);

    const topStream = info.streams.find(x => x.href.includes('crunchyroll')) ||
        info.streams[0];

    if (topStream) {
        let footerEl = el.querySelector('.lc-tt-action-button-wrap');
        if (!footerEl) {
            footerEl = document.createElement('div');
            footerEl.classList.add('overflow-hidden', 'lc-tt-action-button-wrap');
            el.append(footerEl);

            const linkEl = document.createElement('a');
            linkEl.classList.add('lc-tt-action-button', 'lc-release-schedule-action-button', 'lc-btn-xs');
            linkEl.href = topStream.href;
            linkEl.target = '_blank';
            linkEl.rel = 'nofollow noopener';
            linkEl.title = 'Watch';
            footerEl.append(linkEl);

            const iconEl = document.createElement('img'); // set to topStream.logo
            iconEl.classList.add('h-4');
            iconEl.src = topStream.logo || '';
            linkEl.append(iconEl);
        }
    }
}

async function decoratePage() {
    const elements = document.querySelectorAll<HTMLElement>('.lc-timetable-anime-block');
    for (let el of elements) {
        await handleElement(el, true);
    }
    for (let el of elements) {
        await handleElement(el);
    }
}

window.addStreamOverride = addStreamOverride;

if (window.location.pathname.startsWith('/schedule')) {
    console.log('Decorating timetable page...');
    decoratePage();
} else {
    const match = window.location.pathname.match(/\/anime\/(\d+)/);
    if (match) {
        const id = match[1];
        console.log('Extracting info from anime page', id);
        extractAnimeInfo(id, document);
    }
}
