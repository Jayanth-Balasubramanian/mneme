import { lazy, Suspense } from "react";
import type { CompanionConversation } from "../../shared/companion";

const MarkdownMessage = lazy(() => import("./MarkdownMessage").then((module) => ({ default: module.MarkdownMessage })));

type ConversationHistoryProps = {
  conversations: CompanionConversation[];
  onRetry: (conversation: CompanionConversation) => void;
  onNavigate: (page: number) => void;
};

export function ConversationHistory({ conversations, onRetry, onNavigate }: ConversationHistoryProps) {
  return (
    <div className="conversation-history">
      <div className="history-heading"><p className="reader-kicker">Chat</p><span>{conversations.length} messages</span></div>
      {conversations.length === 0 ? <p className="history-empty">Your conversation will stay with this book.</p> : conversations.map((conversation) => (
        <article className={`conversation-card chat-message chat-message--${conversation.status}`} key={conversation.id}>
          <div className="conversation-question">
            <span>{conversation.status === "failed" ? "Could not answer" : conversation.provider === "demo" ? "Demo" : "Mneme"}</span>
            {conversation.status === "failed" ? <button onClick={() => onRetry(conversation)}>Retry</button> : null}
          </div>
          <p className="chat-message__question">{conversation.question}</p>
          {conversation.answer ? (
            <Suspense fallback={<p className="chat-markdown">{conversation.answer}</p>}>
              <MarkdownMessage>{conversation.answer}</MarkdownMessage>
            </Suspense>
          ) : <p className="conversation-error">{conversation.errorMessage ?? "Waiting to retry this message."}</p>}
          <div className="conversation-citations">
            {conversation.citations.map((citation, index) => <button key={`${citation.pageNumber}-${index}`} onClick={() => onNavigate(citation.pageNumber)}>Page {citation.pageNumber}</button>)}
          </div>
        </article>
      ))}
    </div>
  );
}
