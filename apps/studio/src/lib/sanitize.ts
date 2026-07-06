/**
 * Sanitize untrusted SVG before DOM insertion (CLAUDE.md rule 8).
 * DOM-based: parse, walk, strip — no regex-only false confidence.
 */
const BANNED_TAGS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'link', 'meta']);

export function sanitizeSvg(markup: string): string {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><text x="6" y="26" font-size="8" fill="currentColor">invalid svg</text></svg>';
  }
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (BANNED_TAGS.has(child.tagName.toLowerCase())) {
        child.remove();
        continue;
      }
      walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (
        name.startsWith('on') ||
        ((name === 'href' || name === 'xlink:href' || name === 'src') &&
          !value.startsWith('#') &&
          !value.startsWith('data:image/'))
      ) {
        el.removeAttribute(attr.name);
      }
    }
  };
  walk(root);
  return new XMLSerializer().serializeToString(root);
}
