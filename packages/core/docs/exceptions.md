# Exception Handling

Navios provides a comprehensive exception handling system that allows you to throw HTTP exceptions and handle errors in a consistent manner across your application.

## Built-in HTTP Exceptions

Navios includes several built-in HTTP exception classes that correspond to common HTTP status codes:

### BadRequestException (400)

### UnauthorizedException (401)

### ForbiddenException (403)

### NotFoundException (404)

### ConflictException (409)

### InternalServerErrorException (500)

## Base HttpException

All HTTP exceptions extend the base `HttpException` class:

```typescript
import { HttpException } from '@navios/core'

// Create custom exception
export class CustomException extends HttpException {
  constructor(message: string) {
    super(message, 418) // I'm a teapot
  }
}

// Or throw HttpException directly
@Controller()
export class UserController {
  @Endpoint(getUserByIdEndpoint)
  async getUserById({ params }: { params: { id: string } }) {
    if (!this.isValidId(params.id)) {
      throw new HttpException('Invalid user ID format', 422)
    }

    return this.userService.findById(params.id)
  }
}
```

## Exception with Additional Data

You can include additional data in exceptions:

```typescript
import { BadRequestException } from '@navios/core'

@Controller()
export class UserController {
  @Endpoint(createUserEndpoint)
  async createUser({ body }: { body: CreateUserDto }) {
    const validationErrors = await this.validateUser(body)

    if (validationErrors.length > 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validationErrors,
        timestamp: new Date().toISOString(),
      })
    }

    return this.userService.create(body)
  }

  private async validateUser(user: CreateUserDto) {
    const errors: string[] = []

    if (!user.email) {
      errors.push('Email is required')
    } else if (!this.isValidEmail(user.email)) {
      errors.push('Invalid email format')
    }

    if (!user.password || user.password.length < 8) {
      errors.push('Password must be at least 8 characters')
    }

    return errors
  }
}
```

## Custom Exceptions

Create domain-specific exceptions by extending HTTP exceptions:

```typescript
import { BadRequestException, ConflictException, NotFoundException } from '@navios/core'

// Domain-specific exceptions
export class UserNotFoundException extends NotFoundException {
  constructor(userId: string) {
    super(`User with ID ${userId} not found`)
  }
}

export class InvalidEmailException extends BadRequestException {
  constructor(email: string) {
    super({
      message: 'Invalid email address',
      email,
      code: 'INVALID_EMAIL',
    })
  }
}

export class EmailAlreadyExistsException extends ConflictException {
  constructor(email: string) {
    super({
      message: 'Email address already exists',
      email,
      code: 'EMAIL_EXISTS',
    })
  }
}
```

## Async Exception Handling

Handle exceptions in async operations:

```typescript
@Controller()
export class UserController {
  private logger = inject(Logger, { context: 'UserController' })

  @Endpoint(sendEmailEndpoint)
  async sendEmail({ params }: { params: { id: string } }) {
    try {
      const user = await this.userService.findById(params.id)

      if (!user) {
        throw new NotFoundException(`User with ID ${params.id} not found`)
      }

      await this.emailService.sendWelcomeEmail(user.email)

      return { message: 'Email sent successfully' }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error // Re-throw HTTP exceptions
      }

      // Log unexpected errors
      this.logger.error('Failed to send email', {
        userId: params.id,
        error: error.message,
        stack: error.stack,
      })

      throw new InternalServerErrorException('Failed to send email')
    }
  }
}
```

## Exception Response Format

### HttpException Response Format

`HttpException` and its subclasses (like `NotFoundException`, `BadRequestException`, etc.) maintain backward compatibility and return the original format:

```json
{
  "statusCode": 404,
  "message": "User with ID 123 not found",
  "timestamp": "2023-10-01T12:00:00.000Z",
  "path": "/users/123"
}
```

For exceptions with additional data:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "INVALID_EMAIL"
    }
  ],
  "timestamp": "2023-10-01T12:00:00.000Z",
  "path": "/users"
}
```

### RFC 7807 Problem Details Format

Framework-level errors (validation errors, guard rejections, not found routes, unhandled errors) use **RFC 7807 Problem Details** format for standardized, machine-readable error responses:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Route [GET] /api/users/999 not found"
}
```

Validation errors include structured error details:

```json
{
  "type": "about:blank",
  "title": "Validation Error",
  "status": 400,
  "detail": "Request validation failed",
  "errors": {
    "email": {
      "code": "invalid_string",
      "validation": "email",
      "message": "Invalid email",
      "path": ["email"]
    }
  }
}
```

All Problem Details responses include the `Content-Type: application/problem+json` header. For more information on customizing error responders, see the [Error Handling Guide](../../../apps/docs/docs/server/guides/error-handling.md).

## Best Practices

### 1. Use Specific Exceptions

Use the most specific exception type for better error handling:

```typescript
// ✅ Good - Specific exception
if (!user) {
  throw new NotFoundException(`User with ID ${id} not found`)
}

// ❌ Avoid - Generic exception
if (!user) {
  throw new HttpException('User not found', 404)
}
```

### 2. Include Context

Provide helpful context in exception messages:

```typescript
// ✅ Good - Includes context
throw new BadRequestException({
  message: 'Invalid user data',
  field: 'email',
  value: email,
  reason: 'Email format is invalid',
})

// ❌ Avoid - Vague message
throw new BadRequestException('Invalid data')
```

### 3. Log Appropriately

Log exceptions at appropriate levels:

```typescript
@Controller()
export class UserController {
  private logger = inject(Logger, { context: 'UserController' })

  async getUser(id: string) {
    try {
      return await this.userService.findById(id)
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Don't log client errors as errors
        this.logger.debug(`User not found: ${id}`)
        throw error
      }

      // Log server errors
      this.logger.error('Failed to get user', {
        userId: id,
        error: error.message,
        stack: error.stack,
      })

      throw new InternalServerErrorException('Failed to retrieve user')
    }
  }
}
```

### 4. Don't Expose Internal Details

Don't expose sensitive information in exception messages:

```typescript
// ✅ Good - Safe message
throw new InternalServerErrorException('Database connection failed')

// ❌ Avoid - Exposes sensitive info
throw new InternalServerErrorException(
  `Database connection failed: ${databaseUrl} with credentials ${username}:${password}`,
)
```

### 5. Create Domain-Specific Exceptions

Create exceptions that match your domain:

```typescript
// User domain exceptions
export class UserNotFoundException extends NotFoundException {
  constructor(userId: string) {
    super(`User with ID ${userId} not found`)
  }
}

export class UserEmailAlreadyExistsException extends ConflictException {
  constructor(email: string) {
    super(`User with email ${email} already exists`)
  }
}

// Order domain exceptions
export class OrderNotFoundException extends NotFoundException {
  constructor(orderId: string) {
    super(`Order with ID ${orderId} not found`)
  }
}

export class InsufficientInventoryException extends ConflictException {
  constructor(productId: string, requested: number, available: number) {
    super({
      message: 'Insufficient inventory',
      productId,
      requested,
      available,
    })
  }
}
```
