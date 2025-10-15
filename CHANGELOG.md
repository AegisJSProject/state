<!-- markdownlint-disable -->
# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v1.0.7] - 2025-10-15

### Changed
- Update publishing to comply with new npm policy

### Fixed
- Add missing sourcemap

## [v1.0.6] - 2024-12-02

### Fixed
- Add support for `radio` inputs and `contenteditable` elements in `changeHandler`
- Do not update state without a `name` in `changeHandler`

## [v1.0.5] - 2024-11-28

### Fixed
- Fix bug in `setState()` where URL was incorrectly set to `""` when calling `replaceState()`

## [v1.0.4] - 2024-11-27

### Added
- Add event target and dispatch `change`  and `beforechange` events on state changes
- Add support for `setState()` accepting functions
- Add `changeHandler()` as callback to update state on `change` and `input` events

### Fixed
- Set default base as `document.documentElement` to supprt `<head>`
- Fix linting errors and eslint config

## [v1.0.3] - 2024-11-21

### Added
- "Reactivity" of elements (attributes, text, styles) via `data-aegis-state-*` sttributes & `MutationObserver`
- `toJSON()` support of proxy objects via `getState()`

## [v1.0.2] - 2024-10-23

### Added
- Add JSDocs
- Add minified `.mjs` version in output

## [v1.0.1] - 2024-10-21

### Changed
- `getState` now returns a `Proxy` object for the value (reflected in `manageState`)
- `setState` is no longer async

## [v1.0.0] - 2024-10-13

Initial Release
