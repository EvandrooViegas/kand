# Resumable design analysis

The library creates an authenticated `POST /api/global-designs/analysis-jobs` job and polls `GET /api/global-designs/analysis-jobs/:id`. A failed job can be resumed with `POST` to the same job URL. The browser remembers its job ID across refreshes.

The Node server runs analysis asynchronously. MongoDB stores the job, progress, worker lease, retry time and resulting family ID. Each completed AI stage also has a content-addressed cache entry. A 20-second heartbeat renews the 90-second lease. Polling recovers abandoned work after a process restart; two processes cannot claim a live lease simultaneously. Temporary provider errors retry automatically for up to three job attempts. Completion saves an unpublished draft. Regeneration uses the captured draft revision to avoid overwriting concurrent edits.

This runner assumes the persistent Node runtime used by `next dev` or `next start`. It does not require a separate queue service. A deployment that suspends execution after each HTTP response must move `runAnalysisJob` to a persistent worker; the Mongo job/lease format is reusable. Jobs interrupted by such suspension resume when the library polls after the lease expires.

Groq handles the primary request. If it is temporarily unavailable, quota-limited, or inaccessible, the configured `OPENAI_API_KEY` enables fallback for both image understanding and JSON drafting. The default backup is `gpt-4.1-mini`; override it with `OPENAI_DESIGN_MODEL`. Requests go only to the fixed official OpenAI API endpoint. Credentials are never returned by job endpoints. No extra dependency is required.

Drafting requests produce one variation at a time with a 3200-token output cap. A conservative input/output estimate routes oversized requests to the backup before calling Groq (`GROQ_DESIGN_TOKEN_BUDGET`, default 7000); an actual 413 also triggers fallback. Two references plus nine variations appear as eleven cached stages. Existing jobs stopped by the old token-limit failure automatically queue one recovery attempt when read. Detailed failure diagnostics remain server-side.

Layout validation normalizes numeric typography, clamps text boxes to the canvas, relocates overlapping copy into available space, and fits cutouts around copy. Repairs preserve editable nodes and content; impossible layouts are rejected for model correction rather than saved with collisions.

Validation: automated tests cover provider failover, preserved image input, secret-safe errors, cached retries, persisted progress, live/expired leases and single draft creation. The live smoke test uses a synthetic color image and a simulated primary-provider 503.
