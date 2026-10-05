import { NextResponse } from "next/server";
import {
  createRootConversation,
  loadConversationGraph,
} from "@/lib/persistence";
import { persistenceIsConfigured } from "@/lib/supabase-admin";
import { getBrowserOwner } from "@/lib/browser-owner";

export async function GET() {
  if (!persistenceIsConfigured()) {
    return NextResponse.json({ configured: false, conversations: [] });
  }

  try {
    const ownerId = await getBrowserOwner();
    return NextResponse.json({
      configured: true,
      conversations: await loadConversationGraph(ownerId),
    });
  } catch (error) {
    console.error("Unable to load persisted conversations.", error);
    return NextResponse.json(
      { error: "Unable to load conversation history." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!persistenceIsConfigured()) {
    return NextResponse.json(
      { error: "Supabase persistence is not configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as {
      graphId?: unknown;
      conversationId?: unknown;
    };
    if (
      typeof body.graphId !== "string" ||
      typeof body.conversationId !== "string"
    ) {
      return NextResponse.json({ error: "Invalid root conversation." }, { status: 400 });
    }
    await createRootConversation(
      await getBrowserOwner(),
      body.graphId,
      body.conversationId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to create root conversation.", error);
    return NextResponse.json(
      { error: "Unable to create conversation." },
      { status: 500 },
    );
  }
}
