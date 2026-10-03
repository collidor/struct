export interface PlaygroundPreset {
  id: string
  name: string
  description: string
  code: string
  sampleValid: string
  sampleInvalid: string
}

export const PLAYGROUND_PRESETS: PlaygroundPreset[] = [
  {
    id: 'user-profile',
    name: 'User Registration Profile',
    description: 'Object schema with string sanitizers, email rules, enum selection, and widget hints.',
    code: `s.struct({
  username: s.string().trim().toLowerCase().min(3).max(20).describe('Account handle'),
  email: s.string().trim().email().describe('Primary contact address'),
  age: s.number().integer().min(18).max(120).describe('User age'),
  role: s.enum(['admin', 'editor', 'viewer'] as const).default('viewer'),
  website: s.optional(s.string().url()),
  newsletter: s.boolean().default(false).describe('Receive product updates'),
  bio: s.optional(s.string().max(200)),
})`,
    sampleValid: `{
  "username": "   JohnDoe  ",
  "email": "john.doe@example.com",
  "age": 28,
  "role": "editor",
  "website": "https://example.com",
  "newsletter": true,
  "bio": "Software architect and open source enthusiast."
}`,
    sampleInvalid: `{
  "username": "jd",
  "email": "not-an-email",
  "age": 15,
  "role": "superuser",
  "newsletter": "yes"
}`,
  },
  {
    id: 'ecommerce-order',
    name: 'E-Commerce Order & Line Items',
    description: 'Nested structs, array item validation, and numeric constraints.',
    code: `s.struct({
  orderId: s.string().uuid(),
  status: s.enum(['pending', 'processing', 'shipped', 'delivered'] as const).default('pending'),
  currency: s.string().toUpperCase().min(3).max(3).default('USD'),
  items: s.array(
    s.struct({
      sku: s.string().toUpperCase().min(3),
      quantity: s.number().integer().positive().max(100),
      unitPrice: s.number().positive()
    })
  ).min(1).describe('Order line items'),
  notes: s.optional(s.string().max(500))
})`,
    sampleValid: `{
  "orderId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "processing",
  "currency": "usd",
  "items": [
    { "sku": "pro-keyboard-90", "quantity": 1, "unitPrice": 149.99 },
    { "sku": "mouse-mat-xxl", "quantity": 2, "unitPrice": 24.50 }
  ],
  "notes": "Please leave at front porch."
}`,
    sampleInvalid: `{
  "orderId": "invalid-order-uuid",
  "status": "unknown-status",
  "currency": "DOLLAR",
  "items": []
}`,
  },
  {
    id: 'axon-node',
    name: 'Axon Graph Node Port',
    description: 'Data structure contract for Axon computation graphs and port subtyping.',
    code: `s.struct({
  nodeId: s.string().min(1),
  channel: s.string().toLowerCase(),
  payload: s.union([
    s.string(),
    s.number(),
    s.struct({ signal: s.string(), value: s.number() })
  ]),
  timestamp: s.number().positive(),
  metadata: s.record(s.string(), s.unknown())
})`,
    sampleValid: `{
  "nodeId": "node-sensor-01",
  "channel": "telemetry/temperature",
  "payload": {
    "signal": "TEMP_C",
    "value": 24.8
  },
  "timestamp": 1727980000000,
  "metadata": {
    "firmware": "v2.4.1",
    "calibrated": true
  }
}`,
    sampleInvalid: `{
  "nodeId": "",
  "channel": "TELEMETRY",
  "payload": false,
  "timestamp": -50,
  "metadata": null
}`,
  },
]
