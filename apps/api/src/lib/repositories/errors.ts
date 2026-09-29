/** Thrown when a coin spend would take a user's balance below zero. */
export class InsufficientCoinsError extends Error {
  constructor(message = "Insufficient coin balance") {
    super(message);
    this.name = "InsufficientCoinsError";
  }
}
