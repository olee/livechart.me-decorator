import type { AnimeInfo } from "./types";

export function saveAnimeInfo(info: AnimeInfo) {
    localStorage.setItem(`info-${info.id}`, JSON.stringify(info));
}

export function loadAnimeInfo(id: string): AnimeInfo | undefined {
    return JSON.parse(localStorage.getItem(`info-${id}`) || 'null') || undefined;
}
