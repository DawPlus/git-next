# Ticket Records

Load only when creating, updating, completing, or locating a ticket. Coordinator owns lifecycle metadata; Brain initializes it when publishing. Quick work needs no ticket or history record.

## Dates and repair budget

Preserve the project's existing metadata format. New tickets use compact YAML front matter before the title:

```yaml
---
id: T-261004-01
state: ready
created_at: "2026-10-04T10:00:00+09:00"
updated_at: "2026-10-04T10:00:00+09:00"
completed_at: null
repairs_used: 0
---
```

Use actual ISO 8601 timestamps with an explicit offset (UTC `Z` is also valid), never the example values. Keep `created_at` immutable; change `updated_at` only for a meaningful ticket edit or transition, never for reads. Set `completed_at` when QA passes and Coordinator records Done. Store timestamps once in the body, not in every Board row. For legacy tickets, recover known dates from trustworthy evidence; leave unknown creation time null rather than inventing it from migration time or an ID.

IDs remain unique after archival. When allocating today's next sequence, check matching IDs/filenames in the active index and the relevant archive month; do not read archived bodies just to allocate an ID. Never reuse a completed ID because its Board row was removed. To resolve a dependency on an archived ticket, read only that exact ID's completion record.

The Board owns active state/Next; body `state` mirrors it and becomes the historical status after archival. Keep them consistent. `repairs_used` is the durable shared automatic-repair count (default limit 1); runtime is a cache. Increment before each repair; never reset during resume or archive. Any Human-authorized extra allowance and agreed correction are recorded briefly on the same ticket, preserving prior counts.

## Completion and archive

1. Verify acceptance and AI QA evidence, then record `state: done`, completion/update timestamps, and a short Result: outcome, exact checks/results, and relevant limitations. No full logs or conversation transcript. Resolve known live-worker outcomes before completion.
2. Preserve the entire ticket body at `docs/tickets/archive/YYYY-MM/{ID}.md`, using the completion timestamp's month. Respect established project archive/dashboard paths instead when present. Keep ID and creation time unchanged. Never overwrite a different existing archive file or delete a ticket to clear a queue.
3. Repair affected relative links and incoming active-ticket/dependency links to the archived body. Verify the destination, complete content, and links before removing the old active copy or Board row. If archival fails, retain the existing record and report the failure; retry archival without re-running successful QA or changing `completed_at`.
4. Board is a compact index of active work, not an expanding completion log. Once the dashboard can enumerate archive records, remove the completed row after the archive is verified. If the current reader only follows Board rows (as current acorn-dashboard does), retain a compact `done`, `Next=-` row with the archive body link until that reader supports archive discovery. Never hide history from the existing reader merely to shrink the Board. This compatibility row is not active work or a Human approval queue.
5. Clear stale active runtime fields after settlement using recovery guidance. Do not erase unresolved automation bindings or retry history.

Archive is retained project history, not another active Board. Do not archive unfinished work. Preserve superseded tickets and their replacement links under the project's existing history policy; never silently delete them. Archiving a verified completed ticket is normal closeout, not permission for bulk deletion/reset of project records.

## Token budget and dashboard contract

- Routine work reads only the selected active ticket/row and necessary entry files. Do not preload other active bodies, completed rows, archive directories, or EOD history.
- Historical questions: find by exact ID/date/path first, then read only matching bodies. Never scan all completion history to resume work.
- The dashboard may enumerate Markdown and read front matter in code; its full dataset must not be pasted into Agent context. Dates and status support sorting/filtering without opening every body in the Agent.
- The current acorn-dashboard resolves bodies through configured Board links; it does not yet enumerate archive folders or interpret these dates as UI fields. Its reader must be updated before removing compatibility rows. Raw Markdown remains the record; do not invent a database or duplicate history index here.
- Post-Done feedback enters normal request classification: Quick for small low-risk work, otherwise a new ticket linked to the original archived ID/path. No permanent feedback/approval stage, automatic reopen, or retroactive erasure of completion evidence.
