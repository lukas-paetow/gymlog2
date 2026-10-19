
# gymlog2
Full-stack mobile application for tracking my workouts. Written in TypeScript and making use of ReactNative, SQLite and Expo. >95% test coverage. To be used on my android phone. The plan is to make planning routines, logging them in the gym, and plotting the data as easy as possible.

<img width="300" alt="gymapp2" src="https://github.com/user-attachments/assets/4a4dd8fd-4dd0-4149-a36f-1974ff96cef5" />
<img width="300" alt="gymapp1" src="https://github.com/user-attachments/assets/419c2f4c-b8bc-48a4-a690-4e4bbcbfd3d6" />

## Local documentation

From `mobile/`, run `npm run docs` to generate the database and date-format reference.
Open `mobile/docs/api/index.html` in your browser. Regenerate after code changes.

See [the testing plan](docs/testing.md) for local testing and coverage goals.

## Local tests

Use Node 24 or newer. From `mobile/`, run `npm run check` for types and tests with
coverage, or `npm test` for tests only. Open `mobile/coverage/lcov-report/index.html`
after a coverage run to inspect uncovered lines and branches.
