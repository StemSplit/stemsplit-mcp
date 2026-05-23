import { z } from 'zod';

import { toJsonContent } from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const getBalanceInput = {} as const;

const GetBalanceSchema = z.object(getBalanceInput);

export const getBalanceToolDef = {
  title: 'Get Credit Balance',
  description:
    "Return the authenticated user's remaining StemSplit credit balance in seconds, minutes, and a human-readable string.",
  inputSchema: getBalanceInput,
};

export async function runGetBalance(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ToolHandlerResult> {
  GetBalanceSchema.parse(rawInput);
  const balance = await deps.client.getBalance();
  return toJsonContent(balance);
}
