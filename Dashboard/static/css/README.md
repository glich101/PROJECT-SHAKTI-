# CSS Organization Guide

## Overview

The CSS has been reorganized into a modular, maintainable structure following best practices:
- **BEM naming convention** for clarity and consistency
- **Utility-first approach** for rapid development
- **Single responsibility** - each file has one clear purpose
- **Variables-based theming** for easy customization
- **Responsive design** with mobile-first approach

## File Structure

```
static/css/
├── main.css              # Master file that imports all modules (use this in HTML)
├── variables.css         # CSS custom properties, colors, spacing, typography
├── base.css             # Reset, normalize, and base element styles
├── layout.css           # Page layout, sidebar, header, main content area
├── components.css       # Reusable components: buttons, cards, forms, badges
└── utilities.css        # Utility classes for spacing, text, colors, flexbox
```

## File Descriptions

### 1. **main.css** (Entry Point)
The master stylesheet that imports all other CSS files in the correct order:
1. Variables
2. Base styles
3. Layout
4. Components
5. Utilities

**Use this file in your HTML:**
```html
<link rel="stylesheet" href="{{ url_for('static', filename='css/main.css') }}">
```

### 2. **variables.css** (Configuration)
Defines all CSS custom properties (CSS variables) for consistent design:
- **Colors**: Primary, secondary, accent, danger, success, warning, info
- **Spacing**: xs, sm, md, lg, xl, 2xl
- **Sizing**: Border radius, sidebar width, card radius
- **Typography**: Font family, sizes, weights, line heights
- **Shadows**: Multiple shadow levels (xs to xl)
- **Transitions**: Fast, normal, slow
- **Breakpoints**: Media query breakpoints (sm, md, lg, xl)

Dark theme variants are also defined here.

**Usage Example:**
```css
color: var(--color-accent);
padding: var(--space-md);
font-weight: var(--font-weight-bold);
```

### 3. **base.css** (Foundational Styles)
Reset and normalize styles for HTML elements:
- Font imports
- HTML/body resets
- Typography defaults (headings, paragraphs)
- Links styling
- Images and media handling
- Form elements
- Accessibility features (focus states, skip links)
- Scrollbar customization

### 4. **layout.css** (Page Structure)
Defines the overall page layout and structure:
- Main flex layout container
- **Sidebar styling** (.sidebar, .sidebar-modern)
  - Header section (.sidebar__header)
  - Menu/Navigation (.sidebar__menu, .nav-link)
  - Footer section (.sidebar__footer)
  - Mobile responsive behavior
- **Main content area** (.content-area, .main-content)
  - Top bar / Header
  - Main content padding
  - Dashboard layout wrapper
- **Responsive breakpoints** for tablet and mobile
- **BEM naming**: `.sidebar__header`, `.sidebar__link--active`

### 5. **components.css** (Reusable Components)
Styles for specific UI components:

#### Buttons
- `.btn` - Base button style
- `.btn--primary` / `.btn-primary` - Primary action
- `.btn--outline` / `.btn-outline-secondary` - Outline variant
- `.btn--secondary` - Secondary style
- `.btn--danger` - Danger action
- `.btn--sm`, `.btn--lg` - Size variants
- `.btn--block` - Full width
- Special buttons: `.btn-reset`, `.btn-theme`

#### Cards
- `.card` / `.dashboard-card` - Card container
- `.card__header` / `.dashboard-card-header` - Header section
- `.card__title` / `.dashboard-card-title` - Title
- `.card__meta` / `.dashboard-card-meta` - Metadata
- `.card__body` - Body content
- `.card__footer` / `.dashboard-card-footer` - Footer section

#### Charts
- `.chart-container` / `.dashboard-card-graph` - Chart wrapper
- `.chart-toolbar` - Toolbar area
- `.chart-spinner` - Loading spinner

#### Forms
- `.form-label` - Label styling
- `.form-control`, `.form-select` - Input fields

#### Other
- `.badge` - Badge component with variants
- `.dashboard-empty` - Empty state

### 6. **utilities.css** (Helper Classes)
Utility classes for rapid development and responsive design:

#### Display
- `.d-none`, `.d-block`, `.d-flex`, `.d-grid`, `.d-inline`, `.d-inline-block`
- Responsive: `.d-md-none`, `.d-md-block`, `.d-sm-none`, etc.

#### Flexbox
- `.flex-row`, `.flex-column`, `.flex-center`, `.flex-between`
- `.align-items-center`, `.justify-content-center`, `.justify-content-between`
- `.gap-1`, `.gap-2`, `.gap-3`

#### Spacing (Margin)
- `.m-0`, `.m-1`, `.m-2`, `.m-3` - Margin
- `.mx-auto`, `.my-auto` - Auto margins
- `.mt-0/1/2/3`, `.mb-0/1/2/3`, `.ml-auto`, `.mr-auto`

#### Spacing (Padding)
- `.p-0`, `.p-1`, `.p-2`, `.p-3` - Padding
- `.px-1/2`, `.py-1/2` - Horizontal/vertical padding
- `.pt-1/2`, `.pb-1/2` - Top/bottom padding

#### Text
- **Alignment**: `.text-center`, `.text-left`, `.text-right`
- **Color**: `.text-primary`, `.text-secondary`, `.text-muted`, `.text-accent`, `.text-white`, `.text-danger`, `.text-success`, `.text-warning`, `.text-info`
- **Weight**: `.font-weight-normal`, `.font-weight-medium`, `.font-weight-semibold`, `.font-weight-bold`, `.font-weight-extrabold`
- **Size**: `.text-sm`, `.text-base`, `.text-lg`, `.text-xl`, `.text-2xl`
- **Transform**: `.text-uppercase`, `.text-lowercase`, `.text-capitalize`, `.text-nowrap`

#### Background Colors
- `.bg-primary`, `.bg-surface`, `.bg-white`, `.bg-light`, `.bg-dark`, `.bg-danger`, `.bg-success`

#### Borders & Rounded
- `.rounded`, `.rounded-sm`, `.rounded-lg`
- `.border`, `.border-top`, `.border-bottom`

#### Shadows
- `.shadow-xs`, `.shadow-sm`, `.shadow-md`, `.shadow-lg`, `.shadow-none`

#### Sizing
- `.w-100`, `.h-100`, `.w-auto`, `.h-auto`, `.min-h-screen`

#### Overflow
- `.overflow-hidden`, `.overflow-auto`, `.overflow-x-auto`, `.overflow-y-auto`

#### Position
- `.position-relative`, `.position-absolute`, `.position-fixed`, `.position-sticky`

#### Opacity
- `.opacity-0`, `.opacity-50`, `.opacity-100`

#### Transitions
- `.transition-all`, `.transition-fast`, `.transition-slow`

#### Cursor
- `.cursor-pointer`, `.cursor-not-allowed`, `.cursor-default`

## BEM Naming Convention

This project follows **Block Element Modifier (BEM)** naming:

```
.block { }
.block__element { }
.block--modifier { }
.block__element--modifier { }
```

### Examples:
```css
/* Sidebar Block */
.sidebar { }
.sidebar__header { }
.sidebar__title { }
.sidebar__link { }
.sidebar__link--active { }
.sidebar__footer { }

/* Card Block */
.card { }
.card__header { }
.card__title { }
.card__meta { }
.card__body { }
.card__footer { }

/* Button Block */
.btn { }
.btn--primary { }
.btn--outline { }
.btn--sm { }
.btn--lg { }
```

## How to Use

### 1. In HTML Templates
```html
<head>
  <!-- Only include main.css - it imports all others -->
  <link rel="stylesheet" href="{{ url_for('static', filename='css/main.css') }}">
</head>
```

### 2. Using CSS Variables
```html
<div class="card">
  <h2 style="color: var(--color-accent);">Title</h2>
  <p style="padding: var(--space-md);">Content</p>
</div>
```

### 3. Using Component Classes
```html
<button class="btn btn--primary">Click me</button>
<button class="btn btn--outline btn--lg">Large outline</button>

<div class="card">
  <div class="card__header">
    <h3 class="card__title">Card Title</h3>
    <p class="card__meta">Metadata</p>
  </div>
  <div class="card__body">
    <!-- Content -->
  </div>
</div>
```

### 4. Using Utility Classes
```html
<!-- Flexbox layout -->
<div class="d-flex flex-center gap-2">
  <button class="btn btn--primary">Save</button>
  <button class="btn btn--outline">Cancel</button>
</div>

<!-- Spacing -->
<div class="mt-2 mb-3 px-2">
  <p class="text-center text-muted">No data available</p>
</div>

<!-- Responsive display -->
<nav class="d-md-none">Mobile menu</nav>
<nav class="d-none d-md-block">Desktop menu</nav>
```

## Customization

### Change Primary Color
Edit `variables.css`:
```css
:root {
  --color-accent: #0d6efd;      /* Change this */
  --color-accent-hover: #0a58ca; /* And this */
  --color-accent-light: #e7f1ff; /* And this */
}
```

### Change Font
Edit `variables.css`:
```css
:root {
  --font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

### Change Spacing Scale
Edit `variables.css`:
```css
:root {
  --space-md: 1rem;    /* Default unit of spacing */
  --space-lg: 1.5rem;
  --space-xl: 2.5rem;
}
```

### Add Dark Theme
The dark theme is already defined in `variables.css`. Apply it with:
```html
<body class="theme-dark">
  <!-- All CSS variables automatically switch to dark mode -->
</body>
```

## Benefits

1. **Maintainability**: Clear file organization and single responsibility
2. **Scalability**: Easy to add new components and utilities
3. **Consistency**: Variables ensure design coherence across the project
4. **Reusability**: Component and utility classes prevent code duplication
5. **Performance**: Split CSS files can be cached separately
6. **Accessibility**: Built-in focus states and semantic HTML support
7. **Responsive**: Mobile-first design with breakpoint utilities
8. **Theming**: Easy dark/light mode via CSS variables

## Migration Notes

- Old files: `site.css`, `style.css`, `animation.css`, `button.css`, `buttons.css`, `style-home.css`
- These have been consolidated and cleaned up into the new modular structure
- Update all HTML files to import only `main.css` instead of the old individual files
- All styles are preserved with improved naming and organization

## Additional Resources

- [CSS Variables MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [BEM Methodology](http://getbem.com/)
- [CSS Tricks Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)
- [Web Accessibility](https://www.w3.org/WAI/fundamentals/)
