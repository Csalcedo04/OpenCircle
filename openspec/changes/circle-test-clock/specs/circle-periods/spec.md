# Spec Delta

## Purpose

Defines how a savings circle's periods are scheduled from its cadence and size, how each period asks every member for the assigned contribution into the pool, and when a period counts as funded.

## ADDED Requirements

### Requirement: Circle cadence
A circle SHALL have a cadence of `WEEKLY` or `MONTHLY`, chosen when it is created. Creating a circle without a valid cadence SHALL be rejected with HTTP 400. The API SHALL NOT accept a free number of days for new circles.

#### Scenario: Create a monthly circle
- **WHEN** a verified user creates a circle with `cadence: "MONTHLY"` and `size: 4`
- **THEN** the circle is created OPEN with cadence `MONTHLY`, and its summary shows the cadence

#### Scenario: Unknown cadence
- **WHEN** a user creates a circle with `cadence: "DAILY"` or sends `roundLengthDays`
- **THEN** the API answers 400 and no circle is stored

### Requirement: One period per member
A circle SHALL have exactly as many periods as members (its size). Each member SHALL be the beneficiary of exactly one period, the one matching their payout round.

#### Scenario: Schedule on start
- **WHEN** the last seat of a circle with size 5 is taken
- **THEN** the circle has 5 periods numbered 1 to 5, and period n's beneficiary is the member with payout round n

### Requirement: Period boundaries
Period n SHALL start at the circle's start time plus (n − 1) cadence units and end, its deadline, at the start time plus n cadence units. Weekly units SHALL be 7 days. Monthly units SHALL be calendar months counted from the start time each time, not chained. When the start day does not exist in the target month, the period SHALL use that month's last day. The time of day SHALL be kept.

#### Scenario: Weekly boundaries
- **WHEN** a weekly circle starts 2026-03-02T15:00Z
- **THEN** period 1 runs to 2026-03-09T15:00Z and period 2 runs to 2026-03-16T15:00Z

#### Scenario: Monthly at a month end
- **WHEN** a monthly circle starts 2026-01-31T12:00Z
- **THEN** the period deadlines are 2026-02-28T12:00Z, 2026-03-31T12:00Z and 2026-04-30T12:00Z

### Requirement: Opening a period requests every member's amount
When a circle's time reaches a period's start, the system SHALL open that period. It SHALL create one contribution for every member, the beneficiary included, for the circle's contribution amount (`value`, `assetCode`, `assetScale`, integer minor units). It SHALL then request that amount from each member's wallet into the pool wallet over Open Payments, using the grant the member gave. Each request SHALL carry a deterministic key derived from the period and the member, so it is never sent twice.

#### Scenario: Period opens
- **WHEN** the circle's time passes period 2's start
- **THEN** period 2 is `COLLECTING`, it has one contribution per member for the circle's amount, and each contribution is `PROCESSING` with a payment requested from that member's wallet to the pool

#### Scenario: Running twice
- **WHEN** the engine runs again for the same circle time
- **THEN** no new contributions or payment requests are created and nothing changes

#### Scenario: Member without a usable grant
- **WHEN** a member has no active grant, or their wallet refuses the quote or the payment
- **THEN** that member's contribution is `FAILED` with a reason code, and the other members' requests still go out

### Requirement: Contribution completion needs proof
A contribution SHALL become `COMPLETED` only after the system reads the pool wallet's incoming payment for that contribution and its received amount is at least the contribution amount. Creating the outgoing payment SHALL NOT mark a contribution completed. Status changes SHALL follow `PENDING → PROCESSING → COMPLETED | FAILED`. Any other transition SHALL be refused.

#### Scenario: Payment arrives
- **WHEN** the pool's incoming payment for a contribution shows a received amount equal to the contribution
- **THEN** the contribution is `COMPLETED` with a completion time, and an audit event is written

#### Scenario: Payment sent but not received yet
- **WHEN** the member's outgoing payment exists but the pool's incoming payment has received less than the amount
- **THEN** the contribution stays `PROCESSING`

### Requirement: Closing a period
A `COLLECTING` period SHALL become `FUNDED` as soon as all its contributions are `COMPLETED`. When the circle's time reaches the period's deadline with any contribution not completed, the system SHALL first re-read every pending payment. It SHALL then mark the unpaid contributions `FAILED` and the period `BLOCKED`. Paying the pot to the beneficiary is outside this capability.

#### Scenario: Everyone paid
- **WHEN** every contribution of period 1 is `COMPLETED`
- **THEN** period 1 is `FUNDED` with a closing time

#### Scenario: Deadline with a missing payment
- **WHEN** the circle's time passes period 1's deadline and one member's contribution is still `PROCESSING` after a final re-read
- **THEN** that contribution is `FAILED`, period 1 is `BLOCKED`, and period 2 still opens on schedule

### Requirement: Audit of period changes
Every change of a period's state and of a contribution's status SHALL write an audit event without personal data, tokens or keys.

#### Scenario: Audit on funding
- **WHEN** a period becomes `FUNDED`
- **THEN** an audit event for the pool wallet records the circle, the period number and the new state, and nothing else about the members
