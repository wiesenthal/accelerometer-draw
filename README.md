Motion Paint — 3D drawing using iPhone motion sensors.

How to use

- Open `index.html` on an iPhone (Safari recommended).
- Tap Enable Motion to grant sensor access.
- Tap Draw to toggle painting, then move your phone in space.
- Clear removes all strokes; Recenter resets the origin near eye height.
- Adjust color and width as desired.

Notes

- iOS requires a user gesture before requesting `DeviceMotion`/`DeviceOrientation` permission. Use the on-screen button.
- Integration of acceleration to position will drift; this is a toy demo with simple damping and stability-based zero-velocity detection to reduce drift.
- Desktop simulation is available if you don’t grant motion permission:
  - Arrow keys / WASD move relative to camera
  - R/F move up/down
  - D toggles draw, C clears, X recenters

