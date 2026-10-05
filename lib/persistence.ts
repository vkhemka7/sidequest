import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type PersistedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type PersistedConversation = {
  id: string;
  graphId: string;
  title: string;
  parentConversationId: string | null;
  parentMessageId: string | null;
  selectedText: string | null;
  messages: PersistedMessage[];
};

export type PersistenceReference = {
  conversationId: string;
  messageId: string;
  selectedText: string;
};

export type GenerationPersistenceInput = {
  generationId: string;
  idempotencyKey: string;
  graphId: string;
  conversationId: string;
  title: string;
  parentConversationId: string | null;
  parentMessageId: string | null;
  selectedText: string | null;
  userMessageId: string;
  content: string;
  reference: PersistenceReference | null;
  contextMessageIds: string[];
};

function throwDatabaseError(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export async function loadConversationGraph(ownerId: string) {
  const supabase = getSupabaseAdmin();
  const { data: graphs, error: graphError } = await supabase
    .from("conversation_graphs")
    .select("id")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  throwDatabaseError("Unable to load conversation graphs", graphError);

  if (!graphs?.length) return [];
  const graphIds = graphs.map((graph) => graph.id);
  const { data: conversations, error: conversationError } = await supabase
    .from("conversations")
    .select(
      "id, graph_id, title, parent_conversation_id, parent_message_id, branch_selected_text, created_at",
    )
    .in("graph_id", graphIds)
    .order("created_at", { ascending: true });
  throwDatabaseError("Unable to load conversations", conversationError);

  if (!conversations?.length) return [];

  const ids = conversations.map((conversation) => conversation.id);
  const { data: messages, error: messageError } = await supabase
    .from("messages")
    .select("id, conversation_id, role, content, sequence_no")
    .in("conversation_id", ids)
    .order("sequence_no", { ascending: true });
  throwDatabaseError("Unable to load messages", messageError);

  return conversations.map((conversation) => ({
    id: conversation.id,
    graphId: conversation.graph_id,
    title: conversation.title,
    parentConversationId: conversation.parent_conversation_id,
    parentMessageId: conversation.parent_message_id,
    selectedText: conversation.branch_selected_text,
    messages: (messages ?? [])
      .filter((message) => message.conversation_id === conversation.id)
      .map((message) => ({
        id: message.id,
        role: message.role as "user" | "assistant",
        content: message.content,
      })),
  })) satisfies PersistedConversation[];
}

export async function createRootConversation(
  ownerId: string,
  graphId: string,
  conversationId: string,
) {
  const { error } = await getSupabaseAdmin().rpc("create_root_conversation", {
    p_owner_id: ownerId,
    p_graph_id: graphId,
    p_conversation_id: conversationId,
    p_title: "New conversation",
  });
  throwDatabaseError("Unable to create root conversation", error);
}

export async function startGeneration(ownerId: string, input: GenerationPersistenceInput) {
  const { error } = await getSupabaseAdmin().rpc("start_generation", {
    p_owner_id: ownerId,
    p_generation_id: input.generationId,
    p_idempotency_key: input.idempotencyKey,
    p_graph_id: input.graphId,
    p_conversation_id: input.conversationId,
    p_title: input.title,
    p_user_message_id: input.userMessageId,
    p_content: input.content,
    p_model: "gpt-5.6",
    p_request_config: { text: { verbosity: "high" } },
    p_context_snapshot: { messageIds: input.contextMessageIds },
    p_parent_conversation_id: input.parentConversationId,
    p_parent_message_id: input.parentMessageId,
    p_branch_selected_text: input.selectedText,
    p_reference_source_conversation_id: input.reference?.conversationId ?? null,
    p_reference_source_message_id: input.reference?.messageId ?? null,
    p_reference_selected_text: input.reference?.selectedText ?? null,
  });
  throwDatabaseError("Unable to persist user message", error);

  const { error: claimError } = await getSupabaseAdmin().rpc(
    "claim_generation",
    { p_owner_id: ownerId, p_generation_id: input.generationId },
  );
  throwDatabaseError("Unable to claim generation request", claimError);
}

export async function completeGeneration(
  ownerId: string,
  generationId: string,
  assistantMessageId: string,
  content: string,
  providerResponseId: string,
) {
  const { error } = await getSupabaseAdmin().rpc("complete_generation", {
    p_owner_id: ownerId,
    p_generation_id: generationId,
    p_assistant_message_id: assistantMessageId,
    p_content: content,
    p_provider_response_id: providerResponseId,
  });
  throwDatabaseError("Unable to persist assistant response", error);
}

export async function failGeneration(
  ownerId: string,
  generationId: string,
  code: string,
  message: string,
) {
  const { error } = await getSupabaseAdmin().rpc("fail_generation", {
    p_owner_id: ownerId,
    p_generation_id: generationId,
    p_error_code: code,
    p_error_message: message,
  });
  throwDatabaseError("Unable to record generation failure", error);
}
