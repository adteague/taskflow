"""Read-only, authenticated metadata about the in-process MCP server.

Powers the frontend's "Connect an Agent" page. The tool/resource catalog is
introspected live from the FastMCP instance — the same data agents get from
tools/list — so the page can never drift from what the server actually serves.
"""

from typing import Any

from fastapi import APIRouter, Depends

from app.mcp_server import INSTRUCTIONS, mcp
from app.security import get_current_user

router = APIRouter(tags=["mcp"], dependencies=[Depends(get_current_user)])


@router.get("/mcp-info")
async def get_mcp_info() -> dict[str, Any]:
    tools = await mcp.list_tools()
    resources = await mcp.list_resources()
    return {
        "server": {
            "name": mcp.name,
            "endpoint": "/mcp",
            "transport": "streamable-http",
            "auth": "Bearer JWT — the same token issued by POST /auth/login",
            "instructions": INSTRUCTIONS,
        },
        "tools": [
            {
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.inputSchema,
            }
            for tool in tools
        ],
        "resources": [
            {
                "uri": str(resource.uri),
                "name": resource.name,
                "description": resource.description,
                "mimeType": resource.mimeType,
            }
            for resource in resources
        ],
    }
