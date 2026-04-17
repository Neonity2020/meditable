import MarkdownToState, { IMarkdownToStateOptions } from "@/packages/modules/state/markdownToState";
import StateToHtml from "@/packages/modules/state/stateToHtml";
import HtmlToMarkdown from "@/packages/modules/state/htmlToMarkdown";
import type { MEOptions } from "@/packages/types";

/**
 * 与编辑器内「Markdown → 文档状态 → HTML」一致的配置子集。
 */
export type MarkdownToHtmlOptions = Pick<
  MEOptions,
  | "footnote"
  | "isGitlabCompatibilityEnabled"
  | "superSubScript"
  | "trimUnnecessaryCodeBlockEmptyLines"
  | "frontMatter"
  | "diagramHtmlType"
  | "staticNodeHtmlRenderer"
  | "staticBlockHtmlRenderer"
>;

const defaultMarkdownOptions: IMarkdownToStateOptions = {
  footnote: false,
  isGitlabCompatibilityEnabled: false,
  superSubScript: false,
  trimUnnecessaryCodeBlockEmptyLines: false,
  frontMatter: true,
};

function resolveMarkdownOptions(options?: Partial<MarkdownToHtmlOptions>): IMarkdownToStateOptions {
  const o = { ...defaultMarkdownOptions };
  if (!options) return o;
  if (options.footnote !== undefined) o.footnote = options.footnote;
  if (options.isGitlabCompatibilityEnabled !== undefined) o.isGitlabCompatibilityEnabled = options.isGitlabCompatibilityEnabled;
  if (options.superSubScript !== undefined) o.superSubScript = options.superSubScript;
  if (options.trimUnnecessaryCodeBlockEmptyLines !== undefined) {
    o.trimUnnecessaryCodeBlockEmptyLines = options.trimUnnecessaryCodeBlockEmptyLines;
  }
  if (options.frontMatter !== undefined) o.frontMatter = options.frontMatter;
  return o;
}

/**
 * 将 Markdown 转为 HTML（内部：`markdownToState` → `stateToHtml`，与 `MEState.getContent('html')` 管线一致）。
 */
export async function markdownToHtml(
  markdown: string,
  options?: Partial<MarkdownToHtmlOptions>
): Promise<string> {
  const md = resolveMarkdownOptions(options);
  const markdownToState = new MarkdownToState(md);
  const stateToHtml = new StateToHtml({
    diagramHtmlType: options?.diagramHtmlType,
    staticNodeHtmlRenderer: options?.staticNodeHtmlRenderer,
    staticBlockHtmlRenderer: options?.staticBlockHtmlRenderer,
  });
  const data = markdownToState.generate(markdown);
  return stateToHtml.generate(data.children || []);
}

/**
 * 将 HTML 转为 Markdown（封装 `HtmlToMarkdown`）。
 * @param keeps 传给 Turndown 插件的保留规则列表，与 `HtmlToMarkdown#generate` 一致。
 */
export function htmlToMarkdown(
  html: string,
  turndownOptions?: ConstructorParameters<typeof HtmlToMarkdown>[0],
  keeps: Parameters<HtmlToMarkdown["generate"]>[1] = []
): string {
  return new HtmlToMarkdown(turndownOptions).generate(html, keeps);
}
