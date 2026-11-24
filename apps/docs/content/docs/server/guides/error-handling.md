---
sidebar_position: 5
title: Error Handling
---

# Error Handling

Navios provides built-in exception classes for common HTTP errors. Exceptions are automatically converted to appropriate HTTP responses.

## Built-in Exceptions

| Exception | Status Code | Use Case |
|-----------|-------------|----------|
| `BadRequestException` | 400 | Invalid request data |
| `UnauthorizedException` | 401 | Missing or invalid authentication |
| `ForbiddenException` | 403 | Authenticated but not authorized |
| `NotFoundException` | 404 | Resource not found |
| `ConflictException` | 409 | Resource conflict (e.g., duplicate) |
| `InternalServerErrorException` | 500 | Server error |

## Using Exceptions

Import and throw exceptions in handlers or services:

```typescript
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@navios/core'

@Controller()
class UserController {
  private userService = inject(UserService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    const user = await this.userService.findById(params.urlParams.userId)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Endpoint(createUser)
  async createUser(params: EndpointParams<typeof createUser>) {
    const existing = await this.userService.findByEmail(params.data.email)
    if (existing) {
      throw new ConflictException('Email already registered')
    }
    return this.userService.create(params.data)
  }
}
```

## Custom Status Codes

Use `HttpException` for status codes not covered by built-in exceptions:

```typescript
import { HttpException } from '@navios/core'

// Too Many Requests
throw new HttpException(429, 'Rate limit exceeded')

// Service Unavailable
throw new HttpException(503, 'Service temporarily unavailable')

// I'm a teapot
throw new HttpException(418, "I'm a teapot")
```

## Error Response Format

Navios uses **RFC 7807 Problem Details** format for standardized error responses. This provides a consistent, machine-readable error format across all error types.

### HttpException Responses

`HttpException` and its subclasses (like `NotFoundException`, `BadRequestException`, etc.) maintain backward compatibility and return the original format:

```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

### RFC 7807 Problem Details

For framework-level errors (validation errors, guard rejections, unhandled errors, not found routes), Navios returns RFC 7807 Problem Details:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Route [GET] /api/users/999 not found"
}
```

The response includes:
- `type` - URI reference identifying the problem type (defaults to `"about:blank"`)
- `title` - Short, human-readable summary of the problem
- `status` - HTTP status code
- `detail` - Human-readable explanation specific to this occurrence
- `errors` - (Validation errors only) Structured validation error details

All Problem Details responses include the `Content-Type: application/problem+json` header.

## Validation Errors

Zod validation errors from endpoint schemas automatically return 400 Bad Request with RFC 7807 Problem Details format:

```typescript
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email'),
  }),
})

// Invalid request { name: "", email: "invalid" }
// Returns: 400 Bad Request with Problem Details
```

Validation error responses include structured error details:

```json
{
  "type": "about:blank",
  "title": "Validation Error",
  "status": 400,
  "detail": "Request validation failed",
  "errors": {
    "name": {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "String must contain at least 1 character(s)",
      "path": ["name"]
    },
    "email": {
      "code": "invalid_string",
      "validation": "email",
      "message": "Invalid email",
      "path": ["email"]
    }
  }
}
```

## Error Handling in Services

Let exceptions bubble up from services - they'll be caught and converted:

```typescript
@Injectable()
class UserService {
  async findById(id: string) {
    const user = await this.db.users.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException(`User ${id} not found`)
    }
    return user
  }

  async update(id: string, data: UpdateUserDto) {
    const user = await this.findById(id) // Throws if not found
    return this.db.users.update({ where: { id }, data })
  }
}
```

## Custom Exception Classes

Create domain-specific exceptions for clearer code:

```typescript
class UserNotFoundException extends NotFoundException {
  constructor(userId: string) {
    super(`User ${userId} not found`)
  }
}

class EmailAlreadyExistsException extends ConflictException {
  constructor(email: string) {
    super(`Email ${email} is already registered`)
  }
}

// Usage
throw new UserNotFoundException('123')
throw new EmailAlreadyExistsException('user@example.com')
```

## Catching External Errors

Convert external errors to HTTP exceptions:

```typescript
@Injectable()
class PaymentService {
  async processPayment(amount: number) {
    try {
      return await this.stripeClient.charge(amount)
    } catch (error) {
      if (error.code === 'card_declined') {
        throw new BadRequestException('Card was declined')
      }
      throw new InternalServerErrorException('Payment processing failed')
    }
  }
}
```

## Unhandled Errors

Unhandled exceptions become 500 Internal Server Error with RFC 7807 Problem Details format:

```json
{
  "type": "about:blank",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred"
}
```

In development, error messages may include more detail. In production, internal details are hidden for security.

## Custom Error Responders

Navios provides a flexible error responder system that you can customize. All error responders implement the `ErrorResponder` interface and are registered with dependency injection.

### Overriding Default Responders

You can override any default responder by providing a custom implementation with higher priority:

```typescript
import {
  Injectable,
  NotFoundResponderToken,
  type ErrorResponder,
  type ErrorResponse,
} from '@navios/core'

@Injectable({
  token: NotFoundResponderToken,
  priority: 0, // Higher than default -10
})
export class CustomNotFoundResponder implements ErrorResponder {
  getResponse(error: unknown, description?: string): ErrorResponse {
    return {
      statusCode: 404,
      payload: {
        type: 'https://api.myapp.com/errors/not-found',
        title: 'Resource Not Found',
        status: 404,
        detail: description ?? 'The requested resource was not found',
      },
      headers: {
        'Content-Type': 'application/problem+json',
      },
    }
  }
}
```

### Available Responder Tokens

- `NotFoundResponderToken` - Handles 404 Not Found errors
- `ForbiddenResponderToken` - Handles 403 Forbidden errors (guard rejections)
- `InternalServerErrorResponderToken` - Handles 500 Internal Server errors
- `ValidationErrorResponderToken` - Handles 400 Validation errors

### Using ErrorResponseProducerService

For custom error handling in adapters or services, you can use `ErrorResponseProducerService`:

```typescript
import {
  Injectable,
  ErrorResponseProducerService,
  FrameworkError,
} from '@navios/core'

@Injectable()
export class CustomService {
  private errorProducer = inject(ErrorResponseProducerService)

  handleError(error: unknown) {
    if (error instanceof ZodError) {
      return this.errorProducer.respond(
        FrameworkError.ValidationError,
        error,
      )
    }
    return this.errorProducer.handleUnknown(error)
  }
}
```

The service provides convenience methods:
- `notFound(error, description?)` - Produce 404 response
- `forbidden(error, description?)` - Produce 403 response
- `internalServerError(error, description?)` - Produce 500 response
- `validationError(error, description?)` - Produce 400 response
- `handleUnknown(error, description?)` - Fallback for unknown errors
