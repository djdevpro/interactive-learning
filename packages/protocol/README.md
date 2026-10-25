# @interactive-learning/protocol

The private contract shared by every Interactive Learning package. It is never published on npm.

It holds three things.

- The guide format, as TypeScript types (`GuideDocument`, `GuideStep`, `GuideAnnotation` and their parts) and the `SCHEMA_VERSION` constant.
- `validateGuide`, which checks unknown JSON and returns a typed guide, or throws a `GuideValidationError` with the path of the invalid field.
- `createGuide` and small helpers used when guides are written.

The recorder writes guides and the players read them. Both import this module so that they agree on the same format and the same validation. The build of each public package bundles the code and types it needs, so users never install this package.

The guide format has its own version, independent of npm versions. A new player release does not require changing existing guide files.
