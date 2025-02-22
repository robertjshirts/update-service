/**
 * Extracts and returns relevant information from a Request object
 * @param request The incoming Request object
 * @returns An object containing parsed request information
 */
export async function getRequestInfo(request: Request) {
  try {
    // Clone the request to avoid consuming the body stream
    const clonedRequest = request.clone();

    // Get basic request information
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;
    const queryParams = Object.fromEntries(url.searchParams);

    // Convert headers to a plain object
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Parse body based on content type
    let body: unknown = null;
    const contentType = headers["content-type"]?.toLowerCase() || "";

    if (method !== "GET" && method !== "HEAD") {
      if (contentType.includes("application/json")) {
        body = await clonedRequest.json();
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await clonedRequest.formData();
        body = Object.fromEntries(formData);
      } else if (contentType.includes("multipart/form-data")) {
        const formData = await clonedRequest.formData();
        const formDataObject: Record<string, unknown> = {};

        for (const [key, value] of formData.entries()) {
          if (value instanceof File) {
            formDataObject[key] = {
              filename: value.name,
              type: value.type,
              size: value.size,
            };
          } else {
            formDataObject[key] = value;
          }
        }
        body = formDataObject;
      } else {
        body = await clonedRequest.text();
      }
    }

    return {
      method,
      url: url.toString(),
      path,
      queryParams,
      headers,
      body,
      protocol: url.protocol,
      host: url.host,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to parse request: ${errorMessage}`);
  }
}

/**
 * Logger class that supports both file and console logging
 */
export class Logger {
  private logFile?: string;

  constructor(logFile?: string) {
    this.logFile = logFile;
  }

  /**
   * Formats a log message with timestamp
   */
  private formatMessage(message: string): string {
    return `[${new Date().toISOString()}] ${message}\n`;
  }

  /**
   * Logs a message to either file or console
   */
  async log(message: string) {
    const formattedMessage = this.formatMessage(message);
    if (this.logFile) {
      await Deno.writeTextFile(this.logFile, formattedMessage, { append: true });
    } else {
      console.log(formattedMessage.trim());
    }
  }

  /**
   * Logs an error message to file (if configured) and always to console.error
   */
  async error(message: string) {
    const formattedMessage = this.formatMessage(`ERROR: ${message}`);
    if (this.logFile) {
      await Deno.writeTextFile(this.logFile, formattedMessage, { append: true });
    }
    // Always log errors to console.error
    console.error(formattedMessage.trim());
  }
}

// Example usage:
// const requestInfo = await getRequestInfo(request);
