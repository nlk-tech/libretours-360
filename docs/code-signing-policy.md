# Code signing policy

> **Status:** applied for with the SignPath Foundation. Until the application is approved, the Windows builds are not signed.

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## What is signed

The Windows release binaries built by the [`build-windows.yml`](../.github/workflows/build-windows.yml) workflow on GitHub-hosted runners, from the source code in this repository:

- the application, `LibreTours 360.exe` (also packed into the installer);
- the NSIS installer.

Nothing built outside that workflow, and no third-party binary, is signed with this certificate.

## Team roles

- Committers and reviewers: [wishmerhill](https://github.com/wishmerhill)
- Approvers: [wishmerhill](https://github.com/wishmerhill)

Every signing request is approved by hand by an approver before it is signed.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

LibreTours 360 makes no network requests of its own: projects, panoramas and settings stay on the user's computer. The only exception is the **Web 3D** tour that the user can export: when a visitor opens it, the exported page loads the Photo Sphere Viewer library from public CDNs (jsDelivr, esm.sh). The **Standalone 3D** export loads nothing from the network.
