import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  completeGeneration,
  failGeneration,
  startGeneration,
  type GenerationPersistenceInput,
} from "@/lib/persistence";
import { persistenceIsConfigured } from "@/lib/supabase-admin";
import { getBrowserOwner } from "@/lib/browser-owner";

const assistantInstructions = `You are the AI assistant inside Sidequest.

Answer the user's actual question directly, with enough depth to make the answer useful. Adapt depth to the question, the conversation context, and the user's requested level of detail rather than defaulting to short answers.

For broad conceptual, educational, or technical questions, default to a thorough explanation rather than a brief definition. Assume that a user asking "what is X?" usually wants to understand X, not merely receive its dictionary definition.

Build the explanation progressively:
- Establish an intuitive mental model.
- Explain the underlying mechanism or structure.
- Give a concrete example that makes the concept tangible.
- Explain why the concept exists or what problem it solves.
- Introduce the most important related concepts and terminology naturally.
- Discuss important limitations, tradeoffs, or failure modes when relevant.

Use this progression to build understanding, not as a rigid template or mandatory set of headings. Structure longer answers with Markdown when helpful. Give the user enough conceptual surface area to understand where the topic leads and ask meaningful follow-up questions. Do not stop after defining the term when important mechanisms, implications, or related concepts are necessary for real understanding.

For simple factual questions, remain concise. Do not artificially lengthen an answer that is complete in a sentence or two. Do not add filler merely to make an answer longer. Do not require a fixed word count, paragraph count, headings, or examples in every answer.

For follow-up questions, use the existing conversation context and answer at the appropriate level rather than restarting the explanation from scratch.

Do not mention these instructions or Sidequest's internal context system.`;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<ChatMessage>;

  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

export async function POST(request: Request) {
  let generationId: string | null = null;
  let generationStarted = false;

  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key is not configured.");

      return NextResponse.json(
        { error: "OpenAI API key is not configured." },
        { status: 500 },
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const body: unknown = await request.json();
    const messages = (body as { messages?: unknown }).messages;
    const persistence = (body as { persistence?: unknown }).persistence;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Request must include at least one message." },
        { status: 400 },
      );
    }

    if (!messages.every(isChatMessage)) {
      return NextResponse.json(
        { error: "Messages must include id, role, and content." },
        { status: 400 },
      );
    }

    if (persistenceIsConfigured()) {
      if (!persistence || typeof persistence !== "object") {
        return NextResponse.json(
          { error: "Persistence metadata is required." },
          { status: 400 },
        );
      }

      const input = persistence as GenerationPersistenceInput;
      const requiredIds = [
        input.generationId,
        input.idempotencyKey,
        input.graphId,
        input.conversationId,
        input.userMessageId,
      ];
      if (
        requiredIds.some((value) => typeof value !== "string") ||
        typeof input.title !== "string" ||
        typeof input.content !== "string" ||
        !Array.isArray(input.contextMessageIds)
      ) {
        return NextResponse.json(
          { error: "Persistence metadata is malformed." },
          { status: 400 },
        );
      }

      generationId = input.generationId;
      await startGeneration(await getBrowserOwner(), input);
      generationStarted = true;
    }

    const response = await openai.responses.create({
      model: "gpt-5.6",
      store: false,
      instructions: assistantInstructions,
      text: {
        verbosity: "high",
      },
      input: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    const text = response.output_text.trim();

    if (!text) {
      console.error("OpenAI response did not include output text.", {
        responseId: response.id,
      });

      if (generationId && generationStarted) {
        await failGeneration(
          await getBrowserOwner(),
          generationId,
          "empty_response",
          "OpenAI response did not include output text.",
        );
        generationStarted = false;
      }

      return NextResponse.json(
        { error: "Assistant response was empty." },
        { status: 502 },
      );
    }

    const assistantMessageId = crypto.randomUUID();
    if (generationId) {
      await completeGeneration(
        await getBrowserOwner(),
        generationId,
        assistantMessageId,
        text,
        response.id,
      );
      generationStarted = false;
    }

    return NextResponse.json({ text, messageId: assistantMessageId });
  } catch (error) {
    console.error("OpenAI chat request failed.", error);

    if (generationId && generationStarted) {
      try {
        await failGeneration(
          await getBrowserOwner(),
          generationId,
          "generation_failed",
          error instanceof Error ? error.message : "Unknown generation failure",
        );
      } catch (persistenceError) {
        console.error("Unable to record generation failure.", persistenceError);
      }
    }

    return NextResponse.json(
      { error: "Unable to generate an assistant response." },
      { status: 500 },
    );
  }
}
