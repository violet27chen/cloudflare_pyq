'use client';

import { Component, useEffect, useState, type ReactNode } from 'react';

/** 渲染失败时降级为纯文本，避免单个 Markdown 块拖垮整页。 */
class MarkdownBoundary extends Component<
  { content: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <span className="whitespace-pre-wrap">{this.props.content}</span>;
    }
    return this.props.children;
  }
}

function RawText({ content }: { content: string }) {
  return <span className="whitespace-pre-wrap">{content}</span>;
}

/**
 * 客户端懒加载的 Markdown 渲染器。
 *
 * 通过动态 import 把 react-markdown 拆成独立 chunk，避免其循环依赖在
 * 首屏 Feed / Admin island chunk 求值（hydration）时触发
 * "Cannot access X before initialization" 的 TDZ、导致整页崩溃。
 *
 * - 加载中 / 加载失败：优雅降级为纯文本（不崩溃）。
 * - 仅在客户端加载 react-markdown，SSR 与服务端构建不会引入该依赖。
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const [node, setNode] = useState<ReactNode | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([import('react-markdown'), import('rehype-sanitize')])
      .then(([rm, rh]) => {
        if (!alive) return;
        const ReactMarkdown = rm.default;
        const rehypeSanitize = rh.default;
        setNode(
          <MarkdownBoundary content={content}>
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{content}</ReactMarkdown>
          </MarkdownBoundary>,
        );
      })
      .catch(() => {
        if (alive) setNode(<RawText content={content} />);
      });
    return () => {
      alive = false;
    };
  }, [content]);

  const inner = node ?? <RawText content={content} />;
  return className ? <div className={className}>{inner}</div> : inner;
}
