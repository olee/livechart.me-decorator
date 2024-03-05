import { loadAnimeInfo, saveAnimeInfo } from "./persistence";
import { RateLimitError, isInfoOutdated, type AnimeInfo, type StreamInfo } from "./types";

declare global {
    var process: {
        env: {
            NODE_ENV: string;
        };
    };
}

function getAnimeUrl(id: string) {
    return `https://www.livechart.me/anime/${id}`;
}

export default async function getAnimeInfo(id: string, useCache = true) {
    const info = !useCache ? undefined : loadAnimeInfo(id);
    if (info && !isInfoOutdated(info)) {
        console.debug(`Loaded anime info [${id}] "${info.title}"`, info);
        return info;
    }
    while (true) {
        const doc = await fetchAnimeInfoDoc(id);
        if (!doc) {
            return;
        }
        try {
            return processAnimeInfo(doc);
        } catch (e) {
            if (e instanceof RateLimitError) {
                console.warn('Rate limit exceeded, waiting 5 seconds');
                await new Promise(r => setTimeout(r, 5_000));
            } else {
                console.error(`Error fetching anime info [${id}]`, e);
                return;
            }
        }
    }
}

async function fetchAnimeInfoDoc(id: string) {
    const templateId = `anime-${id}`;
    let templateEl: HTMLTemplateElement | undefined;
    // templateEl = document.querySelector<HTMLTemplateElement>(`#${templateId}`);
    if (!templateEl) {
        const url = getAnimeUrl(id);
        const html = await fetch(url).then(x => x.text());
        templateEl = document.createElement('template');
        templateEl.innerHTML = html;
        templateEl.id = templateId;
        // For debugging purposes only, append to body to see in devtools
        if (process.env.NODE_ENV === 'development') {
            document.body.append(templateEl);
        }

        // Wait 2 seconds to avoid rate limit
        await new Promise(r => setTimeout(r, 2000));
    }
    return templateEl.content;
}

/*
Important tags:
<meta property="og:url" content="https://www.livechart.me/anime/12345">
<meta property="og:title" content="TITLE">
*/

const ANIME_INFO_STREAMS_SELECTOR =
    '[data-controller="anime-details"] .grid.md\\:grid-cols-2 .card.bg-base-300 .flex .flex-1 a';

export function processAnimeInfo(doc: ParentNode) {
    const ogUrl = doc.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content;
    if (!ogUrl) {
        throw new RateLimitError();
    }
    const id = ogUrl.match(/\/anime\/(\d+)/)?.[1];
    if (!id) {
        throw new Error(`Could parse anime id from ${ogUrl}`);
    }

    const title = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
    if (!title) {
        throw new Error(`Could not find title for anime ${ogUrl}`);
    }

    const streams = Array.from(doc.querySelectorAll<HTMLAnchorElement>(ANIME_INFO_STREAMS_SELECTOR))
        .map<StreamInfo>(x => ({
            href: x.href,
            logo: (x.parentElement?.previousSibling as HTMLImageElement | undefined)?.src,
        }))
        .filter(x => !x.href.includes('crunchyroll.com/videos'));

    const info = Object.freeze<AnimeInfo>({
        id,
        title,
        streams,
        updatedAt: Date.now(),
    });
    console.debug(`Fetched anime info [${id}] "${info.title}"`, info);
    saveAnimeInfo(info);
    return info;
}
