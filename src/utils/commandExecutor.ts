import { spawn } from "child_process";
import { logger } from "./logger.js";

/**
 * Execute a command and return the output
 */
export interface ExecutionResult {
  output: string;
  exitCode: number | null;
  signal: string | null;
  error?: Error;
}

export interface ExecutionOptions {
  onProgress?: (output: string) => void;
  timeout?: number;
}

export async function executeCommand(
  command: string,
  args: string[],
  options: ExecutionOptions = {}
): Promise<string> {
  const { onProgress, timeout = 600000 } = options; // 10 minute default timeout

  return new Promise((resolve, reject) => {
    logger.debug(`Executing: ${command} ${args.join(" ")}`);

    let stdout = "";
    let stderr = "";
    let progressInterval: NodeJS.Timeout | null = null;

    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });

    // Progress monitoring
    if (onProgress) {
      progressInterval = setInterval(() => {
        const preview = stdout.slice(-200) || stderr.slice(-200);
        logger.progress(
          `Executing... (stdout: ${stdout.length} chars, stderr: ${stderr.length} chars) Latest: ${preview.slice(-100)}`
        );
      }, 5000);
    }

    // Timeout handling
    const timeoutHandle = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    // Capture stdout
    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      if (onProgress) {
        onProgress(chunk);
      }
    });

    // Capture stderr
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Handle process errors
    child.on("error", (error: Error) => {
      clearTimeout(timeoutHandle);
      if (progressInterval) clearInterval(progressInterval);
      logger.error(`Command error: ${error.message}`);
      reject(error);
    });

    // Handle process exit
    child.on("close", (exitCode: number | null, signal: string | null) => {
      clearTimeout(timeoutHandle);
      if (progressInterval) clearInterval(progressInterval);

      logger.debug(`Command exited with code ${exitCode}, signal ${signal}`);

      if (exitCode !== 0) {
        const errorMsg = `Command failed with exit code ${exitCode}: ${stderr}`;
        logger.error(errorMsg);
        reject(new Error(errorMsg));
      } else {
        resolve(stdout);
      }
    });
  });
}
