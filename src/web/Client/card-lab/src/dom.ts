/**
 * Cool stuff to manipulate the DOM and Web Components.
 * Certified better than React, all in (almost) 100 lines of code!
 */

export function registerTemplate(id: string, html: string) {
    const template = document.createElement('template');
    template.id = id;
    template.innerHTML = html;
    document.head.appendChild(template);

    return template;
}

let globalStyles = null as HTMLElement[] | null;
export function importGlobalStyles(shadowDom: ShadowRoot) {
    if (globalStyles === null) {
        globalStyles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'));
    }
    for (const n of globalStyles) {
        shadowDom.appendChild(n.cloneNode(false));
    }
}

/**
 * A very useful decorator to put before a field of type HTMLElement to get it filled in connected().
 * @param id the id of the element in the shadow DOM
 */
export function fromDom(id: string) {
    return (self: any, name: string) => {
        if (!self.nodePropMap) {
            self.nodePropMap = {};
        }
        self.nodePropMap[name] = id;
    };
}

const constructibleStyleSheetsSupported = "adoptedStyleSheets" in document;

// This is a sort of polyfill for constructible stylesheets. (not available in iOS <16)
export class LabStyle {
    sheet: CSSStyleSheet | HTMLStyleElement;
    constructor(public css: string) {
        if (constructibleStyleSheetsSupported) {
            this.sheet = new CSSStyleSheet();
            this.sheet.replaceSync(css);
        } else {
            const el = document.createElement('style');
            el.textContent = css;
            this.sheet = el;
        }
    }
    
    apply(element: LabElement) {
        if (constructibleStyleSheetsSupported) {
            element.dom.adoptedStyleSheets.push(this.sheet as CSSStyleSheet);
        } else {
            const style = this.sheet as HTMLStyleElement;
            element.dom.appendChild(style.cloneNode(true));
        }
    }
}

// All LabElements are display: block by default.
const sharedStyle = new LabStyle(":host { display: block; }");

export class LabElement extends HTMLElement {
    dom: ShadowRoot = null!
    importGlobalStyles = false
    useDefaultHostStyle = true
    connectedOnce = false;
    // nodePropMap?: Record<string, string>
    // Set by the decorator using the prototype
    
    private connectedCallback() {
        if (this.connectedOnce) {
            this.reconnected();
            return;
        }
        
        this.connectedOnce = true;
        this.dom = this.attachShadow({mode: 'open'});
        if (this.importGlobalStyles) {
            importGlobalStyles(this.dom)
        }
        if (this.useDefaultHostStyle) {
            sharedStyle.apply(this);
        }

        this.init();
        this.render();
        this.resolveFromDomFields();
        this.connected();
    }

    private disconnectedCallback() {
        this.disconnected();
    }

    private attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        this.attributeChanged(name, oldValue, newValue);
    }

    init() {
    }

    render() {
    }

    connected() {
    }
    
    reconnected() {}

    disconnected() {
    }

    attributeChanged(name: string, oldValue: string | null, newValue: string | null) {
    }

    resolveFromDomFields() {
        const nodePropMap = (this as any).nodePropMap as Record<string, string>;
        if (nodePropMap) {
            for (const [name, id] of Object.entries(nodePropMap)) {
                (this as any)[name] = this.dom.getElementById(id);
            }
        }
    }

    /**
     * Helper functions to avoid typing around 40 characters every time.
     */

    getElement<T extends HTMLElement>(id: string): T | null {
        return this.dom.getElementById(id) as T | null;
    }

    renderTemplate(template: HTMLTemplateElement, target: HTMLElement | ShadowRoot | null = null) {
        if (target === null) {
            target = this.dom;
        }
        target.appendChild(template.content.cloneNode(true));
    }
}