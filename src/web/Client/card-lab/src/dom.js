/**
 * Cool stuff to manipulate the DOM and Web Components
 */

export function registerTemplate(id, html) {
    const template = document.createElement('template');
    template.id = id;
    template.innerHTML = html;
    document.head.appendChild(template);
    
    return template;
}

export function importGlobalStyles(shadowDom) {
    const linkNodes = document.querySelectorAll('link[rel="stylesheet"]');
    for (const n of linkNodes) {
        shadowDom.appendChild(n.cloneNode(true));
    }
}