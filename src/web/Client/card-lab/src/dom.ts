﻿/**
 * Cool stuff to manipulate the DOM and Web Components.
 * Certified better than React, all in 100 lines of code!
 */

export function registerTemplate(id: string, html: string) {
    const template = document.createElement('template');
    template.id = id;
    template.innerHTML = html;
    document.head.appendChild(template);

    return template;
}

export function importGlobalStyles(shadowDom: ShadowRoot) {
    // TODO: inspect performance impact?
    const linkNodes = document.head.querySelectorAll('link[rel="stylesheet"]');
    for (const n of linkNodes) {
        shadowDom.appendChild(n.cloneNode(true));
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

// All LabElements are display: block by default.
const sharedStyle = new CSSStyleSheet();
sharedStyle.insertRule(":host { display: block; }");

export class LabElement extends HTMLElement {
    dom: ShadowRoot = null!
    importGlobalStyles = false
    // nodePropMap?: Record<string, string>
    // Set by the decorator using the prototype
    private connectedCallback() {
        this.dom = this.attachShadow({mode: 'open'});
        if (this.importGlobalStyles) {
            importGlobalStyles(this.dom)
        }
        this.dom.adoptedStyleSheets.push(sharedStyle);

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

    disconnected() {
    }

    attributeChanged(name: string, oldValue: string, newValue: string) {
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