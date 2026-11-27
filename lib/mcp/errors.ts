/**
 * Errors safe to surface verbatim to MCP callers (validation, missing items,
 * incompatible units). Unexpected system/Prisma errors are logged server-side
 * and masked behind a generic error message.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export class ResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceError";
  }
}
