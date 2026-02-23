export type JsonObject = Record<string, unknown>;

export type ToolTextContent = {
  type: 'text';
  text: string;
};

export type ToolResult = {
  content: ToolTextContent[];
  structuredContent?: JsonObject;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: JsonObject;
  execute: (id: string | number | undefined, params: unknown) => Promise<ToolResult> | ToolResult;
};

export type ToolRegistrationOptions = {
  optional?: boolean;
};

export type CommandResult = {
  text: string;
};

export type CommandContext = {
  senderId?: string;
  channel?: string;
  isAuthorizedSender?: boolean;
  args?: string;
  commandBody?: string;
  config?: unknown;
};

export type CommandDefinition = {
  name: string;
  description: string;
  acceptsArgs?: boolean;
  requireAuth?: boolean;
  handler: (ctx: CommandContext) => Promise<CommandResult> | CommandResult;
};

export type LoggerLike = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

export type PluginApi = {
  config?: unknown;
  logger?: LoggerLike;
  registerTool: (definition: ToolDefinition, options?: ToolRegistrationOptions) => void;
  registerCommand?: (definition: CommandDefinition) => void;
};
