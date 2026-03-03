// ── Support Page ──────────────────────────────────────────────────────

import { useState } from "react";
import { SupportChat } from "../components/SupportChat";
import { SupportArticleViewer } from "../components/SupportArticleViewer";
import { getSupportArticle } from "../lib/support-codex";
import type { SupportArticle } from "@stream-shogun/core";
import type { Page } from "../components/Sidebar";

interface SupportPageProps {
  /** The page the user was on before navigating to Support */
  sourceContext?: Page;
}

export function SupportPage({ sourceContext }: SupportPageProps) {
  const [viewingArticle, setViewingArticle] = useState<SupportArticle | null>(null);

  const handleOpenArticle = (id: string) => {
    const article = getSupportArticle(id);
    if (article) setViewingArticle(article);
  };

  if (viewingArticle) {
    return (
      <div className="support-page">
        <SupportArticleViewer
          article={viewingArticle}
          onBack={() => setViewingArticle(null)}
        />
      </div>
    );
  }

  return (
    <div className="support-page">
      <SupportChat onOpenArticle={handleOpenArticle} sourceContext={sourceContext} />
    </div>
  );
}
