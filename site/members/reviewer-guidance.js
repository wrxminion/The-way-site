// Reviewer guidance text. One place, reused on the reviewer screen and in reviewer training (docs/reviewer-guidance.md has the same words).
// Frank, Oct 30 2026: submitters may be in 6th grade, or may be learning English. Judge honesty and evidence, never spelling or grammar.
window.WayReviewerGuidance = {
  headline: 'Facts are facts, said by AI, a 6th grader, or a professor.',
  note: [
    'A claim is judged by its evidence. Never by who said it, or how well it is written.',
    'Many members write in a second language, or are young, or left school early. That is fine. They are welcome here.',
    'Judge two things only: did they really read it, and are they honest about what the article shows. Do not judge spelling, grammar, or how fancy the words are.',
    'Never decline a review because of language alone. If you decline, say what was missing, in short plain sentences.',
    'New members get extra care. Their first three reviews are marked. Say one thing they did well, then one thing to try next time.'
  ],
  // Gentle, specific replies. The reviewer clicks one to fill the reason box, then edits it.
  declineTemplates: [
    { label: 'Too short to tell', text: 'Thank you for trying. We could not tell if you read it. Please tell us one thing in the article that stood out to you, and try again.' },
    { label: 'Not about this article', text: 'Thank you. Your note seems to be about something else. Please say what this article says, in your own words, and try again.' },
    { label: 'Copied from the article', text: 'Thank you. It looks like the words came from the article. Please say it in your own words. Short and simple is fine.' },
    { label: 'Evidence answer does not match', text: 'Thank you. You said the article shows evidence, but we could not find it. Please look again for names, documents, numbers or records. If there are none, choose "No evidence shown". That is a good answer too.' },
    { label: 'Screenshot does not match', text: 'Thank you. The screenshot looks like a different page. A screenshot is optional. You can try again with the right page, or leave it out.' }
  ],
  acceptTemplates: [
    { label: 'Well done', text: 'Thank you. You read it and told us clearly what you saw.' }
  ]
};
