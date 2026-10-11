# OpenQuiz Design System

OpenQuiz DS is a buildless HTML, CSS, and JavaScript design system inspired by the measured visual language of OpenQuiz. It combines the extracted foundations with accessible extensions required for complete learning workflows.

## Preview

Open `index.html` directly in a browser, or serve the repository with any static server:

```powershell
npx serve .
```

The core interface works from the filesystem. Cabinet Grotesk and GSAP are progressive CDN enhancements; system fonts and CSS transitions remain available when those resources cannot load.

## Project structure

```text
index.html              Interactive design system documentation
page/index.html         Full learning-product example
css/variables.css       Public tokens and light/dark themes
css/reset.css           Baseline and accessibility reset
css/components.css      Reusable component API
css/style.css           Documentation and example compositions
css/responsive.css      Breakpoints and reduced-motion behavior
js/utils.js             Shared DOM, storage, focus, and copy helpers
js/data.js              Buildless sample-data module
js/main.js              Theme, navigation, tabs, modal, and motion logic
data/mockData.json      Portable example data
```

## CSS setup

Load the stylesheets in this order:

```html
<link rel="stylesheet" href="css/variables.css">
<link rel="stylesheet" href="css/reset.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/responsive.css">
```

Applications that only need the reusable kit can omit `style.css` and `responsive.css`, then provide their own composition layer.

## Tokens

All public custom properties use the `--oq-` namespace. Component styles consume semantic tokens rather than fixed light-theme values.

```css
.lesson-banner {
  padding: var(--oq-space-6);
  color: var(--oq-text);
  background: var(--oq-surface-solid);
  border: 1px solid var(--oq-border);
  border-radius: var(--oq-radius-xl);
  box-shadow: var(--oq-shadow-md);
}
```

Token groups cover semantic colors, display and body typography, a four-point spacing scale, shape, elevation, focus, containers, motion, and layering.

## Themes

Set the active theme on the root element:

```html
<html data-theme="light">
<html data-theme="dark">
```

Light is the default. The included theme control stores the user's explicit selection under the `oq-theme` local-storage key. Storage failure falls back safely to light mode.

## Components

Components use a base class plus explicit modifiers:

```html
<button class="oq-btn oq-btn--primary" type="button">Continue</button>
<button class="oq-btn oq-btn--outline oq-btn--sm" type="button">Preview</button>

<article class="oq-card oq-card--interactive">
  <div class="oq-card__body oq-stack">
    <span class="oq-badge oq-badge--success">Complete</span>
    <h2>Vocabulary practice</h2>
  </div>
</article>
```

The public kit includes buttons, cards, badges, fields, selects, text areas, checkboxes, radio controls, switches, alerts, tabs, tables, tooltips, navigation, footer, and modal dialogs.

### Interactive DOM contracts

- `[data-theme-toggle]` switches and stores the active theme.
- `[data-menu-toggle]` controls the matching `[data-mobile-menu]` navigation.
- `[data-tabs]` initializes accessible arrow-key tabs.
- `[data-modal-open="dialog-id"]` opens a native dialog with focus management.
- `[data-modal-close]` closes the nearest dialog and restores focus.
- `[data-accordion]` enables click and arrow-key horizontal panels.

## Accessibility behavior

- Text and controls target WCAG AA contrast in both themes.
- Interactive targets are at least 40px, with primary controls at 48px.
- Focus indicators use a semantic high-contrast focus token.
- Tabs support Left, Right, Home, and End keys.
- Dialogs support Escape, focus trapping, backdrop close, and focus restoration.
- Alerts combine color with iconography and text.
- `prefers-reduced-motion` removes scroll animation and marquee movement.
- Essential content remains visible when JavaScript or GSAP is unavailable.

## Extension rules

1. Use semantic tokens before primitives.
2. Keep component classes inside the `oq-` namespace.
3. Add modifiers for stable variants; use state attributes for behavior.
4. Preserve a visible focus state and a minimum 40px touch target.
5. Test every new component in light, dark, keyboard-only, and reduced-motion modes.
6. Label inferred additions as system extensions in documentation.

## Responsive targets

The system is verified around 375, 768, 1024, 1280, and 1440px. Layouts collapse to one column on narrow screens, navigation becomes a menu, and the product sidebar becomes a horizontal control strip.
