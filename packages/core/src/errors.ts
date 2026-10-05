export class OpenControllerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OpenControllerError";
    this.code = code;
  }
}

export class ProfileError extends OpenControllerError {
  constructor(message: string) {
    super("PROFILE_ERROR", message);
    this.name = "ProfileError";
  }
}

export class SafetyError extends OpenControllerError {
  constructor(message: string) {
    super("SAFETY_ERROR", message);
    this.name = "SafetyError";
  }
}

export class AdapterError extends OpenControllerError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "AdapterError";
  }
}

export type TimedPressAbortErrorOptions = {
  abortReason: unknown;
  cause: unknown;
  pressSendError?: unknown;
  releaseError?: unknown;
  neutralizationError?: unknown;
};

/** Cancellation outcome for a positive-duration `Controller.press` call. */
export class TimedPressAbortError extends Error {
  readonly abortReason: unknown;
  override readonly cause: unknown;
  readonly pressSendError?: unknown;
  readonly releaseError?: unknown;
  neutralizationError?: unknown;

  constructor(options: TimedPressAbortErrorOptions) {
    super("Timed button press was aborted");
    this.name = "TimedPressAbortError";
    this.abortReason = options.abortReason;
    this.cause = options.cause;
    if (options.pressSendError !== undefined) {
      this.pressSendError = options.pressSendError;
    }
    if (options.releaseError !== undefined) {
      this.releaseError = options.releaseError;
    }
    if (options.neutralizationError !== undefined) {
      this.neutralizationError = options.neutralizationError;
    }
  }
}
