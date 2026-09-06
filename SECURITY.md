# Security Policy

## Supported Versions

Only the latest release gets security fixes. Older versions are not patched.

| Version | Supported |
| ------- | --------- |
| 2.0.x   | Yes       |
| < 2.0   | No        |

## Reporting a Vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting instead:
[Report a vulnerability](https://github.com/Arijit-gotsomecodes/NotePadMac/security/advisories/new)

This is a side project maintained by one person, so response times are best
effort. Expect a first reply within about a week.

When reporting, it helps to include:

- what version you are on (Settings shows it)
- your macOS version
- what happens, and how to reproduce it

## Scope

NotepadMac is a local text editor. It makes no network requests, has no
accounts, and sends no telemetry. The things worth reporting are:

- reading or writing files outside what the user chose
- code execution from opening a file
- anything that escapes the app's sandboxing or permissions

## What the app already does

- The webview runs under a Content Security Policy restricted to local assets
  and Tauri's own IPC channel.
- File access goes through a small set of named commands rather than granting
  the frontend general filesystem permissions.

## Known limitation

Releases are **not code signed or notarized**, because that requires a paid
Apple Developer account. macOS Gatekeeper will quarantine the app on first
launch, which is why the install instructions include `xattr -cr`. Verify the
checksums on the release page if you want to confirm what you downloaded.
