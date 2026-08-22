# Doomsday Trainer — UI language and styleguide

Implementation reference. Every value here is fixed. Do not substitute.

> **Scope note for this codebase.** This guide replaces the app's visual
> language only. **No structural changes.** Keep the existing 3/3/1 keypad and
> every element position, the existing content column width, the mastery grid's
> axis labels and its seven interval buckets, the navigation, and every screen's
> layout. Where this guide describes a structure that differs from what is built
> (a 4/3 keypad, a six-step mastery ramp, a 420px column, a 100-cell progress
> strip, hiding the nav during a session), keep what is built and apply only the
> colour, type, spacing, radius, border, motion and copy rules to it.
>
> The seven-step mastery ramp in use is fitted to the six brand ramp steps
> below rather than collapsed to six.

---

## 1. Design principles

**Precision over encouragement.** The app measures sub-second recall. It never
congratulates, never uses exclamation marks, never gamifies beyond a plain
counter. Feedback states report a fact.

**Position is memory.** Every interactive element that repeats across reps sits
at the same coordinates every time. The keypad never reflows, never reorders,
never resizes between questions. Layout stability is a functional requirement,
not an aesthetic one.

**The grid is the identity.** The 10×10 mastery grid is the signature element.
Nothing else in the app competes with it for attention.

**Zero layout shift during a session.** Content that changes between reps
changes in place. No element enters, leaves, grows, or moves.

---

## 2. Colour tokens

### Light mode

```
--bg                 #FAF9F6
--surface-1          #F1EFE8
--surface-2          #FFFFFF
--border             #DEDCD3
--border-strong      #C4C2B8

--text-primary       #2C2C2A
--text-secondary     #5F5E5A
--text-muted         #888780
--text-inverse       #FFFFFF

--brand              #7F77DD
--brand-deep         #534AB7
--brand-light        #AFA9EC
--brand-tint         #EEEDFE
--brand-on-tint      #3C3489

--grade-fast         #639922
--grade-medium       #EF9F27
--grade-slow         #D85A30
--grade-wrong        #E24B4A

--grade-fast-tint    #EAF3DE
--grade-wrong-tint   #FCEBEB

--mastery-0          #EAE8E0
--mastery-1          #EEEDFE
--mastery-2          #CECBF6
--mastery-3          #AFA9EC
--mastery-4          #7F77DD
--mastery-5          #534AB7
```

### Dark mode

```
--bg                 #17161A
--surface-1          #1F1E24
--surface-2          #27262E
--border             #34333C
--border-strong      #46454F

--text-primary       #EDEBE4
--text-secondary     #A5A29A
--text-muted         #75736D
--text-inverse       #17161A

--brand              #AFA9EC
--brand-deep         #7F77DD
--brand-light        #CECBF6
--brand-tint         #26215C
--brand-on-tint      #CECBF6

--grade-fast         #97C459
--grade-medium       #FAC775
--grade-slow         #F0997B
--grade-wrong        #F09595

--grade-fast-tint    #173404
--grade-wrong-tint   #501313

--mastery-0          #27262E
--mastery-1          #26215C
--mastery-2          #3C3489
--mastery-3          #534AB7
--mastery-4          #7F77DD
--mastery-5          #AFA9EC
```

### Rules

The palette is constrained by the app itself: grading already spends green,
amber, orange and red on latency. The brand has to sit outside that range or
feedback stops reading instantly. Purple is the only ramp that does.

Grading colours appear **only** in the feedback flash and in the latency
histogram. They never tint cards, headers, buttons, or the mastery grid.
Reusing them elsewhere destroys the pre-attentive read.

The brand colour never appears on a control the user taps during a rep. It is
reserved for the mastery grid ramp, the progress bar, and non-rep navigation.

The seven answer buttons stay neutral. Colour-coding 0–6 would compete with the
grading colours at the exact moment feedback fires.

The mastery grid's lightest two steps are close enough that they need the
hairline border to separate. That is deliberate: an unseen item and a
barely-introduced item should not look different at a glance, because
functionally they are not.

Dark mode is the default on first launch. The app is used late.

---

## 3. Typography

```
--font-sans   'IBM Plex Sans', system-ui, sans-serif
--font-mono   'IBM Plex Mono', ui-monospace, monospace
```

Load weights **400 and 500 only**. No other weights are used anywhere.

The deciding constraint is digit disambiguation, not personality. Every screen
is digits, and the answer set 0–6 contains the two pairs geometric sans faces
collapse: 0/6 and 3/5. Plex Mono has tabular widths by default, which the 10×10
grid needs, and its 6 has a straight stem rather than a closed bowl, so it never
reads as 0 at speed.

```
Scale             size   weight  family  tracking   use
--type-prompt     72px   400     mono    -0.02em    the two-digit year
--type-key        24px   400     mono    0          keypad digit
--type-title      22px   500     sans    -0.01em    screen title
--type-heading    17px   500     sans    0          section heading
--type-body       15px   400     sans    0          body text
--type-label      13px   400     sans    0.01em     field label, stat label
--type-caption    11px   400     sans    0.02em     metadata
--type-cell       11px   400     mono    0          mastery grid cell
--type-stat       28px   400     mono    -0.01em    stat card value
```

Line height is 1.0 for `prompt`, `key`, `stat` and `cell`. 1.5 for everything
else.

All digits render in `--font-mono` with `font-variant-numeric: tabular-nums`.
This is not optional; the mastery grid and the stat columns depend on it.

The prompt digit is weight 400, not 500. Weight 500 is reserved for the selected
key so the two never compete.

Sentence case everywhere. No title case, no all caps, no letter-spaced small
caps.

---

## 4. Spacing

4px base unit.

```
--space-1  4px     --space-5  24px
--space-2  8px     --space-6  32px
--space-3  12px    --space-7  48px
--space-4  16px    --space-8  64px
```

Screen horizontal padding is `--space-5` (24px) on all screens, all
breakpoints.

---

## 5. Radius

```
--radius-xs     3px      mastery grid cells
--radius-sm     6px      badges, chips, inline tags
--radius-md     10px     keypad keys, buttons, inputs, select
--radius-lg     14px     cards, sheets, modals
--radius-pill   999px    progress bar track and fill only
```

No other radius values. Single-sided borders never get a radius.

---

## 6. Borders and elevation

```
--stroke-hairline   1px solid var(--border)
--stroke-strong     1px solid var(--border-strong)
```

All borders are 1px. No 0.5px, no 2px, with one exception: the keypad key
showing the correct answer after a wrong tap uses `2px solid var(--grade-fast)`.

Elevation is flat throughout. One shadow exists in the entire app:

```
--shadow-keypad     0 -1px 0 0 var(--border)
```

A hairline, not a drop shadow. No blur, no spread, no other shadows anywhere.

---

## 7. Motion

The app is a latency instrument. Animation that delays input or obscures timing
is a defect.

```
--dur-instant   0ms      --dur-advance  120ms
--dur-flash     160ms    --dur-ui       180ms
--dur-hold      200ms

--ease-out      cubic-bezier(0.2, 0, 0, 1)
```

- The keypad has **no** press animation, no scale, no ripple.
- Feedback fill applies at `--dur-instant`. The colour is there on the same
  frame as the tap.
- Correct: fill holds for `--dur-hold`, then the prompt crossfades to the next
  item over `--dur-advance`.
- Wrong: fill applies instantly and persists until the user taps to continue.
  No timer, no auto-advance.
- Screen transitions use `--dur-ui` opacity only. No slide, no push.
- The mastery grid animates cell colour changes over `--dur-ui` when the stats
  screen mounts. This is the only decorative motion in the app.
- `prefers-reduced-motion: reduce` sets every duration above to `0ms` except
  `--dur-hold`, which is timing, not motion.

---

## 8. Components

### Prompt

Two digits, always zero-padded (07, not 7). `--type-prompt`, `--text-primary`,
centred. No card, no frame, no label above it. The number sits on the page
background alone.

### Keypad key

```
Radius            --radius-md
Background        --surface-2
Border            --stroke-hairline
Type              --type-key
Colour            --text-primary
```

States:

```
Resting           background --surface-2, border --border
Hover (pointer)   border --border-strong
Focus-visible     outline 2px solid var(--brand), outline-offset 2px
Correct           background --grade-fast, colour --text-inverse, weight 500
Wrong             background --grade-wrong, colour --text-inverse, weight 500
Answer reveal     background --surface-2, border 2px solid var(--grade-fast)
Disabled          not used — keys stay live between reps
```

There is no pressed state. The tap produces a grading state directly.

### Mastery grid

```
Cell radius       --radius-xs
Cell background   --mastery-N per current interval bucket
Cell type         --type-cell, the two-digit year
Cell text colour  --text-secondary on the light steps
                  --text-inverse on the dark steps
```

### Card

```
Background        --surface-2
Border            --stroke-hairline
Radius            --radius-lg
Padding           --space-4 --space-5
```

Used for the item detail sheet and settings groups. Not on the review screen.

### Stat card

```
Background        --surface-1
Border            none
Radius            --radius-md
Padding           --space-4
Label             --type-label, --text-secondary, above
Value             --type-stat, --text-primary, below
```

### Button

```
Height            44px
Padding           0 --space-4
Radius            --radius-md
Type              --type-body, weight 500
```

Two variants only.

```
Primary           background --brand-deep, colour --text-inverse, no border
Secondary         background transparent, colour --text-primary, --stroke-strong
```

One primary per screen, maximum. Never on the review screen.

### Progress bar

```
Track   --surface-1, height 6px, --radius-pill
Fill    --brand, --radius-pill
```

---

## 9. Feedback sequence

Correct:

```
t=0ms      pointerdown fires, latency recorded, key fills --grade-fast
t=200ms    prompt begins crossfade
t=320ms    next prompt fully visible, key returns to resting
```

Wrong:

```
t=0ms      pointerdown fires, latency recorded, key fills --grade-wrong
t=0ms      correct key gets 2px --grade-fast border
t=∞        state persists; any tap advances
```

No sound. No haptic on correct. Haptic on wrong only, a single light impact.

---

## 10. Copy

Sentence case. No terminal punctuation on labels, buttons, or headings. Helper
text and empty-state body copy take periods.

Never used anywhere in the product:

```
Great, Nice, Well done, Keep it up, Almost, Oops, Try again
Any exclamation mark
Any emoji
Any streak language beyond the plain number
```

Wrong-answer copy is the correct value and nothing else. The reveal border
communicates the rest.

Empty review queue: heading `Nothing due`, body `Next review in 4 hours.`
Never `Nothing here yet.`

Errors state what happened and what to do, in one sentence, no prefix.

---

## 11. Accessibility

```
Minimum hit target        44 × 44
Minimum text contrast     4.5:1 body, 3:1 for --type-prompt at 72px
Focus indicator           2px solid --brand, offset 2px, never removed
```

Every keypad key has an `aria-label` reading the digit. The prompt has
`aria-live="polite"` announcing the year.

Feedback is never colour-only. Correct and wrong differ by fill colour and by
the presence of the reveal border on a second key.

Physical keyboard: keys 0 through 6 map to the corresponding answer. Space or
Enter advances after a wrong answer.

---

## 12. What this app does not have

No gradients. No drop shadows. No blur, glass, or translucency. No skeuomorphic
calendar imagery. No illustration. No mascot. No onboarding carousel. No
confetti. No streak flames. No sound.
