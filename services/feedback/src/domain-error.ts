export class FeedbackDomainError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "FeedbackDomainError";
    this.statusCode = statusCode;
  }
}
