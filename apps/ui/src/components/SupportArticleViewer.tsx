// ── Support Article Viewer ────────────────────────────────────────────

import type { SupportArticle } from "@stream-shogun/core";

interface SupportArticleViewerProps {
  article: SupportArticle;
  onBack: () => void;
}

export function SupportArticleViewer({ article, onBack }: SupportArticleViewerProps) {
  return (
    <div className="support-article-viewer">
      <div className="support-article-header">
        <button className="support-back-btn" onClick={onBack}>
          ← Back to chat
        </button>
        <h2>{article.meta.title}</h2>
        <div className="support-article-meta">
          <span className="support-article-date">
            Updated: {article.meta.lastUpdated}
          </span>
          <div className="support-article-tags">
            {article.meta.tags.map((tag) => (
              <span key={tag} className="support-tag">{tag}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="support-article-body">
        <MarkdownRenderer markdown={article.body} />
      </div>
    </div>
  );
}

// ── Simple Markdown Renderer ──────────────────────────────────────────
// Converts a subset of markdown to React elements.
// Handles headings, paragraphs, bold, inline code, lists, tables, blockquotes.

function MarkdownRenderer({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const elements: JSX.Element[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      elements.push(<Tag key={i}>{renderInline(headingMatch[2])}</Tag>);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote key={i} className="support-blockquote">
          {renderInline(quoteLines.join(" "))}
        </blockquote>,
      );
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1]?.includes("---")) {
      const tableRows: string[][] = [];
      const headers = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      i += 2; // skip header + separator

      while (i < lines.length && lines[i].includes("|")) {
        tableRows.push(
          lines[i]
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean),
        );
        i++;
      }

      elements.push(
        <table key={i} className="support-table">
          <thead>
            <tr>
              {headers.map((h, hi) => (
                <th key={hi}>{renderInline(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    // Unordered list
    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s+/, ""));
        i++;
      }
      elements.push(
        <ul key={i}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      elements.push(
        <ol key={i}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={i} className="support-code">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Paragraph
    elements.push(<p key={i}>{renderInline(line)}</p>);
    i++;
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  // Simple inline formatting: **bold**, `code`, *italic*, [link](url)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Italic
    const italicMatch = remaining.match(/\*([^*]+)\*/);

    // Find the earliest match
    let earliest: { match: RegExpMatchArray; type: string } | null = null;

    for (const [match, type] of [
      [boldMatch, "bold"],
      [codeMatch, "code"],
      [italicMatch, "italic"],
    ] as [RegExpMatchArray | null, string][]) {
      if (match?.index !== undefined) {
        if (!earliest || match.index < earliest.match.index!) {
          earliest = { match, type };
        }
      }
    }

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    const { match, type } = earliest;
    const idx = match.index!;

    // Text before the match
    if (idx > 0) parts.push(remaining.slice(0, idx));

    switch (type) {
      case "bold":
        parts.push(<strong key={key++}>{match[1]}</strong>);
        break;
      case "code":
        parts.push(<code key={key++} className="support-inline-code">{match[1]}</code>);
        break;
      case "italic":
        parts.push(<em key={key++}>{match[1]}</em>);
        break;
    }

    remaining = remaining.slice(idx + match[0].length);
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}
