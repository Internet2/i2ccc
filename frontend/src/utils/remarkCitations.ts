import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root, Parent, Text, PhrasingContent } from 'mdast';

export const CITATION_GROUP_HREF_PREFIX = '#__cite_group_';
const CITATION_REGEX = /\[\[(\d+)\]\]/g;
const BLOCK_TYPES = new Set(['paragraph', 'heading', 'tableCell']);

export interface RemarkCitationsOptions {
  /**
   * Set of valid citation numbers (i.e. numbers present in `message.sources`).
   * Numbers NOT in this set are left as literal `[[n]]` text in the rendered
   * output — that's the fallback behavior for hallucinated citations.
   * Numbers IN this set are stripped from the text and re-emitted as a
   * grouped citation link at the end of the containing block.
   */
  validNumbers?: Set<number>;
}

/**
 * Remark plugin that rewrites `[[n]]` tokens inside text nodes into a single
 * grouped citation link appended at the end of the containing block
 * (paragraph, heading, table cell).
 *
 * The href encodes the list of unique source numbers cited in that block, in
 * order of first appearance: `#__cite_group_1,3,5__`. A custom `a` component
 * override in the renderer then splits this group by badge type and renders
 * one chip per badge.
 *
 * Tokens inside `code` / `inlineCode` mdast nodes are not visited (those nodes
 * carry a `value`, not `text` children), so citations in code remain literal.
 */
export const remarkCitations: Plugin<[RemarkCitationsOptions?], Root> = (options = {}) => {
  const valid = options.validNumbers;

  return (tree) => {
    visit(tree, (node) => {
      if (!BLOCK_TYPES.has(node.type)) return;
      const block = node as Parent;

      const collected: number[] = [];

      visit(block, 'text', (textNode: Text) => {
        textNode.value = textNode.value.replace(CITATION_REGEX, (match, captured: string) => {
          const num = parseInt(captured, 10);
          if (!valid || valid.has(num)) {
            collected.push(num);
            return '';
          }
          return match;
        });
      });

      if (collected.length === 0) return;

      const unique = Array.from(new Set(collected));

      block.children.push({
        type: 'link',
        url: `${CITATION_GROUP_HREF_PREFIX}${unique.join(',')}__`,
        children: [{ type: 'text', value: '' }],
      } as PhrasingContent);
    });
  };
};

export const parseCitationGroupHref = (href: string | undefined): number[] | null => {
  if (!href) return null;
  const match = href.match(/^#__cite_group_([\d,]+)__$/);
  if (!match) return null;
  return match[1]
    .split(',')
    .map((part) => parseInt(part, 10))
    .filter((n) => Number.isFinite(n));
};
