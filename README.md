# GPE → KE: Felix Baumgartner Freefall (GCSE)

An interactive, single-file web app to explore how Gravitational Potential Energy (GPE) converts to Kinetic Energy (KE) during a high-altitude freefall, inspired by Felix Baumgartner's 2012 jump from ~39 km.

Open `index.html` in your browser—no build needed.

## What students can do

- Set mass, jump altitude, and parachute deploy altitude.
- Toggle air resistance (drag) and choose gravity model: simplified g=10 N/kg or realistic g(h).
- See live plots of GPE, KE, and energy dissipated by air (thermal).
- Observe max speed, time before deployment/ground, and compare ideal vs drag cases.
- Includes a simple SVG astronaut animation linked to the altitude profile.

## Physics used

- GPE = m g h (or with g(h) when enabled).
- KE = ½ m v².
- Drag force: F_d = ½ ρ C_d A v² opposing motion.
- Atmosphere: ρ(h) = ρ₀ exp(−h/H) with ρ₀≈1.225 kg/m³, H≈8500 m.
- Gravity: either simplified g=10 N/kg, or g(h) = g₀ (R/(R+h))² with R = 6.371×10⁶ m.

Numerical integration uses a small time step with semi-implicit Euler. Parameters (C_d, area) are simplified and constant; real jumps change posture and include compressibility/Mach effects.

## Defaults (approximate)

- Mass (jumper + suit): 118 kg
- Jump altitude: 39,045 m
- C_d: 1.0, Area: 0.8 m² (rough, body tucked/partially streamlined)

## Suggested questions

- Without drag, what is the maximum KE at deploy? How does this compare to initial GPE?
- With drag, why does KE peak and then reduce before deployment?
- How does changing C_d or area affect max speed and energy dissipated?
- What happens to g(h) at 39 km compared to sea level? Is the difference significant?

## Running

Just open `index.html` in a modern browser. If using VS Code, right-click → "Open with Live Server" for auto-refresh, or double-click the file in Finder.

## Troubleshooting

- If the chart is blank, click "Run simulation" again.
- If you set an extremely small dt or large inputs, the simulation caps runtime to prevent lockups.

## License

For teaching use only.
