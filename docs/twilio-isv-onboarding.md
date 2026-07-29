# Twilio ISV Onboarding For Ferocity

Ferocity should use Twilio as a provider inside the Messaging Engine, not as the core messaging architecture.

## Required Twilio Position

Before Ferocity can register customers as an ISV:

1. Ferocity needs a Twilio Primary Customer Profile.
2. That profile must be approved.
3. The business identity should be set as `ISV Reseller or Partner`.
4. Ferocity should use a customer-mapped structure for each business.

## Recommended Architecture

Use Twilio's ISV architecture with a subaccount mapped to each customer whenever practical.

For each customer:

1. Create or map a Twilio subaccount.
2. Create a Secondary Customer Profile in that customer account.
3. Register a Brand.
4. Register a Campaign for each messaging use case.
5. Create a Messaging Service mapped to that Campaign.
6. Attach the approved phone number.
7. Keep live sends off in Ferocity until approval, consent, opt-out, budget, and testing are complete.

Avoid sharing one campaign across unrelated businesses. One bad sender can create risk for the rest of the platform.

## Ferocity Tables

- `messaging_registrations`: customer-provided business/A2P packet.
- `twilio_isv_customer_routes`: Twilio-specific customer route status and SIDs.
- `tenant_messaging_accounts`: customer-owned vs Ferocity-managed account lanes.
- `messages`, `message_delivery_events`, `message_webhook_events`: provider-independent message records.

## Not Live Until

- Twilio primary profile is approved.
- Customer secondary profile is submitted and approved.
- Brand is approved.
- Campaign is approved.
- Messaging Service exists.
- Number is attached.
- Test messages pass.
- STOP/HELP and suppression are active.
- Ferocity live sending is enabled for the tenant.

## Official References

- https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv
- https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api
- https://www.twilio.com/docs/trust-hub/profiles
