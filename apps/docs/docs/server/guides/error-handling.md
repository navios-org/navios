---
sidebar_position: 4
title: Error Handling
---

# Error Handling

Navios provides built-in exception classes for common HTTP errors and automatically converts exceptions to appropriate HTTP responses.

## Built-in Exceptions

| Exception | Status Code | Description |
|-----------|-------------|-------------|
| `BadRequestException` | 400 | Invalid request data |
| `UnauthorizedException` | 401 | Missing or invalid authentication |
| `ForbiddenException` | 403 | Authenticated but not authorized |
| `NotFoundException` | 404 | Resource not found |
| `ConflictException` | 409 | Resource conflict |
| `InternalServerErrorException` | 500 | Server error |

## Using Exceptions

Import and throw exceptions in your handlers:

```typescript
import {
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
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

## Exception Messages

Pass a custom message to any exception:

```typescript
throw new NotFoundException('User not found')
throw new BadRequestException('Invalid email format')
throw new ForbiddenException('You do not have permission to access this resource')
```

## HttpException Base Class

Create exceptions with custom status codes:

```typescript
import { HttpException } from '@navios/core'

// Custom status code
throw new HttpException(418, "I'm a teapot")

// Too Many Requests
throw new HttpException(429, 'Rate limit exceeded')

// Service Unavailable
throw new HttpException(503, 'Service temporarily unavailable')
```

## Validation Errors

Zod validation errors are automatically converted to 400 Bad Request responses with details:

```typescript
// Endpoint schema
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  dataSchema: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email'),
    age: z.number().min(0, 'Age must be positive'),
  }),
})

// Invalid request { name: "", email: "invalid", age: -1 }
// Response: 400 Bad Request with validation details
```

## Error Response Format

Exception responses follow a consistent format:

```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

## Handling Errors in Services

Let exceptions bubble up from services:

```typescript
@Injectable()
class UserService {
  private db = inject(DatabaseService)

  async findById(id: string) {
    const user = await this.db.users.findUnique({ where: { id } })

    if (!user) {
      throw new NotFoundException(`User ${id} not found`)
    }

    return user
  }

  async update(id: string, data: UpdateUserDto) {
    const user = await this.findById(id) // Throws if not found

    return this.db.users.update({
      where: { id },
      data,
    })
  }
}
```

## Custom Exception Classes

Create domain-specific exceptions:

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

class InsufficientFundsException extends BadRequestException {
  constructor() {
    super('Insufficient funds for this transaction')
  }
}

// Usage
throw new UserNotFoundException('123')
throw new EmailAlreadyExistsException('user@example.com')
```

## Catching and Re-throwing

Catch external errors and convert to HTTP exceptions:

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
      if (error.code === 'insufficient_funds') {
        throw new BadRequestException('Insufficient funds')
      }
      throw new InternalServerErrorException('Payment processing failed')
    }
  }
}
```

## Unhandled Errors

Unhandled exceptions are caught and converted to 500 Internal Server Error:

```typescript
@Endpoint(getData)
async getData() {
  // If this throws an unexpected error
  const data = await this.externalApi.fetch()

  // It becomes a 500 response:
  // { statusCode: 500, message: "Internal Server Error" }
}
```

In development, stack traces may be included. In production, internal error details are hidden for security.
