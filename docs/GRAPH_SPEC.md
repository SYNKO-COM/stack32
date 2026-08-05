# GraphSpec

Independent of React Flow. Version `1.0`.

Node types: `input`, `guardrail`, `llm`, `router`, `tool`, `knowledge`, `memory_read`, `memory_write`, `approval`, `transform`, `output`, `sub_agent`.

Validation: unique IDs, entry=`input`, reachable `output`, max 40 nodes, max 3 sub-agents, no recursive sub-agents, no executable config keys, tool nodes must reference trusted tool IDs.

Visual layout preferences are stored separately from GraphSpec; dragging nodes must not change runtime behavior.
