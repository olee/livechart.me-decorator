
export interface AnimeInfo {
    readonly id: string;
    readonly title: string;
    readonly streams: readonly StreamInfo[];
    readonly updatedAt: number;
}

export interface StreamInfo {
    readonly href: string;
    readonly logo?: string;
}

export class RateLimitError extends Error {
    constructor() {
        super('Rate limit exceeded');
    }
}

const ONE_HOUR = 1000 * 60 * 60;

export function isInfoOutdated(info: AnimeInfo) {
    const lastUpdatedSince = Date.now() - (info.updatedAt || 0);
    return (
        lastUpdatedSince > ONE_HOUR * (info.streams.length === 0 ? 6 : 24 * 2)
    );
}
