# Knowledge & RAG

Pipeline: upload/validate → extract → split → embed → store → ready (queued run).

Sources: PDF, txt, md, csv, public URL (SSRF-safe).

Embeddings: `text-embedding-3-small`, dimension **1536**.

RPC: `match_knowledge_chunks` with user isolation.

Malware scanning: production TODO (MIME/size/extension enforced).
