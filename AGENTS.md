# Notes for AI coding assistants (Codex, Claude, ChatGPT)

Read CONTRIBUTING.md first. Larger changes go in a pull request that the maintainer merges.

## The ledger line (required for any change a reader can notice)

The public Development Ledger (/development/) adds a row automatically when a pull request is merged, but only if the PR body has a ledger line.

Exact form:

- Put it in the PR body (the description), not the title and not a comment.
- The line starts with `ledger:` in the first column. No bullet, no bold, no quote mark, no spaces before it.
- One line, one or two plain sentences, under 400 characters. Say what a reader can now see or do. Neutral wording, no hype, no em dashes.
- Only that line is copied to the public page. The PR title and the rest of the body are never used.

Example (put it on its own line in the PR body):

    ledger: The Government page now has a short quiz at the end of each section, so readers can check what they learned.

Not this: `- ledger: ...`, `**ledger:** ...`, `Ledger line: ...`, or the text inside a code block or a quote.

## Leave it out when the change is internal

No `ledger:` line means no row. Skip it for typos, news data, tests and similar. Never put private notes, names of people, addresses or research topics in the line, because the repository and the ledger are public.

## Do not publish

To block a row even when a ledger line exists, put the words DO NOT PUBLISH alone on a line in the PR body (capitals, nothing else on that line), or add the label `do-not-publish`.

## What happens next

After the PR merges, a bot adds the row to the ledger page within a minute or two (the page reads it from the ledger-data branch). No second PR is opened and nobody has to merge anything. If no row appears, the PR body had no valid `ledger:` line. A person marks rows "Live, checked by a person" on the members Admin page (Ledger checks).
