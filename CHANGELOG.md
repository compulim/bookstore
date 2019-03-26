# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
- Fix [#XXX](https://github.com/compulim/bookstore/issues/XXX). Fixed something, by [@compulim](https://github.com/compulim), in PR [#XXX](https://github.com/compulim/bookstore/pull/XXX).
-->

## [Unreleased]

### Added

- `createStorageUsingAzureStorage`: Now supports `prefix`, in PR [#4](https://github.com/compulim/bookstore/pull/4).
- `createStorageUsingAzureStorage`: Blobs with invalid metadata will be default to `undefined`, in PR [#4](https://github.com/compulim/bookstore/pull/4).

### Fixed

- Fix [#4](https://github.com/compulim/bookstore/issues/4). Fix `update` did not send `id` to `summarizer`, by [@compulim](https://github.com/compulim), in PR [#3](https://github.com/compulim/bookstore/pull/3).
- Fix [#5](https://github.com/compulim/bookstore/issues/5). Set lease to 15 seconds to prevent lock-ups due to errors, by [@compulim](https://github.com/compulim), in PR [#6](https://github.com/compulim/bookstore/pull/6).

## [2.2.0] - 2019-02-18

### Added

- Fix [#1](https://github.com/compulim/bookstore/issues/1). `summarizer` will receive `id` of the page as the second argument, in PR [#2](https://github.com/compulim/bookstore/pull/2).

## [2.1.0] - 2018-12-30

### Changed

- Use [`fast-deep-equal@2.0.1`](https://npmjs.com/package/fast-deep-equal) for deep equality check, by [@compulim](https://github.com/compulim) in commit [5f5b3b6](https://github.com/compulim/bookstore/commit/5f5b3b64464ba6c33d0aeec86154682465a98c0c).

## [2.0.0] - 2018-12-24

### Added

- Initial public release
