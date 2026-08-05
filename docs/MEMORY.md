# Memory

- Short-term: live thread messages + context window
- Long-term: `agent_memories` with optional `vector(1536)` embeddings
- Write policies: `never` | `explicit` | `automatic` (validated)
- Secret-like content rejected
- APIs: list / delete one / clear all / patch settings
- RLS: user + agent ownership
