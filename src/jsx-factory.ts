
interface RefObjectPrivate<T> extends MicroJSX.RefObject<T> {
    _set: (el: T | null) => void;
}

export namespace MicroJSX {
    export interface RefObject<T> {
        current: T | null;
        _set: (el: T | null) => void;
    }

    type MouseEvents = (
        "click" |
        "dblClick" |
        "mouseDown" |
        "mouseEnter" |
        "mouseLeave" |
        "mouseMove" |
        "mouseOut" |
        "mouseOver" |
        "mouseUp"
    );

    type MouseEventHandlers = Record<`on${Capitalize<MouseEvents>}`, (event: MouseEvent) => void>;

    export interface HTMLAttributes<T extends HTMLElement = HTMLElement> extends Partial<MouseEventHandlers> {
        ref?: RefObject<T>;
        class?: string;
        id?: string;
        title?: string;
        // [key: string]: string | number | boolean | Function | null | undefined;
    }

    export interface HTMLAnchorAttributes extends HTMLAttributes<HTMLAnchorElement> {
        href?: string;
        target?: string;
        rel?: string;
    }

    export interface HTMLImageAttributes extends HTMLAttributes<HTMLImageElement> {
        src?: string;
        alt?: string;
    }
}

declare global {
    export namespace JSX {
        export interface Element extends HTMLElement {
        }

        export interface ElementAttributesProperty {
            props: {};
        }

        export interface IntrinsicElements {
            'div': MicroJSX.HTMLAttributes;
            'a': MicroJSX.HTMLAnchorAttributes;
            'img': MicroJSX.HTMLImageAttributes;
            [elemName: string]: MicroJSX.HTMLAttributes<any>;
        }
    }
}

type FunctionComponent = (props: any, ...children: any[]) => any;

type TextOrElement = string | HTMLElement | TextOrElement[];

export function createElement(tag: string | FunctionComponent, props: Record<string, any>, ...children: any[]): JSX.Element {
    if (typeof tag === "function") {
        return tag(props, ...children);
    }
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(props || {})) {
        if (name.startsWith("on") && name.toLowerCase() in window) {
            element.addEventListener(name.toLowerCase().substr(2), value);
        } else if (name === "ref") {
            (value as MicroJSX.RefObject<HTMLElement>)._set(element);
        } else {
            element.setAttribute(name, value.toString());
        }
    }
    for (const child of children) {
        appendChild(element, child);
    }
    return element;
}

function appendChild(parent: HTMLElement, child: TextOrElement) {
    if (Array.isArray(child))
        child.forEach(nestedChild => appendChild(parent, nestedChild));
    else
        parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
}

export function createFragment(props: unknown, ...children: any[]) {
    return children;
}

export function createRef<T extends HTMLElement>(): MicroJSX.RefObject<T> {
    const ref: RefObjectPrivate<T> = {
        current: null,
        _set: (el: T | null) => ref.current = el,
    };
    return ref;
}
