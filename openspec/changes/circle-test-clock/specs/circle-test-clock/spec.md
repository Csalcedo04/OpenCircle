# Spec Delta

## Purpose

Gives savings circles a simulated time that can be moved forward on demand, like Stripe test clocks, so weekly and monthly periods and the pool's collection can be tested in minutes on the Open Payments testnet.

## ADDED Requirements

### Requirement: Test clocks are dev-only
Test clock features SHALL exist only when the backend runs with `TEST_CLOCKS_ENABLED=true`. When the flag is off, every test clock endpoint SHALL answer 404. Creating a circle attached to a test clock SHALL be rejected with 404 `TEST_CLOCK_NOT_FOUND`. The frontend dev pages SHALL answer not-found unless the frontend runs with `TEST_CLOCKS_ENABLED=true`.

#### Scenario: Flag off
- **WHEN** `TEST_CLOCKS_ENABLED` is unset and a client calls `POST /api/test-clocks`
- **THEN** the API answers 404

### Requirement: Create a test clock
A signed-in user SHALL be able to create a test clock with a name and an initial frozen time. The frozen time defaults to now. The clock SHALL belong to that user, and only its owner SHALL read, advance or attach circles to it.

#### Scenario: Create
- **WHEN** a signed-in user posts `{ name: "demo", frozenTime: "2026-01-31T12:00:00Z" }` to `POST /api/test-clocks`
- **THEN** the API answers 201 with the clock's id, name and frozen time

#### Scenario: Someone else's clock
- **WHEN** a different user reads or advances that clock
- **THEN** the API answers 404

### Requirement: Attach a circle at creation
A circle SHALL be attachable to a test clock only when it is created, by passing the clock's id. An attached circle SHALL use the clock's frozen time for everything time-based: its start time, period boundaries, and contribution and period timestamps. A circle SHALL NOT be moved between clocks or detached.

#### Scenario: Circle starts on clock time
- **WHEN** the last seat of a circle attached to a clock frozen at 2026-01-31T12:00Z is taken
- **THEN** the circle's start time is 2026-01-31T12:00Z and period 1 opens at that time

### Requirement: Advance a test clock
The owner SHALL be able to advance a clock to a later time with `POST /api/test-clocks/{id}/advance` and `{ to }`. A time earlier than the frozen time SHALL be rejected with 422. Advancing SHALL process every period start and deadline crossed for each attached circle, in time order, as if real time had passed. Advancing to the current frozen time SHALL only re-read pending payments. Concurrent advances of the same clock SHALL run one at a time.

#### Scenario: Advance one month
- **WHEN** a monthly circle on a clock frozen at its start is advanced to period 1's deadline
- **THEN** period 1 is closed (`FUNDED` or `BLOCKED`), period 2 is `COLLECTING`, and period 2's payment requests have been sent

#### Scenario: Moving back
- **WHEN** the owner advances a clock to a time before its frozen time
- **THEN** the API answers 422 and nothing changes

#### Scenario: Refresh without moving
- **WHEN** the owner advances a clock to its current frozen time
- **THEN** pending contributions whose payments arrived become `COMPLETED`, and the frozen time is unchanged

### Requirement: Inspect a test clock
The owner SHALL be able to read a clock with its frozen time and its attached circles. For each circle the response SHALL include the current period, the beneficiary, the period boundaries, and every member's contribution status for the current period.

#### Scenario: Inspect
- **WHEN** the owner calls `GET /api/test-clocks/{id}`
- **THEN** the response lists each attached circle with its current period number, deadline and per-member contribution statuses

### Requirement: Dev pages for test clocks
The regular circle pages still use demo data, so with the flag on the frontend SHALL offer standalone dev pages:
- **`/{lang}/dev/test-clocks`:** a form to create a clock (name and start date), which then opens that clock's page.
- **`/{lang}/dev/test-clocks/{id}`:** owner only. It shows:
  - the simulated date
  - a form to create a circle on the clock (name, amount, size, weekly or monthly, the owner's payout round)
  - for each circle: its current period, beneficiary and deadline, each member's contribution status, and a link others use to join
  - an "Advance one period" button that moves the clock to the next period boundary of any of its circles
  - a "Refresh" button that re-reads payments without moving the clock
- **`/{lang}/dev/circles/{id}`:** a circle's seats with a join form for a signed-in, verified user, offering the free payout rounds.

#### Scenario: Advance from the clock page
- **WHEN** the clock owner clicks "Advance one period" while a circle is in period 1
- **THEN** the page shows the new simulated date, period 2 as the circle's current period, and the new contribution statuses

#### Scenario: Another user joins from the link
- **WHEN** a second verified user opens the circle's join link and picks a free payout round
- **THEN** they take that seat, and filling the last seat starts the circle at the clock's time
