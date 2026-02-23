# Chimera Codex Parity QA Checklist

Date: 2026-02-23  
Owner: Chimera UI/UX parity sprint

## 1. Preflight

- [ ] Build succeeds: `pnpm build`
- [ ] App launches in dev mode: `pnpm dev`
- [ ] No console errors on initial load

## 2. Left Sidebar

- [ ] Sidebar width drag works and persists
- [ ] Search filters sessions live
- [ ] Sort and Group controls update list correctly
- [ ] Active row style is clear and stable
- [ ] Thread context menu actions work (rename/pin/archive/unread/close)

## 3. Composer + Cloud

- [ ] Composer is disabled when no workspace is selected
- [ ] `Cloud` button is disabled without workspace
- [ ] `Cloud` opens inline panel below composer (not right panel)
- [ ] Clicking outside composer closes cloud surface
- [ ] `Esc` closes cloud surface
- [ ] Switching thread closes cloud surface
- [ ] Opening Settings/Command Palette closes cloud surface

## 4. Browser Right Panel

- [ ] Topbar `Browser` button toggles right panel
- [ ] `Cmd+Shift+B` toggles browser panel
- [ ] `Esc` closes browser panel
- [ ] Closing panel preserves chat layout alignment

## 5. Thread Switching + Scroll

- [ ] If user is reading older messages, switching threads preserves exact scroll position
- [ ] If user is near bottom, switching threads returns near bottom behavior
- [ ] No sudden jump to top on thread switch
- [ ] No noticeable jank during rapid thread switching

## 6. Chat Rendering + Virtualization

- [ ] Small threads render normally (no missing messages)
- [ ] Large threads (>120 items) virtualize without flicker
- [ ] Scrolling long threads remains smooth
- [ ] Pending approvals and thinking rows render correctly in virtualized mode

## 7. Keyboard + Commands

- [ ] `Cmd+K` opens command palette
- [ ] `Cmd+Shift+C` toggles cloud surface
- [ ] `Cmd+Enter` sends prompt
- [ ] `Cmd+1..9` switches threads
- [ ] `Esc` closes the top-most open modal/surface

## 8. Visual Consistency

- [ ] Sidebar, topbar, composer, and right panel spacing look consistent
- [ ] Focus rings are visible on keyboard navigation
- [ ] Hover states are subtle and consistent
- [ ] Scrollbars are unobtrusive and readable
- [ ] Motion feels smooth and not distracting

## 9. Performance Sanity

- [ ] App cold start feels responsive
- [ ] Opening Settings, Cloud, Browser, Command Palette has no long freeze
- [ ] Large thread open time is acceptable
- [ ] CPU usage remains stable during continuous scroll

## 10. Current Punch List

- [ ] Validate lazy markdown load visually on first assistant message (ensure no flash mismatch)
- [ ] Confirm codex-level parity for every hover/focus animation timing via side-by-side visual session
- [ ] Add automated Playwright regression tests for:
  - thread switch scroll retention
  - cloud surface toggle lifecycle
  - browser panel toggle lifecycle
  - keyboard shortcut routing

