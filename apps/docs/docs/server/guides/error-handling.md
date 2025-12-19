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

Exceptions produce consistent JSON responses:

```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

## Validation Errors

Zod validation errors from endpoint schemas automatically return 400 Bad Request:

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
// Returns: 400 Bad Request with validation details
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

Unhandled exceptions become 500 Internal Server Error. In development, stack traces may be shown. In production, internal details are hidden:

```json
{
  "statusCode": 500,
  "message": "Internal Server Error"
}
```
