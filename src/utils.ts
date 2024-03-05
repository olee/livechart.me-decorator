
export function delay(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}

export function getShortName(title: string, maxLength = 32) {
    let result = '';
    for (const part of title.split(' ')) {
        if (result && result.length + part.length > maxLength) {
            result += '...';
            break;
        }
        result += ` ${part}`;
    }
    return result;
}
