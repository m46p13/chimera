import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";

export default function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }: { children: ReactNode }) {
          return <pre className="code-block">{children}</pre>;
        },
        code({ className, children, ...props }: { className?: string; children: ReactNode }) {
          const hasLang = Boolean(className);
          if (hasLang) {
            return (
              <code className={`code-inner ${className}`} {...props}>
                {String(children).replace(/\n$/, "")}
              </code>
            );
          }
          return (
            <code className="inline-code" {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
