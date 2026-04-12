Before writing any frontend code, pause and commit to a clear aesthetic direction. This thinking step is non-negotiable — it separates memorable interfaces from forgettable ones.

## The Four Questions

Answer all four before touching code:

### 1. Purpose
What problem does this interface solve? Who uses it, and in what context? A dashboard for a tired ops engineer at 2am needs different design energy than a landing page for a luxury skincare brand. Let the use case drive every choice.

### 2. Tone — Pick an Extreme
Don't be timid. Choose a strong aesthetic pole and commit. Examples (use as springboards, not templates):

- Brutally minimal — one font, one color, nothing decorative
- Maximalist chaos — layered, dense, overwhelming in the best way
- Retro-futuristic — CRT glow, scan lines, terminal aesthetics
- Organic/natural — irregular forms, earthy tones, imperfect textures
- Luxury/refined — restrained palette, exquisite spacing, whisper-quiet motion
- Playful/toy-like — chunky shadows, saturated primaries, bouncy interactions
- Editorial/magazine — strong typographic hierarchy, pull quotes, ruled lines
- Brutalist/raw — harsh grids, unstyled HTML energy turned intentional
- Art deco/geometric — symmetry, gold accents, ornate structural patterns
- Soft/pastel — high-key light, gentle gradients, rounded everything
- Industrial/utilitarian — monospace, muted steel tones, function-first

### 3. Constraints
What are the hard technical limits? Framework requirements, bundle size, accessibility (WCAG), browser support, performance budget? Name them explicitly so they inform decisions rather than surprise you later.

### 4. Differentiation — The One Unforgettable Thing
What is the single detail someone will remember about this interface 24 hours later? A cursor that leaves a trail. A headline that fractures on hover. A color so specific it feels proprietary. Name it before building it.

---

## Implementation Principles

Once direction is locked, execute with precision:

### Typography
- No generic fonts (Arial, Inter, Roboto, system-ui). Ever.
- Pair a distinctive display font with a refined body font.
- Use Google Fonts, Adobe Fonts, or self-hosted variable fonts.
- Type size, weight, tracking, and leading are design decisions — treat them as such.
- A great type choice can carry an entire design.

### Color & Theme
- Use CSS variables (`--color-*`, `--space-*`, `--type-*`) for every token.
- One dominant color family. One sharp accent. Maximum three.
- Timid, evenly-distributed palettes feel undesigned. Commit.
- Dark and light themes should be equally valid options — vary between them across builds.

### Motion
- Prioritize CSS-only animations for HTML; use Motion library in React when available.
- One well-orchestrated page load (staggered `animation-delay` reveals) beats ten scattered micro-interactions.
- Scroll-triggered reveals, hover state surprises, entrance choreography.
- Motion should feel inevitable, not decorative.

### Spatial Composition
- Fight the urge toward predictable card grids and centered stacks.
- Use asymmetry, overlap, diagonal flow, grid-breaking elements.
- Generous negative space OR controlled density — never the lukewarm middle.
- Whitespace is not empty space; it is structure.

### Backgrounds & Visual Atmosphere
- Never default to a solid `#ffffff` or `#000000` background without intention.
- Options: gradient meshes, CSS noise textures, geometric SVG patterns, layered transparencies, grain overlays, dramatic shadows, decorative borders, custom cursors.
- Background treatment sets the entire emotional register of the design.

---

## Anti-Patterns — Never Do These

- `font-family: Inter, sans-serif` as a default choice
- Purple gradient on white (the universal sign of AI-generated design)
- Equal visual weight given to every element (no hierarchy)
- `border-radius: 8px` on everything
- Predictable hero → features → CTA layout without variation
- Animations that add duration without adding meaning
- Color palettes from a random generator with no commitment
- Space Grotesk as a "distinctive" choice (it is not, anymore)

---

## The Thinking Output

Before coding, write a brief design brief (2–4 sentences) stating:

1. The chosen aesthetic direction
2. The key font pairing
3. The color approach
4. The one unforgettable detail

This brief is the contract you hold yourself to during implementation. If a decision doesn't serve the brief, cut it.

---

## Execution Reminder

Match complexity to vision. A maximalist design needs elaborate, layered code. A minimalist design needs precision, restraint, and obsessive attention to spacing. Both are valid. Neither is easier. Execute the vision — don't settle for approximately right.

Claude is capable of extraordinary creative work. Don't default to safe. Commit fully to the direction and build something genuinely distinctive.
