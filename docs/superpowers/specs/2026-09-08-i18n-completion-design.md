# Complete English/Japanese UI localization

## Goal

Make all application-owned, user-visible React UI copy available in English
and Japanese. Preserve user-provided values (uploaded data, template names,
field labels, and recipe names) verbatim.

## Translation architecture

- Keep one typed `messages` catalog in `src/core/i18n.ts`.
- Add every application-owned label, help text, confirmation, error, and ARIA
  label in both locales. A compile-time key type prevents invalid lookups.
- Components create a translator from the persisted setting and render catalog
  entries rather than literal interface text.
- Dynamic messages use small interpolation helpers so translated sentence
  structure is preserved.

## Locale behavior and accessibility

- Selecting a locale persists it in existing settings and updates the React UI
  immediately.
- The app sets `document.documentElement.lang` to the active locale and updates
  the document title whenever that locale changes.
- The first-visit language dialog opens with focus on its first choice, keeps
  Tab and Shift+Tab within its choices, and prevents the inactive app content
  from receiving focus while open.
- The dialog remains an explicit selection step; it cannot be dismissed without
  choosing a language.

## Scope

Included: all visible copy in React application components, labels in settings,
guided tour text, alerts created in client code, and ARIA/title/placeholder
attributes. Static SEO metadata and the no-JavaScript fallback remain Japanese,
because they are served before an application locale exists. User data and
custom schema content are not translated.

## Verification

- Unit tests cover catalog parity, locale persistence, document language/title
  synchronization, and dialog keyboard focus cycling.
- Browser automation covers first-visit selection, persisted reload, in-app
  language switching, and absence of Japanese application UI copy in English
  mode for the exercised views.
- Run the full test suite, typecheck, lint, and production build before push.
