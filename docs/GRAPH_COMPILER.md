# Graph Compiler

Maps GraphSpec node types to trusted Python handlers. Never evaluates model-supplied code, never imports dynamic modules, never runs shell.

Unknown tools / nodes → `GRAPH_COMPILE_FAILED` / `TOOL_NOT_ALLOWED`.

Unit tests cover malicious specs in `tests/test_graph_compiler.py`.
