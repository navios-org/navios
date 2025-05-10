export class HttpException {
  constructor(
    public readonly statusCode: number,
    public readonly response: string | object,
    public readonly error?: Error,
  ) {}
}
