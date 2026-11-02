# Judges pages: how to merge extra research

Each state judges page (for example `site/guide-ny/races/judges.html`) is grouped by district. Under each district list there is a marker comment:

    <!-- chatgpt-slot:ny-d1 (see docs/judges-merge-format.md) -->

Put merged research directly above that marker, inside the same district, as one `<li>` per candidate in the list above it, or as a short `<p class="note">` block for district-wide facts.

## Per-candidate entry

    <li><span><b>Name (Party lines)</b> <a class="src" href="URL" rel="noopener" target="_blank">source: short title</a></span><span class="what">One to three plain sentences. Facts only.</span></li>

## Rules

1. Every fact needs a source link. Claims need two sources and one primary source (court, board of elections, bar association, candidate, filing).
2. Use "alleged" for anything unproven. Show both sides. No scores, no endorsements, no advice on how to vote.
3. No em dashes. Plain, short sentences.
4. No inline scripts, no inline `style=` attributes, no external images.
5. Mark anything an AI wrote and nobody checked as "not independently reviewed" in the sentence or the source label.
