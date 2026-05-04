# Current Authentication Flow

The system uses a custom OTP-based authentication mechanism combined with device fingerprinting and JWT session management.

## Key Components

1.  **Device Fingerprinting**: Generates a unique `fingerprint` from client metadata (IP, OS, Model, etc.) to track devices.
2.  **OTP Lifecycle**: Handles generation, storage, and validation of one-time passwords via email.
3.  **Auth Sessions**: Tracks active logins per device. Supports "trusted" devices that can skip OTP for future logins.
4.  **JWT Handling**: Issues short-lived access tokens.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Client
    participant API as Auth Module
    participant DB as Database
    participant Email as Email Service

    Note over Client, API: Step 1: Device Registration
    Client->>API: POST /auth/create-device-uuid (Client Metadata)
    API->>API: Compute SHA-256 Fingerprint
    API->>DB: Check/Update/Create Device
    DB-->>API: Device ID
    API-->>Client: { deviceId }

    Note over Client, API: Step 2: Request Login (OTP)
    Client->>API: POST /auth/otp/request-otp (email, deviceId)
    API->>DB: Check user & device status
    alt Device is Trusted
        DB-->>API: Trusted Session found
        API-->>Client: { success: true, accessToken, message: "Logged in with trusted device" }
    else Device NOT Trusted
        API->>API: Generate 6-digit OTP
        API->>DB: Store/Update hashed OTP and rate-limit counters
        API->>Email: Send OTP to user
        API-->>Client: { success: true, message: "OTP sent successfully" }
    end

    Note over Client, API: Step 3: Verify OTP
    Client->>API: POST /auth/otp/verify-otp (email, deviceId, otp, isTrusted?)
    API->>DB: Validate OTP & Expire it
    API->>DB: Create Auth Session (record device+user link)
    API->>API: Generate Access Token (JWT)
    API-->>Client: { accessToken, deviceId, success: true }
```

## Session Management

- **Sliding Window**: Tokens can be refreshed via `POST /auth/refresh-token` as long as the auth session in the DB is active and hasn't exceeded the max valid time (7 days).
- **Concurrency**: By default, limited to **1 active device** per user (configurable in `AuthService`).
- **Trusted Devices**: If a user marks a device as trusted (`isTrusted: true`) during verification, subsequent login requests from that same device ID will bypass OTP and issue a token immediately.
