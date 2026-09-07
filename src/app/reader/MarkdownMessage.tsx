import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `$$${math}$$`)
    .replace(/\\\((.*?)\\\)/g, (_, math: string) => `$${math}$`);
}

export function MarkdownMessage({ children }: { children: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        skipHtml
      >
        {normalizeMathDelimiters(children)}
      </ReactMarkdown>
    </div>
  );
}
