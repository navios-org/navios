# @navios/mail Specification

## Overview

`@navios/mail` is a flexible email sending library for the Navios framework. It provides a unified API for sending emails across multiple providers with template support and seamless integration into Navios's dependency injection system.

**Package:** `@navios/mail`
**Version:** 0.1.0
**License:** MIT
**Dependencies:** None (transports are optional)
**Peer Dependencies:** `@navios/core`, `@navios/di`
**Optional Dependencies:**
- `nodemailer` (^6.x) - SMTP transport
- `@sendgrid/mail` (^8.x) - SendGrid
- `@aws-sdk/client-ses` (^3.x) - AWS SES
- `resend` (^4.x) - Resend
- `postmark` (^4.x) - Postmark

---

## Core Concepts

### Architecture Overview

```
MailService
├── Core Operations
│   ├── send(message) - Send single email
│   ├── sendMany(messages) - Send multiple emails
│   ├── sendTemplate(template, data) - Send from template
│   └── queue(message) - Queue email for later
│
├── Transports
│   ├── SmtpTransport - SMTP via nodemailer
│   ├── SendGridTransport - SendGrid API
│   ├── SESTransport - AWS SES
│   ├── ResendTransport - Resend API
│   ├── PostmarkTransport - Postmark API
│   └── Custom transports via MailTransport interface
│
├── Templates
│   ├── HandlebarsAdapter - Handlebars templates
│   ├── MjmlAdapter - MJML responsive emails
│   ├── ReactEmailAdapter - React Email
│   └── Custom adapters via TemplateAdapter interface
│
└── Features
    ├── Attachments
    ├── Inline images
    ├── Queue integration
    └── Preview mode
```

### Key Principles

- **Unified API** - Same interface across all email providers
- **DI Integration** - Injectable service via @navios/di
- **Template Support** - Multiple template engines
- **Type-Safe** - Full TypeScript support
- **Queue Integration** - Async email sending

---

## Setup

### Provider Function

The mail service is configured using the `provideMailService()` function which returns an `InjectionToken`.

```typescript
import { provideMailService, SmtpTransport } from '@navios/mail'

// Basic SMTP configuration
const MailToken = provideMailService({
  transport: new SmtpTransport({
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  }),
  defaults: {
    from: 'noreply@example.com',
  },
})

// Async configuration
const MailToken = provideMailService(async () => {
  const config = await loadConfig()
  return {
    transport: new SendGridTransport({
      apiKey: config.sendgrid.apiKey,
    }),
    defaults: {
      from: config.email.defaultFrom,
    },
  }
})
```

### SendGrid Configuration

```typescript
import { provideMailService, SendGridTransport } from '@navios/mail'

const MailToken = provideMailService({
  transport: new SendGridTransport({
    apiKey: process.env.SENDGRID_API_KEY,
  }),
  defaults: {
    from: {
      email: 'hello@example.com',
      name: 'My App',
    },
  },
})
```

### AWS SES Configuration

```typescript
import { provideMailService, SESTransport } from '@navios/mail'

const MailToken = provideMailService({
  transport: new SESTransport({
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  }),
  defaults: {
    from: 'noreply@example.com',
  },
})
```

### Resend Configuration

```typescript
import { provideMailService, ResendTransport } from '@navios/mail'

const MailToken = provideMailService({
  transport: new ResendTransport({
    apiKey: process.env.RESEND_API_KEY,
  }),
  defaults: {
    from: 'noreply@example.com',
  },
})
```

### Module Registration

```typescript
import { Module } from '@navios/core'
import { provideMailService, SmtpTransport } from '@navios/mail'

const MailToken = provideMailService({
  transport: new SmtpTransport({
    host: 'smtp.example.com',
    port: 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  }),
})

@Module({
  providers: [MailToken],
})
class AppModule {}
```

---

## MailService API

### Injection

```typescript
import { Injectable, inject } from '@navios/di'
import { MailService } from '@navios/mail'

@Injectable()
class NotificationService {
  private mail = inject(MailService)
}
```

### send(message)

Sends a single email.

```typescript
// Simple text email
await this.mail.send({
  to: 'user@example.com',
  subject: 'Hello',
  text: 'Hello World!',
})

// HTML email
await this.mail.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to our app!</h1>',
})

// Full options
await this.mail.send({
  from: 'custom@example.com',
  to: ['user1@example.com', 'user2@example.com'],
  cc: 'manager@example.com',
  bcc: 'audit@example.com',
  replyTo: 'support@example.com',
  subject: 'Important Update',
  text: 'Plain text version',
  html: '<h1>HTML version</h1>',
  attachments: [
    {
      filename: 'report.pdf',
      content: pdfBuffer,
      contentType: 'application/pdf',
    },
  ],
  headers: {
    'X-Custom-Header': 'value',
  },
})
```

**Message Options:**

| Property      | Type                          | Description                    |
| ------------- | ----------------------------- | ------------------------------ |
| `from`        | `string \| Address`           | Sender address                 |
| `to`          | `string \| Address \| Array`  | Recipient(s)                   |
| `cc`          | `string \| Address \| Array`  | CC recipient(s)                |
| `bcc`         | `string \| Address \| Array`  | BCC recipient(s)               |
| `replyTo`     | `string \| Address`           | Reply-To address               |
| `subject`     | `string`                      | Email subject                  |
| `text`        | `string`                      | Plain text body                |
| `html`        | `string`                      | HTML body                      |
| `attachments` | `Attachment[]`                | File attachments               |
| `headers`     | `Record<string, string>`      | Custom headers                 |

**Returns:** `Promise<SendResult>`

### sendMany(messages)

Sends multiple emails (batched if supported by transport).

```typescript
await this.mail.sendMany([
  { to: 'user1@example.com', subject: 'Hello', text: 'Message 1' },
  { to: 'user2@example.com', subject: 'Hello', text: 'Message 2' },
  { to: 'user3@example.com', subject: 'Hello', text: 'Message 3' },
])
```

**Returns:** `Promise<SendResult[]>`

### sendTemplate(options)

Sends an email using a template.

```typescript
// With template name
await this.mail.sendTemplate({
  to: 'user@example.com',
  template: 'welcome',
  context: {
    name: 'John',
    activationLink: 'https://example.com/activate/123',
  },
})

// With inline template
await this.mail.sendTemplate({
  to: 'user@example.com',
  subject: 'Order Confirmation',
  template: {
    html: '<h1>Thank you, {{name}}!</h1><p>Order #{{orderId}}</p>',
  },
  context: {
    name: 'John',
    orderId: '12345',
  },
})
```

**Template Options:**

| Property   | Type                      | Description                    |
| ---------- | ------------------------- | ------------------------------ |
| `to`       | `string \| Address`       | Recipient                      |
| `template` | `string \| TemplateInline`| Template name or inline        |
| `context`  | `Record<string, unknown>` | Template variables             |
| `subject`  | `string`                  | Subject (optional if in template) |

**Returns:** `Promise<SendResult>`

### queue(message, options?)

Queues an email for asynchronous sending.

```typescript
// Queue for immediate async processing
await this.mail.queue({
  to: 'user@example.com',
  subject: 'Welcome',
  template: 'welcome',
  context: { name: 'John' },
})

// Queue with delay
await this.mail.queue(
  {
    to: 'user@example.com',
    subject: 'Follow-up',
    template: 'followup',
  },
  { delay: 24 * 60 * 60 * 1000 } // Send after 24 hours
)
```

**Returns:** `Promise<string>` - Queue job ID

---

## Templates

### Template Configuration

Configure template engine in provider.

```typescript
import { provideMailService, SmtpTransport, HandlebarsAdapter } from '@navios/mail'

const MailToken = provideMailService({
  transport: new SmtpTransport({ /* ... */ }),
  template: {
    adapter: new HandlebarsAdapter(),
    dir: './templates/email',
    options: {
      strict: true,
    },
  },
})
```

### HandlebarsAdapter

Uses Handlebars templates.

```typescript
import { HandlebarsAdapter } from '@navios/mail'

new HandlebarsAdapter({
  // Register custom helpers
  helpers: {
    uppercase: (str: string) => str.toUpperCase(),
    formatDate: (date: Date) => date.toLocaleDateString(),
  },
  // Register partials
  partials: {
    header: '<header>{{> @partial-block }}</header>',
    footer: '<footer>Copyright 2024</footer>',
  },
})
```

**Template Example (templates/email/welcome.hbs):**

```handlebars
{{!-- welcome.hbs --}}
<!DOCTYPE html>
<html>
<head>
  <title>Welcome!</title>
</head>
<body>
  {{> header}}
  <h1>Welcome, {{name}}!</h1>
  <p>Click below to activate your account:</p>
  <a href="{{activationLink}}">Activate Account</a>
  {{> footer}}
</body>
</html>
```

### MjmlAdapter

Uses MJML for responsive email templates.

```typescript
import { MjmlAdapter } from '@navios/mail'

new MjmlAdapter({
  // MJML options
  validationLevel: 'soft',
  minify: true,
  beautify: false,
})
```

**Template Example (templates/email/welcome.mjml):**

```xml
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Welcome, {{name}}!</mj-text>
        <mj-button href="{{activationLink}}">
          Activate Account
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

### ReactEmailAdapter

Uses React Email for component-based templates.

```typescript
import { ReactEmailAdapter } from '@navios/mail'

new ReactEmailAdapter({
  componentsDir: './emails',
})
```

**Template Example (emails/Welcome.tsx):**

```tsx
import { Html, Button, Text } from '@react-email/components'

interface WelcomeEmailProps {
  name: string
  activationLink: string
}

export default function WelcomeEmail({ name, activationLink }: WelcomeEmailProps) {
  return (
    <Html>
      <Text>Welcome, {name}!</Text>
      <Button href={activationLink}>
        Activate Account
      </Button>
    </Html>
  )
}
```

---

## Transports

### SmtpTransport

SMTP transport using nodemailer.

```typescript
import { SmtpTransport } from '@navios/mail'

new SmtpTransport({
  host: 'smtp.example.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'username',
    pass: 'password',
  },
  // Optional
  pool: true, // Use pooled connections
  maxConnections: 5,
  maxMessages: 100,
  rateLimit: 10, // Messages per second
})
```

### SendGridTransport

SendGrid API transport.

```typescript
import { SendGridTransport } from '@navios/mail'

new SendGridTransport({
  apiKey: process.env.SENDGRID_API_KEY,
  // Optional: Use dynamic template
  dynamicTemplateId: 'd-xxxxxxxxxxxx',
})
```

### SESTransport

AWS SES transport.

```typescript
import { SESTransport } from '@navios/mail'

new SESTransport({
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'AKIA...',
    secretAccessKey: 'secret',
  },
  // Optional
  configurationSetName: 'my-config-set',
  rateLimit: 14, // SES default is 14/second
})
```

### ResendTransport

Resend API transport.

```typescript
import { ResendTransport } from '@navios/mail'

new ResendTransport({
  apiKey: process.env.RESEND_API_KEY,
})
```

### PostmarkTransport

Postmark API transport.

```typescript
import { PostmarkTransport } from '@navios/mail'

new PostmarkTransport({
  serverToken: process.env.POSTMARK_SERVER_TOKEN,
  // Optional
  messageStream: 'outbound',
})
```

### Custom Transport

Implement the `MailTransport` interface.

```typescript
import { MailTransport, MailMessage, SendResult } from '@navios/mail'

class CustomTransport implements MailTransport {
  async send(message: MailMessage): Promise<SendResult> {
    // Implementation
    return {
      messageId: 'custom-id',
      accepted: [message.to],
      rejected: [],
    }
  }

  async sendMany(messages: MailMessage[]): Promise<SendResult[]> {
    return Promise.all(messages.map(m => this.send(m)))
  }

  async verify(): Promise<boolean> {
    // Test connection
    return true
  }

  async onServiceDestroy(): Promise<void> {
    // Cleanup
  }
}
```

---

## Attachments

### File Attachments

```typescript
await this.mail.send({
  to: 'user@example.com',
  subject: 'Documents',
  text: 'Please find attached documents.',
  attachments: [
    // From buffer
    {
      filename: 'report.pdf',
      content: pdfBuffer,
      contentType: 'application/pdf',
    },
    // From file path
    {
      filename: 'image.png',
      path: './files/image.png',
    },
    // From URL
    {
      filename: 'logo.png',
      path: 'https://example.com/logo.png',
    },
    // From stream
    {
      filename: 'data.csv',
      content: csvStream,
      contentType: 'text/csv',
    },
  ],
})
```

### Inline Images

```typescript
await this.mail.send({
  to: 'user@example.com',
  subject: 'Newsletter',
  html: '<img src="cid:logo" /><p>Welcome!</p>',
  attachments: [
    {
      filename: 'logo.png',
      path: './images/logo.png',
      cid: 'logo', // Content-ID for inline reference
    },
  ],
})
```

---

## Queue Integration

Integrate with @navios/queues for reliable email delivery.

```typescript
import { provideMailService, SmtpTransport } from '@navios/mail'

const MailToken = provideMailService({
  transport: new SmtpTransport({ /* ... */ }),
  queue: {
    enabled: true,
    name: 'email', // Queue name
    attempts: 3,   // Retry attempts
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
})
```

```typescript
// All sends are automatically queued
await this.mail.send({
  to: 'user@example.com',
  subject: 'Hello',
  text: 'This will be queued and processed async',
})

// Or explicitly queue with options
await this.mail.queue(
  {
    to: 'user@example.com',
    template: 'digest',
    context: { /* ... */ },
  },
  {
    delay: 60_000, // Wait 1 minute
    priority: 'high',
  }
)
```

---

## Preview Mode

Preview emails during development.

```typescript
import { provideMailService, PreviewTransport } from '@navios/mail'

const MailToken = provideMailService({
  transport: process.env.NODE_ENV === 'development'
    ? new PreviewTransport({
        dir: './email-previews',
        open: true, // Auto-open in browser
      })
    : new SmtpTransport({ /* ... */ }),
})
```

The `PreviewTransport` saves emails as HTML files and optionally opens them in your browser.

---

## Complete Example

```typescript
// mail.provider.ts
import { provideMailService, SmtpTransport, SendGridTransport, HandlebarsAdapter } from '@navios/mail'

export const MailToken = provideMailService({
  transport: process.env.NODE_ENV === 'production'
    ? new SendGridTransport({
        apiKey: process.env.SENDGRID_API_KEY!,
      })
    : new SmtpTransport({
        host: 'localhost',
        port: 1025, // Mailhog for development
      }),
  defaults: {
    from: {
      email: 'noreply@example.com',
      name: 'My App',
    },
  },
  template: {
    adapter: new HandlebarsAdapter(),
    dir: './templates/email',
  },
  queue: {
    enabled: process.env.NODE_ENV === 'production',
    name: 'email',
    attempts: 3,
  },
})
```

```typescript
// services/notification.service.ts
import { Injectable, inject } from '@navios/di'
import { MailService } from '@navios/mail'

@Injectable()
class NotificationService {
  private mail = inject(MailService)
  private userService = inject(UserService)

  async sendWelcomeEmail(userId: string): Promise<void> {
    const user = await this.userService.findById(userId)

    await this.mail.sendTemplate({
      to: user.email,
      template: 'welcome',
      context: {
        name: user.name,
        activationLink: `https://example.com/activate/${user.activationToken}`,
      },
    })
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    await this.mail.sendTemplate({
      to: email,
      template: 'password-reset',
      context: {
        resetLink: `https://example.com/reset-password/${token}`,
        expiresIn: '1 hour',
      },
    })
  }

  async sendOrderConfirmation(orderId: string): Promise<void> {
    const order = await this.orderService.findById(orderId)
    const user = await this.userService.findById(order.userId)

    await this.mail.sendTemplate({
      to: user.email,
      template: 'order-confirmation',
      context: {
        orderNumber: order.id,
        items: order.items,
        total: order.total,
        shippingAddress: order.shippingAddress,
      },
      attachments: [
        {
          filename: `invoice-${order.id}.pdf`,
          content: await this.invoiceService.generatePdf(order),
        },
      ],
    })
  }

  async sendBulkNewsletter(
    userIds: string[],
    content: { subject: string; body: string }
  ): Promise<void> {
    const users = await this.userService.findByIds(userIds)

    const messages = users.map(user => ({
      to: user.email,
      subject: content.subject,
      template: 'newsletter',
      context: {
        name: user.name,
        content: content.body,
        unsubscribeLink: `https://example.com/unsubscribe/${user.unsubscribeToken}`,
      },
    }))

    await this.mail.sendMany(messages)
  }
}
```

```typescript
// controllers/auth.controller.ts
import { Controller, Endpoint } from '@navios/core'
import { inject } from '@navios/di'
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

const requestPasswordReset = API.declareEndpoint({
  method: 'POST',
  path: '/auth/forgot-password',
  bodySchema: z.object({
    email: z.string().email(),
  }),
  responseSchema: z.object({
    message: z.string(),
  }),
})

@Controller()
class AuthController {
  private authService = inject(AuthService)
  private notificationService = inject(NotificationService)

  @Endpoint(requestPasswordReset)
  async forgotPassword(params: EndpointParams<typeof requestPasswordReset>) {
    const token = await this.authService.createPasswordResetToken(params.body.email)

    if (token) {
      // Don't await - send async to not leak timing information
      this.notificationService.sendPasswordReset(params.body.email, token)
    }

    // Always return success to prevent email enumeration
    return { message: 'If the email exists, a reset link will be sent.' }
  }
}
```

```typescript
// modules/app.module.ts
import { Module } from '@navios/core'
import { MailToken } from './mail.provider'

@Module({
  providers: [MailToken, NotificationService],
  controllers: [AuthController],
})
class AppModule {}
```

---

## API Reference Summary

### Provider Function

| Export             | Type     | Description                    |
| ------------------ | -------- | ------------------------------ |
| `provideMailService` | Function | Creates mail service provider |

### Service & Types

| Export              | Type      | Description                    |
| ------------------- | --------- | ------------------------------ |
| `MailService`       | Class     | Main mail service              |
| `SmtpTransport`     | Class     | SMTP transport                 |
| `SendGridTransport` | Class     | SendGrid transport             |
| `SESTransport`      | Class     | AWS SES transport              |
| `ResendTransport`   | Class     | Resend transport               |
| `PostmarkTransport` | Class     | Postmark transport             |
| `PreviewTransport`  | Class     | Development preview transport  |
| `HandlebarsAdapter` | Class     | Handlebars template adapter    |
| `MjmlAdapter`       | Class     | MJML template adapter          |
| `ReactEmailAdapter` | Class     | React Email adapter            |

### MailService Methods

| Method         | Return                | Description                    |
| -------------- | --------------------- | ------------------------------ |
| `send`         | `Promise<SendResult>` | Send single email              |
| `sendMany`     | `Promise<SendResult[]>`| Send multiple emails          |
| `sendTemplate` | `Promise<SendResult>` | Send using template            |
| `queue`        | `Promise<string>`     | Queue email for later          |
| `verify`       | `Promise<boolean>`    | Verify transport connection    |

### Configuration Options

| Property    | Type              | Description                    |
| ----------- | ----------------- | ------------------------------ |
| `transport` | `MailTransport`   | Email transport                |
| `defaults`  | `MailDefaults`    | Default mail options           |
| `template`  | `TemplateConfig`  | Template configuration         |
| `queue`     | `QueueConfig`     | Queue integration config       |
