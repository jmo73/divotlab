---
name: Practice Library page
description: The practice-library.html rebuild — accordion drills, category tabs, HC filter, overall design decisions
type: project
---

## File location
- Live file: `practice-library.html` (production)
- The v2 development file was `practice-library-v2.html` — now redundant, can be deleted

## Structure
- 5 category tabs: Driving (red), Approach (blue), Short Game (gold), Putting (green), Mental (purple)
- Each panel has: Start Here callout → Fundamentals (collapsible Setup/Feels/Avoid) → Drill quick-nav pills → Accordion drills → Sessions → Resources
- 26 total drills across 5 categories
- Level filter: subtle inline row (All / High / Mid / Low / Scratch) — just bold white text when active, no background

## Key design decisions
- Fundamentals section is COLLAPSIBLE — hidden by default, toggled with a button
- Accordions have smooth max-height transition and category-colored left border when open
- First drill opens automatically on page load
- Tab switching scrolls to content and resets level filter to All
- Drill quick-nav pills turn green when a drill is marked done
- Session card steps are clickable — jump to and open the referenced drill accordion

## Drill completion tracking
- Uses localStorage key: 'divotlab_drills_done'
- Each drill gets a checkmark circle on the accordion trigger
- Tab badges show "X/Y" completion count when any drills are done
- Share button inside each open accordion copies a direct URL to that drill

## CTA band
- Links to /practice (the Practice Plan quiz)
- Dark green gradient card, positioned between content and footer
- Text: "Want a plan built around your specific weaknesses?"
