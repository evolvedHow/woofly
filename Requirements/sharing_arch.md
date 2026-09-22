# Woof P2P Sharing

## Functional & Architecture Specification for Existing React PWA

## 1. Objective

Add a private, peer-oriented sharing system to the existing React-based, mobile-friendly PWA.

The application represents dogs and their activities/achievements.

A dog should be able to "woof" an achievement or other small piece of content to a limited set of known dog friends.

This is **not intended to become a social network**.

The core concept is:

> Dogs have explicit Woof Friends. A Woof Friend relationship is established intentionally by two owners. Once established, the dogs can exchange asynchronous Woofs even when the recipient is not currently using the application.

The system should work on:

* iOS
* Android
* Desktop browsers where supported

The primary mobile experience is the focus.

---

# 2. Core Design Principle

The architecture should be:

**Peer-oriented, private, asynchronous, lightweight, and decentralized in spirit.**

The system must NOT introduce:

* A global social feed
* Follower/following relationships
* Friend recommendations
* Public discovery of users
* Global user search
* Likes
* Comments
* Algorithmic feeds
* Social ranking
* Public profiles
* A centralized social graph

The backend should function primarily as a **dumb message relay/mailbox**, not as a social network.

Ideally, the server should not know the contents of a Woof.

---

# 3. Important Architectural Decision

Do **not** use WebRTC as the primary communication mechanism.

Reason:

WebRTC requires both peers to participate in establishing a live connection. The desired Woof experience is asynchronous.

Example:

* Luna's owner takes Luna for a walk at 9:00 AM.
* Luna earns an achievement.
* Max's owner may not open the app until 6:00 PM.
* Max should still receive the Woof.

Therefore the primary transport must support **store-and-forward asynchronous delivery**.

---

# 4. High-Level Architecture

```text
                         ┌──────────────────┐
                         │   WOOF RELAY     │
                         │                  │
                         │  Mailboxes       │
                         │  Push routing    │
                         │  TTL / expiry    │
                         │  Delivery ACKs   │
                         └────────┬─────────┘
                                  │
                                  │ Internet
                                  │
                 ┌────────────────┴────────────────┐
                 │                                 │
             Luna PWA                          Max PWA
                 │                                 │
          ┌──────┴──────┐                  ┌───────┴──────┐
          │             │                  │              │
       Identity     Woof Circle          Identity      Woof Circle
          │             │                  │              │
          └─────────────┴──────────────────┴──────────────┘

                     ENCRYPTED WOOFS
```

The relay should primarily perform:

1. Mailbox management
2. Delivery
3. Push notification triggering
4. Message expiration
5. Delivery acknowledgement

It should NOT understand the semantic content of a Woof.

---

# 5. Woof Identity

Each dog should have a human-friendly **Woof Handle**.

Example:

```text
LUNA-7K4P-M9Q
```

The handle is intended for humans to exchange.

It should be easy to:

* display
* copy
* share
* enter manually
* encode into a QR code

However, the human-readable handle should NOT itself be the cryptographic identity.

The underlying identity should be based on a public/private keypair.

Conceptually:

```json
{
  "woofHandle": "LUNA-7K4P-M9Q",
  "peerId": "...",
  "publicKey": "..."
}
```

The private key must remain on the user's device.

---

# 6. Woof Friend Relationship

A Woof Friend relationship is explicitly established by two owners.

Example:

Owner of Luna meets owner of Max.

Luna's owner shows:

```text
LUNA-7K4P-M9Q
```

or displays a QR code.

Max's owner scans it.

The application displays:

```text
Add Luna to your Woof Circle?

🐾 Luna

[ Add Luna ]   [ Cancel ]
```

Once accepted, the relationship is established.

The relationship should include the necessary public-key information required for encrypted communication.

Conceptually:

```text
Luna
  │
  ├── Max
  │     └── Max public key
  │
  ├── Bruno
  │     └── Bruno public key
  │
  └── Daisy
        └── Daisy public key
```

The relationship list should primarily be stored locally.

The backend does not need to maintain a social graph.

---

# 7. Bilateral Relationship

The relationship should be treated as bilateral.

Do not implement a one-sided "follow" model.

Conceptually:

```text
Luna <──────────► Max
```

rather than:

```text
Luna ───────────► Max
```

The user experience should communicate that these are known Woof Friends.

---

# 8. QR Code Pairing

QR-code pairing should be the primary mechanism for establishing a relationship.

The QR code can contain a pairing URL or pairing payload.

Example:

```text
https://yourapp.example/join/LUNA-7K4P-M9Q
```

However, do not assume that the human-readable handle alone is sufficient for cryptographic pairing.

The pairing payload should contain whatever information is necessary to safely establish the relationship and exchange public keys.

The QR code should be:

* easy to display
* easy to scan
* easy to regenerate
* safe to share intentionally

---

# 9. Optional OS Share Integration

The PWA may also support the Web Share API.

This can provide an alternative to manually showing/typing a handle.

Potential flow:

```text
Luna's PWA
    |
    | Share Luna
    v
OS Share Sheet
    |
    +-- AirDrop
    +-- Messages
    +-- Bluetooth/Wi-Fi sharing
    +-- Other apps
```

The application should not attempt to implement Apple's AirDrop or Android's native proximity sharing itself.

Let the operating system provide those capabilities where available.

The application's protocol should remain independent of the underlying physical transport.

---

# 10. Woof Object

A Woof is a small event/message generated by one dog for one or more known Woof Friends.

Example:

```json
{
  "id": "unique-message-id",
  "type": "achievement",
  "createdAt": "2026-09-22T13:42:00Z",
  "sender": "Luna",
  "achievement": "10-mile-walk",
  "message": "Luna walked 10 miles today!",
  "metadata": {
    "park": "Central Park"
  }
}
```

The exact application-specific fields should be determined based on the existing data model.

Do not introduce unnecessary generic social-media concepts.

---

# 11. Woof Types

The initial architecture should allow multiple Woof types without requiring a redesign.

Examples:

```text
achievement
milestone
walk
photo
location-event
birthday
streak
custom
```

The first implementation may support only the types already needed by the existing application.

Use a versioned payload structure so that future Woof types can be added.

Example:

```json
{
  "schemaVersion": 1,
  "type": "achievement",
  ...
}
```

---

# 12. End-to-End Encryption

Woofs should be encrypted before leaving the sender's device.

The relay should ideally see only an opaque encrypted envelope.

Conceptually:

```text
Luna PWA

Plaintext Woof
     |
     | encrypt using recipient public key
     v
Encrypted Woof
     |
     v
Relay
     |
     v
Encrypted Woof
     |
     v
Max PWA
     |
     | decrypt using Max private key
     v
Plaintext Woof
```

Use browser-supported cryptographic primitives where practical, preferably the Web Crypto API.

Do not invent custom cryptography.

Use established cryptographic algorithms and libraries where necessary.

---

# 13. Important Privacy Principle

The relay should NOT need to understand:

* dog name
* achievement
* message text
* photos
* location
* walk details
* other application-specific Woof content

The relay should primarily know:

```text
recipient mailbox
message ID
encrypted payload
timestamp
expiration
delivery state
```

Even the recipient identity should be represented by an opaque identifier rather than exposing unnecessary user information.

---

# 14. Mailbox Model

Each application identity has a mailbox.

Conceptually:

```text
Mailbox: MAX-opaque-id

Messages:
    encrypted-message-001
    encrypted-message-002
    encrypted-message-003
```

A sender places an encrypted Woof into the recipient's mailbox.

The recipient retrieves pending Woofs when the PWA is opened or synchronized.

---

# 15. Store-and-Forward

This is fundamental.

The recipient does NOT need to be online.

Example:

```text
09:00
Luna generates Woof
       |
       v
Relay mailbox
       |
       |
       |  recipient offline
       |
       |
18:00
Max opens PWA
       |
       v
Retrieve Woof
       |
       v
Decrypt
       |
       v
Display:
🐾 Luna woofed!
```

The relay therefore behaves more like a mailbox/post office than a chat server.

---

# 16. Web Push

Use Web Push as the notification mechanism.

Do NOT make Push the primary message-storage mechanism.

Preferred flow:

```text
Sender
   |
   | encrypted Woof
   v
Relay
   |
   | store
   |
   +----> Web Push
              |
              v
        Recipient device
              |
              v
       "🐾 Luna woofed!"
```

When the recipient opens the application, it retrieves the actual encrypted message from the relay.

The Push notification should contain minimal information.

Example:

```text
🐾 Luna woofed!
```

Avoid putting sensitive content into the push payload.

---

# 17. Delivery Lifecycle

A Woof should have a basic lifecycle:

```text
CREATED
   |
   v
ENCRYPTED
   |
   v
UPLOADED
   |
   v
PENDING
   |
   v
DELIVERED
   |
   v
ACKNOWLEDGED
   |
   v
DELETED / EXPIRED
```

The exact implementation can be simplified.

The key requirement is that the system must tolerate:

* sender going offline
* recipient going offline
* application being closed
* temporary network failures
* duplicate delivery
* retry attempts

Therefore messages must have unique IDs and delivery should be idempotent.

---

# 18. Message Expiration

The relay should not become a permanent archive.

Woofs should have a configurable TTL.

Possible default:

```text
30 days
```

The implementation should allow the TTL to be changed later.

Messages can be deleted earlier when:

* recipient acknowledges successful retrieval
* sender explicitly revokes them, where appropriate
* expiration is reached

Do not retain messages indefinitely by default.

---

# 19. Multiple Devices

A user may use:

* iPhone
* iPad
* Android device
* desktop

The architecture should allow multiple application installations.

Do not assume one physical device equals one dog identity.

Possible model:

```text
Dog Identity
     |
     +-- Device A
     |
     +-- Device B
     |
     +-- Device C
```

Each device may have its own local cryptographic keys and Push subscription.

The exact key-management design should be determined during implementation, but the architecture must not make multi-device support impossible.

---

# 20. Desktop

Desktop support is desirable but secondary.

Desktop should support:

* viewing Woof Circle
* receiving Woofs
* sending Woofs
* pairing via QR code where practical
* generating/displaying Woof handles

Do not make desktop proximity sharing a requirement.

---

# 21. No Global Discovery

There must be no feature equivalent to:

```text
Find dogs near me
Find users
Nearby Woof users
Search all dogs
```

The only way to establish a relationship should be through intentional sharing of a handle/pairing mechanism.

This is an important product requirement.

---

# 22. No Location-Based Social Discovery

The application may record/display location as part of a dog's own activity or achievement if the existing application supports it.

However, location must NOT be used to automatically discover other Woof users.

Example:

Allowed:

```text
Luna walked in Central Park.
```

Not allowed:

```text
There are 14 Woof users near you.
```

---

# 23. No Centralized Feed

Do not create a global timeline.

Each dog sees Woofs specifically addressed to that dog/owner.

Example:

```text
Luna's Woof Circle

🐾 Max
   "I found a new trail!"

🐾 Bruno
   "3 walks this week!"

🐾 Daisy
   "Birthday Woof!"
```

This is a private inbox/circle, not a social feed.

---

# 24. Backend Requirements

The backend should be intentionally minimal.

Potential API surface:

```text
POST /register
POST /pair
POST /mailbox/{recipient}
GET  /mailbox/{recipient}
POST /mailbox/{recipient}/ack
POST /push/subscribe
DELETE /push/subscribe
```

The actual API design may differ.

The implementation should prioritize:

* simplicity
* reliability
* low operational cost
* minimal persistent state
* stateless application logic where possible

Do not introduce:

* Redis
* Kafka
* RabbitMQ
* Kubernetes
* complex microservices
* elaborate authentication systems

unless a concrete requirement demonstrates that they are necessary.

---

# 25. Backend Data

The minimum persistent information should be approximately:

```text
recipient/mailbox identifier
encrypted message
message ID
created timestamp
expiration timestamp
delivery state
push subscription information
```

Avoid storing plaintext Woof content.

Avoid storing unnecessary user profile data.

Avoid building a global social graph.

---

# 26. Authentication vs Identity

Keep these concepts separate.

### Application identity

Who owns this cryptographic identity?

### Device identity

Which PWA installation is communicating?

### Woof relationship

Which other identities has this dog explicitly paired with?

### Server authorization

Is this device authorized to write/read the appropriate mailbox?

The implementation should define a lightweight mechanism that prevents arbitrary users from writing to arbitrary mailboxes.

Do not assume that knowing a Woof Handle is sufficient authorization to send messages.

---

# 27. Threat Model

The first implementation should consider at least:

* someone guessing mailbox IDs
* unauthorized message injection
* replaying an old message
* duplicate messages
* stolen device
* leaked Push endpoint
* malicious QR code
* compromised relay
* sender impersonation

The relay should never be trusted with plaintext Woof content.

Use cryptographic signatures/authentication where appropriate.

Do not invent cryptographic protocols.

Prefer established primitives/libraries.

---

# 28. Offline-First Behavior

The PWA should continue functioning locally when offline.

For example:

```text
Luna walks
    |
    v
Achievement generated
    |
    v
Local IndexedDB
    |
    | network unavailable
    |
    v
Queued Woof
```

When connectivity returns:

```text
Queued Woof
    |
    v
Encrypt
    |
    v
Upload
    |
    v
Relay
```

The user should not have to manually retry.

---

# 29. Local Storage

Use IndexedDB or the application's existing local persistence mechanism.

Local state should include things such as:

```text
My dog identity
Private key material
Woof Circle
Known public keys
Pending outgoing Woofs
Received Woofs
Delivery state
Push subscription
Application settings
```

Do not put sensitive cryptographic material into ordinary React state.

Use appropriate browser storage/security mechanisms.

---

# 30. PWA Service Worker

The service worker should support:

* Push events
* notification display
* notification click handling
* background synchronization where supported
* application shell caching
* potentially triggering message synchronization

Do not assume that every browser supports every background capability.

Implement graceful degradation.

---

# 31. Graceful Degradation

The application must continue working when a platform does not support:

* Web Push
* background sync
* Web Share
* Share Target
* QR scanning
* installation as a PWA

For example:

If Push isn't available:

```text
Woof is waiting.
```

When the user next opens the application:

```text
Sync → retrieve pending Woofs
```

The core messaging system must not depend on Push.

---

# 32. Sharing UX

The primary user actions should be extremely simple.

### Add Woof Friend

```text
[ Add Woof Friend ]

Show My Woof
Scan Woof
Enter Woof Handle
```

### Send Woof

```text
🐾 WOof

Choose:
[ Achievement ]
[ Walk ]
[ Photo ]
[ Other ]
```

Then:

```text
Send to:

☑ Max
☐ Bruno
☐ Daisy

[ WOOF! ]
```

### Receive Woof

```text
🐾 Luna WOofed!

🏆 10-mile walk

[ View ]
```

---

# 33. Transport Abstraction

Do not tightly couple application code to the relay implementation.

Create an abstraction along the lines of:

```typescript
interface WoofTransport {
    send(...): Promise<SendResult>;
    receive(...): Promise<Woof[]>;
    acknowledge(...): Promise<void>;
}
```

Potential implementations:

```text
RelayTransport
LocalTransport
OSShareTransport
```

The first production implementation should be:

```text
RelayTransport
```

OS Share is an optional convenience for pairing/sharing.

Do not implement WebRTC.

---

# 34. Important Distinction: Transport vs Relationship

Do not confuse:

**How two users establish a relationship**

with:

**How their Woofs are delivered afterward.**

Initial relationship establishment may happen through:

* QR code
* Woof Handle
* OS Share

Afterward, Woofs should normally travel through:

```text
encrypted → relay → mailbox → push → retrieve
```

This allows the owners to be nowhere near each other when a Woof is sent.

---

# 35. Future-Proofing

The architecture should leave room for future features such as:

* photos
* short audio Woofs
* richer achievements
* dog birthdays
* walk milestones
* shared walks
* temporary Woof Circles
* group Woofs
* device-to-device proximity discovery

But **do not implement these unless required by the current product.**

The initial system should remain small.

---

# 36. Explicit Non-Goals

Do NOT implement in this change:

* WebRTC
* global social networking
* public profiles
* followers
* likes
* comments
* global search
* location-based discovery
* recommendation algorithms
* advertising
* analytics-driven social feeds
* complex messaging/chat infrastructure
* message history stored indefinitely on the server
* unnecessary backend infrastructure

---

# 37. Suggested Implementation Phases

## Phase 1 — Local identity

Implement:

* Dog identity
* Woof Handle
* public/private keypair
* local persistence
* QR representation

No server required yet.

---

## Phase 2 — Pairing

Implement:

* Scan Woof
* Add Woof Friend
* bilateral relationship
* public-key exchange
* local Woof Circle

Still keep the architecture testable without the backend.

---

## Phase 3 — Relay

Implement the minimal backend:

```text
register
pair
send
retrieve
ack
```

Implement encrypted envelopes.

The relay must not require knowledge of plaintext Woofs.

---

## Phase 4 — Push

Add:

* Push subscription registration
* Push notification
* notification click → open PWA
* mailbox synchronization

Push is a convenience/notification layer, not the message database.

---

## Phase 5 — Offline Queue

Implement:

* outgoing queue
* retry
* deduplication
* ACK
* expiration
* recovery after connectivity returns

---

## Phase 6 — UX Polish

Implement:

* Woof Circle
* attractive Woof notifications
* QR pairing experience
* simple "WOOF!" interaction
* delivery status
* graceful platform fallbacks

---

# 38. Acceptance Criteria

The implementation should satisfy these scenarios.

### Scenario A — Pairing

1. Luna owner displays QR.
2. Max owner scans QR.
3. Max sees Luna.
4. Max accepts.
5. Both applications now recognize the other as a Woof Friend.

---

### Scenario B — Asynchronous Woof

1. Luna earns an achievement.
2. Luna's application creates a Woof.
3. Luna's application encrypts it for Max.
4. Encrypted message is uploaded to relay.
5. Max is offline.
6. Max later opens the application.
7. Max retrieves the message.
8. Max's application decrypts it.
9. Max sees the achievement.

---

### Scenario C — Push

1. Luna sends Woof.
2. Max's application is closed.
3. Relay stores the encrypted Woof.
4. Max receives:

```text
🐾 Luna woofed!
```

5. Max taps notification.
6. PWA opens.
7. PWA retrieves and decrypts the Woof.

---

### Scenario D — Offline Sender

1. Luna earns achievement.
2. Luna has no network connection.
3. Woof is stored locally.
4. Network returns.
5. Woof automatically uploads.
6. Max eventually receives it.

---

### Scenario E — Relay Compromise

If the relay database is inspected by an attacker:

* plaintext Woof content must not be available
* private keys must not be available
* unnecessary personal information must not be available

The attacker may potentially see metadata such as message timing and mailbox identifiers depending on the final protocol. Document these limitations rather than pretending the system provides metadata privacy.

---

# 39. Implementation Philosophy

This feature should feel like a **small private communications protocol embedded inside the existing PWA**, not like adding a social network.

Prefer:

```text
simple
local-first
explicit relationships
encrypted
asynchronous
minimal server
minimal data retention
```

over:

```text
centralized
feature-rich
real-time
social
analytics-heavy
server-dependent
```

When making implementation decisions, favor the solution with the smallest operational footprint that satisfies the requirements.

---

# 40. Deliverables Expected From Coding Agent

Before modifying the codebase:

1. Inspect the existing PWA architecture.
2. Identify the current dog/user data model.
3. Identify existing persistence mechanisms.
4. Identify existing service-worker/PWA configuration.
5. Identify existing authentication, if any.
6. Identify existing hosting/deployment architecture.

Then produce a short implementation plan describing:

* files/modules to modify
* new modules required
* data structures
* client-side storage changes
* service-worker changes
* backend requirements
* security considerations
* platform limitations
* migration considerations

Do not begin by introducing infrastructure.

The agent should first determine how much of the feature can be implemented using the existing application architecture.

---

# 41. Most Important Product Principle

The resulting experience should feel like:

> **"My dog has a small circle of dogs she knows, and they can Woof to each other."**

It should NOT feel like:

> "I joined another social network."

The technical architecture should reinforce that distinction.
