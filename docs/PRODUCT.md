# Product

## Problem

Learning conversations often introduce unfamiliar concepts. Exploring one in the same conversation can derail the primary topic; moving elsewhere can lose the original context and place.

## Core concept

Sidequest is an AI learning interface designed around conversational branches. A learner follows a primary thread, opens a sidequest from a concept or message, explores it separately, and returns to the parent thread without losing their place.

## Target experience

Curiosity should be easy to act on. Learners should understand which thread they are in, what prompted a branch, and how to resume the parent conversation. Exploring a tangent should preserve the parent thread's context and reading position.

## Core interaction model

1. Follow a primary learning conversation.
2. Choose a concept or message and create a sidequest linked to that origin.
3. Explore the concept in a separate conversational branch.
4. Return to the parent thread at the previous place and continue learning.

The exact selection UI, branch presentation, and context-sharing rules remain to be designed.

## Current prototype scope

The repository contains an interactive Sidequest prototype with a Threads sidebar, composer-based branching, selected-text references, nested parent navigation, OpenAI-backed Markdown responses, and optional Supabase/PostgreSQL persistence. Configured deployments reconstruct browser-scoped graphs after refresh; there is no account authentication or cross-device sync. See [Architecture](ARCHITECTURE.md) for the implementation inventory and [Progress](PROGRESS.md) for the current handoff state.

## Non-goals for the current stage

The immediate stage is validating the branch-and-return interaction. Production AI infrastructure, durable accounts, cross-device history, collaboration, billing, and a full learning management system are outside that stage's scope. These exclusions are scope boundaries, not promises of later features.

## Future direction — not implemented

Continue validating the implemented branch-and-return interaction and persisted history. Account authentication, cross-device access, generation recovery, and reading-position restoration remain future work; see [Roadmap](ROADMAP.md).
