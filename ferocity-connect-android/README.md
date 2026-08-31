# Ferocity Connect Android gateway

This is the standalone, independently buildable Android transport for the Ferocity messaging engine. It is not a general bulk-SMS utility. A phone must be paired to one Ferocity workspace and all work remains subject to Ferocity authorization, consent, suppression, pacing, health, and kill-switch controls.

## Build and signing

1. Install Android Studio Quail 3 / Android SDK 36 and JDK 17.
2. Open this directory and allow Gradle to sync.
3. Run `./gradlew test lint assembleDebug` for engineering verification.
4. Configure a dedicated offline-protected release keystore through local Gradle properties or CI secrets. Never commit the keystore or passwords.
5. Run `./gradlew bundleRelease assembleRelease`, retain the mapping file, and publish the APK SHA-256 beside the download.

AGP 9.3 requires Gradle 9.5. The repository includes the official Gradle 9.5.0 wrapper JAR and distribution checksum; both were verified against Gradle's published SHA-256 values.

## Physical-device certification

- Android 10, 12, 14, 15, and current Android 16/17 supported-device behavior.
- Single SIM and dual SIM; explicit subscription selection and removed/default SIM behavior.
- Outbound short and multipart SMS; sent and delivery callbacks; no service, radio off, device limit, and FDN failures.
- Inbound single and multipart SMS; duplicate broadcast replay; STOP-family opt-out and HELP routing.
- Network loss during inbound/status upload; local queue survives process death and flushes after reconnect.
- Reboot recovery and foreground service notification.
- Permission denial and revocation; credential expiry/rotation/revocation; device pause and global kill switch.
- Two devices racing for one job; lease expiration; retry ceiling and dead letter.
- Cross-tenant credential, job id, and event id attacks.

## Distribution

SMS permissions are restricted in Google Play. Ferocity should distribute a signed APK from its authenticated site unless and until Play eligibility is formally confirmed. Android developer identity verification requirements and signing-key continuity must be completed before public distribution. Customers must use a lawful carrier plan and compliant messaging use case.
