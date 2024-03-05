import { createClient } from "./genql";

const client_id = '17318';

let anilistToken = localStorage.getItem('anilistToken');

export const anilistClient = createClient({
    url: "https://graphql.anilist.co",
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

export function logout(): void {
    anilistToken = null;
    localStorage.removeItem('anilistToken');
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
    localStorage.setItem('anilistToken', anilistToken);
    window.location.hash = '';

    const { Viewer: user } = await anilistClient.query({
        Viewer: {
            name: true,
        }
    });
    alert(`Successfully logged in to AniList as ${user?.name}`);
})();
