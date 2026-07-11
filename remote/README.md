# @presenter/remote

Expo app — a phone remote for the presenter system. Sign in with the server URL
+ admin password, pick a presentation, and drive it (Prev / Next / Go to). Uses
the same server as the web admin; connects over the WebSocket with a session
token (no per-app token needed).

## Run

```sh
cd remote
bun install
bunx expo start        # then press i (iOS), a (Android), or w (web)
```

Point it at your server URL (e.g. `http://<your-ip>:7737` on LAN, or your public
tunnel URL). Get the admin password from the server logs.

## Notes

- Auth is password-based for now (Google OAuth in a native app is deferred).
- Teleprompter scroll-to-change-slides (Slice 2) is not implemented yet; this is
  the tap remote.
