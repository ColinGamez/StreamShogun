// ── Support Chat Component ────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";
import type { SupportChatMessage, SupportDiagnostics, StructuredAnswer } from "@stream-shogun/core";
import { useAppStore } from "../stores/app-store";
import { composeAnswer, renderAnswerText, createChatMessage } from "../lib/support-engine";
import { saveFeedback } from "../lib/support-feedback";
import { getSupportArticleCount } from "../lib/support-codex";
import { buildSupportBundle, bundleFilename } from "../lib/support-bundle";
import { saveFile } from "../lib/bridge";
import type { Page } from "./Sidebar";

// ── Context-aware suggested prompts ───────────────────────────────────

const CONTEXT_PROMPTS: Record<string, string[]> = {
  library: [
    "How do I add an M3U playlist?",
    "How do I add an EPG source?",
    "Why is my EPG empty?",
    "What playlist formats are supported?",
  ],
  channels: [
    "How do I search for channels?",
    "Why are some channels missing?",
    "How do I add an M3U playlist?",
    "How does channel matching work?",
  ],
  guide: [
    "Why is my EPG empty?",
    "How do I add an EPG source?",
    "Why are programme times wrong?",
    "How does channel-EPG matching work?",
  ],
  player: [
    "Why is video buffering?",
    "How do I enable PIP?",
    "I see a black screen, what should I do?",
    "How do I change channels faster?",
  ],
  settings: [
    "How do I upgrade to Pro?",
    "How do I manage my subscription?",
    "What is Discord Rich Presence?",
    "How do I change the language?",
  ],
  history: [
    "How does watch history work?",
    "How do I add a playlist?",
    "What keyboard shortcuts are available?",
    "How do I enable PIP?",
  ],
  support: [
    "How do I add a playlist?",
    "My EPG is not loading",
    "How do I upgrade to Pro?",
    "How do I enable PIP?",
  ],
};

const DEFAULT_PROMPTS = CONTEXT_PROMPTS.support;

function getContextPrompts(source?: Page): string[] {
  if (!source) return DEFAULT_PROMPTS;
  return CONTEXT_PROMPTS[source] ?? DEFAULT_PROMPTS;
}

const APP_VERSION = "0.1.0"; // TODO: pull from package.json or env

interface SupportChatProps {
  onOpenArticle: (id: string) => void;
  /** The page the user came from, used for context-aware prompts */
  sourceContext?: Page;
}

export function SupportChat({ onOpenArticle, sourceContext }: SupportChatProps) {
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [answers, setAnswers] = useState<Map<string, StructuredAnswer>>(new Map());
  const [input, setInput] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set());
  const [feedbackComment, setFeedbackComment] = useState<{ msgId: string; text: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const authUser = useAppStore((s) => s.authUser);
  const authPlan = useAppStore((s) => s.authPlan);
  const subscriptionStatus = useAppStore((s) => s.subscriptionStatus);
  const playlistCount = useAppStore((s) => s.dbPlaylists.length);
  const epgSourceCount = useAppStore((s) => s.dbEpgSources.length);
  const settings = useAppStore((s) => s.settings);
  const locale = useAppStore((s) => s.locale);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback(
    (query: string) => {
      if (!query.trim()) return;

      const userMsg = createChatMessage("user", query.trim());
      const answer = composeAnswer(query.trim());
      const text = renderAnswerText(answer);

      // If diagnostics enabled, append summary
      let responseText = text;
      if (includeDiagnostics) {
        const diag = collectDiagnostics();
        responseText +=
          "\n\n---\n**Diagnostics** (auto-attached):\n" +
          `• App: v${diag.appVersion}\n` +
          `• OS: ${diag.os}\n` +
          `• Logged in: ${diag.loggedIn ? "Yes" : "No"}\n` +
          `• Playlists: ${diag.playlistCount}\n` +
          `• Billing: ${diag.billingEnabled ? "Enabled" : "Disabled"}`;
      }

      const assistantMsg = createChatMessage("assistant", responseText, answer.citations);

      // Store the structured answer keyed by message ID for rich rendering
      setAnswers((prev) => new Map(prev).set(assistantMsg.id, answer));
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
    },
    [includeDiagnostics, authUser, playlistCount, epgSourceCount, settings],
  );

  const collectDiagnostics = useCallback((): SupportDiagnostics => {
    return {
      appVersion: APP_VERSION,
      os: navigator.userAgent.includes("Windows")
        ? "Windows"
        : navigator.userAgent.includes("Mac")
          ? "macOS"
          : "Linux",
      loggedIn: !!authUser,
      playlistCount,
      epgSourceCount,
      billingEnabled: !!settings.billingEnabled,
    };
  }, [authUser, playlistCount, epgSourceCount, settings]);

  const collectBundleContext = useCallback(() => {
    return {
      appVersion: APP_VERSION,
      os: navigator.userAgent.includes("Windows")
        ? "Windows"
        : navigator.userAgent.includes("Mac")
          ? "macOS"
          : "Linux",
      locale,
      loggedIn: !!authUser,
      playlistCount,
      epgSourceCount,
      billingEnabled: !!settings.billingEnabled,
      billingPlan: authPlan !== "FREE" ? authPlan : undefined,
      billingStatus: subscriptionStatus !== "NONE" ? subscriptionStatus : undefined,
      messages,
    };
  }, [authUser, authPlan, subscriptionStatus, playlistCount, epgSourceCount, settings, locale, messages]);

  const handleCopySupportBundle = useCallback(() => {
    const bundle = buildSupportBundle(collectBundleContext());
    navigator.clipboard
      .writeText(JSON.stringify(bundle, null, 2))
      .catch(() => { /* clipboard API may fail */ });
  }, [collectBundleContext]);

  const handleExportSupportBundle = useCallback(async () => {
    const bundle = buildSupportBundle(collectBundleContext());
    const json = JSON.stringify(bundle, null, 2);
    await saveFile(bundleFilename(), json, "Export Support Bundle");
  }, [collectBundleContext]);

  const handleFeedback = useCallback(
    (msgId: string, rating: "up" | "down") => {
      setFeedbackSent((prev) => new Set(prev).add(msgId));

      const msg = messages.find((m) => m.id === msgId);
      if (!msg) return;

      // Update message rating in state
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, rating } : m)),
      );

      if (rating === "down") {
        setFeedbackComment({ msgId, text: "" });
      } else {
        saveFeedback({
          messageId: msgId,
          rating,
          articleIds: msg.citations ?? [],
          appVersion: APP_VERSION,
          timestamp: new Date().toISOString(),
        });
      }
    },
    [messages],
  );

  const handleSubmitFeedbackComment = useCallback(() => {
    if (!feedbackComment) return;

    const msg = messages.find((m) => m.id === feedbackComment.msgId);
    saveFeedback({
      messageId: feedbackComment.msgId,
      rating: "down",
      comment: feedbackComment.text || undefined,
      articleIds: msg?.citations ?? [],
      appVersion: APP_VERSION,
      timestamp: new Date().toISOString(),
    });

    setFeedbackComment(null);
  }, [feedbackComment, messages]);

  // handleSendFeedbackApi — opt-in API submission, wired via "Send to team"
  // button (currently disabled). Re-enable when the feedback API route is
  // ready for production traffic.
  // const handleSendFeedbackApi = useCallback(
  //   async (msgId: string) => { ... },
  //   [messages, settings],
  // );

  const articleCount = getSupportArticleCount();

  return (
    <div className="support-chat">
      <div className="support-chat-header">
        <h2>🎌 AI Support</h2>
        <span className="support-chat-meta">
          {articleCount} articles indexed • Answers are based on official docs only
        </span>
      </div>

      {/* Context-aware suggested prompts (show when no messages) */}
      {messages.length === 0 && (
        <div className="support-suggestions">
          <p className="support-suggestions-label">
            {sourceContext && sourceContext !== "support"
              ? `Questions about ${sourceContext.charAt(0).toUpperCase() + sourceContext.slice(1)}:`
              : "Popular questions:"}
          </p>
          <div className="support-suggestions-grid">
            {getContextPrompts(sourceContext).map((prompt) => (
              <button
                key={prompt}
                className="support-suggestion-chip"
                onClick={() => handleSubmit(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message list */}
      <div className="support-chat-messages" role="log" aria-live="polite">
        {messages.map((msg) => (
          <div key={msg.id} className={`support-msg support-msg-${msg.role}`}>
            <div className="support-msg-bubble">
              {msg.role === "assistant" && answers.has(msg.id)
                ? <StructuredAnswerView answer={answers.get(msg.id)!} onOpenArticle={onOpenArticle} />
                : <div className="support-msg-text">{msg.text}</div>
              }
              {/* Citations */}
              {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                <div className="support-msg-citations">
                  {msg.citations.map((cid: string) => (
                    <button
                      key={cid}
                      className="support-citation-link"
                      onClick={() => onOpenArticle(cid)}
                    >
                      📖 {cid}
                    </button>
                  ))}
                </div>
              )}
              {/* Feedback buttons */}
              {msg.role === "assistant" && (
                <div className="support-msg-feedback">
                  {!feedbackSent.has(msg.id) ? (
                    <>
                      <button
                        className="support-feedback-btn"
                        onClick={() => handleFeedback(msg.id, "up")}
                        aria-label="Helpful"
                        title="Helpful"
                      >
                        👍
                      </button>
                      <button
                        className="support-feedback-btn"
                        onClick={() => handleFeedback(msg.id, "down")}
                        aria-label="Not helpful"
                        title="Not helpful"
                      >
                        👎
                      </button>
                    </>
                  ) : (
                    <span className="support-feedback-thanks">
                      {msg.rating === "up" ? "Thanks!" : "Sorry about that"}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Feedback comment box (appears on thumbs down) */}
      {feedbackComment && (
        <div className="support-feedback-comment">
          <input
            type="text"
            className="support-feedback-input"
            placeholder="What was wrong? (optional)"
            value={feedbackComment.text}
            onChange={(e) =>
              setFeedbackComment({ ...feedbackComment, text: e.target.value })
            }
            onKeyDown={(e) => e.key === "Enter" && handleSubmitFeedbackComment()}
          />
          <button className="btn-sm btn-primary" onClick={handleSubmitFeedbackComment}>
            Submit
          </button>
          <button className="btn-sm" onClick={() => setFeedbackComment(null)}>
            Skip
          </button>
        </div>
      )}

      {/* Controls bar */}
      <div className="support-chat-controls">
        <label className="support-toggle">
          <input
            type="checkbox"
            checked={includeDiagnostics}
            onChange={(e) => setIncludeDiagnostics(e.target.checked)}
          />
          <span>Include diagnostics</span>
        </label>
        <button
          className="support-copy-bundle"
          onClick={handleCopySupportBundle}
          title="Copy support bundle to clipboard"
        >
          📋 Copy bundle
        </button>
        <button
          className="support-export-bundle"
          onClick={handleExportSupportBundle}
          title="Export support bundle to file"
        >
          💾 Export bundle
        </button>
        <a
          href="mailto:support@streamshogun.com"
          className="support-contact-link"
        >
          📧 Contact Support
        </a>
      </div>

      {/* Input */}
      <form
        className="support-chat-input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(input);
        }}
      >
        <input
          type="text"
          className="support-chat-input"
          placeholder="Ask about StreamShōgun…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ask a support question"
        />
        <button type="submit" className="btn-primary support-send-btn" disabled={!input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

// ── Structured Answer Renderer ────────────────────────────────────────

function StructuredAnswerView({
  answer,
  onOpenArticle,
}: {
  answer: StructuredAnswer;
  onOpenArticle: (id: string) => void;
}) {
  const badge =
    answer.confidence === "high" ? "🟢 High" : answer.confidence === "medium" ? "🟡 Medium" : "🔴 Low";

  return (
    <div className="sa-root">
      {/* Confidence badge */}
      <span className={`sa-confidence sa-confidence-${answer.confidence}`}>{badge} confidence</span>

      {/* Summary */}
      <p className="sa-summary">{answer.summary}</p>

      {/* Steps */}
      {answer.steps.length > 0 && (
        <div className="sa-section">
          <h4 className="sa-heading">Steps</h4>
          <ul className="sa-step-list">
            {answer.steps.map((step, i) => (
              <li key={i} className="sa-step">
                <span>{step.text}</span>
                {step.citation && (
                  <cite className="sa-cite" title={step.citation}>
                    {step.citation}
                  </cite>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Troubleshooting */}
      {answer.troubleshooting.length > 0 && (
        <div className="sa-section">
          <h4 className="sa-heading">Troubleshooting</h4>
          <ul className="sa-trouble-list">
            {answer.troubleshooting.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Related Guides */}
      {answer.relatedGuides.length > 0 && (
        <div className="sa-section">
          <h4 className="sa-heading">Related Guides</h4>
          <div className="sa-guides">
            {answer.relatedGuides.map((g) => (
              <button key={g.id} className="sa-guide-link" onClick={() => onOpenArticle(g.id)}>
                📖 {g.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clarifying question */}
      {answer.clarifyingQuestion && (
        <div className="sa-clarify">
          <span className="sa-clarify-icon">💬</span>
          <span>{answer.clarifyingQuestion}</span>
        </div>
      )}
    </div>
  );
}
