# Atmospheric Features Guide

## 🌤️ Weather System

### How It Works

**With Zipcode (Real Weather):**
1. Open fridge door
2. Enter your US zipcode in settings
3. Weather updates every 30 minutes using Open-Meteo API (free, no key needed)

**Without Zipcode (Random Weather):**
- Random weather conditions change periodically
- Adds variety and ambiance to your kitchen

### Weather Conditions

| Condition | Visual Effect | When It Appears |
|-----------|---------------|-----------------|
| ☀️ Sunny | Bright sun icon, clear sky | Clear weather codes |
| ☁️ Cloudy | Soft cloud overlay | Overcast conditions |
| 🌧️ Rainy | Animated rain streaks | Precipitation detected |
| ❄️ Snowy | Falling snowflakes | Cold precipitation |

---

## 🌗 Day/Night Cycle

The kitchen automatically adjusts based on your local time:

### Daytime (6 AM - 6 PM)
- **Sky**: Bright blue gradient
- **Lighting**: Warm yellow light from window
- **Atmosphere**: Energetic, bright
- **Window glow**: Strong natural daylight

### Evening (6 PM - 9 PM)
- **Sky**: Orange/pink sunset gradient
- **Lighting**: Warm orange glow
- **Atmosphere**: Cozy, golden hour
- **Window glow**: Soft amber tones

### Night (9 PM - 6 AM)
- **Sky**: Dark blue/black gradient with stars
- **Lighting**: Cool blue moonlight
- **Atmosphere**: Calm, quiet
- **Window glow**: Subtle cool tones

---

## 💡 Dynamic Lighting System

### Light Sources

**Fridge Spotlight (Always Active)**
- Warm 800px radial light cone
- Centers on the fridge
- Ensures fridge is always visible
- Cannot be disabled (core feature)

**Window Light (Time-Dependent)**
- 600px elliptical light cone
- Changes color with time of day
- Casts from window toward kitchen
- Creates atmospheric depth

### Customization

**Ambient Intensity Slider**
- Range: 20% - 100%
- Default: 60%
- Affects: Both light cones together
- Does NOT affect fridge visibility (filtered separately)

```
Low (20-40%):   Moody, dramatic atmosphere
Medium (50-70%): Balanced, cozy ambiance  
High (80-100%): Bright, cheerful environment
```

---

## 🎨 Visual Integration

### Realistic Mode
- Soft gradient light cones with blur
- Smooth color transitions
- Natural weather animations

### Pixel Art Mode
- Reduced blur for retro feel
- Weather effects still animated
- Window has pixel-style border
- VT323 font for weather display

---

## 🔧 Technical Details

### APIs Used

**Zippopotam (Geocoding)**
- Free, no key required
- Converts zipcode → lat/lon
- URL: `api.zippopotam.us/us/{zipcode}`

**Open-Meteo (Weather)**
- Free, no key required
- Current weather conditions
- URL: `api.open-meteo.com/v1/forecast`
- Temperature in Fahrenheit

### Update Intervals

- **Day/Night Cycle**: Updates every 5 minutes
- **Weather Data**: Updates every 30 minutes
- **Initial Load**: Both systems initialize on page load

### Local Storage

Settings persisted in browser:
- `zipcode` - User's weather location
- `ambientIntensity` - Lighting brightness (20-100)

---

## 💡 Tips

1. **No Zipcode?** Leave blank for random weather that changes automatically
2. **Too Dark?** Increase ambient intensity slider in settings
3. **Performance**: Lighting uses CSS blur filters (GPU accelerated)
4. **Time Zone**: Uses your browser's local time for day/night cycle
5. **Fridge Always Visible**: Core spotlight ensures usability at all times

---

## 🌟 Future Enhancements

Potential additions (not yet implemented):
- Weather forecast preview
- Custom time zone selection
- Manual time override (simulate different times)
- Additional weather conditions (fog, thunderstorms)
- Seasonal variations (longer nights in winter)
- Light color temperature customization
