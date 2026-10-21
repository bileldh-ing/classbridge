# Admin guide

Admin and support accounts see the *Admin* area (`/admin`); other users get a permission-denied page. Every sensitive action asks for a reason and is written to the append-only audit log.

| Area | What you can do |
|---|---|
| Overview | real database metrics: users by role, teachers awaiting review, bookings, payment states, open reports, recent audit events, provider configuration status |
| Teachers | review submitted profiles and private credential files (each file view is audited), approve/reject with reason, grant or revoke badges (`identity_verified`, `credential_reviewed`, `platform_verified`) |
| Users | search users, suspend (revokes their sessions) or reactivate, with a reason |
| Bookings / Payments | inspect bookings, payment intents and verified provider webhook events |
| Refunds | see requested/failed refunds and retry submission to the payment provider; final state comes only from the provider |
| Reports | handle user reports (open → reviewing → actioned/dismissed); view support tickets |
| Audit | read-only audit trail |

Permissions: the **support** role can view and handle reports but cannot verify teachers, change users or issue refunds. There is no hidden backdoor and no access to private messages. Not available yet: subject/category management, feature-flag and configuration screens, admin MFA.
