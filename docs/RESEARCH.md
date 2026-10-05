# Sidequest Research Space

Sidequest began from the observation that linear chat interfaces poorly represent nonlinear human thought. Users naturally encounter tangents, clarification questions, alternative paths, and nested questions while interacting with AI. Sidequest explores whether human-AI conversation should be represented as a navigable graph rather than only a chronological transcript.

## Current product boundary

The current product is a focused, single-user branching chat prototype. It supports root conversations, nested sidequests, exact branch-message provenance, selected-text references, graph navigation, OpenAI responses, and a Supabase/PostgreSQL persistence path. It does not implement branch merging, summaries, retrieval, multi-model routing, collaboration, browser-extension integration, advanced memory, knowledge graphs, or research experiments.

Everything below is a future research or product direction. It is recorded to preserve the design space, not to imply implementation or commitment.

## 1. Human–AI conversation structure

Linear chat is simple, familiar, and easy to serialize, but it forces clarification, comparison, correction, and tangent exploration into one chronology. That can blur which question an answer addresses and make it hard to resume the original task.

Possible structures include:

- A tree, where each branch has one parent and provenance stays simple.
- A directed acyclic graph, where branches can merge or share context.
- A timeline with checkpoints and alternate continuations.
- A graph whose edges have semantic types such as “clarifies,” “challenges,” “compares,” or “applies.”
- Parallel sibling branches used to explore alternate reasoning paths or model answers.

“Git for conversations” is a useful analogy but an incomplete one. Commits resemble immutable messages or checkpoints; branches resemble sidequests; merges resemble returning insight. Conversations also contain ambiguity, evolving intent, model nondeterminism, and personal meaning that source-code merges do not. Research should determine which version-control ideas transfer cleanly and which create needless complexity.

Important questions include whether users understand nested branches, when cross-links justify a DAG, whether checkpoints should be explicit, and whether semantic edges improve navigation or simply add metadata burden.

## 2. Context management

A branch can inherit the complete ancestor transcript, only history through its branch point, the parent message, selected text, summaries, retrieved concepts, or some combination. Full history maximizes recall but increases cost and context pollution. Minimal context is cheaper but may make references incoherent.

Potential context-engine strategies include:

- Exact ancestor history bounded at every branch origin.
- Selected passage plus a small window around its source message.
- Hierarchical summaries at conversation and subtree levels.
- Semantic retrieval over immutable message chunks.
- Dynamic budgets split among recent branch messages, ancestors, summaries, and retrieved evidence.
- Provenance manifests that record why every context item was included.
- Relevance scoring constrained by graph distance so unrelated sibling branches do not leak in.

Graph structure may improve retrieval by providing a strong prior: parent and ancestor nodes are usually more relevant than arbitrary historical text. This should be measured against flat semantic search. Compression must preserve qualifications and uncertainty, not turn summaries into false facts. Context construction should remain inspectable enough to debug answer quality and cost.

## 3. Branch lifecycle

Sidequests may be quick clarifications, durable research threads, abandoned experiments, or alternate answers. A lifecycle could include active, completed, archived, superseded, or promoted states, but explicit status may impose unnecessary work.

Possible behaviors include:

- Let the user mark a branch complete and optionally return with an insight.
- Generate a user-editable summary when returning to the parent.
- Promote selected findings rather than automatically merging everything.
- Archive stale or abandoned branches without deleting provenance.
- Rank branches by recency, depth, revisits, or user-marked importance.
- Suggest branches or pruning only after users understand manual branching.

Automatic branch creation is risky: it may fragment a conversation, surprise users, and increase graph-management cost. Completion and merging should initially remain deliberate user actions.

## 4. Human-computer interaction and UX

The core HCI problem is managing tangents without increasing cognitive overhead. A graph can preserve structure while also becoming another interface the user must understand.

Research areas include breadcrumbs, tree navigation, minimaps, expandable subtrees, depth cues, keyboard navigation, search, reading-position restoration, selected-text branching, message-level branching, and responsive representations for small screens. Large graphs may require progressive disclosure, branch filtering, landmarks, recency cues, or task-centered views.

Useful measures include time to resume a parent, navigation errors, lost-position reports, time spent managing structure, and perceived cognitive load. The interface should make ordinary chat nearly invisible; structure should appear when it helps rather than dominate every exchange.

## 5. Learning and education

Branching may let learners ask “basic” clarification questions without derailing a lesson. It may also encourage distraction and reduce synthesis if learners accumulate disconnected tangents.

A controlled comparison of linear chat and Sidequest could measure:

- Immediate comprehension and delayed retention.
- Main-task completion and return-to-main-thread success.
- Number, depth, and duration of tangents.
- Willingness to ask clarification questions.
- Subjective cognitive load and confidence.
- Ability to explain relationships among explored concepts.
- User preference after equivalent tasks.

Experiments should distinguish novelty effects from durable benefit, compare novice and expert users, and control model output. Learning maps, concept dependencies, unresolved-question lists, and study-path generation are promising later applications, not current features.

## 6. Multi-model and multi-agent Sidequest

Sidequest could become a model-independent conversation layer:

```text
Conversation Graph
       |
  Context Engine
       |
--------------------------------
| OpenAI | Claude | Gemini      |
| Local models | Other systems |
--------------------------------
```

Different branches could use different models, compare answers as siblings, route simple clarifications cheaply, or use specialized agents. A model-agnostic graph requires normalized message roles, capability metadata, request provenance, tool-call representation, and clear handling of provider-specific state.

Risks include inconsistent behavior, duplicated costs, provider lock-in through hidden features, evaluation complexity, and confusing users about which model knows which context. Bring-your-own-key and local inference reduce platform cost but create setup, security, and support burdens.

## 7. Browser extension

A browser extension could add Sidequest to ChatGPT, Claude, Gemini, or other AI interfaces: select an answer passage, open a Sidequest overlay, explore, then return to the source.

The architecture would likely include content scripts, site-specific DOM adapters, an overlay or sidebar, a durable independent graph store, and a way to capture source URL, message identity, visible text, and selection. It may not have access to the provider’s true conversation state, system prompt, tool results, or internal IDs.

Key risks are fragile DOM integration, broad extension permissions, private conversation capture, cross-origin restrictions, website changes, policy/terms constraints, and false confidence about reconstructed context. The larger product question is whether Sidequest is more valuable as an interaction/infrastructure layer over existing agents than as another standalone chatbot.

## 8. Inference economics

Commercial APIs make Sidequest responsible for inference cost, and branching can resend overlapping ancestor context. Potential models include subscription tiers, usage limits, BYOK, local inference, model routing, prompt caching, semantic caching, and graph-aware context reduction.

Using a user’s existing AI subscription is attractive but may be technically unavailable or prohibited. Browser extensions might reduce Sidequest-owned inference only when they can permissibly invoke an existing interface. Caching must account for personalization, changing context, privacy, and model nondeterminism. Cost research should measure tokens and latency per useful learning outcome rather than only per request.

## 9. Graph and systems architecture

Relational adjacency lists are a strong starting point because Sidequest needs transactional integrity, ordered messages, provenance, ownership, and straightforward ancestor queries. A graph database might help complex traversals later, but adds operational cost before the graph workload demands it.

Long-term systems topics include DAG constraints, lowest common ancestors, merge semantics, event sourcing, immutable events, snapshots, message versioning, offline-first operation, distributed synchronization, conflict resolution, collaborative graphs, and CRDTs. Event sourcing offers auditability and replay but complicates queries and migrations. Snapshotting improves load time while requiring invalidation rules. Offline mutation requires globally unique IDs, deterministic conflict policies, and careful sequence allocation.

## 10. AI memory

Memory might be global, graph-specific, conversation-specific, or branch-local. A branch may contain tentative ideas that should never become global memory. Users may need explicit promotion from branch to parent to graph to account-level memory.

Conversation topology could improve retrieval by distinguishing core-thread facts from speculative tangents. Episodic memory could preserve what happened in a particular graph; semantic memory could store stable user knowledge or preferences. Any promotion system needs provenance, edit/delete controls, visibility into use, and safeguards against model-generated misinformation becoming durable memory.

## 11. Knowledge graphs

A conversation graph could gradually yield a separate concept graph:

```text
conversation nodes
       ↓
concept mentions and questions
       ↓
typed relationships
       ↓
personal knowledge graph
```

Possible applications include learning maps, prerequisite discovery, study paths, unresolved-question queues, spaced revisiting, and knowledge-gap detection. The system must distinguish conversation topology from conceptual truth: a conversational branch is not automatically an ontological relationship. Extraction quality, user correction, provenance, and changing understanding are central challenges.

## 12. Collaborative Sidequest

Teams or classes could share graphs while exploring different branches asynchronously. Possibilities include branch ownership, teacher/student views, comments, assignments, research-team exploration, notifications, review workflows, and merging discoveries.

Collaboration introduces permissions, concurrent editing, moderation, privacy, attribution, graph conflicts, and notification overload. It also changes the product from personal thinking support to coordination software. This should be pursued only if solo branching proves valuable first.

## 13. Research questions and experiments

- **RQ1:** Does explicit branching improve users’ ability to resume an original task after a tangent? Compare return time, errors, and task completion in linear and branching interfaces.
- **RQ2:** Does graph-structured context reduce irrelevant context while maintaining answer quality? Evaluate blinded answer quality, token use, and latency across full-history, graph-bounded, and retrieval-based prompts.
- **RQ3:** How much ancestor context is necessary for coherent branches? Ablate full ancestors, parent-message windows, selected text, and hierarchical summaries.
- **RQ4:** Do learners retain more when clarification questions are isolated? Run immediate and delayed comprehension tests with controlled content.
- **RQ5:** When should branch discoveries propagate upward? Compare manual promotion, generated summaries, and automatic merging for trust and usefulness.
- **RQ6:** How should large conversation graphs be visualized? Test trees, breadcrumbs, minimaps, search-first views, and progressive disclosure at increasing graph sizes.
- **RQ7:** Can graph-aware prompting reduce inference cost without lowering quality? Measure cost per rated-useful answer and per completed task.
- **RQ8:** Does selected-text grounding improve follow-up accuracy? Compare ambiguous pronoun questions with and without explicit passage context.
- **RQ9:** At what graph depth do users become disoriented? Measure navigation and recall across controlled branching structures.
- **RQ10:** Do users create branches proactively or only after losing context? Study natural use and intervention timing.
- **RQ11:** Are model-comparison sibling branches understandable and useful? Compare side-by-side siblings with conventional regenerated answers.
- **RQ12:** Can topology improve memory retrieval precision? Compare graph-distance-aware retrieval with embedding-only retrieval.
- **RQ13:** Which branch completion signals correlate with successful return? Examine duration, message count, explicit insight capture, and parent revisits.
- **RQ14:** Does automatic branching help or fragment thought? Compare manual, suggested, and automatic conditions.
- **RQ15:** How stable are browser-extension adapters across provider UI changes? Track maintenance burden and provenance fidelity longitudinally.

Promising early experiments are RQ1, RQ3, RQ8, and RQ9 because they test the central interaction without requiring speculative infrastructure. Studies should preregister outcomes where practical, keep model behavior controlled, log graph events with consent, and pair behavioral measures with interviews.

## 14. Product directions

| Direction | Core value | Difficulty | Provider dependence | Differentiation | Major risks |
| --- | --- | --- | --- | --- | --- |
| Standalone AI app | Complete branch-native experience | Medium | High unless BYOK/local | Purpose-built UX | Inference cost and crowded market |
| Browser extension | Adds branching to tools users already use | High | Medium/high | Cross-product interaction layer | DOM fragility, permissions, policy |
| Conversation infrastructure/API | Durable graph and context primitives | High | Low/medium | Provider-neutral structure | Abstract market and integration burden |
| Learning/research tool | Better tangent management and knowledge exploration | Medium | Medium | Focused outcomes and evaluation | Narrow market or distraction risk |
| Multi-agent workspace | Parallel specialist exploration | Very high | High | Graph-native orchestration | Complexity, cost, unclear control |
| Conversation graph SDK | Gives developers reusable branch primitives | High | Low | Infrastructure differentiation | Premature abstraction and support load |
| HCI research platform | Instrumented branching experiments | Medium | Medium | Research contribution | Limited commercial path and study overhead |
| Knowledge-management system | Converts exploration into durable knowledge | Very high | Medium | Links conversation and learning maps | Extraction errors and product sprawl |

No direction is selected here. The shipped prototype should first demonstrate that explicit branching solves a real interaction problem.

## 15. Open technical questions

- What exact ancestor context should each branch receive?
- When should summaries replace raw messages, and how are they invalidated?
- Should the durable structure remain a tree or permit typed DAG edges?
- What are safe, understandable branch-merge semantics?
- Should messages be immutable, redacted, or versioned?
- How should request context provenance be represented and inspected?
- How are interrupted and retried generations reconciled without duplicates?
- How should sibling order and branch importance be represented?
- What is the right pagination strategy for large graphs?
- Can offline clients allocate message order without central coordination?
- How should browser-extension adapters identify source messages robustly?
- What belongs in Sidequest versus the underlying model provider?
- Which data can be retained for research without compromising privacy?
- How should users export, delete, or transfer complete graphs?
- What metrics distinguish productive exploration from distraction?

## 16. Principles

1. Sidequest owns conversation structure, not necessarily inference.
2. Branch provenance should never be lost.
3. The graph is a first-class object, not UI decoration.
4. Context should be intentionally constructed rather than blindly flattened.
5. Users should always be able to return to where they came from.
6. Sidequests should reduce cognitive disruption, not create more of it.
7. The architecture should remain model-agnostic where practical.
8. Visible conversation content and hidden request context should remain distinct.
9. Automatic structure should be explainable and reversible.
10. Durable memory or insight should require clear provenance and user control.
11. Ordinary chat should remain familiar; graph complexity should appear progressively.
12. Research ideas should not be presented as shipped product behavior.
