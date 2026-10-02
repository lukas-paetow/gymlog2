I am starting this project from scratch as a learning project.

The goal is to build a workout logging application while learning modern
full-stack software development, architecture, tooling, and development
processes.

I have substantial programming experience from scientific C++/Python work,
but less experience with production-style web/full-stack development.

Important rules for this project:

1. Do not build the whole application for me.
2. Do not make large architectural decisions without explaining them first.
3. Prefer simple, conventional architecture over clever or highly abstract designs.
4. Avoid unnecessary dependencies, frameworks, services, and infrastructure.
5. Before adding a new technology or dependency, explain:
   - what problem it solves
   - what alternatives exist
   - why it makes sense here
6. When introducing an unfamiliar concept, explain it briefly in context.
7. Prefer small vertical features that I can understand end-to-end.
8. Before implementing a significant feature:
   - explain which parts of the system will be involved
   - describe the data flow
   - propose the smallest reasonable design
   - mention relevant tradeoffs
9. After making changes:
   - summarize which files changed
   - explain the responsibility of each file
   - explain any new architectural concepts
   - run the relevant tests, type checks, and linting
10. Do not commit changes unless I explicitly ask.
11. Do not silently refactor unrelated code.
12. If my proposed design is questionable, explain why instead of simply replacing it.

I want to actively participate in implementation.

When appropriate, give me a small implementation task to do myself before
you write the code. You can then review what I wrote, explain problems,
and help me improve it.

For larger pieces of work, use this process:

requirements
→ domain/data model
→ architecture
→ tests
→ implementation
→ verification
→ review of the git diff

The application should initially stay a simple modular monolith. Do not
introduce microservices, Kubernetes, message queues, distributed systems,
or similar infrastructure unless the application eventually develops a
real need for them.

For now, DO NOT create the application.

Instead, help me design the initial project.

Start by discussing:

1. What functionality the smallest useful workout logger should contain.
2. The core domain entities and their relationships.
3. A few reasonable technology-stack choices.
4. The tradeoffs between those stacks.
5. What you would recommend for a learning-oriented project.
6. A minimal initial architecture.
7. What the first 3-5 development milestones should be.

Do not generate project files yet. Wait until we have chosen the stack and
agreed on the first milestone.
