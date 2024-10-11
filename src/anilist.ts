import { createClient } from "./genql";

const client_id = '17318';

let anilistToken = localStorage.getItem('anilistToken');
let anilistUserId = Number(localStorage.getItem('anilistUserId'));

export const anilistClient = createClient({
    url: "https://graphql.anilist.co",
    batch: {
        batchInterval: 100,
        maxBatchSize: 10,
    },
    headers: () => {
        if (!anilistToken) {
            throw new Error('Not logged in to AniList');
        }
        return {
            Authorization: `Bearer ${anilistToken}`,
        };
    },
});

export function isAuthenticated() {
    return Boolean(anilistToken);
}

export function getUserId() {
    return anilistUserId;
}

export function logout(): void {
    anilistToken = null;
    anilistUserId = 0;
    localStorage.removeItem('anilistToken');
    localStorage.removeItem('anilistUserId');
    window.location.reload();
}

export function getLoginUrl() {
    return `https://anilist.co/api/v2/oauth/authorize?client_id=${client_id}&response_type=token`;
}

(async function processLogin() {
    const hashToken = new URLSearchParams(window.location.hash.slice(1)).get('access_token');
    if (!hashToken) {
        return;
    }
    anilistToken = hashToken;
    window.location.hash = '';

    const { Viewer: user } = await anilistClient.query({
        Viewer: {
            id: true,
            name: true,
        }
    });
    if (!user) {
        throw new Error('Failed to get AniList user info');
    }
    anilistUserId = user.id;
    localStorage.setItem('anilistToken', anilistToken);
    localStorage.setItem('anilistUserId', String(anilistUserId));

    alert(`Successfully logged in to AniList as ${user.name} (#${anilistUserId})`);
})();

export function findAnilistId(links: HTMLAnchorElement[]) {
    for (let link of links) {
        const match = link.href.match(/anilist.co\/anime\/(\d+)/i);
        if (match) {
            return Number(match[1]);
        }
    }
}

export async function getStatus(anilistId: number) {
    return await anilistClient.query({
        MediaList: {
            __args: {
                userId: anilistUserId,
                mediaId: anilistId,
            },
            status: true,
            progress: true,
            score: true,
            media: {
                episodes: true,
            }
        },
    }).then(
        x => x.MediaList,
        error => {
            console.error('Failed to get AniList status', error);
            return null;
        }
    );
}

export async function updateProgress(anilistId: number, progress: number, setWatching: boolean) {
    return anilistClient.mutation({
        SaveMediaListEntry: {
            __args: {
                mediaId: anilistId,
                progress,
                status: setWatching ? 'CURRENT' : undefined,
            },
            progress: true,
        },
    });
}
