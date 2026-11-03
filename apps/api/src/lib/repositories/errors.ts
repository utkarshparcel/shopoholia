/** Thrown by placeOrder when the cart lines it was given are no longer in the cart as read. */
export class CartChangedError extends Error {
  constructor(message = "The cart changed during checkout") {
    super(message);
    this.name = "CartChangedError";
  }
}

/** Thrown by placeOrder when the idempotency key belongs to another user's order. */
export class IdempotencyKeyConflictError extends Error {
  constructor(message = "Idempotency key already used by another order") {
    super(message);
    this.name = "IdempotencyKeyConflictError";
  }
}

/** Thrown when a coin spend would take a user's balance below zero. */
export class InsufficientCoinsError extends Error {
  constructor(message = "Insufficient coin balance") {
    super(message);
    this.name = "InsufficientCoinsError";
  }
}
