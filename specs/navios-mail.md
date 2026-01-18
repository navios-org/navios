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
MailModule
├── MailService (main service)
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
    └── Preview mode (development)
```

### Key Principles

- **Unified API** - Same interface across all providers
- **DI Integration** - Injectable service via @navios/di
- **Template Support** - Multiple template engines
- **Type-Safe** - Full TypeScript support
- **Queue Integration** - Async email delivery via @navios/queues

---

## Setup

### Basic Configuration (SMTP)

```typescript
import { Module } from '@navios/core'
import { MailModule, SmtpTransport } from '@navios/mail'

@Module({
  imports: [
    MailModule.register({
      transport: new SmtpTransport({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'user@example.com',
          pass: 'password',
        },
      }),
      defaults: {
        from: '"My App" <noreply@example.com>',
      },
    }),
  ],
})
class AppModule {}
```

### SendGrid Configuration

```typescript
import { Module } from '@navios/core'
import { MailModule, SendGridTransport } from '@navios/mail'

@Module({
  imports: [
    MailModule.register({
      transport: new SendGridTransport({
        apiKey: process.env.SENDGRID_API_KEY,
      }),
      defaults: {
        from: 'noreply@example.com',
      },
    }),
  ],
})
class AppModule {}
```

### AWS SES Configuration

```typescript
import { Module } from '@navios/core'
import { MailModule, SESTransport } from '@navios/mail'

@Module({
  imports: [
    MailModule.register({
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
    }),
  ],
})
class AppModule {}
```

### Resend Configuration

```typescript
import { Module } from '@navios/core'
import { MailModule, ResendTransport } from '@navios/mail'

@Module({
  imports: [
    MailModule.register({
      transport: new ResendTransport({
        apiKey: process.env.RESEND_API_KEY,
      }),
      defaults: {
        from: 'My App <noreply@example.com>',
      },
    }),
  ],
})
class AppModule {}
```

### With Templates

```typescript
import { Module } from '@navios/core'
import { MailModule, SmtpTransport, HandlebarsAdapter } from '@navios/mail'

@Module({
  imports: [
    MailModule.register({
      transport: new SmtpTransport({
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user', pass: 'pass' },
      }),
      defaults: {
        from: 'noreply@example.com',
      },
      template: {
        adapter: new HandlebarsAdapter(),
        dir: './templates/email',
        options: {
          strict: true,
        },
      },
    }),
  ],
})
class AppModule {}
```

### Async Configuration

```typescript
import { Module } from '@navios/core'
import { MailModule, SendGridTransport } from '@navios/mail'
import { inject } from '@navios/di'

@Module({
  imports: [
    MailModule.registerAsync({
      useFactory: async () => {
        const config = await inject(ConfigService)
        return {
          transport: new SendGridTransport({
            apiKey: config.sendgrid.apiKey,
          }),
          defaults: {
            from: config.mail.from,
          },
        }
      },
    }),
  ],
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
// Basic email
await this.mail.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  text: 'Welcome to our app!',
})

// HTML email
await this.mail.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
})

// Multiple recipients
await this.mail.send({
  to: ['user1@example.com', 'user2@example.com'],
  cc: 'manager@example.com',
  bcc: 'archive@example.com',
  subject: 'Team Update',
  html: '<p>Here is the weekly update...</p>',
})

// With attachments
await this.mail.send({
  to: 'user@example.com',
  subject: 'Your Report',
  html: '<p>Please find your report attached.</p>',
  attachments: [
    {
      filename: 'report.pdf',
      content: pdfBuffer,
      contentType: 'application/pdf',
    },
    {
      filename: 'data.csv',
      path: './exports/data.csv', // File path
    },
    {
      filename: 'image.png',
      content: imageBuffer,
      cid: 'logo', // For inline images: <img src="cid:logo">
    },
  ],
})

// With reply-to
await this.mail.send({
  to: 'user@example.com',
  replyTo: 'support@example.com',
  subject: 'Support Request Received',
  text: 'We received your request...',
})
```

**Message Options:**

| Property      | Type                      | Description                    |
| ------------- | ------------------------- | ------------------------------ |
| `to`          | `string \| string[]`      | Recipient(s)                   |
| `cc`          | `string \| string[]`      | CC recipient(s)                |
| `bcc`         | `string \| string[]`      | BCC recipient(s)               |
| `from`        | `string`                  | Sender (overrides default)     |
| `replyTo`     | `string`                  | Reply-to address               |
| `subject`     | `string`                  | Email subject                  |
| `text`        | `string`                  | Plain text body                |
| `html`        | `string`                  | HTML body                      |
| `attachments` | `Attachment[]`            | File attachments               |
| `headers`     | `Record<string, string>`  | Custom headers                 |
| `priority`    | `'high' \| 'normal' \| 'low'` | Email priority            |

**Returns:** `Promise<SendResult>`

### sendMany(messages)

Sends multiple emails (batch send).

```typescript
const results = await this.mail.sendMany([
  {
    to: 'user1@example.com',
    subject: 'Your Order #1234',
    html: '<p>Order confirmed!</p>',
  },
  {
    to: 'user2@example.com',
    subject: 'Your Order #5678',
    html: '<p>Order confirmed!</p>',
  },
])

// Check results
for (const result of results) {
  if (result.success) {
    console.log(`Sent to ${result.to}`)
  } else {
    console.error(`Failed: ${result.error}`)
  }
}
```

**Returns:** `Promise<SendResult[]>`

### sendTemplate(template, context)

Sends an email using a template.

```typescript
// Using template file
await this.mail.sendTemplate({
  to: 'user@example.com',
  subject: 'Welcome, {{name}}!',
  template: 'welcome', // templates/email/welcome.hbs
  context: {
    name: 'John',
    activationLink: 'https://example.com/activate/abc123',
  },
})

// With layout
await this.mail.sendTemplate({
  to: 'user@example.com',
  subject: 'Order Confirmation',
  template: 'order-confirmation',
  layout: 'transactional', // templates/email/layouts/transactional.hbs
  context: {
    orderNumber: '12345',
    items: [
      { name: 'Product A', price: 29.99 },
      { name: 'Product B', price: 49.99 },
    ],
    total: 79.98,
  },
})
```

**Template Options:**

| Property   | Type     | Description                    |
| ---------- | -------- | ------------------------------ |
| `template` | `string` | Template name (without extension) |
| `layout`   | `string` | Layout template name           |
| `context`  | `object` | Template variables             |

### queue(message)

Queues an email for async delivery (requires @navios/queues).

```typescript
// Queue for later delivery
await this.mail.queue({
  to: 'user@example.com',
  subject: 'Newsletter',
  template: 'newsletter',
  context: { /* ... */ },
})

// With delay
await this.mail.queue({
  to: 'user@example.com',
  subject: 'Reminder',
  template: 'reminder',
  context: { /* ... */ },
}, {
  delay: 3600_000, // Send in 1 hour
})

// With priority
await this.mail.queue({
  to: 'user@example.com',
  subject: 'Password Reset',
  template: 'password-reset',
  context: { /* ... */ },
}, {
  priority: 'high',
})
```

---

## Template Adapters

### HandlebarsAdapter

Handlebars template engine.

```typescript
import { MailModule, HandlebarsAdapter } from '@navios/mail'

MailModule.register({
  transport: /* ... */,
  template: {
    adapter: new HandlebarsAdapter({
      // Register helpers
      helpers: {
        formatDate: (date: Date) => date.toLocaleDateString(),
        formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
      },
      // Register partials directory
      partialsDir: './templates/email/partials',
    }),
    dir: './templates/email',
  },
})
```

**Template Example (`templates/email/welcome.hbs`):**

```handlebars
<!DOCTYPE html>
<html>
<head>
  <title>Welcome</title>
</head>
<body>
  <h1>Welcome, {{name}}!</h1>
  <p>Thanks for joining us on {{formatDate createdAt}}.</p>
  <a href="{{activationLink}}">Activate your account</a>
  {{> footer}}
</body>
</html>
```

### MjmlAdapter

MJML for responsive emails.

```typescript
import { MailModule, MjmlAdapter } from '@navios/mail'

MailModule.register({
  transport: /* ... */,
  template: {
    adapter: new MjmlAdapter({
      validationLevel: 'soft',
      minify: true,
    }),
    dir: './templates/email',
  },
})
```

**Template Example (`templates/email/welcome.mjml`):**

```xml
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>
          <h1>Welcome, {{name}}!</h1>
        </mj-text>
        <mj-button href="{{activationLink}}">
          Activate Account
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

### ReactEmailAdapter

React Email for component-based emails.

```typescript
import { MailModule, ReactEmailAdapter } from '@navios/mail'

MailModule.register({
  transport: /* ... */,
  template: {
    adapter: new ReactEmailAdapter(),
    dir: './templates/email',
  },
})
```

**Template Example (`templates/email/welcome.tsx`):**

```tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components'

interface WelcomeEmailProps {
  name: string
  activationLink: string
}

export default function WelcomeEmail({ name, activationLink }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Text>Welcome, {name}!</Text>
          <Button href={activationLink}>
            Activate Account
          </Button>
        </Container>
      </Body>
    </Html>
  )
}
```

### Custom Template Adapter

Implement the `TemplateAdapter` interface.

```typescript
import { TemplateAdapter, TemplateOptions } from '@navios/mail'

class CustomTemplateAdapter implements TemplateAdapter {
  async compile(
    template: string,
    context: Record<string, unknown>,
    options?: TemplateOptions
  ): Promise<{ html: string; text?: string }> {
    // Compile template with context
    const html = /* your compilation logic */
    const text = /* optional text version */

    return { html, text }
  }
}
```

---

## Transports

### SmtpTransport

Standard SMTP via nodemailer.

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

SendGrid API.

```typescript
import { SendGridTransport } from '@navios/mail'

new SendGridTransport({
  apiKey: 'SG.xxxxx',
  // Optional: Use dynamic templates
  templates: {
    welcome: 'd-xxxxx', // SendGrid template ID
    'password-reset': 'd-yyyyy',
  },
})

// Using SendGrid dynamic templates
await this.mail.send({
  to: 'user@example.com',
  templateId: 'd-xxxxx',
  dynamicTemplateData: {
    name: 'John',
    activationLink: 'https://...',
  },
})
```

### SESTransport

AWS Simple Email Service.

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
  tags: [
    { Name: 'app', Value: 'my-app' },
  ],
})
```

### ResendTransport

Resend API.

```typescript
import { ResendTransport } from '@navios/mail'

new ResendTransport({
  apiKey: 're_xxxxx',
})
```

### PostmarkTransport

Postmark API.

```typescript
import { PostmarkTransport } from '@navios/mail'

new PostmarkTransport({
  serverToken: 'xxxxx',
  // Optional: Use Postmark templates
  templates: {
    welcome: 12345, // Postmark template ID
  },
})
```

### Custom Transport

Implement the `MailTransport` interface.

```typescript
import { MailTransport, MailMessage, SendResult } from '@navios/mail'

class CustomTransport implements MailTransport {
  async send(message: MailMessage): Promise<SendResult> {
    // Send email via your provider
    const response = await myProvider.send({
      to: message.to,
      subject: message.subject,
      html: message.html,
    })

    return {
      success: true,
      messageId: response.id,
      to: message.to,
    }
  }

  async sendMany(messages: MailMessage[]): Promise<SendResult[]> {
    return Promise.all(messages.map(m => this.send(m)))
  }

  // Lifecycle
  async onModuleDestroy?(): Promise<void> {
    // Cleanup connections
  }
}
```

---

## Queue Integration

Integrate with @navios/queues for async email delivery.

### Configuration

```typescript
import { Module } from '@navios/core'
import { MailModule, SmtpTransport } from '@navios/mail'
import { QueueModule } from '@navios/queues'

@Module({
  imports: [
    QueueModule.register({ /* ... */ }),
    MailModule.register({
      transport: new SmtpTransport({ /* ... */ }),
      queue: {
        name: 'emails', // Queue name
        attempts: 3,    // Retry attempts
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }),
  ],
})
class AppModule {}
```

### Usage

```typescript
@Injectable()
class NewsletterService {
  private mail = inject(MailService)

  async sendNewsletter(subscribers: string[], content: NewsletterContent) {
    // Queue all emails
    for (const email of subscribers) {
      await this.mail.queue({
        to: email,
        subject: content.subject,
        template: 'newsletter',
        context: content,
      })
    }
  }
}
```

---

## Development Mode

Preview emails during development.

### Preview Transport

```typescript
import { Module } from '@navios/core'
import { MailModule, PreviewTransport } from '@navios/mail'

@Module({
  imports: [
    MailModule.register({
      transport: process.env.NODE_ENV === 'development'
        ? new PreviewTransport({
            dir: './email-previews', // Save emails as HTML files
            open: true, // Auto-open in browser
          })
        : new SmtpTransport({ /* production config */ }),
    }),
  ],
})
class AppModule {}
```

### Console Transport

Log emails to console (for testing).

```typescript
import { MailModule, ConsoleTransport } from '@navios/mail'

MailModule.register({
  transport: new ConsoleTransport({
    colors: true,
    includeHtml: false, // Just show subject and recipients
  }),
})
```

---

## Complete Example

```typescript
// mail.config.ts
import { MailModule, SendGridTransport, HandlebarsAdapter } from '@navios/mail'

export const mailConfig = MailModule.register({
  transport: new SendGridTransport({
    apiKey: process.env.SENDGRID_API_KEY!,
  }),
  defaults: {
    from: '"My App" <noreply@myapp.com>',
  },
  template: {
    adapter: new HandlebarsAdapter({
      helpers: {
        formatDate: (date: Date) => date.toLocaleDateString(),
        formatCurrency: (n: number) => `$${n.toFixed(2)}`,
      },
    }),
    dir: './templates/email',
  },
  queue: {
    name: 'emails',
    attempts: 3,
  },
})
```

```typescript
// services/email.service.ts
import { Injectable, inject } from '@navios/di'
import { MailService } from '@navios/mail'

@Injectable()
class EmailService {
  private mail = inject(MailService)

  async sendWelcome(user: User): Promise<void> {
    await this.mail.sendTemplate({
      to: user.email,
      subject: `Welcome to MyApp, ${user.name}!`,
      template: 'welcome',
      context: {
        name: user.name,
        activationLink: `https://myapp.com/activate/${user.activationToken}`,
      },
    })
  }

  async sendPasswordReset(user: User, token: string): Promise<void> {
    await this.mail.sendTemplate({
      to: user.email,
      subject: 'Reset Your Password',
      template: 'password-reset',
      context: {
        name: user.name,
        resetLink: `https://myapp.com/reset-password/${token}`,
        expiresIn: '1 hour',
      },
    })
  }

  async sendOrderConfirmation(order: Order): Promise<void> {
    await this.mail.sendTemplate({
      to: order.user.email,
      subject: `Order Confirmation #${order.number}`,
      template: 'order-confirmation',
      context: {
        orderNumber: order.number,
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        shippingAddress: order.shippingAddress,
        estimatedDelivery: order.estimatedDelivery,
      },
      attachments: [
        {
          filename: `invoice-${order.number}.pdf`,
          content: await this.generateInvoicePdf(order),
          contentType: 'application/pdf',
        },
      ],
    })
  }

  async sendBulkNewsletter(
    subscribers: string[],
    newsletter: Newsletter
  ): Promise<void> {
    for (const email of subscribers) {
      await this.mail.queue({
        to: email,
        subject: newsletter.subject,
        template: 'newsletter',
        context: {
          content: newsletter.content,
          unsubscribeLink: `https://myapp.com/unsubscribe/${email}`,
        },
      })
    }
  }
}
```

```typescript
// templates/email/welcome.hbs
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to MyApp</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #4F46E5; color: white; padding: 20px; text-align: center;">
    <h1>Welcome to MyApp!</h1>
  </div>

  <div style="padding: 20px;">
    <p>Hi {{name}},</p>

    <p>Thanks for signing up! We're excited to have you on board.</p>

    <p>To get started, please activate your account:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="{{activationLink}}"
         style="background: #4F46E5; color: white; padding: 12px 24px;
                text-decoration: none; border-radius: 6px;">
        Activate Account
      </a>
    </div>

    <p>If you didn't create this account, you can safely ignore this email.</p>

    <p>Best regards,<br>The MyApp Team</p>
  </div>

  <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #666;">
    <p>&copy; {{currentYear}} MyApp. All rights reserved.</p>
  </div>
</body>
</html>
```

```typescript
// modules/app.module.ts
import { Module, Controller, Endpoint } from '@navios/core'
import { inject } from '@navios/di'

@Controller()
class AuthController {
  private authService = inject(AuthService)
  private emailService = inject(EmailService)

  @Endpoint(register)
  async register(params: EndpointParams<typeof register>) {
    const user = await this.authService.createUser(params.data)
    await this.emailService.sendWelcome(user)
    return { success: true }
  }

  @Endpoint(forgotPassword)
  async forgotPassword(params: EndpointParams<typeof forgotPassword>) {
    const { user, token } = await this.authService.createResetToken(params.data.email)
    await this.emailService.sendPasswordReset(user, token)
    return { success: true }
  }
}

@Module({
  imports: [mailConfig],
  controllers: [AuthController],
  providers: [EmailService],
})
class AppModule {}
```

---

## API Reference Summary

### Module Exports

| Export              | Type      | Description                      |
| ------------------- | --------- | -------------------------------- |
| `MailModule`        | Module    | Mail module configuration        |
| `MailService`       | Class     | Main mail service                |
| `SmtpTransport`     | Class     | SMTP transport                   |
| `SendGridTransport` | Class     | SendGrid transport               |
| `SESTransport`      | Class     | AWS SES transport                |
| `ResendTransport`   | Class     | Resend transport                 |
| `PostmarkTransport` | Class     | Postmark transport               |
| `PreviewTransport`  | Class     | Development preview transport    |
| `ConsoleTransport`  | Class     | Console logging transport        |
| `HandlebarsAdapter` | Class     | Handlebars template adapter      |
| `MjmlAdapter`       | Class     | MJML template adapter            |
| `ReactEmailAdapter` | Class     | React Email adapter              |

### MailService Methods

| Method         | Return                | Description                    |
| -------------- | --------------------- | ------------------------------ |
| `send`         | `Promise<SendResult>` | Send single email              |
| `sendMany`     | `Promise<SendResult[]>`| Send multiple emails          |
| `sendTemplate` | `Promise<SendResult>` | Send using template            |
| `queue`        | `Promise<void>`       | Queue email for later          |

### SendResult Type

| Property    | Type      | Description                    |
| ----------- | --------- | ------------------------------ |
| `success`   | `boolean` | Whether send succeeded         |
| `messageId` | `string`  | Provider message ID            |
| `to`        | `string`  | Recipient address              |
| `error`     | `Error`   | Error if failed                |

### Configuration Options

| Property    | Type              | Description                    |
| ----------- | ----------------- | ------------------------------ |
| `transport` | `MailTransport`   | Email transport                |
| `defaults`  | `Partial<Message>`| Default message options        |
| `template`  | `TemplateConfig`  | Template configuration         |
| `queue`     | `QueueConfig`     | Queue configuration            |
