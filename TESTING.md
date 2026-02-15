# Testing Guide for Pulse Link

## Local Development Setup

### Chrome/Brave Browser Configuration

WebRTC connections between tabs on the same machine require disabling Chrome's mDNS privacy feature:

1. **Navigate to flags:**

   ```
   chrome://flags/#enable-webrtc-hide-local-ips-with-mdns
   ```

2. **Set to:** `Disabled`

3. **Restart browser**

**Why is this needed?**
Chrome's mDNS feature replaces local IP addresses with `.local` hostnames for privacy. While this works great for cross-network connections, it prevents WebRTC connections between tabs on the same machine because the mDNS names aren't resolved properly.

**Note:** This is only needed for local testing with multiple tabs. Production deployments across different devices/networks work without this change.

### Alternative: Launch Chrome with Flag Disabled

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --disable-features=WebRtcHideLocalIpsWithMdns \
  http://localhost:8000/test-webrtc.html

# Linux
google-chrome \
  --disable-features=WebRtcHideLocalIpsWithMdns \
  http://localhost:8000/test-webrtc.html

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --disable-features=WebRtcHideLocalIpsWithMdns ^
  http://localhost:8000/test-webrtc.html
```

## Running Tests

### 1. Start Development Server

```bash
npm run serve
# or
python3 -m http.server 8000
```

### 2. Test Pages

#### Test 1: Local Metronome

**URL:** http://localhost:8000/test-metronome.html

**Tests:**

- ✅ Metronome plays at selected BPM (40-240)
- ✅ Stop is immediate (no lingering clicks)
- ✅ BPM changes are instant with no overlaps
- ✅ Accented downbeats every 4 beats
- ✅ No drift over 5+ minutes

**No browser configuration needed for this test.**

---

#### Test 2: WebRTC Connection

**URL:** http://localhost:8000/test-webrtc.html

**Prerequisites:** Chrome mDNS flag disabled (see above)

**Tests:**

1. Open test page in Tab 1
2. Click "Create Room" → copy room code
3. Open test page in Tab 2
4. Enter room code → click "Join Room"
5. Both tabs should show "Connected"
6. Type messages in either tab → should appear in both
7. Test with 3+ tabs to verify star topology

**Expected Console Logs:**

```
✅ Connected to mock signaling
✅ Leader created room
🧊 ICE gathering state: gathering
🧊 ICE connection state: checking
🧊 ICE connection state: connected
✅ Peer fully connected
```

---

#### Test 3: Time Synchronization

**URL:** http://localhost:8000/test-sync.html

**Prerequisites:** Chrome mDNS flag disabled (see above)

**Tests:**

1. Open test page in Tab 1
2. Click "Create Room"
3. Open test page in Tab 2
4. Enter room code → click "Join Room"
5. Watch synchronization stats update in real-time

**Expected Results:**

- RTT: 1-5ms (same machine), 10-50ms (same WiFi)
- Offset stabilizes after 5-10 samples
- Status shows "Stable" after stabilization
- Offset stays stable over 5+ minutes

---

#### Test 4: Synchronized Metronome (Full MVP)

**URL:** http://localhost:8000/index.html

**Prerequisites:** Chrome mDNS flag disabled (see above)

**Tests:**

1. Open main app in Tab 1
2. Click "Create Room" → set BPM → create
3. Note the room code (or use QR code)
4. Open main app in Tab 2
5. Click "Join Room" → enter code → join
6. Leader clicks "Start Metronome"
7. Both tabs should play synchronized metronome

**Verification:**

- Use headphones with both devices/tabs side by side
- Clicks should be synchronized within ~20ms
- Visual beat indicator should flash in sync
- Downbeats (every 4 beats) should align

---

## Testing Across Devices

For testing across real devices (phones, laptops on same network):

### Option 1: Use ngrok

```bash
# Expose local server to internet
ngrok http 8000

# Access from any device using ngrok URL
https://abc123.ngrok.io/test-webrtc.html
```

### Option 2: Use Local Network IP

```bash
# Find your local IP
ipconfig getifaddr en0  # macOS
ip addr show            # Linux

# Access from devices on same network
http://192.168.1.x:8000/test-webrtc.html
```

**Note:** For cross-device testing, the Chrome mDNS flag is **not needed** because devices have different IPs.

---

## Common Issues

### Issue: "ICE connection state: failed"

**Cause:** Chrome mDNS privacy feature blocking local connections

**Solution:**

1. Disable `chrome://flags/#enable-webrtc-hide-local-ips-with-mdns`
2. Restart browser
3. Clear browser cache if still failing

---

### Issue: "Peer disconnected" immediately after connecting

**Cause:** Firewall blocking WebRTC traffic

**Solution:**

1. Check firewall settings
2. Allow Chrome/browser through firewall
3. Try disabling firewall temporarily for testing

---

### Issue: No audio playing

**Cause:** Browser autoplay policy or audio context not resumed

**Solution:**

1. Ensure you click a button before metronome starts (user interaction required)
2. Check browser console for Web Audio errors
3. Check system volume and browser tab not muted

---

## Browser Compatibility

### Desktop

- ✅ Chrome/Chromium (recommended for development)
- ✅ Firefox
- ✅ Edge
- ✅ Safari
- ✅ Brave (requires mDNS flag disabled for local testing)

### Mobile

- ✅ Android Chrome
- ✅ Android Firefox
- ⚠️ iOS Safari (requires screen-on, Web Audio limitations)

---

## Performance Benchmarks

### Expected Metrics

**Same Machine (tabs):**

- RTT: 1-5ms
- Clock offset: < 2ms
- Sync accuracy: < 5ms

**Same WiFi Network:**

- RTT: 10-50ms
- Clock offset: < 10ms
- Sync accuracy: < 20ms

**Cross-Internet (with TURN):**

- RTT: 50-200ms
- Clock offset: < 30ms
- Sync accuracy: < 50ms

### How to Measure Sync Accuracy

1. Open test-sync.html in two tabs/devices
2. Start metronome at 120 BPM
3. Use headphones to listen to both simultaneously
4. Human-perceptible sync: < 20ms (goal met!)
5. Sub-perceptible: < 10ms (bonus!)

---

## Debugging

### Enable Verbose WebRTC Logging

**Chrome:**

```
chrome://webrtc-internals/
```

Open this in a separate tab while testing to see detailed WebRTC stats, ICE candidates, and connection states.

**Firefox:**

```
about:webrtc
```

### Console Logging

The app includes detailed console logging:

- 🧊 ICE-related messages
- 🔗 Connection state changes
- 📤 Outgoing messages
- 📥 Incoming messages
- ✅ Successful operations
- ❌ Errors

Filter console by emoji to focus on specific subsystems.

---

## Production Testing

For production deployment testing:

1. Deploy to GitHub Pages (see IMPLEMENTATION.md)
2. Test with real Supabase signaling (not mock)
3. Test across different networks (WiFi, cellular)
4. Test with TURN server fallback
5. Measure actual sync accuracy with real devices
6. Test with 5-10 peers simultaneously

---

## Automated Testing (Future)

Currently using manual browser tests. Future improvements:

- Playwright/Puppeteer for automated WebRTC testing
- Headless browser testing for CI/CD
- Synthetic network conditions testing
- Audio output verification with Web Audio API analysis
