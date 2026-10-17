# Spec Delta

## Purpose

Controls who can find, view and join a savings circle. Circles are private and invite-only by default, and the creator can choose to make them public.

## ADDED Requirements

### Requirement: Visibility on creation
A circle SHALL have a visibility of `PRIVATE` or `PUBLIC`. It SHALL default to `PRIVATE` when the create request does not set one. A private circle SHALL get an unguessable invite code, at least 128 bits of randomness, when it is created.

#### Scenario: Default is private
- **WHEN** a verified user creates a circle without `visibility`
- **THEN** the circle is `PRIVATE`, and the creator's response includes its invite link

#### Scenario: Public on request
- **WHEN** a verified user creates a circle with `visibility: "PUBLIC"`
- **THEN** the circle is `PUBLIC` and appears in `GET /api/circles`

### Requirement: Private circles are hidden
`GET /api/circles` SHALL list only `PUBLIC` circles. For a `PRIVATE` circle, `GET /api/circles/{id}` and `POST /api/circles/{id}/join` SHALL succeed only for one of:
- a member of the circle
- a request carrying the circle's current invite code

Every other request SHALL get 404 `CIRCLE_NOT_FOUND`, the same as an unknown circle. The invite code SHALL be returned only to the creator.

#### Scenario: Stranger without the link
- **WHEN** a signed-in non-member requests a private circle's id without an invite code
- **THEN** the API answers 404 `CIRCLE_NOT_FOUND`

#### Scenario: Invited user joins
- **WHEN** a verified non-member joins a private circle with its current invite code
- **THEN** they take the seat as with a public circle

#### Scenario: Members always see it
- **WHEN** a member opens their private circle without an invite code
- **THEN** the API returns the circle, and it is also in their `GET /api/users/me/circles`

### Requirement: Creator controls visibility and the link
While a circle is `OPEN`, its creator SHALL be able to change its visibility and to rotate its invite code. After a rotation, the previous code SHALL stop working. Anyone other than the creator SHALL get 404 for these actions. Once the circle is no longer `OPEN`, a visibility change SHALL be rejected with 409 `CIRCLE_NOT_OPEN`.

#### Scenario: Make public later
- **WHEN** the creator sets a private OPEN circle to `PUBLIC`
- **THEN** it appears in the public list and any verified user can join

#### Scenario: Rotate a leaked link
- **WHEN** the creator rotates the invite code and someone uses the old link
- **THEN** that request gets 404 `CIRCLE_NOT_FOUND`

### Requirement: Existing circles stay visible
Circles that existed before this change SHALL become `PUBLIC`.

#### Scenario: Migration
- **WHEN** the migration runs on a database with existing circles
- **THEN** every existing circle is `PUBLIC` and still appears in the public list
