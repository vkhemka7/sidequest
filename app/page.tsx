"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Markdown from "react-markdown";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  graphId: string;
  title: string;
  messages: Message[];
  parentConversationId: string | null;
  parentMessageId: string | null;
  selectedText: string | null;
};

type TextReference = {
  conversationId: string;
  messageId: string;
  selectedText: string;
};

type PendingSelection = TextReference & {
  top: number;
  left: number;
};

const initialConversation: Conversation = {
  id: "conversation-main",
  graphId: "graph-main",
  title: "New conversation",
  parentConversationId: null,
  parentMessageId: null,
  selectedText: null,
  messages: [],
};

function truncateText(text: string, maxLength = 96) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}

// Ancestor messages are request context only; each saved origin bounds its history.
function inheritedMessages(conversation: Conversation, conversations: Conversation[]): Message[] {
  const parent = conversations.find((item) => item.id === conversation.parentConversationId);
  if (!parent) return [];
  const branchIndex = parent.messages.findIndex((message) => message.id === conversation.parentMessageId);
  return [
    ...inheritedMessages(parent, conversations),
    ...parent.messages.slice(0, branchIndex + 1),
  ];
}

function referenceContent(selectedText: string, question: string) {
  return `The user is referring specifically to this passage from an earlier assistant response:\n\n"${selectedText}"\n\nThe user's question is:\n\n${question}`;
}

export function requestMessagesForConversation(
  conversation: Conversation,
  conversations: Conversation[],
  reference: TextReference | null = null,
) {
  const ownMessages = conversation.messages.map((message, index) => {
    const isReferencedBranchQuestion =
      conversation.selectedText && index === 0 && message.role === "user";
    const isReferencedCurrentQuestion =
      reference &&
      index === conversation.messages.length - 1 &&
      message.role === "user";

    if (!isReferencedBranchQuestion && !isReferencedCurrentQuestion) {
      return message;
    }

    return {
      ...message,
      content: referenceContent(
        isReferencedCurrentQuestion
          ? reference!.selectedText
          : conversation.selectedText!,
        message.content,
      ),
    };
  });

  return [...inheritedMessages(conversation, conversations), ...ownMessages];
}

export default function Home() {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [conversations, setConversations] = useState<Conversation[]>([
    initialConversation,
  ]);
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversation.id,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composerInput, setComposerInput] = useState("");
  const [textReference, setTextReference] = useState<TextReference | null>(null);
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null);
  const [loadingConversationIds, setLoadingConversationIds] = useState<string[]>([]);
  const [conversationErrors, setConversationErrors] = useState<
    Record<string, string>
  >({});
  const [persistenceConfigured, setPersistenceConfigured] = useState(false);
  const [persistenceLoading, setPersistenceLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initializePersistence() {
      setPersistenceLoading(true);
      try {
        const response = await fetch("/api/conversations");
        const data = (await response.json()) as {
          configured?: boolean;
          conversations?: Conversation[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Unable to load history.");
        if (cancelled || !data.configured) return;

        setPersistenceConfigured(true);
        if (data.conversations?.length) {
          setConversations(data.conversations);
          setActiveConversationId(
            data.conversations.find(
              (conversation) => conversation.parentConversationId === null,
            )?.id ?? data.conversations[0].id,
          );
          return;
        }

        const graphId = crypto.randomUUID();
        const conversationId = crypto.randomUUID();
        const createResponse = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graphId, conversationId }),
        });
        if (!createResponse.ok) throw new Error("Unable to create conversation.");
        if (!cancelled) {
          setConversations([{ ...initialConversation, id: conversationId, graphId }]);
          setActiveConversationId(conversationId);
        }
      } catch (error) {
        if (!cancelled) {
          setConversationErrors((errors) => ({
            ...errors,
            [initialConversation.id]:
              error instanceof Error ? error.message : "Unable to load history.",
          }));
        }
      } finally {
        if (!cancelled) setPersistenceLoading(false);
      }
    }

    void initializePersistence();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    conversations[0];
  const parentConversation = activeConversation.parentConversationId
    ? conversations.find(
        (conversation) => conversation.id === activeConversation.parentConversationId,
      )
    : null;
  const rootConversations = conversations.filter(
    (conversation) => conversation.parentConversationId === null,
  );
  const activeConversationIsLoading = loadingConversationIds.includes(
    activeConversation.id,
  );
  const activeConversationError = conversationErrors[activeConversation.id];

  async function sendMessage(asSidequest = false) {
    const content = composerInput.trim();
    const branchPoint = textReference
      ? activeConversation.messages.find(
          (message) => message.id === textReference.messageId,
        )
      : activeConversation.messages.at(-1);

    if (!content || persistenceLoading || activeConversationIsLoading || (asSidequest && !branchPoint)) {
      return;
    }

    const newMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const requestConversation: Conversation = asSidequest
      ? {
          id: crypto.randomUUID(),
          graphId: activeConversation.graphId,
          title: truncateText(content, 48),
          parentConversationId: activeConversation.id,
          parentMessageId: branchPoint!.id,
          selectedText: textReference?.selectedText ?? null,
          messages: [newMessage],
        }
      : {
          ...activeConversation,
          title:
            activeConversation.parentConversationId === null &&
            activeConversation.title === "New conversation" &&
            activeConversation.messages.length === 0
              ? truncateText(content, 48)
              : activeConversation.title,
          messages: [...activeConversation.messages, newMessage],
        };
    const requestConversationId = requestConversation.id;
    const requestMessages = requestMessagesForConversation(
      requestConversation,
      conversations,
      asSidequest ? null : textReference,
    );

    setConversations((currentConversations) =>
      asSidequest
        ? [...currentConversations, requestConversation]
        : currentConversations.map((conversation) =>
            conversation.id === requestConversationId ? requestConversation : conversation,
          ),
    );
    if (asSidequest) setActiveConversationId(requestConversationId);
    setComposerInput("");
    setTextReference(null);
    setPendingSelection(null);
    setConversationErrors((currentErrors) => {
      const remainingErrors = { ...currentErrors };
      delete remainingErrors[requestConversationId];

      return remainingErrors;
    });
    setLoadingConversationIds((currentIds) => [
      ...currentIds,
      requestConversationId,
    ]);

    try {
      const generationId = crypto.randomUUID();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: requestMessages,
          persistence: persistenceConfigured
            ? {
                generationId,
                idempotencyKey: generationId,
                graphId: requestConversation.graphId,
                conversationId: requestConversation.id,
                title: requestConversation.title,
                parentConversationId: asSidequest
                  ? requestConversation.parentConversationId
                  : null,
                parentMessageId: asSidequest
                  ? requestConversation.parentMessageId
                  : null,
                selectedText: asSidequest
                  ? requestConversation.selectedText
                  : null,
                userMessageId: newMessage.id,
                content,
                reference: textReference,
                contextMessageIds: requestMessages.map((message) => message.id),
              }
            : undefined,
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const errorMessage =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Unable to generate an assistant response.";

        throw new Error(errorMessage);
      }

      if (
        !data ||
        typeof data !== "object" ||
        !("text" in data) ||
        typeof data.text !== "string"
      ) {
        throw new Error("Assistant response was malformed.");
      }

      const assistantMessage: Message = {
        id:
          "messageId" in data && typeof data.messageId === "string"
            ? data.messageId
            : crypto.randomUUID(),
        role: "assistant",
        content: data.text,
      };

      setConversations((currentConversations) =>
        currentConversations.map((conversation) =>
          conversation.id === requestConversationId
            ? {
                ...conversation,
                messages: [...conversation.messages, assistantMessage],
              }
            : conversation,
        ),
      );
    } catch (error) {
      console.error(error);
      setConversationErrors((currentErrors) => ({
        ...currentErrors,
        [requestConversationId]:
          error instanceof Error
            ? error.message
            : "Unable to generate an assistant response.",
      }));
    } finally {
      setLoadingConversationIds((currentIds) =>
        currentIds.filter((id) => id !== requestConversationId),
      );
    }
  }

  function returnToParent() {
    if (activeConversation.parentConversationId) {
      setActiveConversationId(activeConversation.parentConversationId);
      setTextReference(null);
      setPendingSelection(null);
    }
  }

  function activateConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    setTextReference(null);
    setPendingSelection(null);
    setSidebarOpen(false);
  }

  function captureSelection(
    event: MouseEvent<HTMLElement>,
    conversationId: string,
    messageId: string,
  ) {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? "";

    if (!selection || selection.rangeCount !== 1 || !selectedText) {
      setPendingSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const messageElement = event.currentTarget;
    if (
      !messageElement.contains(range.startContainer) ||
      !messageElement.contains(range.endContainer)
    ) {
      setPendingSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    setPendingSelection({
      conversationId,
      messageId,
      selectedText,
      top: Math.max(8, rect.top - 44),
      left: Math.min(window.innerWidth - 130, Math.max(8, rect.left + rect.width / 2 - 58)),
    });
  }

  function attachPendingSelection() {
    if (!pendingSelection) return;
    const { conversationId, messageId, selectedText } = pendingSelection;
    setTextReference({ conversationId, messageId, selectedText });
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function renderThread(conversation: Conversation): ReactNode {
    const children = conversations.filter((child) => child.parentConversationId === conversation.id);
    const isActive = activeConversationId === conversation.id;
    return (
      <li key={conversation.id}>
        <button
          type="button"
          aria-current={isActive ? "true" : undefined}
          onClick={() => activateConversation(conversation.id)}
          className={`thread-link ${isActive ? "thread-link-active" : ""}`}
          title={conversation.title}
        >
          {conversation.title}
        </button>
        {children.length > 0 ? (
          <ol className="thread-children">
            {children.map(renderThread)}
          </ol>
        ) : null}
      </li>
    );
  }

  const isEmpty = activeConversation.messages.length === 0;

  return (
    <div
      className="chat-shell"
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest(".selection-action")) {
          setPendingSelection(null);
        }
      }}
    >
      {pendingSelection ? (
        <button
          type="button"
          className="selection-action"
          style={{ top: pendingSelection.top, left: pendingSelection.left }}
          onPointerDown={(event) => event.preventDefault()}
          onClick={attachPendingSelection}
        >
          Ask about this
        </button>
      ) : null}
      <aside id="thread-sidebar" className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} aria-label="Threads">
        <h1 className="brand">Sidequest</h1>
        <nav aria-labelledby="journey-heading">
          <h2 id="journey-heading" className="sidebar-label">Threads</h2>
          <ol className="thread-tree">{rootConversations.map(renderThread)}</ol>
        </nav>
      </aside>

      <main aria-labelledby="conversation-heading" className="chat-main">
        <header className="chat-header">
          <button type="button" className="mobile-threads-toggle" aria-controls="thread-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? "Close threads" : "Threads"}
          </button>
          {parentConversation ? (
            <button
              type="button"
              onClick={returnToParent}
              aria-label="Back to parent"
              title={`Back to ${parentConversation.title}`}
              className="parent-link"
            >
              <span aria-hidden="true">←</span>
              <span className="truncate">{parentConversation.title}</span>
            </button>
          ) : null}
          <h2 id="conversation-heading" className="conversation-title">
            {activeConversation.title}
          </h2>
        </header>

        <div className={`chat-content ${isEmpty ? "chat-content-empty" : ""}`}>
          <div className="message-scroll">
            <div className="conversation-column message-list">
              {activeConversation.messages.length > 0 ? (
                activeConversation.messages.map((message) => {
                  const isUser = message.role === "user";

                  return (
                    <article
                      key={message.id}
                      className={isUser ? "message message-user" : "message message-assistant"}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      ) : (
                        <div
                          className="assistant-markdown min-w-0 break-words"
                          onMouseUp={(event) =>
                            captureSelection(
                              event,
                              activeConversation.id,
                              message.id,
                            )
                          }
                        >
                          <Markdown skipHtml>{message.content}</Markdown>
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <section className="empty-state">
                  Where do you want to start?
                </section>
              )}

              {activeConversationIsLoading ? (
                <section role="status" className="loading-message">
                  Thinking...
                </section>
              ) : null}

              {activeConversationError ? (
                <section role="alert" className="error-message">
                  {activeConversationError}
                </section>
              ) : null}
            </div>
          </div>

          <div className="composer-area">
            <form
              className="conversation-column composer"
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage();
              }}
            >
              {textReference ? (
                <div className="composer-reference">
                  <span aria-hidden="true">↳</span>
                  <span className="composer-reference-text">
                    “{textReference.selectedText}”
                  </span>
                  <button
                    type="button"
                    className="composer-reference-remove"
                    aria-label="Remove reference"
                    title="Remove reference"
                    onClick={() => setTextReference(null)}
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <label htmlFor="message" className="sr-only">
                Message
              </label>
              <div className="composer-input">
                <span className="composer-sizer" aria-hidden="true">{composerInput + " "}</span>
                <textarea
                  ref={composerRef}
                  rows={1}
                  id="message"
                  name="message"
                  placeholder="Message Sidequest..."
                  value={composerInput}
              disabled={persistenceLoading || activeConversationIsLoading}
                  onChange={(event) => setComposerInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  className="composer-textarea"
                />
              </div>
              <div className="composer-controls">
                <button
                  type="button"
                  aria-label="Ask in a sidequest"
                  title="Ask in a sidequest"
                  disabled={persistenceLoading || activeConversationIsLoading || !composerInput.trim() || activeConversation.messages.length === 0}
                  onClick={() => sendMessage(true)}
                  className="composer-button fork-button"
                >
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="6" cy="5" r="2" />
                    <circle cx="6" cy="19" r="2" />
                    <circle cx="18" cy="5" r="2" />
                    <path d="M6 7v10M18 7v2a4 4 0 0 1-4 4H6" />
                  </svg>
                </button>
                <button
                  type="submit"
                  aria-label="Send"
                  title="Send"
                  disabled={persistenceLoading || activeConversationIsLoading || !composerInput.trim()}
                  className="composer-button send-button"
                >
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5m-6 6 6-6 6 6" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
