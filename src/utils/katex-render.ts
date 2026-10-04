import katex from 'katex';

/**
 * Renders a LaTeX string into an HTML element
 */
export function renderLatex(tex: string, element: HTMLElement, displayMode: boolean = false): void {
  try {
    katex.render(tex, element, {
      displayMode,
      throwOnError: false,
    });
  } catch (err) {
    console.error('KaTeX rendering error:', err);
    element.textContent = tex;
  }
}

/**
 * Parses and renders any $...$ (inline) or $$...$$ (display) in a container
 */
export function renderMathInElement(container: HTMLElement): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  const regex = /(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g;

  for (const node of textNodes) {
    const text = node.nodeValue || '';
    if (!regex.test(text)) continue;

    regex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      }

      const raw = match[0];
      const isDisplay = raw.startsWith('$$');
      const formula = isDisplay ? raw.slice(2, -2) : raw.slice(1, -1);

      const span = document.createElement(isDisplay ? 'div' : 'span');
      if (isDisplay) span.className = 'math-block';
      renderLatex(formula, span, isDisplay);
      fragment.appendChild(span);

      lastIndex = match.index + raw.length;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
  }
}
