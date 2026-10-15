# Faculty outreach

Drafts for a first email to a UIUC professor. Vinayak is a junior in Computer Engineering seeking a sustained undergraduate research position under faculty supervision. Sidequest may become the project. Contributing to related work already underway in the group is also a fit.

Neither hypothesis has been tested. Do not report an improvement. Do not name a professor’s topic unless the bracketed sentence is filled from something you have actually read.

The deployment is access-gated. Do not put the access token in email. Offer a walkthrough.

## What to send

| When | Send | Do not send |
| --- | --- | --- |
| First email | The one-page brief, [RESEARCH_BRIEF.md](RESEARCH_BRIEF.md), as a PDF. Link the demo: https://sidequest-ruddy-three.vercel.app | The access token. The literature review. Any table that looks like a result. The offline package’s fixture output. |
| If they reply | [RESEARCH_PROPOSAL.md](RESEARCH_PROPOSAL.md). Offer [LITERATURE_REVIEW.md](LITERATURE_REVIEW.md) and [RESEARCH_GAPS.md](RESEARCH_GAPS.md) only if they ask how the questions sit against prior work. | A claim that graph-aware ranking beat the baselines. It did not. On the development fixture the graph arm selected the same messages as the semantic arm, and those vectors are synthetic. |
| Source, if they ask for code | The public app repository. Say that production sends the full branch-bounded history, and that the offline selectors live in a separate worktree and are not deployed. | A description of the offline code as an experiment. |

Use the HCI variant for human–AI interaction, learning, or usable interfaces. Use the NLP variant for retrieval, memory, long context, or dialogue systems. If a professor spans both, send one variant and name the other hypothesis in a single sentence, which these drafts already do.

## How to personalize

Replace every bracket. Delete a placeholder you cannot fill from a real paper, project page, or talk. One accurate sentence is enough. A vague sentence is worse than none.

- `[Professor last name]`
- `[Connection]` — one sentence, about 25 words, naming a paper or project you have read (title and year) and why you are writing this group. The drafts are counted without that sentence. Keep the finished email under 200 words. Delete the placeholder if you cannot fill it from a real source.
- `[email]`
- `[hours per week]` — a number you can keep.

## HCI variant

**Subject:** Undergraduate research on branching human–AI conversation

Dear Professor [Last name],

I am Vinayak, a junior in Computer Engineering at UIUC, seeking a sustained undergraduate research position under your supervision. [Connection]

I built Sidequest, a deployed AI conversation tree with nested branches, selected-text provenance, and a return to the parent thread (https://sidequest-ruddy-three.vercel.app). Two hypotheses are open, and neither has been experimentally validated. The human–AI question is whether branching improves conceptual understanding, task resumption, and conversational coherence relative to linear chat. The systems question is whether graph-aware context selection improves retrieval and answer quality under a fixed token budget.

I hope to develop one of these in your group. I am willing to revise the question or contribute to related research already underway. A one-page brief is attached. I can walk through the access-gated demo.

Thank you,  
Vinayak  
[email]  
[hours per week]

## NLP / AI systems variant

**Subject:** Undergraduate research on context selection in branching conversations

Dear Professor [Last name],

I am Vinayak, a junior in Computer Engineering at UIUC, seeking a sustained undergraduate research position under your supervision. [Connection]

I built Sidequest, a deployed AI conversation tree (https://sidequest-ruddy-three.vercel.app). Production includes ancestor messages through each branch point and omits other branches. It does not rank them. Two hypotheses are open, and neither has been experimentally validated. The systems question is whether graph-aware context selection improves retrieval and answer quality relative to chronological and semantic retrieval under a fixed token budget. The human–AI question is whether branching improves conceptual understanding, task resumption, and coherence.

I hope to develop the retrieval question in your group. The current semantic baseline uses synthetic vectors, not a real embedder. I am willing to revise the question or contribute to related research already underway. A one-page brief is attached.

Thank you,  
Vinayak  
[email]  
[hours per week]

## Follow-up

Send once, about a week later, only if there is no reply. Keep the same subject line with `Re:`.

Dear Professor [Last name],

I am following up once on my note about a sustained undergraduate research position. Sidequest is the deployed conversation tree. The hypotheses about branching and about graph-aware context selection are still untested, and I am glad either to shape one of them under your supervision or to help with related work already in your group.

The one-page brief is attached again. If this does not fit the group’s current projects, no reply is needed, and I will not write again.

Thank you,  
Vinayak
