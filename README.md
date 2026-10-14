# gymlog2
Full-stack mobile application for tracking my workouts. Written in TypeScript and making use of ReactNative and SQLite, >95% test coverage. To be used on my android phone. The plan is to make planning routines, logging them in the gym, and plotting the data as easy as possible.

## Local documentation

From `mobile/`, run `npm run docs` to generate the database and date-format reference.
Open `mobile/docs/api/index.html` in your browser. Regenerate after code changes.

See [the testing plan](docs/testing.md) for local testing and coverage goals.

## Local tests

Use Node 24 or newer. From `mobile/`, run `npm run check` for types and tests with
coverage, or `npm test` for tests only. Open `mobile/coverage/lcov-report/index.html`
after a coverage run to inspect uncovered lines and branches.
