"""Built-in tool blueprints + blueprint construction helpers (M-D).

A small catalog of safe, dependency-free tool implementations the scaffold can
embed into a generated agent. M-F extends this with connector-backed tools.
"""

from __future__ import annotations

from agent_service.builder.templates.scaffold import ProjectBlueprint, ToolBlueprint, slugify

CALCULATOR = ToolBlueprint(
    name="calculator",
    description="Evaluate a basic arithmetic expression (+, -, *, /).",
    input_schema={
        "type": "object",
        "properties": {"expression": {"type": "string"}},
        "required": ["expression"],
    },
    impl=(
        "import ast\n"
        "import operator\n"
        "_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv, ast.USub: operator.neg}\n"
        "def _eval(node):\n"
        "    if isinstance(node, ast.Constant):\n"
        "        return node.value\n"
        "    if isinstance(node, ast.BinOp):\n"
        "        return _OPS[type(node.op)](_eval(node.left), _eval(node.right))\n"
        "    if isinstance(node, ast.UnaryOp):\n"
        "        return _OPS[type(node.op)](_eval(node.operand))\n"
        "    raise ValueError('unsupported expression')\n"
        "try:\n"
        "    tree = ast.parse(str(args['expression']), mode='eval')\n"
        "    return {'result': _eval(tree.body)}\n"
        "except Exception as exc:\n"
        "    return {'error': str(exc)}"
    ),
)

CURRENT_DATETIME = ToolBlueprint(
    name="current_datetime",
    description="Return the current UTC datetime in ISO 8601.",
    input_schema={"type": "object", "properties": {}, "required": []},
    impl=(
        "from datetime import datetime, timezone\n"
        "return {'now': datetime.now(timezone.utc).isoformat()}"
    ),
)

ECHO = ToolBlueprint(
    name="echo",
    description="Echo back the provided text.",
    input_schema={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
    impl="return {'text': str(args.get('text', ''))}",
)

BUILTIN_TOOLS = {t.name: t for t in (CALCULATOR, CURRENT_DATETIME, ECHO)}


def default_blueprint(
    *,
    name: str,
    description: str,
    system_prompt: str,
    tool_names: list[str] | None = None,
) -> ProjectBlueprint:
    tool_names = tool_names or ["calculator", "current_datetime"]
    tools = [BUILTIN_TOOLS[n] for n in tool_names if n in BUILTIN_TOOLS]
    return ProjectBlueprint(
        name=name,
        slug=slugify(name),
        description=description,
        system_prompt=system_prompt,
        tools=tools,
    )
