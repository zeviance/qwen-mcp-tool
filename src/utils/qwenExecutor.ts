import { CLI, QWEN_MODELS, ERROR_MESSAGES, STATUS_MESSAGES } from "../constants.js";
import { executeCommand } from "./commandExecutor.js";
import { logger } from "./logger.js";
import type { QwenModel, ApprovalMode } from "../constants.js";

/**
 * Options for executing Qwen CLI
 */
export interface QwenExecutionOptions {
  prompt: string;
  model?: QwenModel;
  sandbox?: boolean;
  approvalMode?: ApprovalMode;
  yolo?: boolean;
  allFiles?: boolean;
  debug?: boolean;
  onProgress?: (output: string) => void;
}

/**
 * Execute Qwen CLI with the given options
 */
export async function executeQwenCLI(
  options: QwenExecutionOptions
): Promise<string> {
  const {
    prompt,
    model,
    sandbox = false,
    approvalMode,
    yolo = false,
    allFiles = false,
    debug = false,
    onProgress
  } = options;

  if (!prompt || !prompt.trim()) {
    throw new Error(ERROR_MESSAGES.NO_PROMPT_PROVIDED);
  }

  // Build command arguments
  const args: string[] = [];

  // Add model flag if specified
  if (model) {
    args.push(CLI.FLAGS.MODEL, model);
  }

  // Add sandbox flag if enabled
  if (sandbox) {
    args.push(CLI.FLAGS.SANDBOX);
  }

  // Add approval mode if specified
  if (approvalMode) {
    args.push(CLI.FLAGS.APPROVAL_MODE, approvalMode);
  }

  // Add yolo flag if enabled
  if (yolo) {
    args.push(CLI.FLAGS.YOLO);
  }

  // Add all-files flag if enabled
  if (allFiles) {
    args.push(CLI.FLAGS.ALL_FILES);
  }

  // Add debug flag if enabled
  if (debug) {
    args.push(CLI.FLAGS.DEBUG);
  }


  // Use -p flag for prompts with @file references (required for file expansion),
  // positional arg otherwise (-p is deprecated and conflicts in non-file contexts)
  if (prompt.includes("@")) {
    args.push(CLI.FLAGS.PROMPT, prompt);
  } else {
    args.push(prompt);
  }

  logger.info(`Executing Qwen CLI with model: ${model || "default"}`);

  if (onProgress) {
    onProgress(STATUS_MESSAGES.STARTING_ANALYSIS);
  }

  try {
    const result = await executeCommand(CLI.COMMANDS.QWEN, args, {
      onProgress,
      timeout: 600000 // 10 minutes
    });

    if (onProgress) {
      onProgress(STATUS_MESSAGES.COMPLETED);
    }

    return result;
  } catch (error) {
    // Check if this is a quota/rate limit error and we used the primary model
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isQuotaError = errorMsg.toLowerCase().includes("quota") ||
                         errorMsg.toLowerCase().includes("rate limit");

    // If quota error with primary model, try fallback
    if (isQuotaError && model === QWEN_MODELS.PRIMARY) {
      logger.warn(STATUS_MESSAGES.SWITCHING_MODEL);

      if (onProgress) {
        onProgress(STATUS_MESSAGES.SWITCHING_MODEL);
      }

      // Retry with fallback model
      const fallbackArgs = [...args];
      const modelIndex = fallbackArgs.indexOf(CLI.FLAGS.MODEL);
      if (modelIndex !== -1 && modelIndex + 1 < fallbackArgs.length) {
        fallbackArgs[modelIndex + 1] = QWEN_MODELS.FALLBACK;
      } else {
        // Model wasn't specified, add it
        fallbackArgs.unshift(CLI.FLAGS.MODEL, QWEN_MODELS.FALLBACK);
      }

      try {
        const fallbackResult = await executeCommand(CLI.COMMANDS.QWEN, fallbackArgs, {
          onProgress,
          timeout: 600000
        });

        if (onProgress) {
          onProgress(STATUS_MESSAGES.COMPLETED);
        }

        return fallbackResult;
      } catch (fallbackError) {
        const fallbackErrorMsg = fallbackError instanceof Error ?
          fallbackError.message : String(fallbackError);
        throw new Error(
          `Both primary and fallback models failed:\n` +
          `Primary: ${errorMsg}\n` +
          `Fallback: ${fallbackErrorMsg}`
        );
      }
    }

    // Not a quota error or already tried fallback
    if (onProgress) {
      onProgress(STATUS_MESSAGES.FAILED);
    }

    throw error;
  }
}

/**
 * Execute a simple command (like echo or help)
 */
export async function executeSimpleCommand(
  command: string,
  args: string[] = []
): Promise<string> {
  logger.debug(`Executing simple command: ${command} ${args.join(" ")}`);
  return executeCommand(command, args);
}
