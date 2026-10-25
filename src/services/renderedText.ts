/** Collect rendered DOM text without guessing which descendant is the "main" one.
 * A semantic article stays together; other blocks (including chat divs) stay
 * separate. Short text and siblings outside articles are deliberately retained.
 * This reads loaded DOM, including scroll containers; it never clicks or scrolls.
 */
export type ScanScope = "viewport" | "page";

export function collectRenderedText(root: Element, scope: ScanScope = "page"): Array<{ node: Element; text: string }> {
  const viewportOnly = scope === "viewport";
  // A paragraph crossing the edge is kept whole for readable speech; unrelated
  // paragraphs outside the viewport or an ancestor's scrollport are excluded.
  function intersectsView(node: Node, rect: DOMRect): boolean {
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
    let parent: Element | null = node.parentElement;
    while (parent) {
      // The document scrollport is already represented by the viewport. Its
      // bounding rect moves above zero after scrolling; clipping it again would
      // incorrectly discard every paragraph on pages with root overflow.
      if (parent === node.ownerDocument?.documentElement || parent === node.ownerDocument?.scrollingElement) {
        parent = parent.parentElement;
        continue;
      }
      const style = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        left = Math.max(left, bounds.left + parent.clientLeft);
        right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth);
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        top = Math.max(top, bounds.top + parent.clientTop);
        bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight);
      }
      const tree = parent.getRootNode();
      parent = parent.assignedSlot ?? parent.parentElement ?? (tree instanceof ShadowRoot ? tree.host : null);
    }
    return left < right && top < bottom && rect.right > left && rect.left < right && rect.bottom > top && rect.top < bottom;
  }
  const groups = new Map<Element, string[]>();
  const visibleOwners = new Set<Element>();
  const append = (owner: Element, text: string) => {
    const parts = groups.get(owner) ?? [];
    parts.push(text);
    groups.set(owner, parts);
  };
  function visit(node: Node, block: Element, article: Element | null): void {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent?.trim()) {
        if (node.textContent) append(article ?? block, node.textContent);
        return;
      }
      const range = node.ownerDocument!.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
      if (rects.length) {
        append(article ?? block, node.textContent);
        if (viewportOnly && rects.some(rect => intersectsView(node, rect))) visibleOwners.add(article ?? block);
      }
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.matches('script,style,noscript,template,svg,canvas,iframe,input,[hidden],[aria-hidden="true"]')) return;
    if (viewportOnly && node.matches('nav,aside,footer,[role="navigation"],[role="complementary"],[role="contentinfo"],button,select,textarea')) return;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
      || style.contentVisibility === 'hidden' || Number(style.opacity) === 0) return;
    // Visually clipped accessibility mirrors should not duplicate the chat text.
    const rect = node.getBoundingClientRect();
    if ((style.clip !== 'auto' || style.clipPath !== 'none'
      || ((style.position === 'absolute' || style.position === 'fixed') && style.overflow === 'hidden'))
      && rect.width <= 1 && rect.height <= 1) return;
    const isBlock = !['inline', 'contents'].includes(style.display);
    const nextBlock = isBlock ? node : block;
    const nextArticle = article ?? (!viewportOnly && node.matches('article,[role="article"],[data-ad-preview="message"],[data-testid="post_message"]') ? node : null);
    if (isBlock && nextArticle) append(nextArticle, '\n');
    if (node instanceof HTMLTextAreaElement) {
      append(nextArticle ?? nextBlock, node.value);
    } else if (node.tagName === 'BR') {
      append(nextArticle ?? nextBlock, '\n');
    } else {
      // Open web components are common on documentation and media sites.
      const assigned = node instanceof HTMLSlotElement ? node.assignedNodes() : [];
      const children = assigned.length ? assigned : node.shadowRoot ? node.shadowRoot.childNodes : node.childNodes;
      for (const child of children) visit(child, nextBlock, nextArticle);
    }
    if (isBlock && nextArticle) append(nextArticle, '\n');
  }
  visit(root, root, null);
  return [...groups].filter(([node]) => !viewportOnly || visibleOwners.has(node)).map(([node, parts]) => ({ node, text: parts.join('').replace(/\s+/g, ' ').trim() }))
    .filter(({ text }) => text.length > 0);
}
